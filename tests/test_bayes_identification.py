"""Identified hierarchical F-1 comparisons (#817).

The archived models score = mu[m] + offset[s] + re[f] + eps had no reference
level: the method locations were identified only by their priors (every mu
about 0.17 below the observed means, HDI94 above 1.0), and the runs used two
chains with no convergence diagnostic. These tests check, without sampling,
that the zero-sum parameterisation of research_core.bayes_compare identifies
the locations (full-rank design) where the archived one does not, and check
the archived posteriors: at least four chains, R-hat and bulk / tail ESS on
every reported quantity, locations equal to the observed means.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.bayes_compare import zero_sum_basis  # noqa: E402

DERIVED = ROOT / "data" / "derived"
ARTEFACTS = [
    DERIVED / "method_statistics_labelled" / "cross_classification_bayesian.json",
    DERIVED / "method_statistics_labelled" / "cross_classification_bayesian_deep.json",
    DERIVED / "method_statistics_hidsag" / "cross_classification_bayesian.json",
    DERIVED / "method_statistics_hidsag" / "cross_regression_bayesian.json",
]


def _onehot(idx: np.ndarray, n: int) -> np.ndarray:
    out = np.zeros((idx.size, n))
    out[np.arange(idx.size), idx] = 1.0
    return out


def _crossed(n_m=5, n_s=6, n_f=5):
    m, s, f = np.meshgrid(np.arange(n_m), np.arange(n_s), np.arange(n_f), indexing="ij")
    return m.ravel(), s.ravel(), f.ravel()


def test_zero_sum_basis_is_orthonormal_and_weighted() -> None:
    for w in (np.ones(6), np.array([4.0, 5, 4, 4, 2]), np.array([4.0, 5])):
        b = zero_sum_basis(w)
        assert b.shape == (w.size, w.size - 1)
        np.testing.assert_allclose(b.T @ b, np.eye(w.size - 1), atol=1e-12)
        np.testing.assert_allclose(w @ b, 0.0, atol=1e-12)


def test_archived_crossed_design_does_not_identify_the_locations() -> None:
    m, s, f = _crossed()
    x_old = np.hstack([_onehot(m, 5), _onehot(s, 6), _onehot(f, 5)])
    assert np.linalg.matrix_rank(x_old) == x_old.shape[1] - 2  # two free shifts
    x_new = np.hstack([_onehot(m, 5), _onehot(s, 6) @ zero_sum_basis(np.ones(6)),
                       _onehot(f, 5) @ zero_sum_basis(np.ones(5))])
    assert np.linalg.matrix_rank(x_new) == x_new.shape[1]


def test_zero_sum_locations_are_the_method_means() -> None:
    """With zero-sum group effects the least-squares mu equals each method's observed mean."""
    rng = np.random.default_rng(0)
    m, s, f = _crossed()
    y = 0.8 + 0.05 * m + rng.normal(0, 0.1, 6)[s] + rng.normal(0, 0.02, 5)[f] + rng.normal(0, 0.01, m.size)
    x_new = np.hstack([_onehot(m, 5), _onehot(s, 6) @ zero_sum_basis(np.ones(6)),
                       _onehot(f, 5) @ zero_sum_basis(np.ones(5))])
    beta = np.linalg.lstsq(x_new, y, rcond=None)[0]
    np.testing.assert_allclose(beta[:5], [y[m == k].mean() for k in range(5)], atol=1e-12)


def test_nested_design_identifies_the_target_mean() -> None:
    """HIDSAG: targets within subsets; mu is the mean over targets (weights = targets per subset)."""
    target_group = np.array([0] * 4 + [1] * 5 + [2] * 4 + [3] * 4 + [4] * 2)
    n_t, n_g, n_m = target_group.size, 5, 5
    mm, tt = np.meshgrid(np.arange(n_m), np.arange(n_t), indexing="ij")
    m, t = mm.ravel(), tt.ravel()
    counts = np.bincount(target_group).astype(float)
    g_basis = zero_sum_basis(counts)
    within = np.zeros((n_t, n_t - n_g))
    col = 0
    for g in range(n_g):
        members = np.flatnonzero(target_group == g)
        b = zero_sum_basis(np.ones(members.size))
        within[np.ix_(members, np.arange(col, col + b.shape[1]))] = b
        col += b.shape[1]
    cell = np.hstack([_onehot(target_group, n_g) @ g_basis, within])  # target x params
    np.testing.assert_allclose(cell.sum(axis=0), 0.0, atol=1e-12)     # sum_t c_t = 0
    x_new = np.hstack([_onehot(m, n_m), _onehot(t, n_t) @ cell])
    assert np.linalg.matrix_rank(x_new) == x_new.shape[1]
    x_old = np.hstack([_onehot(m, n_m), _onehot(target_group[t], n_g), _onehot(t, n_t)])
    assert np.linalg.matrix_rank(x_old) < x_old.shape[1]


@pytest.mark.parametrize("path", ARTEFACTS, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_archived_posteriors_are_identified_and_diagnosed(path: Path) -> None:
    rec = json.loads(path.read_text(encoding="utf-8"))
    diag = rec["diagnostics"]
    assert diag["chains"] >= 4
    assert diag["divergences"] == 0
    assert diag["max_r_hat"] <= 1.01
    assert diag["min_ess_bulk"] >= 400 and diag["min_ess_tail"] >= 400
    for m in rec["method_posteriors"]:
        assert {"r_hat", "ess_bulk", "ess_tail"} <= set(m)
        # identified: the location sits on the observed mean (up to the mild shrinkage of
        # its N(0, 1) prior), not on a prior-set shift (archived: 0.17 off, about 0.9 sd)
        assert abs(m["posterior_mean"] - m["observed_mean"]) < 0.25 * m["posterior_std"], m
        assert m["hdi94_lo"] <= m["observed_mean"] <= m["hdi94_hi"], m
    for d in rec["pairwise_differences"]:
        assert {"r_hat", "ess_bulk", "ess_tail"} <= set(d)
