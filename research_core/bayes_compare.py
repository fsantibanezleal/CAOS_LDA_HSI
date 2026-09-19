"""Identified hierarchical comparison of methods, with convergence diagnostics.

Used by the F-1 builders (build_bayesian_classification_labelled,
build_bayesian_classification_deep, build_bayesian_method_comparison).

Why (issue #817). The archived models were

    score[m, s, f] = mu[m] + offset[s] + re[f] + eps,   mu ~ N(0, 1), offset ~ N(0, 0.5), ...

with no reference level: adding c to every mu[m] and subtracting c from every
offset leaves the likelihood unchanged, so mu[m] was fixed only by the priors
(every posterior mu sat about 0.17 below the observed means, shared one posterior
sd of about 0.19, and its 94% HDI ran above 1.0 for a macro-F1). They also ran
two NUTS chains and recorded no convergence diagnostic.

Parameterisation used here. The group effects are constrained to sum to zero,
so mu[m] is the method's mean score over the groups of the study, the quantity
the manuscripts report as the observed mean:

- crossed design (labelled scenes: scene x fold, every method in every cell):
  offset ~ ZeroSumNormal(0.5) over scenes and re ~ ZeroSumNormal(0.2) over
  fold indices; mu[m] is the method's mean over the 6 x 5 cells.
- nested design (HIDSAG: targets within subsets, every method on every target):
  cell effect c[t] = offset[subset(t)] + re[t], with sum_s n_s offset[s] = 0
  (n_s targets in subset s) and re zero-sum within each subset, so sum_t c[t] = 0
  and mu[m] is the method's mean over the targets.

The priors are otherwise the archived ones (mu ~ N(0, 1); sigma ~ HalfNormal).
Differences mu[a] - mu[b] and P(mu[a] > mu[b]) have the same meaning as before;
now mu[m] is identified too. The model still treats the residuals of different
methods in one cell as independent, as the archived model did.

Every reported quantity carries the rank-normalised split R-hat and the bulk and
tail effective sample sizes of Vehtari et al. (2021), computed with ArviZ over
at least four chains, plus the number of divergent transitions.
"""
from __future__ import annotations

import os
import time

import numpy as np

HDI_PROB = 0.94


def zero_sum_basis(weights: np.ndarray) -> np.ndarray:
    """Orthonormal basis (n x (n-1)) of {x : sum_i w_i x_i = 0}."""
    w = np.asarray(weights, dtype=np.float64).reshape(-1)
    n = w.size
    if n < 2:
        return np.zeros((n, 0))
    # Complete w / |w| to an orthonormal basis; the other n-1 columns span w's complement.
    m = np.eye(n)
    m[:, 0] = w / np.linalg.norm(w)
    q, _ = np.linalg.qr(m)
    basis = q[:, 1:]
    assert np.allclose(w @ basis, 0.0, atol=1e-12)
    return basis


def _sample(model, draws: int, tune: int, chains: int, seed: int, target_accept: float,
            backend: str):
    import pymc as pm

    kwargs = dict(draws=draws, tune=tune, chains=chains, random_seed=seed,
                  target_accept=target_accept, progressbar=False)
    with model:
        if backend == "numpyro":
            import jax

            jax.config.update("jax_enable_x64", True)
            return pm.sample(nuts_sampler="numpyro",
                             nuts_sampler_kwargs={"chain_method": "sequential"}, **kwargs)
        return pm.sample(**kwargs)


