"""HIDSAG method-statistics enrichment.

The base regression / classification fits across HIDSAG subsets are
already computed by `run_local_core_benchmarks.py` and saved into
`data/derived/core/local_core_benchmarks.json` as `measured_target_runs`.
Each run carries one task (regression or classification) per numeric or
categorical target, with per-method metrics:

  raw_ridge_regression
  pls_regression
  topic_mixture_linear_regression
  cube_topic_mixture_linear_regression
  region_topic_mixture_linear_regression
  topic_routed_linear_regression           <-- the central A39 contribution

This builder does NOT refit. It reads those metrics and adds the
statistical layer the master plan demands but the existing payload
lacks:

- pairwise Wilcoxon signed-rank (paired across targets) with Holm-
  Bonferroni correction
- Cliff's delta effect size for every pair
- Friedman χ² + Nemenyi post-hoc on R² (regression) and macro-F1
  (classification) across targets
- bootstrap CI95 of each method's mean metric across targets
- ranking summary (mean rank, win rate)

Output: data/derived/method_statistics_hidsag/<subset>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pingouin
import scikit_posthocs as sp
from scipy.stats import friedmanchisquare

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from research_core.paths import DERIVED_DIR
from _mlflow_helper import mlflow_run

warnings.filterwarnings("ignore", category=UserWarning)


CORE_BENCHMARKS_PATH = DERIVED_DIR / "core" / "local_core_benchmarks.json"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_hidsag"

REGRESSION_PRIMARY_METRIC = "r2"
CLASSIFICATION_PRIMARY_METRIC = "macro_f1"
BOOTSTRAP_N = 1000
RANDOM_STATE = 42


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.size == 0 or b.size == 0:
        return 0.0
    diffs = a[:, None] - b[None, :]
    gt = (diffs > 0).sum()
    lt = (diffs < 0).sum()
    return float((gt - lt) / (a.size * b.size))


def bootstrap_ci95(values: np.ndarray, rng: np.random.Generator) -> dict:
    if values.size == 0:
        return {"mean": None, "ci95_lo": None, "ci95_hi": None}
    boot = []
    for _ in range(BOOTSTRAP_N):
        sample = rng.choice(values, size=values.size, replace=True)
        boot.append(float(np.mean(sample)))
    boot = np.array(boot)
    return {
        "mean": round(float(values.mean()), 6),
        "std": round(float(values.std()), 6),
        "ci95_lo": round(float(np.percentile(boot, 2.5)), 6),
        "ci95_hi": round(float(np.percentile(boot, 97.5)), 6),
    }


def pairwise_wilcoxon_holm(per_method_scores: dict[str, np.ndarray]) -> list[dict]:
    methods = list(per_method_scores.keys())
    pairs: list[dict] = []
    pvals: list[float] = []
    for i in range(len(methods)):
        for j in range(i + 1, len(methods)):
            a = per_method_scores[methods[i]]
            b = per_method_scores[methods[j]]
            mask = np.isfinite(a) & np.isfinite(b)
            if mask.sum() < 3 or np.allclose(a[mask], b[mask]):
                pairs.append({"a": methods[i], "b": methods[j], "n": int(mask.sum()),
                              "W": 0.0, "p_raw": 1.0, "cliff_delta": 0.0})
                pvals.append(1.0)
                continue
            try:
                res = pingouin.wilcoxon(a[mask], b[mask], alternative="two-sided")
                p = float(res["p-val"].iloc[0])
                W = float(res["W-val"].iloc[0])
            except Exception:
                p, W = 1.0, 0.0
            pairs.append({
                "a": methods[i], "b": methods[j],
                "n": int(mask.sum()),
                "W": round(W, 6),
                "p_raw": round(p, 6),
                "cliff_delta": round(cliffs_delta(a[mask], b[mask]), 6),
            })
            pvals.append(p)

    if pvals:
        order = np.argsort(pvals)
        m = len(pvals)
        adj = [1.0] * m
        for rank, idx in enumerate(order):
            adj[idx] = min(1.0, pvals[idx] * (m - rank))
        for k in range(1, m):
            cur = order[k]
            prev = order[k - 1]
            if adj[cur] < adj[prev]:
                adj[cur] = adj[prev]
        for idx in range(m):
            pairs[idx]["p_holm"] = round(float(adj[idx]), 6)
    return pairs


def friedman_and_nemenyi(target_method_matrix: np.ndarray, methods: list[str]) -> dict:
    """target_method_matrix shape: [n_targets, n_methods]."""
    if target_method_matrix.shape[0] < 3 or target_method_matrix.shape[1] < 2:
        return {"friedman": None, "nemenyi_p_matrix": None}
    try:
        stat, p = friedmanchisquare(*[target_method_matrix[:, j] for j in range(target_method_matrix.shape[1])])
        friedman = {"chi2": round(float(stat), 6), "p_value": round(float(p), 6)}
    except Exception:
        friedman = None
    try:
        nem = sp.posthoc_nemenyi_friedman(target_method_matrix)
        p_matrix = [[round(float(v), 6) for v in row] for row in np.asarray(nem)]
    except Exception:
        p_matrix = None
    return {
        "friedman": friedman,
        "nemenyi_p_matrix": p_matrix,
        "method_names": methods,
    }


def rank_per_target(target_method_matrix: np.ndarray, methods: list[str]) -> dict:
    """For each target, rank methods (1 = best). Average rank across targets."""
    if target_method_matrix.size == 0:
        return {}
    # Higher = better; rank = 1 - argsort
    ranks = np.zeros_like(target_method_matrix)
    for t in range(target_method_matrix.shape[0]):
        order = np.argsort(-target_method_matrix[t])  # descending
        # Convert to 1-based ranks
        for rank, idx in enumerate(order):
            ranks[t, idx] = rank + 1
    mean_rank = ranks.mean(axis=0)
    return {
        "method_names": methods,
        "mean_rank": [round(float(r), 4) for r in mean_rank.tolist()],
        "win_rate": [
            round(float((ranks[:, j] == 1).mean()), 4) for j in range(target_method_matrix.shape[1])
        ],
    }


def extract_method_metric(task: dict, method: str, metric: str) -> float | None:
    metrics = task.get("metrics", {})
    block = metrics.get(method)
    if not block:
        return None
    val = block.get(metric)
    if val is None or (isinstance(val, float) and not np.isfinite(val)):
        return None
    return float(val)


def aggregate_subset(run: dict) -> dict:
    rng = np.random.default_rng(RANDOM_STATE)
    out = {
        "subset_code": run.get("subset_code"),
        "dataset_id": run.get("dataset_id"),
        "sample_count": run.get("sample_count"),
        "measurement_count_total": run.get("measurement_count_total"),
        "regression": None,
        "classification": None,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_method_statistics_hidsag v0.2",
    }

    # Regression block
    reg_tasks = run.get("regression_tasks", []) or []
    if reg_tasks:
        # Methods are the union of metric keys across tasks
        methods = sorted({m for t in reg_tasks for m in t.get("metrics", {}).keys()})
        per_method_scores = {m: [] for m in methods}
        target_names = []
        for t in reg_tasks:
            target_names.append(t.get("target"))
            for m in methods:
                v = extract_method_metric(t, m, REGRESSION_PRIMARY_METRIC)
                per_method_scores[m].append(v)

        # Build matrix dropping rows with any NaN
        matrix = np.array([per_method_scores[m] for m in methods]).T
        finite_rows = np.isfinite(matrix).all(axis=1)
        clean = matrix[finite_rows]
        clean_targets = [target_names[i] for i, ok in enumerate(finite_rows) if ok]

        method_aggregates = {}
        for j, m in enumerate(methods):
            values = np.array([v for v in per_method_scores[m] if v is not None and np.isfinite(v)])
            method_aggregates[m] = {
                "n_targets": int(values.size),
                "r2_distribution": bootstrap_ci95(values, rng),
                "median": round(float(np.median(values)), 6) if values.size else None,
                "min": round(float(values.min()), 6) if values.size else None,
                "max": round(float(values.max()), 6) if values.size else None,
            }

        per_method_arr = {m: np.array([v for v in per_method_scores[m]], dtype=np.float64) for m in methods}
        wilcoxon = pairwise_wilcoxon_holm(per_method_arr)
        fr_nem = friedman_and_nemenyi(clean, methods)
        ranks = rank_per_target(clean, methods)

        out["regression"] = {
            "primary_metric": REGRESSION_PRIMARY_METRIC,
            "n_targets": len(reg_tasks),
            "n_targets_complete": int(finite_rows.sum()),
            "target_names": target_names,
            "methods": methods,
            "method_aggregates": method_aggregates,
            "pairwise_wilcoxon_holm_on_r2": wilcoxon,
            "friedman_nemenyi": fr_nem,
            "ranking": ranks,
        }

    # Classification block
    cls_tasks = run.get("classification_tasks", []) or []
    if cls_tasks:
        methods = sorted({m for t in cls_tasks for m in t.get("metrics", {}).keys()})
        per_method_scores = {m: [] for m in methods}
        target_names = []
        for t in cls_tasks:
            target_names.append(t.get("target"))
            for m in methods:
                v = extract_method_metric(t, m, CLASSIFICATION_PRIMARY_METRIC)
                per_method_scores[m].append(v)

        matrix = np.array([per_method_scores[m] for m in methods]).T
        finite_rows = np.isfinite(matrix).all(axis=1)
        clean = matrix[finite_rows]

        method_aggregates = {}
        for m in methods:
            values = np.array([v for v in per_method_scores[m] if v is not None and np.isfinite(v)])
            method_aggregates[m] = {
                "n_targets": int(values.size),
                "macro_f1_distribution": bootstrap_ci95(values, rng),
                "median": round(float(np.median(values)), 6) if values.size else None,
                "min": round(float(values.min()), 6) if values.size else None,
                "max": round(float(values.max()), 6) if values.size else None,
            }

        per_method_arr = {m: np.array(per_method_scores[m], dtype=np.float64) for m in methods}
        wilcoxon = pairwise_wilcoxon_holm(per_method_arr)
        fr_nem = friedman_and_nemenyi(clean, methods)
        ranks = rank_per_target(clean, methods)

        out["classification"] = {
            "primary_metric": CLASSIFICATION_PRIMARY_METRIC,
            "n_targets": len(cls_tasks),
            "n_targets_complete": int(finite_rows.sum()),
            "target_names": target_names,
            "methods": methods,
            "method_aggregates": method_aggregates,
            "pairwise_wilcoxon_holm_on_macro_f1": wilcoxon,
            "friedman_nemenyi": fr_nem,
            "ranking": ranks,
        }

    return out


def main() -> int:
    if not CORE_BENCHMARKS_PATH.exists():
        print(f"  no core benchmarks at {CORE_BENCHMARKS_PATH}", flush=True)
        return 1
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    core = json.load(CORE_BENCHMARKS_PATH.open("r", encoding="utf-8"))
    runs = core.get("measured_target_runs", []) or []
    written = 0
    for run_record in runs:
        code = run_record.get("subset_code")
        if not code:
            continue
        print(f"[method_stats_hidsag] {code} ...", flush=True)
        with mlflow_run("build_method_statistics_hidsag", scene_id=code) as mlrun:
            try:
                payload = aggregate_subset(run_record)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                import traceback
                traceback.print_exc()
                continue
            out_path = DERIVED_OUT_DIR / f"{code}.json"
            with out_path.open("w", encoding="utf-8") as h:
                json.dump(payload, h, separators=(",", ":"))

            # Brief headline + MLflow metrics
            if payload["regression"]:
                block = payload["regression"]
                best_method = max(
                    block["method_aggregates"].items(),
                    key=lambda kv: (kv[1]["r2_distribution"]["mean"]
                                    if kv[1]["r2_distribution"]["mean"] is not None else -np.inf),
                )
                f = block["friedman_nemenyi"].get("friedman") if block.get("friedman_nemenyi") else None
                if best_method[1]["r2_distribution"]["mean"] is not None:
                    mlrun.log_metric(
                        "regression_best_r2_mean",
                        float(best_method[1]["r2_distribution"]["mean"]),
                    )
                if f and f.get("p_value") is not None:
                    mlrun.log_metric("regression_friedman_p", float(f["p_value"]))
                print(
                    f"  REG  best={best_method[0]} (R2 mean={best_method[1]['r2_distribution']['mean']:.3f}); "
                    f"Friedman p={f['p_value'] if f else 'NA'}",
                    flush=True,
                )
            if payload["classification"]:
                block = payload["classification"]
                best_method = max(
                    block["method_aggregates"].items(),
                    key=lambda kv: (kv[1]["macro_f1_distribution"]["mean"]
                                    if kv[1]["macro_f1_distribution"]["mean"] is not None else -np.inf),
                )
                f = block["friedman_nemenyi"].get("friedman") if block.get("friedman_nemenyi") else None
                if best_method[1]["macro_f1_distribution"]["mean"] is not None:
                    mlrun.log_metric(
                        "classification_best_macro_f1_mean",
                        float(best_method[1]["macro_f1_distribution"]["mean"]),
                    )
                if f and f.get("p_value") is not None:
                    mlrun.log_metric("classification_friedman_p", float(f["p_value"]))
                print(
                    f"  CLS  best={best_method[0]} (F1 mean={best_method[1]['macro_f1_distribution']['mean']:.3f}); "
                    f"Friedman p={f['p_value'] if f else 'NA'}",
                    flush=True,
                )
            mlrun.log_artifact(str(out_path))
            written += 1
    print(f"[method_stats_hidsag] done — {written} subsets written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
