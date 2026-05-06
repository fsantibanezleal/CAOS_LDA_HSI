"""B-9 follow-up: per-document reconstruction loss via CAE-1D and beta-VAE
as anomaly indicators on the labelled scenes.

For each scene:
  - Train CAE-1D K=8 and beta-VAE K=8 on the canonical sampled spectra
  - Compute per-doc reconstruction RMSE (CAE-1D) and recon_loss + KL
    (beta-VAE)
  - Compute Spearman correlation between each anomaly indicator and
    theta-logistic misclassification (5-fold StratifiedKFold)
  - Per-class median + p95 of the anomaly scores

Output: data/derived/deep_anomaly/<scene>.json

Higher Spearman => the deep representations reconstruction error
flags hard / mis-classified documents better than chance.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold

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


OUTPUT_DIR = DERIVED_DIR / "deep_anomaly"
LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
LATENT_DIM = 8


def normalize_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = values.min(axis=1, keepdims=True)
    high = values.max(axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def fit_cae_1d_with_recon(spectra: np.ndarray, latent: int = 8, epochs: int = 80) -> tuple[np.ndarray, np.ndarray]:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    torch.manual_seed(42)

    D, B = spectra.shape
    x = torch.from_numpy(spectra.astype(np.float32)).unsqueeze(1)

    class CAE1D(nn.Module):
        def __init__(self, B, latent):
            super().__init__()
            self.enc = nn.Sequential(
                nn.Conv1d(1, 16, kernel_size=5, padding=2), nn.ReLU(),
                nn.MaxPool1d(2),
                nn.Conv1d(16, 32, kernel_size=5, padding=2), nn.ReLU(),
                nn.AdaptiveAvgPool1d(8),
            )
            self.head = nn.Linear(32 * 8, latent)
            self.up = nn.Linear(latent, B)

        def encode(self, x):
            return self.head(self.enc(x).flatten(1))

        def forward(self, x):
            z = self.encode(x)
            return z, self.up(z)

    model = CAE1D(B, latent)
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
        z, recon = model(x)
        per_doc_rmse = torch.sqrt(((recon - x.squeeze(1)) ** 2).mean(dim=1))
    return z.cpu().numpy(), per_doc_rmse.cpu().numpy()


def fit_beta_vae_with_loss(spectra: np.ndarray, latent: int = 8, beta: float = 4.0, epochs: int = 80) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    torch.manual_seed(42)

    D, B = spectra.shape
    x = torch.from_numpy(spectra.astype(np.float32))

    class BetaVAE(nn.Module):
        def __init__(self, B, latent):
            super().__init__()
            self.enc = nn.Sequential(
                nn.Linear(B, 128), nn.ReLU(),
                nn.Linear(128, 64), nn.ReLU(),
            )
            self.fc_mu = nn.Linear(64, latent)
            self.fc_logvar = nn.Linear(64, latent)
            self.dec = nn.Sequential(
                nn.Linear(latent, 64), nn.ReLU(),
                nn.Linear(64, 128), nn.ReLU(),
                nn.Linear(128, B),
            )

        def encode(self, x):
            h = self.enc(x)
            return self.fc_mu(h), self.fc_logvar(h)

    model = BetaVAE(B, latent)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loader = DataLoader(TensorDataset(x), batch_size=64, shuffle=True)
    for _ in range(epochs):
        for (batch,) in loader:
            opt.zero_grad()
            mu, logvar = model.encode(batch)
            std = torch.exp(0.5 * logvar)
            z = mu + torch.randn_like(std) * std
            recon = model.dec(z)
            recon_loss = nn.functional.mse_loss(recon, batch, reduction="sum") / batch.shape[0]
            kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp()) / batch.shape[0]
            loss = recon_loss + beta * kl
            loss.backward()
            opt.step()
    model.eval()
    with torch.no_grad():
        mu, logvar = model.encode(x)
        recon = model.dec(mu)
        per_doc_rmse = torch.sqrt(((recon - x) ** 2).mean(dim=1))
        per_doc_kl = -0.5 * (1 + logvar - mu.pow(2) - logvar.exp()).sum(dim=1)
    return mu.cpu().numpy(), per_doc_rmse.cpu().numpy(), per_doc_kl.cpu().numpy()


def theta_logistic_misclass_mask(features: np.ndarray, labels: np.ndarray) -> np.ndarray:
    n = features.shape[0]
    misclass = np.zeros(n, dtype=bool)
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for tr, te in skf.split(features, labels):
        clf = LogisticRegression(max_iter=2000, C=1.0).fit(features[tr], labels[tr])
        pred = clf.predict(features[te])
        misclass[te] = pred != labels[te]
    return misclass


def per_class_summary(scores: np.ndarray, labels: np.ndarray) -> dict:
    out = {}
    for c in np.unique(labels):
        s = scores[labels == c]
        out[str(int(c))] = {
            "median": round(float(np.median(s)), 6),
            "p95": round(float(np.percentile(s, 95)), 6),
            "n": int(s.size),
        }
    return out


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

    cae_z, cae_rmse = fit_cae_1d_with_recon(spectra_norm)
    bvae_z, bvae_rmse, bvae_kl = fit_beta_vae_with_loss(spectra_norm)

    cae_misclass = theta_logistic_misclass_mask(cae_z, labels)
    bvae_misclass = theta_logistic_misclass_mask(bvae_z, labels)

    rho_cae_rmse, _ = spearmanr(cae_rmse, cae_misclass.astype(np.float32))
    rho_bvae_rmse, _ = spearmanr(bvae_rmse, bvae_misclass.astype(np.float32))
    rho_bvae_kl, _ = spearmanr(bvae_kl, bvae_misclass.astype(np.float32))

    return {
        "scene_id": scene_id,
        "n_documents": int(labels.size),
        "cae_1d_8": {
            "anomaly_indicator": "reconstruction_rmse",
            "spearman_rho_vs_misclass": round(float(rho_cae_rmse), 6),
            "rmse_overall": {
                "median": round(float(np.median(cae_rmse)), 6),
                "p95": round(float(np.percentile(cae_rmse, 95)), 6),
            },
            "rmse_per_class": per_class_summary(cae_rmse, labels),
            "n_misclassified": int(cae_misclass.sum()),
        },
        "beta_vae_8": {
            "anomaly_indicators": ["reconstruction_rmse", "kl_divergence"],
            "spearman_rho_rmse_vs_misclass": round(float(rho_bvae_rmse), 6),
            "spearman_rho_kl_vs_misclass": round(float(rho_bvae_kl), 6),
            "rmse_overall": {
                "median": round(float(np.median(bvae_rmse)), 6),
                "p95": round(float(np.percentile(bvae_rmse, 95)), 6),
            },
            "kl_overall": {
                "median": round(float(np.median(bvae_kl)), 6),
                "p95": round(float(np.percentile(bvae_kl, 95)), 6),
            },
            "n_misclassified": int(bvae_misclass.sum()),
        },
        "framework_axis": "B-9 follow-up: deep-method anomaly indicators (CAE-1D recon RMSE; beta-VAE recon RMSE + KL) and Spearman rho vs theta-logistic misclassification on the same latent",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_deep_anomaly v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[deep_anom] {scene_id} ...", flush=True)
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
        cae = payload["cae_1d_8"]
        bv = payload["beta_vae_8"]
        print(f"  cae rho={cae['spearman_rho_vs_misclass']:+.3f}  bvae rho_rmse={bv['spearman_rho_rmse_vs_misclass']:+.3f}  rho_kl={bv['spearman_rho_kl_vs_misclass']:+.3f}", flush=True)
        written += 1
    print(f"[deep_anom] done -- {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
