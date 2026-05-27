"""V13 — learned wordification via VQ-VAE codebook (issue #620).

A 13th wordification recipe in the V1..V12 family: instead of
hand-crafted quantisation, learn a discrete codebook with VQ-VAE-style
quantisation directly on pixel spectra.

The encoder is a small MLP (B -> 64 -> M*8) producing M sub-vectors
of dimension 8 each. Each sub-vector is quantised to its nearest of
K codewords (a learnable [K, 8] codebook). The decoder reconstructs
the spectrum from the sum of selected codewords.

Tokens emitted per pixel = M (one codebook index per sub-vector).
Vocab size = M * K.

Hyperparameters per scene (default):
- M = 4 sub-vectors
- K = 32 codewords
- 100 epochs, Adam lr=3e-3
- straight-through estimator for the quantisation step

Output: data/local/wordifications/V13/uniform_Q8/{scene}/doc_term.npz
        + data/local/wordifications/V13/uniform_Q8/{scene}/vocab.json

This is "Q=8" only nominally because VQ-VAE doesn't bin by intensity;
the parameter is repurposed as `K = 4 * Q` codewords. Documented in
the per-scene metadata so downstream builders can read it correctly.

Tracks issue #620 (V13 VQ-VAE learned wordification).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications" / "V13" / "uniform_Q8"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42

M = 4          # number of sub-vectors per spectrum
K_CODEWORDS = 32
LATENT_DIM = 8
EPOCHS = 100
BATCH = 128
LR = 3e-3
COMMITMENT_BETA = 0.25


def set_seeds():
    np.random.seed(RANDOM_STATE)
    torch.manual_seed(RANDOM_STATE)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(RANDOM_STATE)


class VQVAE(nn.Module):
    def __init__(self, B: int, M: int, K: int, latent: int):
        super().__init__()
        self.M = M
        self.K = K
        self.latent = latent
        self.encoder = nn.Sequential(
            nn.Linear(B, 64), nn.GELU(),
            nn.Linear(64, M * latent),
        )
        # Codebook [K, latent] — separate codebook per sub-vector position
        self.codebook = nn.Parameter(torch.randn(M, K, latent) * 0.1)
        self.decoder = nn.Sequential(
            nn.Linear(M * latent, 64), nn.GELU(),
            nn.Linear(64, B),
        )

    def quantise(self, z: torch.Tensor):
        """z: [n, M, latent] -> codes [n, M] (long), z_q [n, M, latent]."""
        codes_list = []
        z_q_list = []
        for m in range(self.M):
            d = ((z[:, m, :].unsqueeze(1) - self.codebook[m].unsqueeze(0)) ** 2).sum(-1)  # [n, K]
            codes_m = d.argmin(dim=1)
            codes_list.append(codes_m)
            z_q_list.append(self.codebook[m][codes_m])
        codes = torch.stack(codes_list, dim=1)  # [n, M]
        z_q = torch.stack(z_q_list, dim=1)      # [n, M, latent]
        return codes, z_q

    def forward(self, x: torch.Tensor):
        n = x.shape[0]
        z = self.encoder(x).view(n, self.M, self.latent)
        codes, z_q = self.quantise(z)
        # Straight-through gradient
        z_st = z + (z_q - z).detach()
        x_hat = self.decoder(z_st.view(n, self.M * self.latent))
        # Losses
        commit_loss = F.mse_loss(z, z_q.detach())
        codebook_loss = F.mse_loss(z_q, z.detach())
        recon = F.mse_loss(x_hat, x)
        return x_hat, codes, recon, commit_loss, codebook_loss


def fit_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    mask = valid & (flat_labels > 0)
    pixel_idx = np.flatnonzero(mask)
    labels = flat_labels[pixel_idx]
    sample_local = stratified_sample_indices(labels, SAMPLES_PER_CLASS,
                                             random_state=RANDOM_STATE)
    spectra = flat[pixel_idx[sample_local]]
    # Min-max normalise per spectrum
    lo = spectra.min(axis=1, keepdims=True)
    hi = spectra.max(axis=1, keepdims=True)
    spectra01 = (spectra - lo) / np.maximum(hi - lo, 1e-12)
    D = spectra01.shape[0]

    set_seeds()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = VQVAE(B=B, M=M, K=K_CODEWORDS, latent=LATENT_DIM).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    X = torch.from_numpy(spectra01).to(device)

    for epoch in range(EPOCHS):
        # Shuffle
        perm = torch.randperm(D, device=device)
        for start in range(0, D, BATCH):
            idx = perm[start:start + BATCH]
            x = X[idx]
            _, _, recon, cl, cbl = model(x)
            loss = recon + COMMITMENT_BETA * cl + cbl
            opt.zero_grad()
            loss.backward()
            opt.step()

    # Final code extraction
    model.eval()
    with torch.no_grad():
        codes, _ = model.quantise(model.encoder(X).view(D, M, LATENT_DIM))
    codes_np = codes.cpu().numpy()  # [D, M]

    # Build sparse [D, M*K] doc-term: each row has exactly M nonzeros
    vocab = [f"vq_m{m}_c{c:02d}" for m in range(M) for c in range(K_CODEWORDS)]
    rows = np.repeat(np.arange(D), M)
    sub_idx = np.tile(np.arange(M), D)
    cols = sub_idx * K_CODEWORDS + codes_np.ravel().astype(np.int64)
    data = np.ones(D * M, dtype=np.int32)
    doc_term = sp.csr_matrix(
        (data, (rows, cols)), shape=(D, M * K_CODEWORDS), dtype=np.int32
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "M": M, "K_codewords": K_CODEWORDS, "vocab_size": M * K_CODEWORDS,
        "doc_term": doc_term, "vocab": vocab,
        "epochs": EPOCHS, "batch": BATCH,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V13 VQ-VAE learned wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V13] {scene} ...", flush=True)
        try:
            res = fit_for_scene(scene)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback; traceback.print_exc()
            n_skip += 1
            continue
        if res is None:
            n_skip += 1
            continue
        out_dir = WORDIFICATION_LOCAL / scene
        out_dir.mkdir(parents=True, exist_ok=True)
        sp.save_npz(out_dir / "doc_term.npz", res["doc_term"])
        with (out_dir / "vocab.json").open("w", encoding="utf-8") as h:
            json.dump({
                "vocab": res["vocab"], "recipe": "V13",
                "scheme": "uniform", "Q": 8,  # nominal
                "B": res["B"], "M": res["M"], "K_codewords": res["K_codewords"],
                "epochs": res["epochs"], "batch": res["batch"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v13 v0.1",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} vocab={res['vocab_size']} "
            f"M={res['M']} K={res['K_codewords']}",
            flush=True,
        )
    print(f"[V13] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
