"""Bayesian hierarchical comparison of methods across HIDSAG subsets.

PyMC hierarchical model that pools R^2 (regression) and macro-F1
(classification) across the five HIDSAG subsets to compute the
posterior probability that each method dominates each baseline. This
is the Benavoli-Mangili 2017 alternative to frequentist Friedman /
Nemenyi: instead of asking "does Wilcoxon reject the null?", we ask
"what is P(method A > method B)?".

Model (per task type — regression / classification):

  for each method m, target t in subset s:
    score[m, t, s] ~ Normal(mu[m] + subset_offset[s] + target_noise[t], sigma)
    mu[m] ~ Normal(0, 1)               # method-level effect
    subset_offset[s] ~ Normal(0, 0.5)  # subset random intercept
    target_noise[t] ~ Normal(0, 0.5)
    sigma ~ HalfNormal(1)

Posterior inference via NUTS. Reports per-method posterior mean +
HDI94, plus pairwise P(mu_a > mu_b) matrix.

Output: data/derived/method_statistics_hidsag/<subset|cross>_bayesian.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR

warnings.filterwarnings("ignore")


METHOD_STATS_DIR = DERIVED_DIR / "method_statistics_hidsag"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_hidsag"

NUTS_DRAWS = 1000
NUTS_TUNE = 1000
NUTS_CHAINS = 2
RANDOM_STATE = 42


def load_subset_metric_matrix(task_type: str) -> dict:
    """Build a long-format dataframe equivalent across all subsets.

    task_type ∈ {"regression", "classification"}.
    Returns dict with method_names, subset_codes, target_names,
    score_array (n_obs,), method_index, subset_index, target_index.
    """
    method_set: set[str] = set()
    rows: list[tuple[str, str, str, float]] = []  # (method, subset, target, score)
    metric_key = "r2_distribution" if task_type == "regression" else "macro_f1_distribution"
    block_key = task_type
    primary_metric = "r2" if task_type == "regression" else "macro_f1"
    for path in sorted(METHOD_STATS_DIR.glob("*.json")):
        if path.stem.endswith("_bayesian"):
            continue
        if path.stem.endswith("_methods"):
            continue
        if path.stem.endswith("_literature"):
            continue
        try:
            payload = json.load(path.open("r", encoding="utf-8"))
        except Exception:
            continue
        block = payload.get(block_key)
        if not block:
            continue
        method_aggs = block.get("method_aggregates") or {}
        targets = block.get("target_names") or []
        for method, agg in method_aggs.items():
            method_set.add(method)
        # Re-derive per-target per-method scores from the aggregate. The
        # aggregate has bootstrap CI95 of the across-target mean; for the
        # Bayesian model we need the per-target raw means. Look them up
        # from the source `local_core_benchmarks.json` block instead.
    return {"method_names": sorted(method_set)}


def collect_per_target_scores(task_type: str) -> dict:
    """Walk each subset's method_statistics_hidsag JSON and the source
    local_core_benchmarks measured_target_runs to gather per-target
    per-method scores."""
    bench_path = DERIVED_DIR / "core" / "local_core_benchmarks.json"
    if not bench_path.exists():
        return {"observations": []}
    bench = json.load(bench_path.open("r", encoding="utf-8"))
    runs = bench.get("measured_target_runs", []) or []
    primary_metric = "r2" if task_type == "regression" else "macro_f1"
    task_key = "regression_tasks" if task_type == "regression" else "classification_tasks"
    observations: list[dict] = []
    for run in runs:
        subset_code = run.get("subset_code")
        for task in run.get(task_key, []) or []:
            target = task.get("target")
            metrics = task.get("metrics") or {}
            for method, block in metrics.items():
                val = block.get(primary_metric)
                if val is None or not np.isfinite(val):
                    continue
                observations.append({
                    "subset": subset_code,
                    "target": str(target),
                    "method": method,
                    "score": float(val),
                })
    return {"observations": observations}


def fit_hierarchical(
    observations: list[dict], task_type: str
) -> dict:
    """PyMC hierarchical normal model with method, subset, target effects."""
    if not observations:
        return {}
    import pymc as pm
    import arviz as az

    methods = sorted({o["method"] for o in observations})
    subsets = sorted({o["subset"] for o in observations})
    targets = sorted({(o["subset"], o["target"]) for o in observations})

    method_idx = np.array([methods.index(o["method"]) for o in observations])
    subset_idx = np.array([subsets.index(o["subset"]) for o in observations])
    target_idx = np.array([targets.index((o["subset"], o["target"])) for o in observations])
    scores = np.array([o["score"] for o in observations], dtype=np.float64)

    with pm.Model() as model:
        mu_method = pm.Normal("mu_method", mu=0.0, sigma=1.0, shape=len(methods))
        offset_subset = pm.Normal("offset_subset", mu=0.0, sigma=0.5, shape=len(subsets))
        target_re = pm.Normal("target_re", mu=0.0, sigma=0.5, shape=len(targets))
        sigma = pm.HalfNormal("sigma", sigma=1.0)
        mu = mu_method[method_idx] + offset_subset[subset_idx] + target_re[target_idx]
        pm.Normal("y", mu=mu, sigma=sigma, observed=scores)

        idata = pm.sample(
            draws=NUTS_DRAWS,
            tune=NUTS_TUNE,
            chains=NUTS_CHAINS,
            random_seed=RANDOM_STATE,
            target_accept=0.9,
            progressbar=False,
        )

    posterior = idata.posterior
    mu_samples = posterior["mu_method"].stack(sample=("chain", "draw")).values  # [n_methods, n_samples]

    summaries = []
    for i, m in enumerate(methods):
        samples = mu_samples[i]
        hdi = az.hdi(samples, hdi_prob=0.94)
        summaries.append({
            "method": m,
            "posterior_mean": round(float(samples.mean()), 6),
            "posterior_std": round(float(samples.std()), 6),
            "hdi94_lo": round(float(hdi[0]), 6),
            "hdi94_hi": round(float(hdi[1]), 6),
        })

    # Pairwise P(mu_a > mu_b)
    pairwise = {}
    for i in range(len(methods)):
        for j in range(len(methods)):
            if i == j:
                continue
            p = float((mu_samples[i] > mu_samples[j]).mean())
            pairwise.setdefault(methods[i], {})[methods[j]] = round(p, 6)

    return {
        "task_type": task_type,
        "n_observations": int(len(observations)),
        "n_methods": int(len(methods)),
        "n_subsets": int(len(subsets)),
        "n_targets": int(len(targets)),
        "method_names": methods,
        "subset_names": subsets,
        "method_posteriors": summaries,
        "pairwise_p_a_gt_b": pairwise,
        "model_summary": (
            "score = mu_method[m] + offset_subset[s] + target_re[t] + N(0, sigma); "
            "mu_method ~ N(0, 1); offset_subset ~ N(0, 0.5); target_re ~ N(0, 0.5); "
            "sigma ~ HalfNormal(1); NUTS draws=1000, tune=1000, 2 chains."
        ),
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for task_type in ("regression", "classification"):
        print(f"[bayesian_compare] {task_type} ...", flush=True)
        obs = collect_per_target_scores(task_type)["observations"]
        if not obs:
            print("  skipped (no observations)", flush=True)
            continue
        try:
            payload = fit_hierarchical(obs, task_type)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if not payload:
            continue
        payload["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        payload["builder_version"] = "build_bayesian_method_comparison v0.1"
        out_path = DERIVED_OUT_DIR / f"cross_{task_type}_bayesian.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))

        # Headline: top-3 by posterior mean
        ranked = sorted(payload["method_posteriors"], key=lambda x: -x["posterior_mean"])[:3]
        print(
            f"  n_obs={payload['n_observations']} methods={payload['n_methods']} subsets={payload['n_subsets']} targets={payload['n_targets']}",
            flush=True,
        )
        for r in ranked:
            print(
                f"    {r['method']:35s} mu={r['posterior_mean']:+.3f} HDI94=[{r['hdi94_lo']:+.3f}, {r['hdi94_hi']:+.3f}]",
                flush=True,
            )
        written += 1
    print(f"[bayesian_compare] done — {written} payloads written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
