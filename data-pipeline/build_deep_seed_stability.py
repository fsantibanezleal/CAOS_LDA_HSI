"""B-6 follow-up: CAE-1D seed stability across torch random seeds.

For each labelled scene, fits CAE-1D at latent_dim=8 with N_SEEDS=7
different torch random seeds. Reports for each seed pair:
  - ARI of K-means(latent_seed_a) vs K-means(latent_seed_b)
  - Cosine distance of the centred latent matrices after Procrustes

Also reports the off-diagonal mean / min / std and per-seed ARI vs the
ground-truth label. Higher off-diagonal ARI means the deep-method
representation is reproducible across initialisations; lower means
the architecture is sensitive to seed.

Output: data/derived/deep_seed_stability/<scene>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score
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


OUTPUT_DIR = DERIVED_DIR / "deep_seed_stability"
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


def normalize_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = values.min(axis=1, keepdims=True)
    high = values.max(axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def fit_cae_1d_with_seed(spectra: np.ndarray, latent_dim: int, seed: int, epochs: int = 80) -> np.ndarray:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    D, B = spectra.shape
    x = torch.from_numpy(spectra.astype(np.float32)).unsqueeze(1)

    class CAE1D(nn.Module):
        def __init__(self, B: int, latent: int) -> None:
            super().__init__()
            self.enc = nn.Sequential(
                nn.Conv1d(1, 16, kernel_size=5, padding=2), nn.ReLU(),
                nn.MaxPool1d(2),
                nn.Conv1d(16, 32, kernel_size=5, padding=2), nn.ReLU(),
                nn.AdaptiveAvgPool1d(8),
            )
            self.flatten = nn.Flatten()
            self.head = nn.Linear(32 * 8, latent)
            self.up = nn.Linear(latent, B)

        def encode(self, x):
            return self.head(self.flatten(self.enc(x)))

        def forward(self, x):
            z = self.encode(x)
            return z, self.up(z)

    model = CAE1D(B, latent_dim)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loader = DataLoader(TensorDataset(x), batch_size=64, shuffle=True)
    for _ in range(epochs):
        for (batch,) in loader:
            opt.zero_grad()
            _, recon = model(batch)
            loss = nn.functional.mse_loss(recon, batch.squeeze(1))
            loss.backward()
            opt.step()
    model.eval()
    with torch.no_grad():
        z, _ = model(x)
    return z.cpu().numpy()


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

    # Fit CAE-1D with N_SEEDS torch seeds
    latents = []
    cluster_labels = []
    ari_vs_gt = []
    for seed in range(N_SEEDS):
        z = fit_cae_1d_with_seed(spectra_norm, LATENT_DIM, seed)
        latents.append(z)
        km = KMeans(n_clusters=n_classes, n_init=10, random_state=42).fit(z)
        cluster_labels.append(km.labels_)
        ari_vs_gt.append(float(adjusted_rand_score(labels, km.labels_)))

    # Pairwise seed-pair stats
    pair_ari = np.eye(N_SEEDS)
    procrustes_dist = np.zeros((N_SEEDS, N_SEEDS))
    for i in range(N_SEEDS):
        for j in range(i + 1, N_SEEDS):
            ari_ij = float(adjusted_rand_score(cluster_labels[i], cluster_labels[j]))
            pair_ari[i, j] = pair_ari[j, i] = ari_ij
            # Procrustes alignment between latents
            zi = latents[i] - latents[i].mean(axis=0)
            zj = latents[j] - latents[j].mean(axis=0)
            R, scale = orthogonal_procrustes(zi, zj)
            aligned = zi @ R
            d = float(np.linalg.norm(aligned - zj) / (np.linalg.norm(zj) + 1e-12))
            procrustes_dist[i, j] = procrustes_dist[j, i] = d

    off_diag = pair_ari[~np.eye(N_SEEDS, dtype=bool)]
    proc_off = procrustes_dist[~np.eye(N_SEEDS, dtype=bool)]
    return {
        "scene_id": scene_id,
        "method": "cae_1d_8",
        "n_seeds": N_SEEDS,
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
        "seed_pair_procrustes_dist": [[round(float(v), 6) for v in row] for row in procrustes_dist.tolist()],
        "off_diagonal_summary": {
            "ari_mean": round(float(off_diag.mean()), 6),
            "ari_min": round(float(off_diag.min()), 6),
            "ari_std": round(float(off_diag.std()), 6),
            "procrustes_mean": round(float(proc_off.mean()), 6),
            "procrustes_max": round(float(proc_off.max()), 6),
        },
        "framework_axis": "B-6 follow-up: deep-method seed stability for CAE-1D — pairwise cluster ARI + Procrustes between latent embeddings across N_SEEDS torch initialisations",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_deep_seed_stability v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[deep_seed] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            continue
        out = OUTPUT_DIR / f"{scene_id}.json"
        out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        odg = payload["off_diagonal_summary"]
        print(
            f"  off-diag ari mean={odg['ari_mean']:.3f} min={odg['ari_min']:.3f} std={odg['ari_std']:.3f}",
            flush=True,
        )
        written += 1
    print(f"[deep_seed] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
