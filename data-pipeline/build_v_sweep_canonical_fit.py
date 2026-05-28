"""V-sweep canonical LDA fit — V1..V12 wordification recipes.

Reads the pre-built doc-term sparse matrices under
``data/local/wordifications/{V}/{scheme}_Q{q}/{scene_id}/`` and fits an
online-VB LDA per (V, scheme, Q, scene) tuple. Writes:

- ``data/local/v_sweep/lda_fits/{scene_id}_{V}_{scheme}_Q{q}/`` —
  ``phi.npy``, ``theta.npy``, ``corpus_marginal.npy``, ``vocab.json``,
  ``manifest.json``.
- ``data/derived/v_sweep/topic_views/{scene_id}_{V}_{scheme}_Q{q}.json``
  — a per-fit summary with K, V, D, perplexity, mean theta, and the
  doc-length distribution.

The per-V K-policy (see ``wip/caos-lda-hsi/audits/2026-05-26-v-recipes-theory.md``):
recipes with ≤6 mean tokens per document (V7, V9, V10) need a smaller K
than V1's bandfull regime. We use ``K = clip(round(mean_doc_length / 2),
3, 12)`` clipped to the number of labelled classes when available.

Tracks issue #607 (Cycle 2 — V-sweep infrastructure).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from research_core.raw_scenes import SCENES  # noqa: E402

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
SWEEP_LOCAL_DIR = DATA_DIR / "local" / "v_sweep" / "lda_fits"
SWEEP_DERIVED_DIR = DERIVED_DIR / "v_sweep" / "topic_views"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 21)]
SCHEMES = ["uniform", "quantile", "lloyd_max"]
Q_VALUES = [8, 16, 32]

LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.20
RANDOM_STATE = 42


def class_count_for(scene_id: str) -> int:
    if scene_id == "indian-pines-corrected":
        return 16
    if scene_id == "salinas-corrected":
        return 16
    if scene_id == "salinas-a-corrected":
        return 6
    if scene_id == "pavia-university":
        return 9
    if scene_id == "kennedy-space-center":
        return 13
    if scene_id == "botswana":
        return 14
    return 0


def topic_count_for(scene_id: str, mean_doc_length: float) -> int:
    """Per-V K-policy: clip(round(mean_doc/2), 3, 12) bounded by class count."""
    cls = class_count_for(scene_id)
    upper = max(4, min(12, cls)) if cls > 0 else 12
    if mean_doc_length < 2.5:
        return max(3, min(upper, 4))
    if mean_doc_length < 8:
        return max(3, min(upper, int(round(mean_doc_length / 2))))
    return upper


def load_doc_term(recipe: str, scheme: str, q: int, scene_id: str) -> tuple[sp.csr_matrix, dict] | None:
    corpus_dir = WORDIFICATION_LOCAL / recipe / f"{scheme}_Q{q}" / scene_id
    npz_path = corpus_dir / "doc_term.npz"
    vocab_path = corpus_dir / "vocab.json"
    if not (npz_path.exists() and vocab_path.exists()):
        return None
    matrix = sp.load_npz(npz_path).tocsr()
    with vocab_path.open("r", encoding="utf-8") as handle:
        meta = json.load(handle)
    return matrix, meta


def fit_one(recipe: str, scheme: str, q: int, scene_id: str) -> dict | None:
    payload = load_doc_term(recipe, scheme, q, scene_id)
    if payload is None:
        return {
            "scene_id": scene_id,
            "recipe": recipe,
            "scheme": scheme,
            "Q": q,
            "status": "missing_corpus",
        }
    doc_term, meta = payload
    D, V = doc_term.shape
    doc_lengths = np.asarray(doc_term.sum(axis=1)).reshape(-1)
    mean_doc = float(doc_lengths.mean()) if D > 0 else 0.0
    if mean_doc < 1e-6 or V == 0:
        return {
            "scene_id": scene_id,
            "recipe": recipe,
            "scheme": scheme,
            "Q": q,
            "status": "empty_corpus",
            "D": int(D),
            "V": int(V),
            "mean_doc_length": mean_doc,
        }

    K = topic_count_for(scene_id, mean_doc)

    t0 = time.perf_counter()
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=LDA_MAX_ITER,
        batch_size=512,
        evaluate_every=-1,
        random_state=RANDOM_STATE,
        doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
        topic_word_prior=LDA_TOPIC_WORD_PRIOR,
    )
    # sklearn LDA accepts sparse input
    doc_topic = lda.fit_transform(doc_term)
    phi_un = lda.components_
    phi = phi_un / phi_un.sum(axis=1, keepdims=True)
    fit_secs = time.perf_counter() - t0

    token_totals = np.asarray(doc_term.sum(axis=0)).reshape(-1).astype(np.float64)
    corpus_marginal = token_totals / max(float(token_totals.sum()), 1e-12)

    try:
        perplexity = float(lda.perplexity(doc_term))
    except Exception:  # noqa: BLE001
        perplexity = float("nan")

    # Persist local artefacts
    local_dir = SWEEP_LOCAL_DIR / f"{scene_id}_{recipe}_{scheme}_Q{q}"
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", doc_topic.astype(np.float32))
    np.save(local_dir / "corpus_marginal.npy", corpus_marginal.astype(np.float32))
    np.save(local_dir / "doc_lengths.npy", doc_lengths.astype(np.int32))
    with (local_dir / "vocab.json").open("w", encoding="utf-8") as handle:
        json.dump(meta, handle)

    # Persist derived summary
    SWEEP_DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    derived = {
        "scene_id": scene_id,
        "recipe": recipe,
        "scheme": scheme,
        "Q": q,
        "status": "ok",
        "K": int(K),
        "D": int(D),
        "V": int(V),
        "mean_doc_length": round(mean_doc, 4),
        "doc_length_quantiles": {
            "p05": float(np.quantile(doc_lengths, 0.05)) if D else 0.0,
            "p50": float(np.quantile(doc_lengths, 0.50)) if D else 0.0,
            "p95": float(np.quantile(doc_lengths, 0.95)) if D else 0.0,
        },
        "topic_prevalence": [round(float(x), 6) for x in doc_topic.mean(axis=0).tolist()],
        "perplexity": round(perplexity, 4) if perplexity == perplexity else None,
        "fit_seconds": round(fit_secs, 3),
        "lda_config": {
            "method": "sklearn.LatentDirichletAllocation online",
            "max_iter": LDA_MAX_ITER,
            "doc_topic_prior": LDA_DOC_TOPIC_PRIOR,
            "topic_word_prior": LDA_TOPIC_WORD_PRIOR,
            "random_state": RANDOM_STATE,
        },
        "local_artefacts_dir": str(local_dir.relative_to(DATA_DIR)),
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_canonical_fit v0.1",
    }
    out_path = SWEEP_DERIVED_DIR / f"{scene_id}_{recipe}_{scheme}_Q{q}.json"
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(derived, handle, indent=2)
    return derived


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep canonical LDA fits.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--schemes", nargs="+", default=["uniform"], choices=SCHEMES)
    parser.add_argument("--q-values", nargs="+", type=int, default=[8], choices=Q_VALUES)
    parser.add_argument(
        "--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the (recipe, scheme, Q, scene) tuples without fitting.",
    )
    args = parser.parse_args()

    tuples = [
        (r, s, q, sc)
        for r in args.recipes
        for s in args.schemes
        for q in args.q_values
        for sc in args.scenes
    ]
    print(f"[v-sweep] {len(tuples)} fits scheduled", flush=True)

    if args.dry_run:
        for r, s, q, sc in tuples:
            print(f"  {r} {s} Q={q} {sc}")
        return 0

    n_ok = 0
    n_skip = 0
    n_fail = 0
    for r, s, q, sc in tuples:
        tag = f"{sc} {r} {s} Q={q}"
        try:
            print(f"[v-sweep] {tag} ...", flush=True)
            result = fit_one(r, s, q, sc)
            if result is None:
                n_skip += 1
                continue
            status = result.get("status", "ok")
            if status == "ok":
                n_ok += 1
                print(
                    f"  K={result['K']} D={result['D']} V={result['V']} "
                    f"mean_doc={result['mean_doc_length']:.2f} "
                    f"perp={result.get('perplexity')} "
                    f"t={result['fit_seconds']}s",
                    flush=True,
                )
            else:
                n_skip += 1
                print(f"  SKIP: status={status}", flush=True)
        except Exception as exc:  # noqa: BLE001
            n_fail += 1
            print(f"  FAILED: {exc}", flush=True)
            import traceback

            traceback.print_exc()

    print(
        f"[v-sweep] done. ok={n_ok} skipped={n_skip} failed={n_fail} "
        f"derived_dir={SWEEP_DERIVED_DIR}",
        flush=True,
    )
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
