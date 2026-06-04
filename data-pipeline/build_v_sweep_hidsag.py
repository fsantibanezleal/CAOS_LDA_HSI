"""HIDSAG V-sweep — V1..V14, V17..V19 wordification + F-2 coherence
on 5 mineral subsets.

HIDSAG documents are region-aggregated reflectance spectra
(hidsag_region_documents.npz). Each row is one document. There is no
per-document class label, so F-1 / F-7 do not directly apply. We compute
F-2 coherence (c_v, c_npmi, u_mass on top-10 words per topic) plus
F-14 repetitiveness.

The hypothesis (P4 conditional): V7 (absorption-feature triplet) should
outperform V1 on F-2 coherence on the mineralogical subsets because
USGS library matching aligns with absorption peaks.

Recipe coverage on HIDSAG:
  V1-V7, V10-V14, V17-V19 are dispatched here (all unsupervised; they
  operate directly on the [D, B] region-document spectra matrix).
  V8 (endmember NFINDR) and V9 (region-SAM Felzenszwalb) are skipped —
  they need scene-level precomputes that do not exist for HIDSAG.
  V15 (spectral indices) and V16 (foundation-model scaffold) are out of
  scope (wavelength-band-specific / external-weights dependent).
  V20 (mineral-class-supervised) is out of scope — HIDSAG region
  documents carry no per-document mineral class label.

Output:
  data/local/v_sweep/lda_fits_hidsag/{subset}_{V}_uniform_Q8/...
  data/derived/v_sweep/hidsag/topic_views/{subset}_{V}_uniform_Q8.json
  data/derived/v_sweep/hidsag/f2_coherence/{subset}_{V}_uniform_Q8.json
  data/derived/v_sweep/hidsag/f14_repetitiveness/{subset}_{V}_uniform_Q8.json

Every result dict carries a `source_id` field equal to the subset code
(e.g. "GEOCHEM"), mirroring the labelled-scene `scene_id` convention.
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

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

# Reuse the wordify_* functions from the existing builders by importing
# the modules dynamically (their module names have dashes).
import importlib
import importlib.util


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_PIPE = ROOT / "data-pipeline"
W123 = _load("w123", _PIPE / "build_wordifications.py")
W45 = _load("w45", _PIPE / "build_wordifications_v4plus.py")
W6789 = _load("w6789", _PIPE / "build_wordifications_v6plus.py")
W711 = _load("w711", _PIPE / "build_wordifications_v7v11.py")

HIDSAG_NPZ = DATA_DIR / "derived" / "core" / "hidsag_region_documents.npz"
SUBSETS = ["GEOCHEM", "GEOMET", "MINERAL1", "MINERAL2", "PORPHYRY"]
# Unsupervised recipes runnable on the [D, B] region-document spectra.
# V8/V9 need scene precomputes; V15/V16/V20 are out of scope (see module
# docstring). V13/V14/V17/V18/V19 are ported inline below.
RECIPES = ["V1", "V2", "V3", "V4", "V5", "V6", "V7",
           "V10", "V11", "V12", "V13", "V14", "V17", "V18", "V19"]

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits_hidsag"
SWEEP_DERIVED = DERIVED_DIR / "v_sweep" / "hidsag"

LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.20
RANDOM_STATE = 42
TOP_N = 10
EPS = 1e-12


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    rng = np.maximum(hi - lo, 1e-12)
    return (X - lo) / rng


# ---------------------------------------------------------------------------
# Ported unsupervised recipes (V13, V14, V17, V18, V19).
#
# The standalone builders (build_wordifications_v1{3,4,7,8,9}.py) operate on
# raw scene cubes with class labels; here we re-implement their wordify cores
# to run on the [D, B] HIDSAG region-document spectra matrix (already
# min-max normalised per row by the caller). Hyperparameters mirror the
# standalone builders so cells are comparable to the labelled-scene sweep.
# ---------------------------------------------------------------------------

# V13 (VQ-VAE codebook) — mirrors build_wordifications_v13.py
V13_M = 4              # number of sub-vectors per spectrum
V13_K_CODEWORDS = 32   # codewords per sub-vector position
V13_LATENT = 8
V13_EPOCHS = 100
V13_BATCH = 128
V13_LR = 3e-3
V13_COMMITMENT_BETA = 0.25

# V14 (CWT-Morlet) — mirrors build_wordifications_v14.py
V14_N_SCALES = 16
V14_P_BUCKETS = 8
V14_MAX_TOKENS_PER_DOC = 16
V14_WAVELET = "morl"

# V17 (sparse-coding dictionary) — mirrors build_wordifications_v17.py
V17_K_ATOMS = 64
V17_N_NONZERO = 8

# V18 (graph-Laplacian eigenvectors) — mirrors build_wordifications_v18.py
V18_K_EIGEN = 16
V18_K_NN = 16          # capped per (subset) to min(16, D-2) at call time

# V19 (UMAP coordinates) — mirrors build_wordifications_v19.py
V19_N_DIMS = 3
V19_N_NEIGHBORS = 15
V19_MIN_DIST = 0.1


def wordify_v13_vqvae(Xn: np.ndarray):
    """VQ-VAE learned codebook tokens on [D, B] spectra (issue #620)."""
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    D, B = Xn.shape
    M, K, latent = V13_M, V13_K_CODEWORDS, V13_LATENT

    class VQVAE(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Linear(B, 64), nn.GELU(), nn.Linear(64, M * latent),
            )
            self.codebook = nn.Parameter(torch.randn(M, K, latent) * 0.1)
            self.decoder = nn.Sequential(
                nn.Linear(M * latent, 64), nn.GELU(), nn.Linear(64, B),
            )

        def quantise(self, z):
            codes_list, z_q_list = [], []
            for m in range(M):
                d = ((z[:, m, :].unsqueeze(1) - self.codebook[m].unsqueeze(0)) ** 2).sum(-1)
                codes_m = d.argmin(dim=1)
                codes_list.append(codes_m)
                z_q_list.append(self.codebook[m][codes_m])
            return torch.stack(codes_list, dim=1), torch.stack(z_q_list, dim=1)

        def forward(self, x):
            n = x.shape[0]
            z = self.encoder(x).view(n, M, latent)
            codes, z_q = self.quantise(z)
            z_st = z + (z_q - z).detach()
            x_hat = self.decoder(z_st.view(n, M * latent))
            commit = F.mse_loss(z, z_q.detach())
            cb = F.mse_loss(z_q, z.detach())
            recon = F.mse_loss(x_hat, x)
            return x_hat, codes, recon, commit, cb

    np.random.seed(RANDOM_STATE)
    torch.manual_seed(RANDOM_STATE)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = VQVAE().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=V13_LR)
    X = torch.from_numpy(Xn.astype(np.float32)).to(device)
    for _ in range(V13_EPOCHS):
        perm = torch.randperm(D, device=device)
        for start in range(0, D, V13_BATCH):
            idx = perm[start:start + V13_BATCH]
            _, _, recon, cl, cbl = model(X[idx])
            loss = recon + V13_COMMITMENT_BETA * cl + cbl
            opt.zero_grad()
            loss.backward()
            opt.step()
    model.eval()
    with torch.no_grad():
        codes, _ = model.quantise(model.encoder(X).view(D, M, latent))
    codes_np = codes.cpu().numpy()  # [D, M]

    vocab = [f"vq_m{m}_c{c:02d}" for m in range(M) for c in range(K)]
    rows = np.repeat(np.arange(D), M)
    sub_idx = np.tile(np.arange(M), D)
    cols = sub_idx * K + codes_np.ravel().astype(np.int64)
    data = np.ones(D * M, dtype=np.int32)
    doc_term = sp.csr_matrix((data, (rows, cols)), shape=(D, M * K), dtype=np.int32)
    return doc_term, vocab


