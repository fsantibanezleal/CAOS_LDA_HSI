"""V-sweep F-2 — topic coherence (c_v, c_npmi, U-Mass) across V1..V12.

Reads the local LDA fits written by build_v_sweep_canonical_fit
(phi.npy + the doc_term.npz of the recipe) and computes the three
canonical coherence metrics per (V, scene). The metrics:

- ``U-Mass``: average log[(D(w_i, w_j) + 1) / D(w_j)] over the top-N words
  per topic. Higher is better. Sign: negative under log-prob.
- ``c_npmi``: average NPMI((w_i, w_j)) over pairs of top-N words.
  Bounded in [-1, 1]; higher is better.
- ``c_v``: cosine of context-vector representations of top-N words,
  using boolean co-occurrence + NPMI weighting (Roder et al. 2015).
  Bounded in [0, 1]; higher is better.

Cross-recipe coherence is *not* directly comparable because the vocab
units differ (V1 = band, V2 = q-bin, V7 = absorption-triplet). The
value is in the *cross-method ranking within a scene*: which recipe
yields more coherent topics for that scene's data.

Output: data/derived/v_sweep/f2_coherence/{scene}_{V}_{scheme}_Q{q}.json

Tracks issue #609 (Cycle 4) under master #606.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F2_DERIVED = DERIVED_DIR / "v_sweep" / "f2_coherence"

TOP_N_WORDS = 10
EPS = 1e-12


def top_n_words_per_topic(phi: np.ndarray, n: int = TOP_N_WORDS) -> list[list[int]]:
    K, V = phi.shape
    return [list(np.argsort(phi[k])[::-1][:n]) for k in range(K)]


def precompute_doc_freq(doc_term: sp.csr_matrix) -> tuple[np.ndarray, sp.csr_matrix]:
    """Returns word doc-frequencies and a binary (D, V) presence matrix."""
    binary = (doc_term > 0).astype(np.float32)
    doc_freq = np.asarray(binary.sum(axis=0)).reshape(-1)
    return doc_freq, binary.tocsr()


def umass_coherence(top_words: list[list[int]], doc_freq: np.ndarray,
                    binary: sp.csr_matrix) -> float:
    """U-Mass on top-N words. Negative log-prob; higher is better."""
    D = binary.shape[0]
    scores = []
    for words in top_words:
        if len(words) < 2:
            continue
        topic_score = []
        cols = words
        # pairwise co-document frequency via (binary[:, cols].T @ binary[:, cols])
        sub = binary[:, cols]
        co = (sub.T @ sub).toarray()
        for i in range(len(words)):
            wi = words[i]
            for j in range(i):
                wj = words[j]
                cofreq = co[i, j]
                # U-Mass uses log[(D(w_i, w_j) + 1) / D(w_j)]
                num = cofreq + 1.0
                den = max(doc_freq[wj], 1.0)
                topic_score.append(float(np.log(num / den)))
        if topic_score:
            scores.append(float(np.mean(topic_score)))
    return float(np.mean(scores)) if scores else float("nan")


def npmi_pairs(words: list[int], doc_freq: np.ndarray,
               binary: sp.csr_matrix) -> list[float]:
    D = binary.shape[0]
    if D == 0:
        return []
    sub = binary[:, words]
    co = (sub.T @ sub).toarray()
    out = []
    for i in range(len(words)):
        wi = words[i]
        pi = doc_freq[wi] / D if doc_freq[wi] > 0 else EPS
        for j in range(i):
            wj = words[j]
            pj = doc_freq[wj] / D if doc_freq[wj] > 0 else EPS
            pij = co[i, j] / D if co[i, j] > 0 else EPS
            num = np.log(pij / max(pi * pj, EPS))
            den = -np.log(max(pij, EPS))
            if den > EPS:
                out.append(float(num / den))
    return out


def npmi_coherence(top_words: list[list[int]], doc_freq: np.ndarray,
                   binary: sp.csr_matrix) -> float:
    per_topic = []
    for words in top_words:
        pairs = npmi_pairs(words, doc_freq, binary)
        if pairs:
            per_topic.append(float(np.mean(pairs)))
    return float(np.mean(per_topic)) if per_topic else float("nan")


def cv_coherence(top_words: list[list[int]], doc_freq: np.ndarray,
                 binary: sp.csr_matrix) -> float:
    """c_v: cosine of NPMI-weighted context vectors over top-N words.

    Approximation of Roder et al. 2015, segment_one_one and probability
    estimator P(w) := doc-freq/D, sliding window = document (binary).
    """
    D = binary.shape[0]
    per_topic = []
    for words in top_words:
        n = len(words)
        if n < 2:
            continue
        # NPMI matrix over the top-N (n x n)
        sub = binary[:, words]
        co = (sub.T @ sub).toarray()
        npmi_mat = np.zeros((n, n), dtype=np.float64)
        for i in range(n):
            pi = doc_freq[words[i]] / D if doc_freq[words[i]] > 0 else EPS
            for j in range(n):
                if i == j:
                    npmi_mat[i, j] = 1.0
                    continue
                pj = doc_freq[words[j]] / D if doc_freq[words[j]] > 0 else EPS
                pij = co[i, j] / D if co[i, j] > 0 else EPS
                num = np.log(pij / max(pi * pj, EPS))
                den = -np.log(max(pij, EPS))
                npmi_mat[i, j] = float(num / den) if den > EPS else 0.0
        # Context vector = row of NPMI matrix; cosine vs the topic centroid
        centroid = npmi_mat.mean(axis=0, keepdims=True)
        # cosine per word vs centroid
        norms = np.linalg.norm(npmi_mat, axis=1)
        cn = float(np.linalg.norm(centroid))
        if cn < EPS:
            continue
        cos = (npmi_mat @ centroid.T).reshape(-1) / np.maximum(norms * cn, EPS)
        per_topic.append(float(cos.mean()))
    return float(np.mean(per_topic)) if per_topic else float("nan")


def coherence_for(scene_id: str, recipe: str, scheme: str, q: int) -> dict | None:
    fit_dir = SWEEP_LOCAL / f"{scene_id}_{recipe}_{scheme}_Q{q}"
    phi_path = fit_dir / "phi.npy"
    if not phi_path.exists():
        return None
    phi = np.load(phi_path)
    corpus_dir = WORDIFICATION_LOCAL / recipe / f"{scheme}_Q{q}" / scene_id
    doc_term_path = corpus_dir / "doc_term.npz"
    if not doc_term_path.exists():
        return None
    doc_term = sp.load_npz(doc_term_path).tocsr()
    doc_freq, binary = precompute_doc_freq(doc_term)
    top_words = top_n_words_per_topic(phi, n=TOP_N_WORDS)

    umass = umass_coherence(top_words, doc_freq, binary)
    npmi = npmi_coherence(top_words, doc_freq, binary)
    cv = cv_coherence(top_words, doc_freq, binary)

    return {
        "scene_id": scene_id,
        "recipe": recipe,
        "scheme": scheme,
        "Q": q,
        "K": int(phi.shape[0]),
        "V": int(phi.shape[1]),
        "top_n": int(TOP_N_WORDS),
        "u_mass": round(umass, 6) if umass == umass else None,
        "c_npmi": round(npmi, 6) if npmi == npmi else None,
        "c_v": round(cv, 6) if cv == cv else None,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_f2_coherence v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-2 coherence.")
    parser.add_argument("--scenes", nargs="+", default=None)
    parser.add_argument("--recipes", nargs="+", default=None)
    parser.add_argument("--scheme", default="uniform")
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()

    fits = sorted(SWEEP_LOCAL.glob("*"))
    F2_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    for fit_dir in fits:
        stem = fit_dir.name
        # Expected stem: {scene_id}_{V}_{scheme}_Q{q}
        # The scene_id can contain dashes; recipe is V\d+; scheme is one of
        # {uniform, quantile, lloyd_max}; Q is Q\d+.
        # Parse from the right.
        parts = stem.rsplit("_", 2)
        if len(parts) != 3 or not parts[2].startswith("Q"):
            continue
        q_str = parts[2][1:]
        try:
            q = int(q_str)
        except ValueError:
            continue
        scheme = parts[1]
        prefix = parts[0]
        # prefix = "{scene_id}_{V}"
        scene_recipe = prefix.rsplit("_", 1)
        if len(scene_recipe) != 2:
            continue
        scene_id, recipe = scene_recipe
        if args.scenes and scene_id not in args.scenes:
            continue
        if args.recipes and recipe not in args.recipes:
            continue
        if args.scheme and scheme != args.scheme:
            continue
        if args.q and q != args.q:
            continue
        result = coherence_for(scene_id, recipe, scheme, q)
        if result is None:
            n_skip += 1
            continue
        out_path = F2_DERIVED / f"{scene_id}_{recipe}_{scheme}_Q{q}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(result, h, indent=2)
        n_ok += 1
        print(
            f"[f2] {scene_id} {recipe} {scheme} Q{q} K={result['K']} V={result['V']} "
            f"u_mass={result['u_mass']} c_npmi={result['c_npmi']} c_v={result['c_v']}",
            flush=True,
        )
    print(f"[f2] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