def fit_crossed(scores: np.ndarray, method_idx: np.ndarray, n_methods: int,
                group_idx: np.ndarray, n_groups: int, rep_idx: np.ndarray, n_reps: int,
                *, mu_sigma: float = 1.0, group_sigma: float = 0.5, rep_sigma: float = 0.2,
                noise_sigma: float = 0.5, draws: int = 1000, tune: int = 1000,
                chains: int = 4, seed: int = 42, target_accept: float = 0.9,
                backend: str = "numpyro"):
    """score = mu[m] + offset[g] + re[r] + eps, offsets and re zero-sum."""
    import pymc as pm

    with pm.Model() as model:
        mu = pm.Normal("mu_method", mu=0.0, sigma=mu_sigma, shape=n_methods)
        offset = pm.ZeroSumNormal("offset_group", sigma=group_sigma, shape=n_groups)
        re = pm.ZeroSumNormal("re_rep", sigma=rep_sigma, shape=n_reps)
        sigma = pm.HalfNormal("sigma", sigma=noise_sigma)
        pm.Normal("y", mu=mu[method_idx] + offset[group_idx] + re[rep_idx], sigma=sigma,
                  observed=scores)
    return _sample(model, draws, tune, chains, seed, target_accept, backend)


def fit_nested(scores: np.ndarray, method_idx: np.ndarray, n_methods: int,
               target_idx: np.ndarray, target_group: np.ndarray, n_groups: int,
               *, mu_sigma: float = 1.0, group_sigma: float = 0.5, target_sigma: float = 0.5,
               noise_sigma: float = 1.0, draws: int = 1000, tune: int = 1000,
               chains: int = 4, seed: int = 42, target_accept: float = 0.9,
               backend: str = "numpyro"):
    """score = mu[m] + offset[group(t)] + re[t] + eps with sum_t (offset[group(t)] + re[t]) = 0.

    ``target_group[t]`` is the group (subset) of target t. The group offsets
    satisfy sum_g n_g offset[g] = 0 (isotropic prior on that plane) and the
    target effects are zero-sum within each group.
    """
    import pymc as pm
    import pytensor.tensor as pt

    target_group = np.asarray(target_group)
    n_targets = target_group.size
    counts = np.bincount(target_group, minlength=n_groups).astype(np.float64)
    basis = zero_sum_basis(counts)
    with pm.Model() as model:
        mu = pm.Normal("mu_method", mu=0.0, sigma=mu_sigma, shape=n_methods)
        z = pm.Normal("offset_group_raw", mu=0.0, sigma=group_sigma, shape=basis.shape[1])
        offset = pm.Deterministic("offset_group", pt.dot(pt.as_tensor(basis), z))
        parts = []
        order = []
        for g in range(n_groups):
            members = np.flatnonzero(target_group == g)
            order.extend(members.tolist())
            if members.size >= 2:
                parts.append(pm.ZeroSumNormal(f"re_target_g{g}", sigma=target_sigma,
                                              shape=members.size))
            else:
                parts.append(pt.zeros(members.size))
        re_grouped = pt.concatenate(parts)
        inverse = np.argsort(np.asarray(order))
        re = pm.Deterministic("re_target", re_grouped[inverse])
        cell = pm.Deterministic("cell_effect", offset[target_group] + re)
        sigma = pm.HalfNormal("sigma", sigma=noise_sigma)
        pm.Normal("y", mu=mu[method_idx] + cell[target_idx], sigma=sigma, observed=scores)
    assert n_targets == len(order)
    return _sample(model, draws, tune, chains, seed, target_accept, backend)


def _diag(draws_cd: np.ndarray) -> dict:
    """Mean, sd, HDI94, R-hat, bulk/tail ESS and MCSE of one (chain, draw) array."""
    import arviz as az

    arr = np.asarray(draws_cd, dtype=np.float64)
    flat = arr.reshape(-1)
    hdi = az.hdi(flat, hdi_prob=HDI_PROB)
    return {
        "posterior_mean": round(float(flat.mean()), 6),
        "posterior_std": round(float(flat.std()), 6),
        "hdi94_lo": round(float(hdi[0]), 6),
        "hdi94_hi": round(float(hdi[1]), 6),
        "r_hat": round(float(az.rhat(arr)), 4),
        "ess_bulk": round(float(az.ess(arr, method="bulk")), 1),
        "ess_tail": round(float(az.ess(arr, method="tail")), 1),
        "mcse_mean": round(float(az.mcse(arr, method="mean")), 6),
    }


