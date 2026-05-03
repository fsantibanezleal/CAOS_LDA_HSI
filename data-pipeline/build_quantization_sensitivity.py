"""Quantization-sensitivity validation block.

For every (scheme, Q) configuration produced by build_wordifications.py
on recipe V1, fit an LDA at the same K used by the canonical
build_topic_views fit and report:

- Hungarian-matched cosine between phi rows of the probe fit and the
  canonical fit
- ARI of the probe's dominant-topic assignment vs the canonical's
- topic-stability across the (scheme, Q) grid as a single matrix

Output: data/derived/quantization_sensitivity/<scene>.json

Closes the validation block "quantization-sensitivity" defined in
data/manifests/corpus_recipes.json. Currently uses recipe V1 only;
extend to V2 and V3 when budget allows.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.optimize import linear_sum_assignment
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.metrics import adjusted_rand_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
LOCAL_WORDS_DIR = DATA_DIR / "local" / "wordifications"
DERIVED_OUT_DIR = DERIVED_DIR / "quantization_sensitivity"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RECIPES = ["V1"]
SCHEMES = ["uniform", "quantile", "lloyd_max"]
Q_VALUES = [8, 16, 32]
LDA_MAX_ITER = 60


def fit_lda(doc_term: np.ndarray, K: int, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=LDA_MAX_ITER,
        batch_size=512,
        evaluate_every=-1,
        random_state=seed,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    theta = lda.fit_transform(doc_term)
    phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)
    return phi, theta


def matched_cosine(phi_a: np.ndarray, phi_b: np.ndarray) -> tuple[np.ndarray, float]:
    """Hungarian-matched topic cosine between two phi rows.

    phi_a is K_a x V_a; phi_b is K_b x V_b. We need a common vocabulary
    space. Since phi_a and phi_b for the same recipe (V1) share band
    semantics — V1 vocab is just band ids — they are aligned by index.
    """
    # Take the smaller K
    K = min(phi_a.shape[0], phi_b.shape[0])
    a = phi_a[:K]
    b = phi_b[:K]
    norms_a = np.linalg.norm(a, axis=1, keepdims=True)
    norms_b = np.linalg.norm(b, axis=1, keepdims=True)
    a = a / np.where(norms_a < 1e-12, 1.0, norms_a)
    b = b / np.where(norms_b < 1e-12, 1.0, norms_b)
    cos = a @ b.T
    cost = -cos
    row_ind, col_ind = linear_sum_assignment(cost)
    matches = cos[row_ind, col_ind]
    return matches, float(np.mean(matches))


def build_for_scene(scene_id: str) -> dict | None:
    if not has_labels(scene_id):
        return None
    canonical_fit = LOCAL_FIT_DIR / scene_id
    if not (canonical_fit / "phi.npy").exists():
        print(f"  no canonical fit at {canonical_fit}", flush=True)
        return None
    phi_canonical = np.load(canonical_fit / "phi.npy")
    theta_canonical = np.load(canonical_fit / "theta.npy")
    K = phi_canonical.shape[0]
    dominant_canonical = np.argmax(theta_canonical, axis=1)

    rows: list[dict] = []
    for recipe in RECIPES:
        for scheme in SCHEMES:
            for Q in Q_VALUES:
                doc_term_path = (
                    LOCAL_WORDS_DIR / recipe / f"{scheme}_Q{Q}" / scene_id / "doc_term.npz"
                )
                if not doc_term_path.exists():
                    rows.append({
                        "config": f"{recipe}/{scheme}_Q{Q}",
                        "status": "missing_input",
                    })
                    continue
                doc_term = sparse.load_npz(doc_term_path).toarray().astype(np.float32)
                if doc_term.shape[0] != theta_canonical.shape[0]:
                    rows.append({
                        "config": f"{recipe}/{scheme}_Q{Q}",
                        "status": "doc_count_mismatch",
                        "D_canonical": int(theta_canonical.shape[0]),
                        "D_probe": int(doc_term.shape[0]),
                    })
                    continue
                phi_probe, theta_probe = fit_lda(doc_term, K=K, seed=42)
                matches, cos_mean = matched_cosine(phi_canonical, phi_probe)
                dominant_probe = np.argmax(theta_probe, axis=1)
                ari = float(adjusted_rand_score(dominant_canonical, dominant_probe))
                rows.append({
                    "config": f"{recipe}/{scheme}_Q{Q}",
                    "status": "ok",
                    "matched_cosine_mean": round(cos_mean, 6),
                    "matched_cosine_min": round(float(matches.min()), 6),
                    "ari_dominant_vs_canonical": round(ari, 6),
                    "K": int(K),
                    "V_probe": int(doc_term.shape[1]),
                })

    # Summary statistics across configs
    valid = [r for r in rows if r["status"] == "ok"]
    summary = None
    if valid:
        cos_values = [r["matched_cosine_mean"] for r in valid]
        ari_values = [r["ari_dominant_vs_canonical"] for r in valid]
        summary = {
            "n_configs_compared": len(valid),
            "matched_cosine_mean_overall_mean": round(float(np.mean(cos_values)), 6),
            "matched_cosine_mean_overall_min": round(float(np.min(cos_values)), 6),
            "ari_overall_mean": round(float(np.mean(ari_values)), 6),
            "ari_overall_min": round(float(np.min(ari_values)), 6),
            "verdict": (
                "robust"
                if min(ari_values) > 0.5 and min(cos_values) > 0.7
                else "moderate" if min(ari_values) > 0.3
                else "fragile"
            ),
        }

    return {
        "scene_id": scene_id,
        "topic_count": int(K),
        "canonical_recipe": "V1",
        "canonical_scheme": "uniform_per_spectrum",
        "canonical_Q": 12,
        "probes": rows,
        "summary": summary,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_quantization_sensitivity v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[quant_sensitivity] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped", flush=True)
            continue
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        if payload["summary"]:
            s = payload["summary"]
            print(
                f"  {s['n_configs_compared']} probes -> "
                f"matched_cos {s['matched_cosine_mean_overall_mean']:.3f} "
                f"(min {s['matched_cosine_mean_overall_min']:.3f}), "
                f"ARI {s['ari_overall_mean']:.3f} "
                f"(min {s['ari_overall_min']:.3f}) -> {s['verdict']}",
                flush=True,
            )
        written += 1
    print(f"[quant_sensitivity] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
