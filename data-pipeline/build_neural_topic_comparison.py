"""Cross-method comparison of LDA / ProdLDA / ETM topic mixtures.

Loads each variant's theta from data/local/* and the canonical LDA
sample labels (data/local/lda_fits/<scene>/sample_labels.npy), then
computes a battery of downstream metrics directly comparable across
methods:

  - KMeans(theta, K=n_classes) ARI / NMI vs ground-truth labels
  - silhouette score per method
  - per-method posterior mean of theta entropy (concentration)

Writes a per-scene JSON at:
  data/derived/neural_topic_comparison/<scene>.json

This closes the cycle-59 ETM gap: cycle 59 added the ETM topic
variant alongside ProdLDA, but the three topic models (LDA topic
fits, ProdLDA, ETM) had no head-to-head comparison file. Now the
Benchmarks UI can render a single table answering "which neural
variant produces the most class-discriminative theta?"
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    normalized_mutual_info_score,
    silhouette_score,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR

warnings.filterwarnings("ignore")

SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

OUTPUT_DIR = DERIVED_DIR / "neural_topic_comparison"


def _kmeans_metrics(theta: np.ndarray, labels: np.ndarray) -> dict:
    n_classes = int(np.unique(labels).size)
    if n_classes < 2:
        return {"ari": 0.0, "nmi": 0.0, "silhouette": 0.0, "n_classes": n_classes}
    try:
        km = KMeans(n_clusters=n_classes, n_init=10, random_state=42).fit(theta)
        sil = float(silhouette_score(theta, km.labels_)) if theta.shape[0] > n_classes else 0.0
        return {
            "ari": round(float(adjusted_rand_score(labels, km.labels_)), 6),
            "nmi": round(float(normalized_mutual_info_score(labels, km.labels_)), 6),
            "silhouette": round(sil, 6),
            "n_classes": n_classes,
        }
    except Exception as exc:  # pragma: no cover
        return {"ari": 0.0, "nmi": 0.0, "silhouette": 0.0, "n_classes": n_classes, "error": str(exc)}


def _entropy_summary(theta: np.ndarray) -> dict:
    eps = 1e-12
    p = np.clip(theta, eps, 1.0)
    p = p / p.sum(axis=-1, keepdims=True)
    h = -(p * np.log(p)).sum(axis=-1)
    K = theta.shape[1]
    h_max = float(np.log(K))
    return {
        "K": int(K),
        "max_entropy_uniform": round(h_max, 6),
        "doc_entropy_mean": round(float(h.mean()), 6),
        "doc_entropy_std": round(float(h.std()), 6),
        "doc_entropy_normalised_mean": round(float(h.mean() / h_max), 6),
    }


def _coherence(phi: np.ndarray, vocab: list[str], doc_term: np.ndarray, top_n: int = 15) -> dict:
    """Compute c_v, c_npmi, u_mass via gensim on the band-frequency corpus."""
    try:
        from gensim import corpora
        from gensim.models import CoherenceModel
    except ImportError:
        return {"top_n": int(top_n), "error": "gensim not installed"}

    K = phi.shape[0]
    texts = []
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        tokens = []
        for i in nz:
            count = int(doc_term[d, int(i)])
            if count > 0:
                tokens.extend([vocab[int(i)]] * count)
        texts.append(tokens or [vocab[0]])

    dictionary = corpora.Dictionary([[t] for t in vocab])
    dictionary.token2id = {t: i for i, t in enumerate(vocab)}
    dictionary.id2token = {i: t for i, t in enumerate(vocab)}

    top_tokens: list[list[str]] = []
    for k in range(K):
        order = np.argsort(phi[k])[::-1][:top_n]
        top_tokens.append([vocab[int(i)] for i in order])

    out: dict = {"top_n": int(top_n)}
    for metric in ("c_v", "c_npmi", "u_mass"):
        try:
            cm = CoherenceModel(
                topics=top_tokens,
                texts=texts,
                dictionary=dictionary,
                coherence=metric,
            )
            out[metric] = round(float(cm.get_coherence()), 6)
        except Exception:
            out[metric] = None
    return out


def _band_frequency_doc_term(scene_id: str) -> tuple[np.ndarray | None, list[str] | None]:
    """Reconstruct the band-frequency doc-term matrix from local LDA fit
    artifacts. Uses the LDA fit's vocab + corresponds 1:1 with the
    220-per-class stratified sample shared across LDA / ProdLDA / ETM."""
    lda_dir = DATA_DIR / "local" / "lda_fits" / scene_id
    vocab_path = lda_dir / "vocab.json"
    pixel_idx_path = lda_dir / "sample_pixel_indices.npy"
    corpus_marg_path = lda_dir / "corpus_marginal.npy"
    if not (vocab_path.exists() and pixel_idx_path.exists() and corpus_marg_path.exists()):
        return None, None
    with vocab_path.open("r", encoding="utf-8") as h:
        vocab_payload = json.load(h)
    vocab = vocab_payload.get("vocab")
    if not isinstance(vocab, list):
        return None, None

    # We don't have the doc-term saved directly; reconstruct via the
    # canonical band-frequency wordification. The labels file size tells
    # us the document count; we use the corpus_marginal as proxy when
    # the doc-term cannot be recovered. Keep the reconstruction simple:
    # load the stored cube spectra at the sample indices and quantise.
    try:
        from research_core.raw_scenes import load_scene
    except ImportError:
        return None, vocab
    cube, _, _ = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    pixel_idx = np.load(pixel_idx_path)
    spectra = flat[pixel_idx]
    # Band-frequency wordification: per-row min-max → quantise to integer counts
    lo = spectra.min(axis=1, keepdims=True)
    hi = spectra.max(axis=1, keepdims=True)
    rng = np.where(hi - lo > 1e-6, hi - lo, 1.0)
    norm = (spectra - lo) / rng
    doc_term = np.rint(norm * 20).astype(np.int32)  # SCALE=20 matches build_topic_model_variants
    return doc_term, vocab


def build_for_scene(scene_id: str) -> dict | None:
    lda_dir = DATA_DIR / "local" / "lda_fits" / scene_id
    prodlda_dir = DATA_DIR / "local" / "topic_variants" / "prodlda" / scene_id
    etm_dir = DATA_DIR / "local" / "topic_variants" / "etm" / scene_id

    labels_path = lda_dir / "sample_labels.npy"
    if not labels_path.exists():
        return None
    labels = np.load(labels_path)

    method_paths = {
        "lda": (lda_dir / "theta.npy", lda_dir / "phi.npy"),
        "prodlda": (prodlda_dir / "theta.npy", prodlda_dir / "phi.npy"),
        "etm": (etm_dir / "theta.npy", etm_dir / "phi.npy"),
    }

    doc_term, vocab = _band_frequency_doc_term(scene_id)

    methods: dict[str, dict] = {}
    for name, (theta_path, phi_path) in method_paths.items():
        if not theta_path.exists():
            continue
        theta = np.load(theta_path).astype(np.float32)
        if theta.shape[0] != labels.shape[0]:
            methods[name] = {"error": f"shape mismatch: theta {theta.shape} vs labels {labels.shape}"}
            continue
        block: dict = {
            "K": int(theta.shape[1]),
            "downstream_kmeans_vs_label": _kmeans_metrics(theta, labels),
            "theta_entropy": _entropy_summary(theta),
        }
        if phi_path.exists() and doc_term is not None and vocab is not None:
            try:
                phi = np.load(phi_path).astype(np.float32)
                if phi.shape[1] == len(vocab):
                    block["coherence"] = _coherence(phi, vocab, doc_term, top_n=15)
            except Exception as exc:
                block["coherence"] = {"error": str(exc)}
        methods[name] = block

    ranking = sorted(
        [
            (name, m["downstream_kmeans_vs_label"]["ari"])
            for name, m in methods.items()
            if "error" not in m
        ],
        key=lambda x: x[1],
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "n_documents": int(labels.shape[0]),
        "n_classes": int(np.unique(labels).size),
        "methods": methods,
        "ranking_by_ari": [{"method": n, "ari": round(float(a), 6)} for n, a in ranking],
        "framework_axis": "Cycle 61 + 62 head-to-head LDA vs ProdLDA vs ETM: clustering quality (KMeans-vs-label ARI) + topic coherence (c_v, c_npmi, u_mass) on the canonical 220-per-class stratified sample.",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_neural_topic_comparison v0.2",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in SCENES:
        print(f"[neural_tm_compare] {scene_id} ...", flush=True)
        payload = build_for_scene(scene_id)
        if not payload:
            print(f"  skipped (no LDA fit)", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        ranking = " > ".join(f"{x['method']}={x['ari']:+.3f}" for x in payload["ranking_by_ari"])
        print(f"  ranking: {ranking}", flush=True)
        written += 1
    print(f"[neural_tm_compare] done — {written} scenes written", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
