"""HIDSAG measurement EDA — distributions, correlations, dominant targets.

Reads the existing curated HIDSAG subset JSON
(`data/derived/core/hidsag_curated_subset.json`) and produces a per-subset
EDA payload focused on the *measurement* side of the data: how each
numeric variable (Cu %, Au g/t, mineralogy, geochemistry) is distributed,
how variables correlate, and which targets dominate the subset.

Output: `data/derived/eda/hidsag/<subset_code>.json`

Schema (key fields):
- subset_code, sample_count, measurement_count_total
- numeric_variables: per-variable distribution stats (mean, std, min, p5,
  p25, p50, p75, p95, max, nonzero_samples)
- dominant_targets_by_mean: top variables by mean magnitude
- correlations: Pearson and Spearman matrices between numeric variables
- modality_band_counts: number of bands per modality (swir_low, vnir_low,
  vnir_high)
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR


CURATED_PATH = DERIVED_DIR / "core" / "hidsag_curated_subset.json"
OUTPUT_DIR = DERIVED_DIR / "eda" / "hidsag"


def collect_variable_values(subset: dict, var_name: str) -> np.ndarray:
    """Walk subset['samples'] -> measurements -> variable, collect numeric values."""
    out: list[float] = []
    for sample in subset.get("samples", []):
        for meas in sample.get("measurements", []) or []:
            for variable in meas.get("variables", []) or []:
                if variable.get("name") == var_name:
                    val = variable.get("value")
                    if isinstance(val, (int, float)) and not (isinstance(val, bool)):
                        out.append(float(val))
    return np.asarray(out, dtype=np.float64)


def variable_stats(values: np.ndarray) -> dict:
    if values.size == 0:
        return {"n": 0}
    return {
        "n": int(values.size),
        "n_nonzero": int((values != 0).sum()),
        "mean": round(float(values.mean()), 6),
        "std": round(float(values.std()), 6),
        "min": round(float(values.min()), 6),
        "p5": round(float(np.percentile(values, 5)), 6),
        "p25": round(float(np.percentile(values, 25)), 6),
        "p50": round(float(np.percentile(values, 50)), 6),
        "p75": round(float(np.percentile(values, 75)), 6),
        "p95": round(float(np.percentile(values, 95)), 6),
        "max": round(float(values.max()), 6),
    }


def safe_pearson_matrix(matrix: np.ndarray) -> np.ndarray:
    """Pearson correlation with robustness against zero-std columns."""
    n, p = matrix.shape
    out = np.eye(p, dtype=np.float64)
    if n < 2:
        return out
    means = matrix.mean(axis=0)
    centered = matrix - means
    stds = matrix.std(axis=0)
    norms = np.where(stds < 1e-12, 1.0, stds)
    z = centered / norms
    cov = (z.T @ z) / max(n - 1, 1)
    # zero out rows/cols where std was zero
    bad = stds < 1e-12
    if np.any(bad):
        cov[bad, :] = 0.0
        cov[:, bad] = 0.0
        np.fill_diagonal(cov, 1.0)
    return np.clip(cov, -1.0, 1.0)


def build_for_subset(subset: dict) -> dict:
    code = subset.get("subset_code")
    var_names = list(subset.get("numeric_variable_names", []))
    sample_count = int(subset.get("sample_count", 0))

    # Aligned matrix per variable: collect all values
    var_values: dict[str, np.ndarray] = {
        v: collect_variable_values(subset, v) for v in var_names
    }
    numeric_variables = {v: variable_stats(arr) for v, arr in var_values.items()}

    # For correlation, we need a paired observations matrix. Walk
    # measurements and emit a row per measurement with the available
    # numeric vars (NaN where missing), then do pairwise complete-cases.
    rows: list[dict[str, float]] = []
    for sample in subset.get("samples", []):
        for meas in sample.get("measurements", []) or []:
            entry: dict[str, float] = {}
            for variable in meas.get("variables", []) or []:
                name = variable.get("name")
                val = variable.get("value")
                if name in var_names and isinstance(val, (int, float)) and not isinstance(val, bool):
                    entry[name] = float(val)
            if entry:
                rows.append(entry)

    if rows and var_names:
        matrix = np.full((len(rows), len(var_names)), fill_value=np.nan, dtype=np.float64)
        for i, row in enumerate(rows):
            for j, v in enumerate(var_names):
                if v in row:
                    matrix[i, j] = row[v]
        # Pairwise pearson with complete-case masking
        n_vars = len(var_names)
        pearson = np.eye(n_vars, dtype=np.float64)
        spearman_mat = np.eye(n_vars, dtype=np.float64)
        for a in range(n_vars):
            for b in range(a + 1, n_vars):
                pair = matrix[:, [a, b]]
                mask = np.isfinite(pair).all(axis=1)
                if mask.sum() < 3:
                    continue
                sub = pair[mask]
                if sub[:, 0].std() < 1e-12 or sub[:, 1].std() < 1e-12:
                    continue
                p = float(np.corrcoef(sub[:, 0], sub[:, 1])[0, 1])
                pearson[a, b] = pearson[b, a] = p
                try:
                    s, _ = spearmanr(sub[:, 0], sub[:, 1])
                    if np.isfinite(s):
                        spearman_mat[a, b] = spearman_mat[b, a] = float(s)
                except Exception:
                    pass
        corr_pearson = [[round(float(v), 6) for v in row] for row in pearson]
        corr_spearman = [[round(float(v), 6) for v in row] for row in spearman_mat]
    else:
        corr_pearson = []
        corr_spearman = []

    return {
        "subset_code": code,
        "sample_count": sample_count,
        "measurement_count_total": int(subset.get("measurement_count_total", 0)),
        "numeric_variable_names": var_names,
        "numeric_variables": numeric_variables,
        "dominant_targets_by_mean": subset.get("dominant_targets_by_mean", []),
        "correlation_pearson": {
            "variables": var_names,
            "matrix": corr_pearson,
        },
        "correlation_spearman": {
            "variables": var_names,
            "matrix": corr_spearman,
        },
        "modality_band_counts": {
            mod: len(arr or [])
            for mod, arr in (subset.get("modality_wavelengths_nm") or {}).items()
        },
        "measurement_tags_top": subset.get("measurement_tags_top", []),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_eda_hidsag v0.1",
    }


def main() -> int:
    if not CURATED_PATH.exists():
        print(f"  no curated HIDSAG subset at {CURATED_PATH}", flush=True)
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    curated = json.load(CURATED_PATH.open("r", encoding="utf-8"))
    written = 0
    for subset in curated.get("subsets", []):
        code = subset.get("subset_code")
        if not code:
            continue
        print(f"[eda_hidsag] {code} ...", flush=True)
        try:
            payload = build_for_subset(subset)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        out_path = OUTPUT_DIR / f"{code}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(
            f"  vars={len(payload['numeric_variable_names'])}, "
            f"samples={payload['sample_count']}, "
            f"measurements={payload['measurement_count_total']} -> "
            f"{out_path.relative_to(ROOT)} ({size_kb:.1f} KB)",
            flush=True,
        )
        written += 1
    print(f"[eda_hidsag] done — {written} subsets written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
