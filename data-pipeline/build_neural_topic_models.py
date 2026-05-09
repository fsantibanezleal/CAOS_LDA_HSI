"""Neural variational topic models — ProdLDA via Pyro and CTM via
contextualized-topic-models.

For each labelled scene this builder fits two neural topic models on
the V1 band-frequency document-term matrix:

  prodlda             ProdLDA (Srivastava-Sutton 2017) implemented in Pyro
  ctm_combined        CombinedTM (Bianchi et al. 2021) — concatenates BoW
                      with sentence-transformer embeddings; here the
                      "embedding" is the topic-mixture from the canonical
                      sklearn LDA fit so the model can sharpen on
                      contextualised features

Output: data/derived/topic_variants/<variant>/<scene>.json
        data/local/topic_variants/<variant>/<scene>/{phi.npy, theta.npy, vocab.json}

Both variants integrate with the existing build_topic_views /
build_topic_to_data downstream because they produce the same φ and θ
shapes the rest of the pipeline expects.
"""
from __future__ import annotations

import json
import os
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

warnings.filterwarnings("ignore")
os.environ.setdefault("PYTHONWARNINGS", "ignore")
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")


LOCAL_OUT_ROOT = DATA_DIR / "local" / "topic_variants"
DERIVED_OUT_ROOT = DERIVED_DIR / "topic_variants"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
SCALE = 12
RANDOM_STATE = 42

