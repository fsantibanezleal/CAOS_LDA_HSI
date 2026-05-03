"""K x seed sweep on the canonical recipe (V1 band-frequency).

For each labelled scene, fit LDA at K in {4, 6, 8, 10, 12, 16} with
seeds in {0, 1, 2, 3, 4} and compute:

- perplexity (held-out 80/20 split)
- NPMI coherence on top-15 words
- topic_diversity = unique top-N words / total
- matched-cosine stability across the 5 seeds at each K

Output: data/derived/lda_sweep/<scene>.json

Picks a recommended K per scene as the K that maximises (-perplexity_norm
+ NPMI + matched_cosine_mean) / 3.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)


DERIVED_OUT_DIR = DERIVED_DIR / "lda_sweep"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
K_GRID = [4, 6, 8, 10, 12, 16]
SEEDS = [0, 1, 2, 3, 4]
SAMPLES_PER_CLASS = 220
SCALE = 12
TRAIN_FRAC = 0.8
TOP_N_FOR_NPMI = 15
TOP_N_FOR_DIVERSITY = 15


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def fit_lda(doc_term: np.ndarray, K: int, seed: int):
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=60,
        batch_size=512,
        evaluate_every=-1,
        random_state=seed,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    return lda.fit(doc_term)


def matched_cosine(phi_a: np.ndarray, phi_b: np.ndarray) -> float:
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
    return float(np.mean(cos[row_ind, col_ind]))


def npmi_coherence(phi: np.ndarray, doc_term: np.ndarray, top_n: int = TOP_N_FOR_NPMI) -> float:
    """NPMI coherence using document co-occurrence."""
    K, V = phi.shape
    D = doc_term.shape[0]
    # Document-presence binary matrix for top-N words per topic
    npmi_per_topic = []
    bin_dt = (doc_term > 0).astype(np.float32)
    eps = 1e-12
    for k in range(K):
        top_idx = np.argsort(phi[k])[::-1][:top_n]
        pairs = []
        for i in range(top_n):
            for j in range(i + 1, top_n):
                wi = int(top_idx[i])
                wj = int(top_idx[j])
                p_i = float(bin_dt[:, wi].sum() / D)
                p_j = float(bin_dt[:, wj].sum() / D)
                p_ij = float((bin_dt[:, wi] * bin_dt[:, wj]).sum() / D)
                if p_i < eps or p_j < eps or p_ij < eps:
                    continue
                pmi = np.log(p_ij / (p_i * p_j))
                npmi = pmi / (-np.log(p_ij))
                pairs.append(float(npmi))
        if pairs:
            npmi_per_topic.append(float(np.mean(pairs)))
    return float(np.mean(npmi_per_topic)) if npmi_per_topic else 0.0


def topic_diversity(phi: np.ndarray, top_n: int = TOP_N_FOR_DIVERSITY) -> float:
    K = phi.shape[0]
    top_indices = set()
    for k in range(K):
        for idx in np.argsort(phi[k])[::-1][:top_n]:
            top_indices.add(int(idx))
    return float(len(top_indices) / max(K * top_n, 1))


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    cube, gt, _ = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(labels, SAMPLES_PER_CLASS, random_state=42)
    sample_spectra = spectra[sample_idx_local]
    doc_term = band_frequency_counts(sample_spectra, scale=SCALE).astype(np.float32)
    D = doc_term.shape[0]

    rng = np.random.default_rng(42)
    perm = rng.permutation(D)
    n_train = int(D * TRAIN_FRAC)
    train_idx = perm[:n_train]
    test_idx = perm[n_train:]
    doc_train = doc_term[train_idx]
    doc_test = doc_term[test_idx]

    grid_results = []
    for K in K_GRID:
        phi_per_seed: list[np.ndarray] = []
        seed_metrics: list[dict] = []
        for seed in SEEDS:
            lda = fit_lda(doc_train, K, seed)
            phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)
            phi_per_seed.append(phi)
            try:
                perp_test = float(lda.perplexity(doc_test))
            except Exception:
                perp_test = float("nan")
            try:
                perp_train = float(lda.perplexity(doc_train))
            except Exception:
                perp_train = float("nan")
            npmi = npmi_coherence(phi, doc_term)
            div = topic_diversity(phi)
            seed_metrics.append({
                "seed": seed,
                "perplexity_train": round(perp_train, 4),
                "perplexity_test": round(perp_test, 4),
                "npmi": round(npmi, 6),
                "topic_diversity": round(div, 6),
            })

        # Pairwise matched-cosine across seeds
        matched_cos_pairs = []
        for i in range(len(phi_per_seed)):
            for j in range(i + 1, len(phi_per_seed)):
                matched_cos_pairs.append(matched_cosine(phi_per_seed[i], phi_per_seed[j]))
        stab_mean = float(np.mean(matched_cos_pairs)) if matched_cos_pairs else 0.0
        stab_min = float(np.min(matched_cos_pairs)) if matched_cos_pairs else 0.0

        valid_test = [m["perplexity_test"] for m in seed_metrics if not np.isnan(m["perplexity_test"])]
        valid_npmi = [m["npmi"] for m in seed_metrics]
        grid_results.append({
            "K": K,
            "n_seeds": len(SEEDS),
            "perplexity_test_mean": round(float(np.mean(valid_test)), 4) if valid_test else None,
            "perplexity_test_std": round(float(np.std(valid_test)), 4) if valid_test else None,
            "npmi_mean": round(float(np.mean(valid_npmi)), 6) if valid_npmi else 0.0,
            "topic_diversity_mean": round(float(np.mean([m["topic_diversity"] for m in seed_metrics])), 6),
            "matched_cosine_mean": round(stab_mean, 6),
            "matched_cosine_min": round(stab_min, 6),
            "per_seed": seed_metrics,
        })

    # Recommended K: max(npmi_mean) - lambda1 * perplexity_test_mean (normalised) + lambda2 * matched_cosine_mean
    perp_values = [r["perplexity_test_mean"] for r in grid_results if r["perplexity_test_mean"] is not None]
    if perp_values:
        perp_min, perp_max = float(min(perp_values)), float(max(perp_values))
    else:
        perp_min, perp_max = 0.0, 1.0
    perp_range = max(perp_max - perp_min, 1e-9)
    scored = []
    for r in grid_results:
        perp = r["perplexity_test_mean"] if r["perplexity_test_mean"] is not None else perp_max
        perp_norm = (perp - perp_min) / perp_range
        score = -perp_norm + r["npmi_mean"] + r["matched_cosine_mean"]
        scored.append((r["K"], score, r))
    best = max(scored, key=lambda x: x[1])
    recommended_K = best[0]

    return {
        "scene_id": scene_id,
        "K_grid": K_GRID,
        "seeds": SEEDS,
        "samples_per_class": SAMPLES_PER_CLASS,
        "wordification": "band-frequency",
        "quantization_scale": SCALE,
        "train_fraction": TRAIN_FRAC,
        "grid": grid_results,
        "recommended_K": int(recommended_K),
        "recommendation_method": "(-perplexity_test_norm) + npmi_mean + matched_cosine_mean",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_lda_sweep v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[lda_sweep] {scene_id} ...", flush=True)
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
        # Show brief grid
        for r in payload["grid"]:
            print(
                f"  K={r['K']:2d}  perp_test={r['perplexity_test_mean']:.2f} "
                f"NPMI={r['npmi_mean']:+.3f}  stability={r['matched_cosine_mean']:.3f}",
                flush=True,
            )
        print(f"  -> recommended K = {payload['recommended_K']}", flush=True)
        written += 1
    print(f"[lda_sweep] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
