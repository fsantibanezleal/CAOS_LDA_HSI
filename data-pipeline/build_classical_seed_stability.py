"""B-6 follow-up: seed stability for the classical sklearn methods
(PCA / NMF / ICA / dense AE).

Pairs the deep_seed_stability builder so the four-axis stability ladder
(LDA, deep methods, classical methods) is comparable.

Each method is fitted N_SEEDS=7 times per scene with different
random_state. PCA is deterministic given normalised input, so its
off-diag will sit at ~1.0 and provides a sanity check; NMF and ICA
have init randomness; dense AE (sklearn MLPRegressor) has weight-init
randomness.

Output: data/derived/classical_seed_stability/<scene>__<method>.json
where method in {pca_8, nmf_8, ica_8, dense_ae_8}.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA, NMF, FastICA
from sklearn.metrics import adjusted_rand_score
from sklearn.neural_network import MLPRegressor
from scipy.linalg import orthogonal_procrustes

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from research_core.class_catalog import has_labels
from research_core.paths import DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)


OUTPUT_DIR = DERIVED_DIR / "classical_seed_stability"
LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
N_SEEDS = 7
LATENT_DIM = 8
METHOD = os.environ.get("CAOS_CLASSICAL_SEED_METHOD", "pca_8").strip()


def normalize_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = values.min(axis=1, keepdims=True)
    high = values.max(axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def fit_with_seed(spectra: np.ndarray, latent_dim: int, seed: int) -> np.ndarray:
    if METHOD == "pca_8":
        return PCA(n_components=latent_dim, random_state=seed).fit_transform(spectra)
    if METHOD == "nmf_8":
        nn = np.clip(spectra, 0.0, None)
        return NMF(n_components=latent_dim, init="nndsvdar", random_state=seed, max_iter=400).fit_transform(nn)
    if METHOD == "ica_8":
        return FastICA(n_components=latent_dim, random_state=seed, max_iter=400, tol=1e-3, whiten="unit-variance").fit_transform(spectra)
    if METHOD == "dense_ae_8":
        B = spectra.shape[1]
        hidden = (max(B // 2, latent_dim * 2), latent_dim, max(B // 2, latent_dim * 2))
        mlp = MLPRegressor(hidden_layer_sizes=hidden, activation="relu", solver="adam",
                           max_iter=200, random_state=seed, early_stopping=False, learning_rate_init=1e-3)
        mlp.fit(spectra, spectra)
        h1 = np.maximum(0.0, spectra @ mlp.coefs_[0] + mlp.intercepts_[0])
        z = np.maximum(0.0, h1 @ mlp.coefs_[1] + mlp.intercepts_[1])
        return z
    raise ValueError(f"Unknown CAOS_CLASSICAL_SEED_METHOD: {METHOD}")


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
    spectra_raw = flat[pixel_indices]
    labels_full = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(labels_full, SAMPLES_PER_CLASS, random_state=42)
    spectra = spectra_raw[sample_idx_local]
    labels = labels_full[sample_idx_local]
    spectra_norm = normalize_per_row(spectra)
    n_classes = int(np.unique(labels).size)

    latents = []
    cluster_labels = []
    ari_vs_gt = []
    for seed in range(N_SEEDS):
        try:
            z = fit_with_seed(spectra_norm, LATENT_DIM, seed)
        except Exception as exc:
            print(f"    seed {seed} failed: {exc}", flush=True)
            continue
        latents.append(z)
        km = KMeans(n_clusters=n_classes, n_init=10, random_state=42).fit(z)
        cluster_labels.append(km.labels_)
        ari_vs_gt.append(float(adjusted_rand_score(labels, km.labels_)))

    if len(latents) < 2:
        return None
    n = len(latents)
    pair_ari = np.eye(n)
    proc_dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            ari_ij = float(adjusted_rand_score(cluster_labels[i], cluster_labels[j]))
            pair_ari[i, j] = pair_ari[j, i] = ari_ij
            zi = latents[i] - latents[i].mean(axis=0)
            zj = latents[j] - latents[j].mean(axis=0)
            R, _ = orthogonal_procrustes(zi, zj)
            aligned = zi @ R
            d = float(np.linalg.norm(aligned - zj) / (np.linalg.norm(zj) + 1e-12))
            proc_dist[i, j] = proc_dist[j, i] = d

    off_diag = pair_ari[~np.eye(n, dtype=bool)]
    proc_off = proc_dist[~np.eye(n, dtype=bool)]
    return {
        "scene_id": scene_id,
        "method": METHOD,
        "n_seeds": n,
        "latent_dim": LATENT_DIM,
        "samples_per_class": SAMPLES_PER_CLASS,
        "ari_vs_gt_per_seed": [round(v, 6) for v in ari_vs_gt],
        "ari_vs_gt_summary": {
            "mean": round(float(np.mean(ari_vs_gt)), 6),
            "std": round(float(np.std(ari_vs_gt)), 6),
            "min": round(float(np.min(ari_vs_gt)), 6),
            "max": round(float(np.max(ari_vs_gt)), 6),
        },
        "seed_pair_ari": [[round(float(v), 6) for v in row] for row in pair_ari.tolist()],
        "seed_pair_procrustes_dist": [[round(float(v), 6) for v in row] for row in proc_dist.tolist()],
        "off_diagonal_summary": {
            "ari_mean": round(float(off_diag.mean()), 6),
            "ari_min": round(float(off_diag.min()), 6),
            "ari_std": round(float(off_diag.std()), 6),
            "procrustes_mean": round(float(proc_off.mean()), 6),
            "procrustes_max": round(float(proc_off.max()), 6),
        },
        "framework_axis": "B-6 follow-up: classical-method seed stability (sklearn) — pairwise cluster ARI + Procrustes between latents across N_SEEDS sklearn random_state seeds",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_classical_seed_stability v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[classical_seed:{METHOD}] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            continue
        out = OUTPUT_DIR / f"{scene_id}__{METHOD}.json"
        out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        odg = payload["off_diagonal_summary"]
        print(f"  off-diag ari mean={odg['ari_mean']:.3f} min={odg['ari_min']:.3f} std={odg['ari_std']:.3f}", flush=True)
        written += 1
    print(f"[classical_seed:{METHOD}] done -- {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
