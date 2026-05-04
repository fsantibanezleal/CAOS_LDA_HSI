"""HIDSAG measurement EDA — distributions, correlations, dominant targets.

Reads the existing curated HIDSAG subset JSON
(`data/derived/core/hidsag_curated_subset.json`) and produces a per-subset
EDA payload focused on the *measurement* side of the data: how each
numeric variable (Cu %, Au g/t, mineralogy, geochemistry) is distributed,
how variables correlate, and which targets dominate the subset.

Cycle 0b extension: the per-measurement mean spectrum is derived from
`data/derived/core/hidsag_region_documents.npz` (3 × 3 patch grid per
measurement, ~9 patches/measurement). Each measurement contributes one
mean spectrum; per-tag stratum mean spectra are also reported when the
subset's measurements carry tags.

Output: `data/derived/eda/hidsag/<subset_code>.json`

Schema (key fields):
- subset_code, sample_count, measurement_count_total
- numeric_variables: per-variable distribution stats (mean, std, min, p5,
  p25, p50, p75, p95, max, nonzero_samples)
- dominant_targets_by_mean: top variables by mean magnitude
- correlations: Pearson and Spearman matrices between numeric variables
- modality_band_counts: number of bands per modality (swir_low, vnir_low,
  vnir_high)
- mean_spectrum_by_measurement: per-measurement mean spectrum (cycle 0b)
- mean_spectrum_by_measurement_stratum: per-tag stratum mean spectrum
  (cycle 0b)
- spectrum_axis: feature_layout (modality + wavelength range per band)
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
REGION_DOCS_JSON = DERIVED_DIR / "core" / "hidsag_region_documents.json"
REGION_DOCS_NPZ = DERIVED_DIR / "core" / "hidsag_region_documents.npz"
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


def _build_spectrum_axis(feature_layout: list[dict]) -> list[dict]:
    """Flatten the per-modality wavelength layout into a per-band list.

    Each output entry is {modality, band_index_within_modality, wavelength_nm}.
    Indices are global (0..total_bands-1)."""
    axis: list[dict] = []
    for entry in feature_layout or []:
        modality = entry.get("modality")
        band_count = int(entry.get("band_count", 0))
        wr = entry.get("wavelength_range_nm") or {}
        start = float(wr.get("start", 0.0))
        stop = float(wr.get("stop", 0.0))
        if band_count <= 0:
            continue
        wls = np.linspace(start, stop, band_count)
        for i in range(band_count):
            axis.append({
                "modality": modality,
                "band_index_within_modality": int(i),
                "wavelength_nm": round(float(wls[i]), 4),
            })
    return axis


def _round4_list(arr: np.ndarray) -> list[float]:
    return [round(float(v), 4) for v in arr.tolist()]


def per_measurement_spectra(
    subset_code: str, subset: dict
) -> tuple[list[dict], list[dict], list[dict]]:
    """Compute the per-measurement mean spectrum for one subset by
    averaging the 3x3 patch grid of `<subset>__features` indexed by
    `<subset>__measurement_owner` in the region-documents npz.

    Returns:
      mean_by_measurement: list of {measurement_name, sample_name,
        patch_count, mean_spectrum_round4}
      mean_by_stratum: list of {stratum, measurement_count, mean_spectrum_round4}
      spectrum_axis: per-band {modality, band_index_within_modality,
        wavelength_nm}; empty if region docs not available."""
    if not REGION_DOCS_NPZ.is_file() or not REGION_DOCS_JSON.is_file():
        return [], [], []
    region_index = json.loads(REGION_DOCS_JSON.read_text(encoding="utf-8"))
    subset_meta = next(
        (s for s in region_index.get("subsets", [])
         if s.get("subset_code") == subset_code),
        None,
    )
    if subset_meta is None:
        return [], [], []
    feature_layout = subset_meta.get("feature_layout", []) or []
    spectrum_axis = _build_spectrum_axis(feature_layout)

    z = np.load(REGION_DOCS_NPZ, allow_pickle=True)
    f_key = f"{subset_code}__features"
    mo_key = f"{subset_code}__measurement_owner"
    so_key = f"{subset_code}__sample_owner"
    mn_key = f"{subset_code}__measurement_names"
    sn_key = f"{subset_code}__sample_names"
    if any(k not in z for k in (f_key, mo_key, so_key, mn_key, sn_key)):
        return [], [], spectrum_axis

    features = np.asarray(z[f_key], dtype=np.float64)
    measurement_owner = np.asarray(z[mo_key], dtype=np.int64)
    sample_owner = np.asarray(z[so_key], dtype=np.int64)
    measurement_names = list(z[mn_key].tolist())
    sample_names = list(z[sn_key].tolist())

    # Build measurement -> sample map
    meas_to_sample: dict[int, int] = {}
    for m_idx, s_idx in zip(measurement_owner.tolist(), sample_owner.tolist()):
        if m_idx not in meas_to_sample:
            meas_to_sample[m_idx] = int(s_idx)

    # Index measurement tags from the curated subset payload (so we can
    # group by tag for the per-stratum stratification).
    meas_tag_lookup: dict[tuple[str, str], list[str]] = {}
    for sample in subset.get("samples", []):
        sample_name = sample.get("sample_name")
        for meas in sample.get("measurements", []) or []:
            crop_id = meas.get("crop_id")
            tags = meas.get("tags") or []
            if sample_name and crop_id:
                meas_tag_lookup[(sample_name, str(crop_id))] = list(tags)

    # Per-measurement mean spectrum (average the 9 patches)
    mean_by_measurement: list[dict] = []
    for m_idx in sorted(set(measurement_owner.tolist())):
        mask = measurement_owner == m_idx
        if not mask.any():
            continue
        mean_spec = features[mask].mean(axis=0)
        m_name = (
            measurement_names[m_idx]
            if 0 <= m_idx < len(measurement_names)
            else f"measurement_{m_idx}"
        )
        s_idx = meas_to_sample.get(int(m_idx), -1)
        s_name = (
            sample_names[s_idx]
            if 0 <= s_idx < len(sample_names)
            else f"sample_{s_idx}"
        )
        # measurement_name in the npz is "<sample_name>:<crop_id>";
        # the curated lookup table is keyed by (sample_name, crop_id).
        crop_id = str(m_name).split(":", 1)[-1] if ":" in str(m_name) else str(m_name)
        tags = meas_tag_lookup.get((s_name, crop_id), [])
        mean_by_measurement.append({
            "measurement_name": str(m_name),
            "sample_name": str(s_name),
            "patch_count": int(mask.sum()),
            "tags": tags,
            "mean_spectrum_round4": _round4_list(mean_spec),
        })

    # Per-tag stratum mean spectrum: stratum is each unique tag string.
    # A measurement with multiple tags contributes its mean to each.
    stratum_acc: dict[str, list[np.ndarray]] = {}
    for entry in mean_by_measurement:
        spec = np.asarray(entry["mean_spectrum_round4"], dtype=np.float64)
        for tag in entry["tags"]:
            stratum_acc.setdefault(tag, []).append(spec)
    mean_by_stratum: list[dict] = []
    for tag, specs in sorted(stratum_acc.items()):
        if not specs:
            continue
        stack = np.vstack(specs)
        mean_by_stratum.append({
            "stratum": tag,
            "measurement_count": int(stack.shape[0]),
            "mean_spectrum_round4": _round4_list(stack.mean(axis=0)),
        })

    return mean_by_measurement, mean_by_stratum, spectrum_axis


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

    # Cycle 0b extension: per-measurement and per-stratum mean spectra,
    # derived from the patch-level region documents.
    mean_by_measurement, mean_by_stratum, spectrum_axis = per_measurement_spectra(
        code, subset
    )

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
        "spectrum_axis": spectrum_axis,
        "mean_spectrum_by_measurement": mean_by_measurement,
        "mean_spectrum_by_measurement_stratum": mean_by_stratum,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_eda_hidsag v0.2",
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
        n_meas_spectra = len(payload.get("mean_spectrum_by_measurement", []))
        n_stratum = len(payload.get("mean_spectrum_by_measurement_stratum", []))
        n_axis = len(payload.get("spectrum_axis", []))
        print(
            f"  vars={len(payload['numeric_variable_names'])}, "
            f"samples={payload['sample_count']}, "
            f"measurements={payload['measurement_count_total']}, "
            f"per-meas spectra={n_meas_spectra}, strata={n_stratum}, "
            f"axis bands={n_axis} -> "
            f"{out_path.relative_to(ROOT)} ({size_kb:.1f} KB)",
            flush=True,
        )
        written += 1
    print(f"[eda_hidsag] done — {written} subsets written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
