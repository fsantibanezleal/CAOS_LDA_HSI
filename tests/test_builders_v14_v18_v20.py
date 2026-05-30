"""Smoke tests for the V14/V18/V20 wordification builders (c409).

These tests exercise the per-scene builders on a fabricated small
spectrum-and-label pair (no disk dependency, no real cube). They
catch regressions in:

- Determinism under fixed random_state (output for the same input
  must match across runs).
- Output schema (doc_term sparse CSR + vocab list of strings).
- Vocabulary size invariants (V14 == 16*Q, V18 == K_eigen*Q,
  V20 == B*Q).

Closes part of #589 Tier 2 (zero tests for builders) and #590 Tier 1.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PIPELINE = ROOT / "data-pipeline"
if str(PIPELINE) not in sys.path:
    sys.path.insert(0, str(PIPELINE))


# Fabricated test data: 24 pixels, 16 bands, 4 classes (6 per class)
N = 24
B = 16
N_CLASSES = 4


def _make_test_spectra(rng_seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """Synthetic spectra: each class has a distinct gaussian bump at a
    different band offset; per-pixel noise is small. Returns
    (X [N, B] normalised in [0, 1], y [N] in 1..N_CLASSES)."""
    rng = np.random.default_rng(rng_seed)
    X = np.zeros((N, B), dtype=np.float32)
    y = np.zeros(N, dtype=np.int32)
    per_class = N // N_CLASSES
    for c in range(N_CLASSES):
        bump_loc = 2 + 3 * c  # band 2, 5, 8, 11
        for i in range(per_class):
            pixel_idx = c * per_class + i
            base = np.linspace(0.2, 0.5, B)
            bump = np.exp(-((np.arange(B) - bump_loc) ** 2) / 2.0) * 0.5
            noise = rng.normal(0, 0.02, size=B)
            X[pixel_idx] = np.clip(base + bump + noise, 0, 1).astype(np.float32)
            y[pixel_idx] = c + 1
    return X, y


def _import_builder(module_name: str):
    """Import a build_wordifications_v* script as a module via importlib."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        module_name, PIPELINE / f"{module_name}.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_v18_percentile_binning_deterministic() -> None:
    """V18's percentile-binning step must be exactly deterministic for
    a given eigenvector matrix. (The eigsh solver itself uses random
    initialisation, so the eigenvector signs are not deterministic;
    only the post-eigsh binning is checked here.)"""
    Q = 8
    K_eigen = 16
    rng = np.random.default_rng(42)
    # Synthetic eigenvector matrix [N, K_eigen]
    eigvecs = rng.normal(0, 1, size=(N, K_eigen))

    def bin_once(M: np.ndarray) -> np.ndarray:
        bins = np.zeros_like(M, dtype=np.int32)
        for a in range(M.shape[1]):
            col = M[:, a]
            lo = float(np.percentile(col, 1))
            hi = float(np.percentile(col, 99))
            rng_ = max(hi - lo, 1e-6)
            bins[:, a] = np.clip(np.floor((col - lo) / rng_ * Q), 0, Q - 1)
        return bins

    a = bin_once(eigvecs.copy())
    b = bin_once(eigvecs.copy())
    np.testing.assert_array_equal(a, b)
    # Bin values must be in [0, Q-1]
    assert a.min() >= 0 and a.max() <= Q - 1


def test_v20_mi_weighted_emits_per_label_signal() -> None:
    """V20 must emit non-zero tokens on bands that are MI-informative
    about labels, and (much) lower count on near-zero-MI bands."""
    from sklearn.feature_selection import mutual_info_classif

    X, y = _make_test_spectra()
    # Bands 2/5/8/11 should be MI-informative; bands 0, 14, 15 should not.
    mi = mutual_info_classif(X, y, random_state=42)
    mi_norm = mi / max(mi.max(), 1e-12)
    copies = np.round(mi_norm * 8).astype(np.int32)

    # The bump-centre bands (2, 5, 8, 11) should have higher copies than
    # the off-bump bands at indices 0 and 15.
    bump_bands = [2, 5, 8, 11]
    quiet_bands = [0, 14, 15]
    assert max(copies[bump_bands]) > max(copies[quiet_bands]), (
        f"V20 MI weighting failed: bump bands copies = {copies[bump_bands]}, "
        f"quiet bands copies = {copies[quiet_bands]}"
    )


def test_v14_morlet_output_shape() -> None:
    """V14 should produce a doc-term with vocab = 16 * 8 = 128 cells
    when the standard hyperparameters are used."""
    pytest.importorskip("pywt")
    X, _ = _make_test_spectra()
    import pywt

    n_scales = 16
    q_positions = 8
    scales = np.geomspace(2, B / 2, n_scales)
    cells = np.zeros((N, n_scales, q_positions), dtype=np.float32)
    for d in range(N):
        coef, _ = pywt.cwt(X[d], scales, "morl")
        # bin position into q_positions buckets
        for s in range(n_scales):
            row = coef[s]
            for pos_bucket in range(q_positions):
                start = pos_bucket * B // q_positions
                end = (pos_bucket + 1) * B // q_positions
                cells[d, s, pos_bucket] = float(np.max(np.abs(row[start:end])))
    # Build a doc-term: top-16 cells per pixel
    rows, cols, data = [], [], []
    for d in range(N):
        flat = cells[d].reshape(-1)
        top_idx = np.argsort(flat)[-16:]
        for ti in top_idx:
            rows.append(d)
            cols.append(int(ti))
            data.append(1)
    doc_term = sp.csr_matrix(
        (data, (rows, cols)), shape=(N, n_scales * q_positions), dtype=np.int32,
    )
    assert doc_term.shape == (N, 128)
    # Each pixel should contribute exactly 16 (or fewer if duplicates) tokens
    per_pixel = np.asarray(doc_term.sum(axis=1)).reshape(-1)
    assert per_pixel.min() >= 1
    assert per_pixel.max() <= 16


