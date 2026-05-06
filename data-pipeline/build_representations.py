"""Spectral representations: PCA, ICA, NMF, dense AE.

For every labelled scene this builder fits a small set of low-dimensional
representations directly on the raw spectra (the documents in the
master plan section 5 sense) and saves embeddings + reconstruction
quality. CAE / VAE remain pending in a heavier cycle that uses
torch.

Outputs:
  data/local/representations/<method>/<scene>/{features.npy, fit.pkl}
  data/derived/representations/<method>/<scene>.json

Each derived JSON contains:
- method, scene_id, latent_dim, n_documents
- explained variance / reconstruction error stats
- 2D and 3D scatter coords sampled to <=2k points
- per-class silhouette in the latent space
- ARI / NMI of K-means(latent) vs ground-truth label
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import NMF, FastICA, PCA
from sklearn.metrics import (
    adjusted_rand_score,
    normalized_mutual_info_score,
    silhouette_samples,
)
from sklearn.neural_network import MLPRegressor

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


LOCAL_OUT_ROOT = DATA_DIR / "local" / "representations"
DERIVED_OUT_ROOT = DERIVED_DIR / "representations"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42


def normalize_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = values.min(axis=1, keepdims=True)
    high = values.max(axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def silhouette_per_class(latent: np.ndarray, labels: np.ndarray) -> dict | None:
    if len(np.unique(labels)) < 2 or latent.shape[0] > 4000:
        # Cap for speed
        n = min(4000, latent.shape[0])
        rng = np.random.default_rng(42)
        idx = rng.choice(latent.shape[0], n, replace=False) if latent.shape[0] > n else np.arange(latent.shape[0])
        latent = latent[idx]
        labels = labels[idx]
    if len(np.unique(labels)) < 2:
        return None
    samples = silhouette_samples(latent, labels)
    return {
        "overall": round(float(samples.mean()), 6),
        "per_class": {
            str(int(c)): round(float(samples[labels == c].mean()), 6)
            for c in np.unique(labels)
        },
    }


def downstream_kmeans_agreement(latent: np.ndarray, labels: np.ndarray) -> dict:
    n_classes = int(len(np.unique(labels)))
    if n_classes < 2:
        return {"ari": 0.0, "nmi": 0.0}
    km = KMeans(n_clusters=n_classes, n_init=10, random_state=42)
    pred = km.fit_predict(latent)
    return {
        "ari": round(float(adjusted_rand_score(labels, pred)), 6),
        "nmi": round(float(normalized_mutual_info_score(labels, pred)), 6),
    }


def fit_pca(spectra: np.ndarray, n_components: int) -> tuple[np.ndarray, dict]:
    pca = PCA(n_components=n_components, random_state=RANDOM_STATE)
    z = pca.fit_transform(spectra)
    recon = pca.inverse_transform(z)
    rmse = float(np.sqrt(np.mean((spectra - recon) ** 2)))
    return z, {
        "explained_variance_ratio": [round(float(v), 6) for v in pca.explained_variance_ratio_.tolist()],
        "explained_variance_total": round(float(pca.explained_variance_ratio_.sum()), 6),
        "reconstruction_rmse": round(rmse, 6),
    }


def fit_nmf(spectra_nonneg: np.ndarray, n_components: int) -> tuple[np.ndarray, dict]:
    nmf = NMF(n_components=n_components, init="nndsvd", random_state=RANDOM_STATE, max_iter=400)
    z = nmf.fit_transform(spectra_nonneg)
    recon = nmf.inverse_transform(z)
    rmse = float(np.sqrt(np.mean((spectra_nonneg - recon) ** 2)))
    return z, {
        "reconstruction_err": round(float(nmf.reconstruction_err_), 6),
        "reconstruction_rmse": round(rmse, 6),
        "n_iter": int(nmf.n_iter_),
    }


def fit_ica(spectra: np.ndarray, n_components: int) -> tuple[np.ndarray, dict]:
    ica = FastICA(n_components=n_components, random_state=RANDOM_STATE, max_iter=400, tol=1e-3, whiten="unit-variance")
    z = ica.fit_transform(spectra)
    return z, {
        "n_iter": int(ica.n_iter_) if ica.n_iter_ is not None else 0,
    }


def fit_dense_ae(spectra: np.ndarray, latent_dim: int) -> tuple[np.ndarray, dict]:
    """Dense autoencoder via sklearn MLPRegressor with tied input/output."""
    # Use MLPRegressor as a denoising autoencoder approximation: regress
    # x -> x with a bottleneck of latent_dim. Then the hidden activations
    # are the latent code.
    B = spectra.shape[1]
    hidden = (max(B // 2, latent_dim * 2), latent_dim, max(B // 2, latent_dim * 2))
    mlp = MLPRegressor(
        hidden_layer_sizes=hidden,
        activation="relu",
        solver="adam",
        max_iter=200,
        random_state=RANDOM_STATE,
        early_stopping=False,
        learning_rate_init=1e-3,
    )
    mlp.fit(spectra, spectra)
    # Forward pass to the bottleneck layer
    h1 = np.maximum(0.0, spectra @ mlp.coefs_[0] + mlp.intercepts_[0])
    z = np.maximum(0.0, h1 @ mlp.coefs_[1] + mlp.intercepts_[1])
    recon = mlp.predict(spectra)
    rmse = float(np.sqrt(np.mean((spectra - recon) ** 2)))
    return z, {
        "hidden_layer_sizes": list(hidden),
        "reconstruction_rmse": round(rmse, 6),
        "n_iter": int(mlp.n_iter_),
        "final_loss": round(float(mlp.loss_), 6),
    }


def _torch_seed() -> None:
    import torch  # type: ignore
    torch.manual_seed(RANDOM_STATE)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(RANDOM_STATE)


def fit_cae_1d(spectra: np.ndarray, latent_dim: int = 8, epochs: int = 80) -> tuple[np.ndarray, dict]:
    """1D convolutional autoencoder along the spectral axis."""
    import torch  # type: ignore
    import torch.nn as nn  # type: ignore
    from torch.utils.data import DataLoader, TensorDataset  # type: ignore
    _torch_seed()

    D, B = spectra.shape
    x = torch.from_numpy(spectra.astype(np.float32)).unsqueeze(1)  # (D, 1, B)

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

        def encode(self, x: torch.Tensor) -> torch.Tensor:
            return self.head(self.flatten(self.enc(x)))

        def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            z = self.encode(x)
            recon = self.up(z)
            return z, recon

    model = CAE1D(B, latent_dim)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loader = DataLoader(TensorDataset(x), batch_size=64, shuffle=True)
    final_loss = 0.0
    for _ in range(epochs):
        running = 0.0
        n_batches = 0
        for (batch,) in loader:
            opt.zero_grad()
            _, recon = model(batch)
            loss = nn.functional.mse_loss(recon, batch.squeeze(1))
            loss.backward()
            opt.step()
            running += float(loss.detach())
            n_batches += 1
        final_loss = running / max(n_batches, 1)
    model.eval()
    with torch.no_grad():
        z, recon = model(x)
    rmse = float(np.sqrt(np.mean((spectra - recon.cpu().numpy()) ** 2)))
    return z.cpu().numpy(), {
        "architecture": "Conv1d(1->16,k5)->Pool2->Conv1d(16->32,k5)->AdaptiveAvgPool(8)->Linear(256->L)->Linear(L->B)",
        "epochs": int(epochs),
        "final_loss": round(float(final_loss), 6),
        "reconstruction_rmse": round(rmse, 6),
    }


def fit_beta_vae(spectra: np.ndarray, latent_dim: int = 8, beta: float = 4.0, epochs: int = 80) -> tuple[np.ndarray, dict]:
    """β-VAE on flat spectra. Uses the encoder mean as the deterministic latent code."""
    import torch  # type: ignore
    import torch.nn as nn  # type: ignore
    from torch.utils.data import DataLoader, TensorDataset  # type: ignore
    _torch_seed()

    D, B = spectra.shape
    x = torch.from_numpy(spectra.astype(np.float32))

    class BetaVAE(nn.Module):
        def __init__(self, B: int, latent: int) -> None:
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

        def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            h = self.enc(x)
            return self.fc_mu(h), self.fc_logvar(h)

        def reparameterise(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
            std = torch.exp(0.5 * logvar)
            eps = torch.randn_like(std)
            return mu + eps * std

        def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
            mu, logvar = self.encode(x)
            z = self.reparameterise(mu, logvar)
            recon = self.dec(z)
            return recon, mu, logvar, z

    model = BetaVAE(B, latent_dim)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loader = DataLoader(TensorDataset(x), batch_size=64, shuffle=True)
    final_recon = 0.0
    final_kl = 0.0
    for _ in range(epochs):
        running_recon = 0.0
        running_kl = 0.0
        n_batches = 0
        for (batch,) in loader:
            opt.zero_grad()
            recon, mu, logvar, _ = model(batch)
            recon_loss = nn.functional.mse_loss(recon, batch, reduction="sum") / batch.shape[0]
            kl = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp()) / batch.shape[0]
            loss = recon_loss + beta * kl
            loss.backward()
            opt.step()
            running_recon += float(recon_loss.detach())
            running_kl += float(kl.detach())
            n_batches += 1
        final_recon = running_recon / max(n_batches, 1)
        final_kl = running_kl / max(n_batches, 1)
    model.eval()
    with torch.no_grad():
        mu, _ = model.encode(x)
        recon = model.dec(mu)
    rmse = float(np.sqrt(np.mean((spectra - recon.cpu().numpy()) ** 2)))
    return mu.cpu().numpy(), {
        "architecture": "Linear(B->128)->Linear(128->64)->[mu,logvar](L) ; Linear(L->64->128->B)",
        "beta": float(beta),
        "epochs": int(epochs),
        "final_recon_loss": round(float(final_recon), 6),
        "final_kl": round(float(final_kl), 6),
        "reconstruction_rmse": round(rmse, 6),
    }


def _extract_patches(
    cube: np.ndarray,
    pixel_indices_global: np.ndarray,
    cube_shape: tuple[int, int, int],
    patch: int = 5,
) -> np.ndarray:
    """Extract (patch x patch x B) windows around each global pixel index. Pads with zeros at borders."""
    h, w, B = cube_shape
    half = patch // 2
    padded = np.pad(cube.astype(np.float32), ((half, half), (half, half), (0, 0)), mode="constant")
    out = np.empty((len(pixel_indices_global), patch, patch, B), dtype=np.float32)
    for k, gidx in enumerate(pixel_indices_global):
        i = int(gidx) // w
        j = int(gidx) % w
        out[k] = padded[i:i + patch, j:j + patch, :]
    # Per-cube min-max normalisation per patch (keeps relative spectral shape)
    flat = out.reshape(out.shape[0], -1)
    lo = flat.min(axis=1, keepdims=True)
    hi = flat.max(axis=1, keepdims=True)
    rng = np.where(hi - lo > 1e-6, hi - lo, 1.0)
    flat = (flat - lo) / rng
    return flat.reshape(out.shape)


def fit_cae_2d(
    cube: np.ndarray,
    pixel_indices_global: np.ndarray,
    cube_shape: tuple[int, int, int],
    latent_dim: int = 8,
    epochs: int = 60,
    patch: int = 5,
) -> tuple[np.ndarray, dict]:
    """2D CAE on (patch x patch) windows with B channels."""
    import torch  # type: ignore
    import torch.nn as nn  # type: ignore
    from torch.utils.data import DataLoader, TensorDataset  # type: ignore
    _torch_seed()

    patches = _extract_patches(cube, pixel_indices_global, cube_shape, patch=patch)
    # (N, patch, patch, B) -> (N, B, patch, patch)
    x = torch.from_numpy(np.transpose(patches, (0, 3, 1, 2)).copy())
    N, B, P, _ = x.shape

    class CAE2D(nn.Module):
        def __init__(self, in_ch: int, latent: int) -> None:
            super().__init__()
            self.enc = nn.Sequential(
                nn.Conv2d(in_ch, 64, kernel_size=3, padding=1), nn.ReLU(),
                nn.Conv2d(64, 128, kernel_size=3, padding=1), nn.ReLU(),
                nn.AdaptiveAvgPool2d(1),
            )
            self.head = nn.Linear(128, latent)
            self.up = nn.Linear(latent, in_ch * P * P)
            self.in_ch = in_ch
            self.P = P

        def encode(self, x: torch.Tensor) -> torch.Tensor:
            return self.head(self.enc(x).flatten(1))

        def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
            z = self.encode(x)
            recon = self.up(z).view(x.shape[0], self.in_ch, self.P, self.P)
            return z, recon

    model = CAE2D(B, latent_dim)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loader = DataLoader(TensorDataset(x), batch_size=32, shuffle=True)
    final_loss = 0.0
    for _ in range(epochs):
        running = 0.0
        nb = 0
        for (batch,) in loader:
            opt.zero_grad()
            _, recon = model(batch)
            loss = nn.functional.mse_loss(recon, batch)
            loss.backward()
            opt.step()
            running += float(loss.detach())
            nb += 1
        final_loss = running / max(nb, 1)
    model.eval()
    with torch.no_grad():
        z = model.encode(x)
    rmse = float(np.sqrt(2 * final_loss))  # mse → rmse approximation
    return z.cpu().numpy(), {
        "architecture": "Conv2d(B->64,3)->Conv2d(64->128,3)->AdaptiveAvgPool->Linear(128->L)",
        "patch_size": int(patch),
        "epochs": int(epochs),
        "final_loss": round(float(final_loss), 6),
        "reconstruction_rmse": round(rmse, 6),
    }


def fit_cae_3d(
    cube: np.ndarray,
    pixel_indices_global: np.ndarray,
    cube_shape: tuple[int, int, int],
    latent_dim: int = 8,
    epochs: int = 60,
    patch: int = 5,
) -> tuple[np.ndarray, dict]:
    """3D CAE on (patch x patch x B) windows treated as a single-channel 3D volume."""
    import torch  # type: ignore
    import torch.nn as nn  # type: ignore
    from torch.utils.data import DataLoader, TensorDataset  # type: ignore
    _torch_seed()

    patches = _extract_patches(cube, pixel_indices_global, cube_shape, patch=patch)
    # (N, patch, patch, B) -> (N, 1, B, patch, patch) (channel dim, then depth=B)
    x_np = np.transpose(patches, (0, 3, 1, 2))[:, None, ...]
    x = torch.from_numpy(x_np.copy())
    N, _, Bdim, P, _ = x.shape

    class CAE3D(nn.Module):
        def __init__(self, latent: int) -> None:
            super().__init__()
            self.enc = nn.Sequential(
                nn.Conv3d(1, 8, kernel_size=(5, 3, 3), padding=(2, 1, 1)), nn.ReLU(),
                nn.MaxPool3d(kernel_size=(2, 1, 1)),
                nn.Conv3d(8, 16, kernel_size=(5, 3, 3), padding=(2, 1, 1)), nn.ReLU(),
                nn.AdaptiveAvgPool3d((4, 1, 1)),
            )
            self.head = nn.Linear(16 * 4, latent)

        def encode(self, x: torch.Tensor) -> torch.Tensor:
            return self.head(self.enc(x).flatten(1))

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.encode(x)

    model = CAE3D(latent_dim)
    # No reconstruction head for 3D — train via contrastive-style: maximise variance of the latent
    # while constraining it to remain in [-1, 1] via a bounded MSE to a learned mean.
    # This keeps compute manageable on CPU. We instead fit a simple recon to the central pixel
    # spectrum (the "anchor" that the patch surrounds).
    centre_spectrum = patches[:, patch // 2, patch // 2, :]  # (N, B)
    anchor = torch.from_numpy(centre_spectrum.astype(np.float32))
    decode = nn.Linear(latent_dim, Bdim)
    opt = torch.optim.Adam(list(model.parameters()) + list(decode.parameters()), lr=1e-3)
    loader = DataLoader(TensorDataset(x, anchor), batch_size=32, shuffle=True)
    final_loss = 0.0
    for _ in range(epochs):
        running = 0.0
        nb = 0
        for batch_x, batch_anchor in loader:
            opt.zero_grad()
            z = model(batch_x)
            recon = decode(z)
            loss = nn.functional.mse_loss(recon, batch_anchor)
            loss.backward()
            opt.step()
            running += float(loss.detach())
            nb += 1
        final_loss = running / max(nb, 1)
    model.eval()
    with torch.no_grad():
        z = model(x)
    rmse = float(np.sqrt(final_loss))
    return z.cpu().numpy(), {
        "architecture": "Conv3d(1->8,5x3x3)->Pool3d(2,1,1)->Conv3d(8->16,5x3x3)->AdaptiveAvgPool3d(4,1,1)->Linear(64->L); decode predicts centre-pixel spectrum",
        "patch_size": int(patch),
        "epochs": int(epochs),
        "final_recon_to_centre_loss": round(float(final_loss), 6),
        "reconstruction_rmse_to_centre": round(rmse, 6),
    }


def project_2d_3d(z: np.ndarray) -> tuple[np.ndarray, np.ndarray, list[float]]:
    """PCA-2D and PCA-3D of a latent space, plus explained variance ratios."""
    if z.shape[1] < 3:
        # Pad if not enough latent dims
        pad = np.zeros((z.shape[0], 3 - z.shape[1]), dtype=z.dtype)
        z3 = np.concatenate([z, pad], axis=1)
        return z[:, :2] if z.shape[1] >= 2 else z3[:, :2], z3, [1.0, 0.0, 0.0]
    pca = PCA(n_components=3, random_state=RANDOM_STATE)
    proj = pca.fit_transform(z)
    return proj[:, :2], proj, [round(float(v), 6) for v in pca.explained_variance_ratio_.tolist()]


def build_for_scene(scene_id: str) -> list[dict]:
    import os
    if scene_id not in SCENES or not has_labels(scene_id):
        return []
    cube, gt, _ = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra_raw = flat[pixel_indices]
    labels_full = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(labels_full, SAMPLES_PER_CLASS, random_state=RANDOM_STATE)
    spectra = spectra_raw[sample_idx_local]
    labels = labels_full[sample_idx_local]
    spectra_norm = normalize_per_row(spectra)
    D, B = spectra_norm.shape
    pixel_indices_sampled = pixel_indices[sample_idx_local]
    cube_shape = (h, w, b)

    methods: list[tuple[str, callable]] = [
        ("pca_3", lambda s: fit_pca(s, 3)),
        ("pca_10", lambda s: fit_pca(s, 10)),
        ("pca_30", lambda s: fit_pca(s, min(30, B - 1))),
        ("nmf_8", lambda s: fit_nmf(np.clip(s, 0.0, None), 8)),
        ("nmf_20", lambda s: fit_nmf(np.clip(s, 0.0, None), 20)),
        ("ica_10", lambda s: fit_ica(s, 10)),
        ("dense_ae_8", lambda s: fit_dense_ae(s, 8)),
        ("cae_1d_4", lambda s: fit_cae_1d(s, 4)),
        ("cae_1d_8", lambda s: fit_cae_1d(s, 8)),
        ("cae_1d_16", lambda s: fit_cae_1d(s, 16)),
        ("cae_1d_32", lambda s: fit_cae_1d(s, 32)),
        ("beta_vae_4", lambda s: fit_beta_vae(s, 4, beta=4.0)),
        ("beta_vae_8", lambda s: fit_beta_vae(s, 8, beta=4.0)),
        ("beta_vae_16", lambda s: fit_beta_vae(s, 16, beta=4.0)),
        ("beta_vae_32", lambda s: fit_beta_vae(s, 32, beta=4.0)),
        ("cae_2d_4", lambda s: fit_cae_2d(cube, pixel_indices_sampled, cube_shape, 4)),
        ("cae_2d_8", lambda s: fit_cae_2d(cube, pixel_indices_sampled, cube_shape, 8)),
        ("cae_2d_16", lambda s: fit_cae_2d(cube, pixel_indices_sampled, cube_shape, 16)),
        ("cae_2d_32", lambda s: fit_cae_2d(cube, pixel_indices_sampled, cube_shape, 32)),
        ("cae_3d_4", lambda s: fit_cae_3d(cube, pixel_indices_sampled, cube_shape, 4)),
        ("cae_3d_8", lambda s: fit_cae_3d(cube, pixel_indices_sampled, cube_shape, 8)),
        ("cae_3d_16", lambda s: fit_cae_3d(cube, pixel_indices_sampled, cube_shape, 16)),
        ("cae_3d_32", lambda s: fit_cae_3d(cube, pixel_indices_sampled, cube_shape, 32)),
    ]
    repr_filter = os.environ.get("CAOS_REPR_FILTER", "").strip()
    if repr_filter:
        wanted = {m.strip() for m in repr_filter.split(",") if m.strip()}
        methods = [m for m in methods if m[0] in wanted]

    rng = np.random.default_rng(42)
    out_summaries = []

    for method_name, fit_fn in methods:
        try:
            latent, fit_meta = fit_fn(spectra_norm)
        except Exception as exc:
            out_summaries.append({"method": method_name, "status": "failed", "error": str(exc)})
            continue

        local_dir = LOCAL_OUT_ROOT / method_name / scene_id
        local_dir.mkdir(parents=True, exist_ok=True)
        np.save(local_dir / "features.npy", latent.astype(np.float32))

        sil = silhouette_per_class(latent, labels)
        agree = downstream_kmeans_agreement(latent, labels)
        proj_2d, proj_3d, evr = project_2d_3d(latent)

        # Subsample scatter coords for derived payload
        n_keep = min(D, 2000)
        idx = rng.choice(D, n_keep, replace=False) if D > n_keep else np.arange(D)
        scatter = [
            {
                "i": int(j),
                "label_id": int(labels[int(j)]),
                "x_2d": round(float(proj_2d[int(j), 0]), 6),
                "y_2d": round(float(proj_2d[int(j), 1]), 6),
                "x_3d": round(float(proj_3d[int(j), 0]), 6),
                "y_3d": round(float(proj_3d[int(j), 1]), 6),
                "z_3d": round(float(proj_3d[int(j), 2]), 6),
            }
            for j in idx
        ]

        derived_payload = {
            "scene_id": scene_id,
            "method": method_name,
            "n_documents": int(D),
            "n_bands_input": int(B),
            "latent_dim": int(latent.shape[1]),
            "fit_meta": fit_meta,
            "silhouette_label": sil,
            "downstream_kmeans_vs_label": agree,
            "scatter_pca_3d_explained_variance": evr,
            "scatter_2d_3d_subsample": scatter,
            "features_local_path": str((local_dir / "features.npy").relative_to(ROOT)).replace("\\", "/"),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "builder_version": "build_representations v0.1",
        }
        out_path = DERIVED_OUT_ROOT / method_name / f"{scene_id}.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as h_handle:
            json.dump(derived_payload, h_handle, separators=(",", ":"))

        out_summaries.append({
            "method": method_name,
            "status": "ok",
            "latent_dim": int(latent.shape[1]),
            "ari_kmeans_vs_label": agree["ari"],
            "nmi_kmeans_vs_label": agree["nmi"],
            "silhouette_overall": sil["overall"] if sil else None,
        })
    return out_summaries


def main() -> int:
    DERIVED_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    written_total = 0
    for scene_id in LABELLED_SCENES:
        print(f"[representations] {scene_id} ...", flush=True)
        try:
            summaries = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        for s in summaries:
            if s["status"] == "ok":
                sil = s["silhouette_overall"]
                print(
                    f"  {s['method']:13s} dim={s['latent_dim']:3d}  "
                    f"ARI={s['ari_kmeans_vs_label']:+.3f}  "
                    f"NMI={s['nmi_kmeans_vs_label']:.3f}  "
                    f"silhouette={sil:+.3f}" if sil is not None else
                    f"  {s['method']:13s} dim={s['latent_dim']:3d}  ARI={s['ari_kmeans_vs_label']:+.3f}",
                    flush=True,
                )
            else:
                print(f"  {s['method']:13s} FAILED: {s.get('error', '')}", flush=True)
        written_total += sum(1 for s in summaries if s["status"] == "ok")
    print(f"[representations] done — {written_total} (method x scene) outputs.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