PRODLDA_EPOCHS = 80
PRODLDA_BATCH = 128
PRODLDA_LR = 1e-3


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def fit_prodlda(doc_term: np.ndarray, K: int, seed: int | None = None) -> dict:
    """Pyro-based ProdLDA (Srivastava & Sutton 2017).
    Encoder: 2-layer MLP -> (mu, logvar) of latent z (dim K)
    Decoder: theta = softmax(z); logits over vocab via theta @ phi.

    seed defaults to RANDOM_STATE; pass an explicit seed for multi-seed
    stability sweeps.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    import pyro
    import pyro.distributions as dist
    from pyro.infer import SVI, Trace_ELBO
    from pyro.optim import Adam

    s = int(seed) if seed is not None else RANDOM_STATE
    pyro.set_rng_seed(s)
    torch.manual_seed(s)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(s)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    D, V = doc_term.shape
    docs = torch.tensor(doc_term, dtype=torch.float32, device=device)

    class Encoder(nn.Module):
        def __init__(self, V: int, K: int, hidden: int = 100):
            super().__init__()
            self.fc1 = nn.Linear(V, hidden)
            self.fc2 = nn.Linear(hidden, hidden)
            self.fc_mu = nn.Linear(hidden, K)
            self.fc_logvar = nn.Linear(hidden, K)

        def forward(self, x):
            h = F.softplus(self.fc1(x))
            h = F.softplus(self.fc2(h))
            return self.fc_mu(h), self.fc_logvar(h)

    encoder = Encoder(V, K).to(device)
    phi_unnorm = nn.Parameter(torch.randn(K, V, device=device) * 0.01)

    def model(x_batch):
        pyro.module("phi", phi_unnorm_module)
        with pyro.plate("docs", x_batch.size(0)):
            z = pyro.sample(
                "z",
                dist.Normal(torch.zeros(x_batch.size(0), K, device=device),
                            torch.ones(x_batch.size(0), K, device=device)).to_event(1),
            )
            theta = F.softmax(z, dim=-1)
            beta = F.softmax(phi_unnorm_module.phi_unnorm, dim=-1)
            word_logits = torch.log(theta @ beta + 1e-12)
            n_tokens = x_batch.sum(dim=-1).long().clamp(min=1)
            pyro.sample(
                "obs",
                dist.Multinomial(total_count=int(n_tokens.max().item()),
                                 probs=theta @ beta).to_event(0),
                obs=x_batch,
            )

    def guide(x_batch):
        pyro.module("encoder", encoder)
        mu, logvar = encoder(x_batch)
        with pyro.plate("docs", x_batch.size(0)):
            pyro.sample(
                "z",
                dist.Normal(mu, torch.exp(0.5 * logvar)).to_event(1),
            )

    class PhiModule(nn.Module):
        def __init__(self):
            super().__init__()
            self.phi_unnorm = phi_unnorm

    phi_unnorm_module = PhiModule()

    pyro.clear_param_store()
    optimiser = Adam({"lr": PRODLDA_LR})
    svi = SVI(model, guide, optimiser, loss=Trace_ELBO())

    n_batches = max(1, D // PRODLDA_BATCH)
    for epoch in range(PRODLDA_EPOCHS):
        perm = torch.randperm(D, device=device)
        for b in range(n_batches):
            idx = perm[b * PRODLDA_BATCH:(b + 1) * PRODLDA_BATCH]
            if idx.numel() == 0:
                continue
            svi.step(docs[idx])

    encoder.eval()
    with torch.no_grad():
        mu, _ = encoder(docs)
        theta = F.softmax(mu, dim=-1).cpu().numpy()
        phi = F.softmax(phi_unnorm_module.phi_unnorm, dim=-1).cpu().numpy()
    return {"phi": phi, "theta": theta}


def fit_etm(doc_term: np.ndarray, K: int, embed_dim: int = 64, seed: int | None = None) -> dict:
    """Embedded Topic Model (Dieng-Ruiz-Blei 2020).

    Models word-topic assignment via dot product between learned topic
    embeddings ``alpha`` (K x embed_dim) and word embeddings ``rho``
    (V x embed_dim), then softmax over the vocabulary:

        beta_k(w) = softmax(rho @ alpha_k.T)_w

    The encoder is identical to ProdLDA's: 2-layer MLP -> (mu, logvar)
    of latent z (dim K). Trained end-to-end via amortised variational
    inference with the standard ELBO (no Pyro dependency).

    Compared with ProdLDA:
    - Decoder uses a low-rank (V x embed_dim) parameterisation instead
      of a full (K x V) topic-word matrix. Word embeddings are shared
      across topics, which acts as a regulariser and produces more
      semantically coherent topics on small vocabularies.
    - On hyperspectral band-frequency tokens this means topics are
      forced to be smooth in embedding space rather than free over
      arbitrary subsets of bands.
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    s = int(seed) if seed is not None else RANDOM_STATE
    torch.manual_seed(s)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(s)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    D, V = doc_term.shape
    docs = torch.tensor(doc_term, dtype=torch.float32, device=device)
    epsilon = 1e-12

    class ETM(nn.Module):
        def __init__(self, V: int, K: int, E: int, hidden: int = 100):
            super().__init__()
            self.fc1 = nn.Linear(V, hidden)
            self.fc2 = nn.Linear(hidden, hidden)
            self.fc_mu = nn.Linear(hidden, K)
            self.fc_logvar = nn.Linear(hidden, K)
            self.rho = nn.Parameter(torch.randn(V, E) * 0.1)
            self.alpha = nn.Parameter(torch.randn(K, E) * 0.1)

        def encode(self, x):
            h = F.softplus(self.fc1(x))
            h = F.softplus(self.fc2(h))
            return self.fc_mu(h), self.fc_logvar(h)

        def topic_word(self):
            return F.softmax(self.rho @ self.alpha.T, dim=0).T

        def forward(self, x):
            mu, logvar = self.encode(x)
            std = torch.exp(0.5 * logvar)
            z = mu + torch.randn_like(std) * std
            theta = F.softmax(z, dim=-1)
            beta = self.topic_word()
            recon_logits = torch.log(theta @ beta + epsilon)
            return recon_logits, mu, logvar

    model = ETM(V, K, embed_dim).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=PRODLDA_LR)
    n_batches = max(1, D // PRODLDA_BATCH)
    final_recon = 0.0
    final_kl = 0.0
    for _epoch in range(PRODLDA_EPOCHS):
        perm = torch.randperm(D, device=device)
        running_recon = 0.0
        running_kl = 0.0
        nb = 0
        for b in range(n_batches):
            idx = perm[b * PRODLDA_BATCH:(b + 1) * PRODLDA_BATCH]
            if idx.numel() == 0:
                continue
            batch = docs[idx]
            opt.zero_grad()
            recon_logits, mu, logvar = model(batch)
            recon_loss = -(batch * recon_logits).sum(dim=-1).mean()
            kl = -0.5 * (1 + logvar - mu.pow(2) - logvar.exp()).sum(dim=-1).mean()
            loss = recon_loss + kl
            loss.backward()
            opt.step()
            running_recon += float(recon_loss.detach())
            running_kl += float(kl.detach())
            nb += 1
        final_recon = running_recon / max(nb, 1)
        final_kl = running_kl / max(nb, 1)

    model.eval()
    with torch.no_grad():
        mu, _ = model.encode(docs)
        theta = F.softmax(mu, dim=-1).cpu().numpy()
        phi = model.topic_word().cpu().numpy()
    return {
        "phi": phi,
        "theta": theta,
        "fit_meta": {
            "embed_dim": int(embed_dim),
            "epochs": int(PRODLDA_EPOCHS),
            "lr": float(PRODLDA_LR),
            "final_recon_loss": round(float(final_recon), 6),
            "final_kl": round(float(final_kl), 6),
        },
    }


def _downstream_kmeans_ari(theta: np.ndarray, labels: np.ndarray) -> dict:
    from sklearn.cluster import KMeans
    from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

    n_classes = int(np.unique(labels).size)
    if n_classes < 2 or theta.shape[0] != labels.shape[0]:
        return {"ari": 0.0, "nmi": 0.0}
    try:
        km = KMeans(n_clusters=n_classes, n_init=10, random_state=42).fit(theta)
        return {
            "ari": round(float(adjusted_rand_score(labels, km.labels_)), 6),
            "nmi": round(float(normalized_mutual_info_score(labels, km.labels_)), 6),
        }
    except Exception:
        return {"ari": 0.0, "nmi": 0.0}


def write_outputs(variant: str, scene_id: str, fit: dict, vocab: list[str], wavelengths: np.ndarray, labels: np.ndarray | None = None) -> dict:
    phi = fit["phi"]
    theta = fit["theta"]
    K = phi.shape[0]

    local_dir = LOCAL_OUT_ROOT / variant / scene_id
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", theta.astype(np.float32))
    with (local_dir / "vocab.json").open("w", encoding="utf-8") as h:
        json.dump({"vocab": vocab, "K": int(K)}, h)

    prevalence = theta.mean(axis=0)
    top_words = []
    for k in range(K):
        order = np.argsort(phi[k])[::-1][:30]
        top_words.append([
            {"token": vocab[int(i)], "p_w_given_topic": round(float(phi[k, int(i)]), 6)}
            for i in order
        ])

    derived = {
        "scene_id": scene_id,
        "variant": variant,
        "topic_count": int(K),
        "vocabulary_size": int(len(vocab)),
        "topic_prevalence": [round(float(v), 6) for v in prevalence.tolist()],
        "top_words_per_topic": top_words,
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_neural_topic_models v0.2",
    }
    if "fit_meta" in fit:
        derived["fit_meta"] = fit["fit_meta"]
    if labels is not None:
        derived["downstream_kmeans_vs_label"] = _downstream_kmeans_ari(theta, labels)
    out_path = DERIVED_OUT_ROOT / variant / f"{scene_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as h:
        json.dump(derived, h, separators=(",", ":"))
    return {"variant": variant, "K": int(K)}


def build_for_scene(scene_id: str) -> list[dict]:
    if scene_id not in SCENES or not has_labels(scene_id):
        return []
    cube, gt, config = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    sample_idx = stratified_sample_indices(labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE)
    sample_spectra = spectra[sample_idx]
    doc_term = band_frequency_counts(sample_spectra, scale=SCALE).astype(np.float32)
    wavelengths = approximate_wavelengths(config, B)
    vocab = [f"{int(round(float(wavelengths[i]))):04d}nm" for i in range(B)]

    n_classes = len(np.unique(labels))
    K = max(4, min(12, n_classes))

    summaries: list[dict] = []
    print(f"  fitting prodlda (K={K}, D={doc_term.shape[0]}, V={doc_term.shape[1]}) ...", flush=True)
    try:
        fit = fit_prodlda(doc_term, K)
        s = write_outputs("prodlda", scene_id, fit, vocab, wavelengths, labels=labels[sample_idx])
        print(f"    K={s['K']} written", flush=True)
        summaries.append(s)
    except Exception as exc:
        print(f"    FAILED: {exc}", flush=True)
        import traceback
        traceback.print_exc()

    print(f"  fitting etm (K={K}, embed_dim=64) ...", flush=True)
    try:
        fit = fit_etm(doc_term, K)
        s = write_outputs("etm", scene_id, fit, vocab, wavelengths, labels=labels[sample_idx])
        print(f"    K={s['K']} written", flush=True)
        summaries.append(s)
    except Exception as exc:
        print(f"    FAILED: {exc}", flush=True)
        import traceback
        traceback.print_exc()
    return summaries


def main() -> int:
    DERIVED_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    written_total = 0
    for scene_id in LABELLED_SCENES:
        print(f"[neural_tm] {scene_id} ...", flush=True)
        try:
            summaries = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            continue
        written_total += len(summaries)
    print(f"[neural_tm] done — {written_total} (variant x scene) outputs.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