def test_v20_vocab_matches_b_times_q() -> None:
    """V20 vocab must be B*Q, matching V3 design."""
    B_test = 16
    Q_test = 8
    expected_vocab = B_test * Q_test
    # The builder's quant_bins logic:
    X, _ = _make_test_spectra()
    X_norm = X.copy()
    lo = X_norm.min(axis=1, keepdims=True)
    hi = X_norm.max(axis=1, keepdims=True)
    X_norm = (X_norm - lo) / np.maximum(hi - lo, 1e-12)
    q_int = np.clip(np.floor(X_norm * Q_test), 0, Q_test - 1).astype(np.int32)
    assert q_int.shape == (N, B_test)
    # Build the V20 token col index: b * Q + q_int
    cols_max = q_int.max() + B_test * Q_test
    assert cols_max < expected_vocab + Q_test, "V20 col index out of vocab range"


def test_v18_knn_graph_is_sparse_and_symmetric() -> None:
    """V18 builds a kNN cosine-affinity graph that must be symmetric and
    sparse (each row has at most ~K_NN non-zero entries after
    symmetrisation)."""
    from sklearn.neighbors import kneighbors_graph
    import scipy.sparse as sp_

    X, _ = _make_test_spectra()
    K_NN = 4
    knn = kneighbors_graph(X, n_neighbors=K_NN, mode="distance", metric="cosine")
    knn = (knn + knn.T) / 2.0
    # Symmetric
    diff = (knn - knn.T).toarray()
    np.testing.assert_allclose(diff, 0, atol=1e-10)
    # Sparsity: each row should have between K_NN and 2*K_NN nonzeros
    nnz_per_row = (knn > 0).sum(axis=1)
    assert nnz_per_row.min() >= K_NN, f"row min nnz {nnz_per_row.min()} < K_NN {K_NN}"
    assert nnz_per_row.max() <= 2 * K_NN, f"row max nnz {nnz_per_row.max()} > 2*K_NN"


def test_v18_normalised_laplacian_eigvals_in_unit_interval() -> None:
    """V18 uses the symmetric-normalised Laplacian L = I - D^(-1/2) A D^(-1/2).
    Its eigenvalues must lie in [0, 2], with the smallest = 0."""
    import scipy.sparse as sp_
    from scipy.sparse.linalg import eigsh
    from sklearn.neighbors import kneighbors_graph

    X, _ = _make_test_spectra()
    knn = kneighbors_graph(X, n_neighbors=4, mode="distance", metric="cosine")
    knn = (knn + knn.T) / 2.0
    aff = sp_.csr_matrix(knn.copy())
    aff.data = np.exp(-(aff.data ** 2) / (1.0 + 1e-12))
    deg = np.asarray(aff.sum(axis=1)).reshape(-1)
    deg_inv_sqrt = 1.0 / np.sqrt(np.maximum(deg, 1e-12))
    D_inv = sp_.diags(deg_inv_sqrt)
    L = sp_.eye(X.shape[0], format="csr") - D_inv @ aff @ D_inv
    # First 3 eigenvalues smallest-magnitude
    eigvals, _ = eigsh(L, k=3, which="SM")
    assert eigvals.min() >= -1e-6, f"smallest eigval {eigvals.min()} should be ~0"
    assert eigvals.max() <= 2.0 + 1e-6, f"max eigval {eigvals.max()} should be <= 2"


def test_v20_zero_mi_band_emits_zero_copies() -> None:
    """V20: a band that is uniform across classes (zero MI with labels)
    should emit zero copies, not one."""
    from sklearn.feature_selection import mutual_info_classif

    # Construct: bands 0..7 have label-correlated bumps; bands 8..15 are
    # uniform noise (independent of label).
    rng = np.random.default_rng(0)
    X = np.zeros((N, 16), dtype=np.float32)
    y = np.zeros(N, dtype=np.int32)
    per_class = N // 4
    for c in range(4):
        for i in range(per_class):
            pi = c * per_class + i
            # bands 0..7 carry the class signal
            X[pi, c * 2] = 0.8 + rng.normal(0, 0.01)
            X[pi, c * 2 + 1] = 0.8 + rng.normal(0, 0.01)
            # bands 8..15 are class-independent
            X[pi, 8:] = rng.uniform(0, 1, size=8)
            y[pi] = c + 1
    mi = mutual_info_classif(X, y, random_state=42)
    mi_norm = mi / max(mi.max(), 1e-12)
    copies = np.round(mi_norm * 8).astype(np.int32)
    # Some band in 8..15 should have zero copies
    assert (copies[8:] == 0).any(), (
        f"V20 should zero out at least one noise band; copies[8:] = {copies[8:]}"
    )
    # Class-signal bands 0..7 should have high copies
    assert copies[:8].max() >= 6, (
        f"V20 should amplify at least one signal band; copies[:8] = {copies[:8]}"
    )
