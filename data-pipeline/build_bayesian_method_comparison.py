"""Bayesian hierarchical comparison of methods across HIDSAG subsets.

PyMC hierarchical model that pools R^2 (regression) and macro-F1
(classification) across the five HIDSAG subsets to compute the
posterior probability that each method dominates each baseline. This
is the Benavoli-Mangili 2017 alternative to frequentist Friedman /
Nemenyi: instead of asking "does Wilcoxon reject the null?", we ask
"what is P(method A > method B)?".

Model (per task type, regression / classification):

  for each method m, target t in subset s:
    score[m, t, s] ~ Normal(mu[m] + subset_offset[s] + target_noise[t], sigma)
    mu[m] ~ Normal(0, 1)               # method-level effect
    subset_offset[s] ~ Normal(0, 0.5)  # subset random intercept, sum_s n_s offset_s = 0
    target_noise[t] ~ ZeroSumNormal(0.5) within each subset
    sigma ~ HalfNormal(1)

The zero-sum constraints (v0.3, #817) identify mu[m] as the method's mean
score over the targets; v0.2 had no reference level, so mu[m] was fixed only
by its prior. Posterior inference via NUTS with at least 4 chains (numpyro on
JAX by default, see research_core.bayes_compare.default_backend). Reports per
method the posterior mean, HDI94, rank-normalised R-hat and bulk / tail ESS,
every pairwise difference with the same diagnostics, and the pairwise
P(mu_a > mu_b) matrix.

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
from research_core import bayes_compare as _bc  # noqa: E402

warnings.filterwarnings("ignore")


METHOD_STATS_DIR = DERIVED_DIR / "method_statistics_hidsag"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_hidsag"

import os as _os
NUTS_DRAWS = int(_os.environ.get("CAOS_NUTS_DRAWS", "1000"))
NUTS_TUNE = int(_os.environ.get("CAOS_NUTS_TUNE", "1000"))
NUTS_CHAINS = int(_os.environ.get("CAOS_NUTS_CHAINS", "4"))
RANDOM_STATE = 42
if NUTS_CHAINS < 4:
    raise SystemExit("R-hat needs at least 4 chains (CAOS_NUTS_CHAINS)")


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


# Regression R² is only statistically estimable on subsets with enough
# samples; below this the per-target R² explodes (PORPHYRY reaches
# R² ≈ -12500, MINERAL2 ≈ -9.7) and poisons the cross-subset pool, which is
# what produced the earlier "no method beats zero" artefact. Match the
# benchmark-display policy and exclude n < 50 subsets from the regression
# pool. (Classification uses bounded macro-F1 and is left unfiltered.)
MIN_N_REGRESSION = 50


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
    excluded_subsets: list[str] = []
    for run in runs:
        subset_code = run.get("subset_code")
        n_samples = run.get("sample_count") or run.get("n_samples") or 0
        if task_type == "regression" and n_samples < MIN_N_REGRESSION:
            excluded_subsets.append(f"{subset_code}(n={n_samples})")
            continue
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
    return {"observations": observations, "excluded_subsets": excluded_subsets}


def fit_hierarchical(
    observations: list[dict], task_type: str
) -> dict:
    """Identified hierarchical model with method, subset and target effects (#817).

    score[m, t] = mu[m] + offset[subset(t)] + target_re[t] + eps, with the cell
    effects offset[subset(t)] + target_re[t] summing to zero over the targets
    (subset offsets weighted by their target counts, target effects zero-sum
    within each subset; research_core.bayes_compare.fit_nested), so mu[m] is
    method m's mean score over the targets. The archived v0.2 model had no
    reference level and ran 2 chains with no convergence diagnostic.
    """
    if not observations:
        return {}

    methods = sorted({o["method"] for o in observations})
    subsets = sorted({o["subset"] for o in observations})
    targets = sorted({(o["subset"], o["target"]) for o in observations})

    method_idx = np.array([methods.index(o["method"]) for o in observations])
    target_idx = np.array([targets.index((o["subset"], o["target"])) for o in observations])
    target_group = np.array([subsets.index(s) for s, _ in targets])
    scores = np.array([o["score"] for o in observations], dtype=np.float64)

    backend = _bc.default_backend()
    with _bc.Timer() as timer:
        idata = _bc.fit_nested(
            scores, method_idx, len(methods), target_idx, target_group, len(subsets),
            mu_sigma=1.0, group_sigma=0.5, target_sigma=0.5, noise_sigma=1.0,
            draws=NUTS_DRAWS, tune=NUTS_TUNE, chains=NUTS_CHAINS, seed=RANDOM_STATE,
            target_accept=0.9, backend=backend,
        )
    summary = _bc.summarise(idata, methods, scores, method_idx,
                            group_names=subsets, rep_names=[f"{s}:{t}" for s, t in targets],
                            group_var="offset_group", rep_var="cell_effect")
    metric = "R^2" if task_type == "regression" else "macro-F1"
    return {
        "task_type": task_type,
        "n_observations": int(len(observations)),
        "n_methods": int(len(methods)),
        "n_subsets": int(len(subsets)),
        "n_targets": int(len(targets)),
        "method_names": methods,
        "subset_names": subsets,
        **summary,
        "identification": (
            "the cell effects offset_subset + target_re sum to zero over the targets (subset "
            "offsets weighted by target count, target effects zero-sum within each subset), so "
            f"mu_method is the method's mean {metric} over the targets"
        ),
        "model_summary": (
            "score = mu_method[m] + offset_subset[s] + target_re[t] + N(0, sigma); "
            "mu_method ~ N(0, 1); offset_subset ~ N(0, 0.5) on the plane sum_s n_s offset_s = 0; "
            "target_re ~ ZeroSumNormal(0.5) within each subset; sigma ~ HalfNormal(1); "
            f"NUTS draws={NUTS_DRAWS}, tune={NUTS_TUNE}, {NUTS_CHAINS} chains, target_accept 0.9."
        ),
        "sampler": _bc.sampler_note(backend, NUTS_DRAWS, NUTS_TUNE, NUTS_CHAINS,
                                    RANDOM_STATE, 0.9),
        "sampling_seconds": timer.seconds,
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = failed = 0
    for task_type in ("regression", "classification"):
        print(f"[bayesian_compare] {task_type} ...", flush=True)
        collected = collect_per_target_scores(task_type)
        obs = collected["observations"]
        excluded = collected.get("excluded_subsets", [])
        if excluded:
            print(f"  excluded (n<{MIN_N_REGRESSION}): {', '.join(excluded)}", flush=True)
        if not obs:
            print("  skipped (no observations)", flush=True)
            continue
        try:
            payload = fit_hierarchical(obs, task_type)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            failed += 1
            continue
        if not payload:
            continue
        payload["excluded_subsets"] = excluded
        payload["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        payload["builder_version"] = "build_bayesian_method_comparison v0.3"
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
                f"    {r['method']:35s} mu={r['posterior_mean']:+.3f} HDI94=[{r['hdi94_lo']:+.3f}, {r['hdi94_hi']:+.3f}] "
                f"R-hat={r['r_hat']:.3f} ESS bulk/tail={r['ess_bulk']:.0f}/{r['ess_tail']:.0f}",
                flush=True,
            )
        d = payload["diagnostics"]
        print(f"  divergences={d['divergences']} max R-hat={d['max_r_hat']:.4f} "
              f"min ESS bulk/tail={d['min_ess_bulk']:.0f}/{d['min_ess_tail']:.0f} "
              f"({payload['sampling_seconds']} s)", flush=True)
        written += 1
    print(f"[bayesian_compare] done: {written} payloads written, {failed} failed.", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