def wordify_v14_cwt(Xn: np.ndarray, q: int):
    """Continuous-wavelet (Morlet) tokens on [D, B] spectra (issue #672)."""
    import pywt

    D, B = Xn.shape
    S, P = V14_N_SCALES, V14_P_BUCKETS
    scales = np.logspace(0, np.log10(max(B / 2, 2)), S)
    mag = np.zeros((D, S, B), dtype=np.float32)
    for d in range(D):
        coeffs, _ = pywt.cwt(Xn[d], scales, V14_WAVELET)
        mag[d] = np.abs(coeffs).astype(np.float32)

    bounds = np.linspace(0, B, P + 1, dtype=int)
    bucketed = np.zeros((D, S, P), dtype=np.float32)
    for b in range(P):
        lo, hi = bounds[b], bounds[b + 1]
        if hi > lo:
            bucketed[:, :, b] = mag[:, :, lo:hi].mean(axis=2)

    flat = bucketed.reshape(-1)
    lo = float(np.percentile(flat, 1))
    hi = float(np.percentile(flat, 99))
    rng = max(hi - lo, 1e-6)
    bins = np.clip(np.floor((bucketed - lo) / rng * q), 0, q - 1).astype(np.int32)

    vocab = [f"cwt_s{s:02d}_p{p}_q{qq:02d}"
             for s in range(S) for p in range(P) for qq in range(q)]
    def vocab_idx(s, p, qq):
        return (s * P + p) * q + qq

    rows, cols, data = [], [], []
    for d in range(D):
        flat_mag = bucketed[d].reshape(-1)
        if V14_MAX_TOKENS_PER_DOC < flat_mag.size:
            top_idx = np.argpartition(flat_mag, -V14_MAX_TOKENS_PER_DOC)[-V14_MAX_TOKENS_PER_DOC:]
        else:
            top_idx = np.arange(flat_mag.size)
        for i in top_idx:
            s = int(i // P)
            p = int(i % P)
            qq = int(bins[d, s, p])
            rows.append(d)
            cols.append(vocab_idx(s, p, qq))
            data.append(1)
    doc_term = sp.csr_matrix((data, (rows, cols)), shape=(D, len(vocab)), dtype=np.int32)
    return doc_term, vocab


def wordify_v17_sparse(Xn: np.ndarray, q: int):
    """Sparse-coding dictionary-atom tokens on [D, B] spectra (issue #675)."""
    from sklearn.decomposition import MiniBatchDictionaryLearning

    D = Xn.shape[0]
    K = V17_K_ATOMS
    dl = MiniBatchDictionaryLearning(
        n_components=K, alpha=1.0, max_iter=100,
        transform_algorithm="lasso_lars",
        transform_n_nonzero_coefs=V17_N_NONZERO,
        random_state=RANDOM_STATE,
    )
    coeffs = dl.fit_transform(Xn.astype(np.float64))
    abs_coeffs = np.abs(coeffs)
    bins = np.zeros_like(abs_coeffs, dtype=np.int32)
    for a in range(K):
        col = abs_coeffs[:, a]
        nz = col[col > 0]
        if nz.size < 2:
            continue
        lo = float(np.percentile(nz, 5))
        hi = float(np.percentile(nz, 95))
        rng = max(hi - lo, 1e-6)
        bins[:, a] = np.clip(np.floor((col - lo) / rng * q), 0, q - 1)

    vocab = [f"atom_a{a:03d}_q{qq:02d}" for a in range(K) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        for a in np.flatnonzero(abs_coeffs[d] > 0):
            rows.append(d)
            cols.append(int(a) * q + int(bins[d, a]))
            data.append(1)
    doc_term = sp.csr_matrix((data, (rows, cols)), shape=(D, K * q), dtype=np.int32)
    return doc_term, vocab


def wordify_v18_laplacian(Xn: np.ndarray, q: int):
    """Graph-Laplacian eigenvector tokens on [D, B] spectra (issue #676).

    GUARD: the k-NN graph degree is capped to k = min(16, D-2) so the
    small MINERAL2 subset (D~180) is fine and tiny subsets never request
    more neighbours / eigenvectors than there are documents.
    """
    from scipy.sparse.linalg import eigsh
    from sklearn.neighbors import kneighbors_graph

    D = Xn.shape[0]
    k_nn = max(1, min(V18_K_NN, D - 2))
    knn_adj = kneighbors_graph(Xn, n_neighbors=k_nn, mode="distance", metric="cosine")
    knn_adj = (knn_adj + knn_adj.T) / 2.0
    sigma = float(np.median(knn_adj.data)) if knn_adj.nnz > 0 else 1.0
    affinity = sp.csr_matrix(knn_adj.copy())
    affinity.data = np.exp(-(affinity.data ** 2) / (sigma ** 2 + 1e-12))

    deg = np.asarray(affinity.sum(axis=1)).reshape(-1)
    deg_inv_sqrt = 1.0 / np.sqrt(np.maximum(deg, 1e-12))
    D_inv_sqrt = sp.diags(deg_inv_sqrt)
    norm_aff = D_inv_sqrt @ affinity @ D_inv_sqrt
    laplacian = sp.eye(D, format="csr") - norm_aff

    k_eigen = max(1, min(V18_K_EIGEN, D - 2))
    eigvals, eigvecs = eigsh(laplacian, k=k_eigen, which="SM")
    order = np.argsort(eigvals)
    eigvecs = eigvecs[:, order]
    K_actual = eigvecs.shape[1]

    bins = np.zeros_like(eigvecs, dtype=np.int32)
    for a in range(K_actual):
        col = eigvecs[:, a]
        lo = float(np.percentile(col, 1))
        hi = float(np.percentile(col, 99))
        rng = max(hi - lo, 1e-6)
        bins[:, a] = np.clip(np.floor((col - lo) / rng * q), 0, q - 1)

    vocab = [f"lap_e{a:02d}_q{qq:02d}" for a in range(K_actual) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        for a in range(K_actual):
            rows.append(d)
            cols.append(a * q + int(bins[d, a]))
            data.append(1)
    doc_term = sp.csr_matrix((data, (rows, cols)), shape=(D, K_actual * q), dtype=np.int32)
    return doc_term, vocab


def wordify_v19_umap(Xn: np.ndarray, q: int):
    """UMAP-coordinate tokens on [D, B] spectra (issue #677)."""
    import umap  # type: ignore

    D = Xn.shape[0]
    n_neighbors = max(2, min(V19_N_NEIGHBORS, D - 1))
    reducer = umap.UMAP(
        n_components=V19_N_DIMS, n_neighbors=n_neighbors,
        min_dist=V19_MIN_DIST, random_state=RANDOM_STATE,
    )
    coords = reducer.fit_transform(Xn)
    bins = np.zeros_like(coords, dtype=np.int32)
    for a in range(V19_N_DIMS):
        col = coords[:, a]
        lo = float(np.percentile(col, 1))
        hi = float(np.percentile(col, 99))
        rng = max(hi - lo, 1e-6)
        bins[:, a] = np.clip(np.floor((col - lo) / rng * q), 0, q - 1)

    vocab = [f"umap_d{a}_q{qq:02d}" for a in range(V19_N_DIMS) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        for a in range(V19_N_DIMS):
            rows.append(d)
            cols.append(a * q + int(bins[d, a]))
            data.append(1)
    doc_term = sp.csr_matrix((data, (rows, cols)), shape=(D, V19_N_DIMS * q), dtype=np.int32)
    return doc_term, vocab


def k_for(mean_doc: float) -> int:
    """Slightly looser HIDSAG K-policy since we lack class labels."""
    if mean_doc < 2.5:
        return 4
    if mean_doc < 8:
        return max(3, min(8, int(round(mean_doc / 2))))
    return 8


def wordify(recipe: str, X: np.ndarray, scheme: str, Q: int):
    """Dispatch to the right wordify_v* on a [D, B] spectra matrix.

    V8 (endmember NFINDR) and V9 (region-SAM Felzenszwalb) require
    precomputes that don't exist for HIDSAG; we skip them.

    Out of scope for HIDSAG (not dispatched here):
      V15 — spectral indices need wavelength-specific bands (the HIDSAG
            documents are region aggregates over a synthetic wavelength
            grid, so named-band indices are not meaningful).
      V16 — foundation-model scaffold needs external pretrained weights.
      V20 — supervised: requires a per-document mineral class label that
            does not exist for the HIDSAG region documents (only a
            sample_owner id, used by build_v_sweep_hidsag_f7).
    """
    if recipe in {"V8", "V9"}:
        return None, None, "skipped: precompute not available for HIDSAG"
    if recipe in {"V15", "V16", "V20"}:
        return None, None, f"out of scope for HIDSAG: {recipe}"
    Xn = normalise_per_row(X.astype(np.float32))
    B = Xn.shape[1]
    try:
        if recipe in {"V1", "V2", "V3"}:
            bins = W123.quantize(Xn, scheme, Q)
            if recipe == "V1":
                dt, vocab = W123.wordify_v1_band_frequency(bins, B, Q)
            elif recipe == "V2":
                dt, vocab = W123.wordify_v2_magnitude_phrase(bins, B, Q)
            else:
                dt, vocab = W123.wordify_v3_band_bin(bins, B, Q)
        elif recipe in {"V4", "V5"}:
            wl = np.linspace(400, 2500, B).astype(np.float32)
            if recipe == "V4":
                dt, vocab = W45.wordify_v4_first_derivative(Xn, wl, scheme, Q)
            else:
                dt, vocab = W45.wordify_v5_second_derivative(Xn, wl, scheme, Q)
        elif recipe == "V6":
            dt, vocab = W6789.wordify_v6_wavelet(Xn, scheme, Q)
        elif recipe == "V7":
            wl = np.linspace(400, 2500, B).astype(np.float32)
            dt, vocab = W711.wordify_v7(Xn, wl, scheme, Q)
        elif recipe == "V10":
            wl = np.linspace(400, 2500, B).astype(np.float32)
            dt, vocab = W45.wordify_v10_band_group(Xn, wl, scheme, Q)
        elif recipe == "V11":
            dt, vocab = W711.wordify_v11(Xn, scheme, Q)
        elif recipe == "V12":
            dt, vocab = W6789.wordify_v12_gmm(Xn, scheme, Q)
        elif recipe == "V13":
            dt, vocab = wordify_v13_vqvae(Xn)
        elif recipe == "V14":
            dt, vocab = wordify_v14_cwt(Xn, Q)
        elif recipe == "V17":
            dt, vocab = wordify_v17_sparse(Xn, Q)
        elif recipe == "V18":
            dt, vocab = wordify_v18_laplacian(Xn, Q)
        elif recipe == "V19":
            dt, vocab = wordify_v19_umap(Xn, Q)
        else:
            return None, None, f"unknown recipe {recipe}"
    except Exception as exc:
        return None, None, f"wordify failed: {exc}"
    return dt, vocab, "ok"


def fit_lda_and_compute(recipe: str, subset: str, doc_term: sp.csr_matrix):
    D, V = doc_term.shape
    doc_lengths = np.asarray(doc_term.sum(axis=1)).reshape(-1)
    mean_doc = float(doc_lengths.mean()) if D > 0 else 0.0
    if mean_doc < 1e-6 or V == 0:
        return None
    K = k_for(mean_doc)

    t0 = time.perf_counter()
    lda = LatentDirichletAllocation(
        n_components=K, learning_method="online", max_iter=LDA_MAX_ITER,
        batch_size=512, evaluate_every=-1, random_state=RANDOM_STATE,
        doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
        topic_word_prior=LDA_TOPIC_WORD_PRIOR,
    )
    doc_topic = lda.fit_transform(doc_term)
    phi_un = lda.components_
    phi = phi_un / phi_un.sum(axis=1, keepdims=True)
    fit_secs = time.perf_counter() - t0
    try:
        perplexity = float(lda.perplexity(doc_term))
    except Exception:
        perplexity = float("nan")

    # F-14 jaccard repetitiveness — clip top-N to vocab size
    effective_n = min(TOP_N, V)
    top_sets = [set(np.argsort(phi[k])[::-1][:effective_n].tolist()) for k in range(K)]
    pair_jaccard = []
    for i in range(K):
        for j in range(i + 1, K):
            inter = len(top_sets[i] & top_sets[j])
            union = len(top_sets[i] | top_sets[j])
            pair_jaccard.append(inter / max(union, 1))
    mean_jacc = float(np.mean(pair_jaccard)) if pair_jaccard else 0.0
    max_jacc = float(np.max(pair_jaccard)) if pair_jaccard else 0.0

    # F-2 c_v approximation (doc-level binary co-occurrence)
    binary = (doc_term > 0).astype(np.float32).tocsr()
    doc_freq = np.asarray(binary.sum(axis=0)).reshape(-1)
    Dn = binary.shape[0]
    per_topic_cv = []
    per_topic_npmi = []
    per_topic_umass = []
    for k in range(K):
        words = list(np.argsort(phi[k])[::-1][:effective_n])
        n_words = len(words)
        sub = binary[:, words]
        co = (sub.T @ sub).toarray()
        # NPMI matrix
        npmi_mat = np.zeros((n_words, n_words), dtype=np.float64)
        umass_terms = []
        for i in range(n_words):
            pi = doc_freq[words[i]] / Dn if doc_freq[words[i]] > 0 else EPS
            for j in range(n_words):
                if i == j:
                    npmi_mat[i, j] = 1.0
                    continue
                pj = doc_freq[words[j]] / Dn if doc_freq[words[j]] > 0 else EPS
                pij = co[i, j] / Dn if co[i, j] > 0 else EPS
                num = np.log(pij / max(pi * pj, EPS))
                den = -np.log(max(pij, EPS))
                npmi_mat[i, j] = float(num / den) if den > EPS else 0.0
                if i > j:
                    umass_terms.append(np.log((co[i, j] + 1.0) / max(doc_freq[words[j]], 1.0)))
        # c_v = mean cosine of each row vs centroid
        centroid = npmi_mat.mean(axis=0, keepdims=True)
        norms = np.linalg.norm(npmi_mat, axis=1)
        cn = float(np.linalg.norm(centroid))
        cv = float(((npmi_mat @ centroid.T).reshape(-1) / np.maximum(norms * cn, EPS)).mean()) if cn > EPS else 0.0
        # NPMI mean (off-diagonal)
        if n_words >= 2:
            off = npmi_mat[~np.eye(n_words, dtype=bool)]
        else:
            off = np.array([0.0])
        per_topic_npmi.append(float(off.mean()))
        per_topic_cv.append(cv)
        per_topic_umass.append(float(np.mean(umass_terms)) if umass_terms else 0.0)
    c_v = float(np.mean(per_topic_cv))
    c_npmi = float(np.mean(per_topic_npmi))
    u_mass = float(np.mean(per_topic_umass))

    SWEEP_LOCAL.mkdir(parents=True, exist_ok=True)
    local_dir = SWEEP_LOCAL / f"{subset}_{recipe}_uniform_Q8"
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", doc_topic.astype(np.float32))

    return {
        "subset": subset, "source_id": subset,
        "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "D": int(D), "V": int(V),
        "mean_doc_length": round(mean_doc, 4),
        "perplexity": round(perplexity, 4) if perplexity == perplexity else None,
        "fit_seconds": round(fit_secs, 3),
        "f2_c_v": round(c_v, 6),
        "f2_c_npmi": round(c_npmi, 6),
        "f2_u_mass": round(u_mass, 6),
        "f14_mean_pairwise_jaccard": round(mean_jacc, 6),
        "f14_max_pairwise_jaccard": round(max_jacc, 6),
        "lda_config": {
            "max_iter": LDA_MAX_ITER, "doc_topic_prior": LDA_DOC_TOPIC_PRIOR,
            "topic_word_prior": LDA_TOPIC_WORD_PRIOR,
            "random_state": RANDOM_STATE,
        },
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_hidsag v0.2",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="HIDSAG V-sweep.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES,
                        choices=RECIPES)
    parser.add_argument("--subsets", nargs="+", default=SUBSETS, choices=SUBSETS)
    args = parser.parse_args()

    if not HIDSAG_NPZ.exists():
        print(f"HIDSAG npz not found: {HIDSAG_NPZ}", flush=True)
        return 1
    npz = np.load(HIDSAG_NPZ, allow_pickle=True)

    SWEEP_DERIVED.mkdir(parents=True, exist_ok=True)
    out_dir = SWEEP_DERIVED / "topic_views"
    out_dir.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    for subset in args.subsets:
        key = f"{subset}__features"
        if key not in npz:
            print(f"  no {subset}, skipping", flush=True)
            continue
        X = npz[key]
        print(f"\n[hidsag] {subset}: D={X.shape[0]} B={X.shape[1]}", flush=True)
        for recipe in args.recipes:
            tag = f"{subset} {recipe}"
            dt, vocab, status = wordify(recipe, X, "uniform", 8)
            if status != "ok" or dt is None:
                print(f"  {tag} SKIP: {status}", flush=True)
                n_skip += 1
                continue
            result = fit_lda_and_compute(recipe, subset, dt)
            if result is None:
                n_skip += 1
                continue
            result["vocab_size"] = len(vocab) if vocab is not None else None
            out = out_dir / f"{subset}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(result, h, indent=2)
            n_ok += 1
            print(
                f"  {tag} K={result['K']} V={result['V']} "
                f"c_v={result['f2_c_v']:.3f} "
                f"npmi={result['f2_c_npmi']:.3f} "
                f"jacc_mean={result['f14_mean_pairwise_jaccard']:.3f}",
                flush=True,
            )
    print(f"\n[hidsag] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