def summarise(idata, methods: list[str], scores: np.ndarray, method_idx: np.ndarray,
              group_names: list[str] | None = None, rep_names: list[str] | None = None,
              group_var: str = "offset_group", rep_var: str | None = "re_rep") -> dict:
    """Per-method posteriors, pairwise differences and P(a > b), nuisance terms, diagnostics."""
    post = idata.posterior
    mu = post["mu_method"].values  # (chain, draw, method)
    out_methods = []
    for i, m in enumerate(methods):
        rec = {"method": m, **_diag(mu[:, :, i]),
               "observed_mean": round(float(scores[method_idx == i].mean()), 6)}
        out_methods.append(rec)
    pairwise_p = {}
    differences = []
    for i, a in enumerate(methods):
        for j, b in enumerate(methods):
            if i == j:
                continue
            d = mu[:, :, i] - mu[:, :, j]
            pairwise_p.setdefault(a, {})[b] = round(float((d > 0).mean()), 6)
            if i < j:
                differences.append({"a": a, "b": b, **_diag(d),
                                    "p_a_gt_b": round(float((d > 0).mean()), 6)})
    nuisance = {}
    if group_var in post:
        g = post[group_var].values
        nuisance[group_var] = [{"name": (group_names[k] if group_names else k), **_diag(g[:, :, k])}
                               for k in range(g.shape[-1])]
    if rep_var and rep_var in post:
        r = post[rep_var].values
        nuisance[rep_var] = [{"name": (rep_names[k] if rep_names else k), **_diag(r[:, :, k])}
                             for k in range(r.shape[-1])]
    sigma = _diag(post["sigma"].values)
    stats = idata.sample_stats
    n_div = int(stats["diverging"].values.sum()) if "diverging" in stats else None
    depth = stats["tree_depth"].values if "tree_depth" in stats else None
    reported = out_methods + differences + [sigma] + [x for v in nuisance.values() for x in v]
    return {
        "method_posteriors": out_methods,
        "pairwise_p_a_gt_b": pairwise_p,
        "pairwise_differences": differences,
        "nuisance_posteriors": nuisance,
        "sigma_posterior": sigma,
        "diagnostics": {
            "chains": int(post.sizes["chain"]),
            "draws_per_chain": int(post.sizes["draw"]),
            "divergences": n_div,
            "max_tree_depth_reached": (int((depth >= 10).sum()) if depth is not None else None),
            "max_r_hat": max(x["r_hat"] for x in reported),
            "min_ess_bulk": min(x["ess_bulk"] for x in reported),
            "min_ess_tail": min(x["ess_tail"] for x in reported),
            "r_hat_method": "rank-normalised split R-hat (Vehtari et al. 2021, ArviZ az.rhat)",
            "ess_method": "bulk and tail ESS (Vehtari et al. 2021, ArviZ az.ess)",
        },
    }


def sampler_note(backend: str, draws: int, tune: int, chains: int, seed: int,
                 target_accept: float) -> dict:
    import pymc

    note = {"backend": backend, "draws": draws, "tune": tune, "chains": chains,
            "random_seed": seed, "target_accept": target_accept,
            "pymc_version": pymc.__version__}
    if backend == "numpyro":
        import jax
        import numpyro

        note.update({"numpyro_version": numpyro.__version__, "jax_version": jax.__version__,
                     "jax_device": str(jax.devices()[0]), "chain_method": "sequential",
                     "jax_enable_x64": True})
    return note


class Timer:
    def __enter__(self):
        self.t0 = time.perf_counter()
        return self

    def __exit__(self, *exc):
        self.seconds = round(time.perf_counter() - self.t0, 1)


def default_backend() -> str:
    """numpyro (JAX, CPU) unless CAOS_NUTS_BACKEND=pymc is set.

    PyTensor on this Windows host has no C++ compiler (pytensor.config.cxx is
    empty), so the default PyMC NUTS runs in pure-Python mode; numpyro's NUTS
    on JAX samples the same PyMC model (pm.sample(nuts_sampler="numpyro")).
    """
    return os.environ.get("CAOS_NUTS_BACKEND", "numpyro")
