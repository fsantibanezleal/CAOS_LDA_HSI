"""Build a wavelength-aware bad-band heuristic summary for local HIDSAG subsets."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CURATED_PATH = ROOT / "data" / "derived" / "core" / "hidsag_curated_subset.json"
OUTPUT_PATH = ROOT / "data" / "derived" / "core" / "hidsag_band_quality.json"
EDGE_TRIM_FRACTION = 0.01
EDGE_TRIM_MIN = 4
EDGE_TRIM_MAX = 12
SPIKE_MAD_MULTIPLIER = 6.0


def load_json(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_rows01(values: np.ndarray) -> np.ndarray:
    row_min = np.min(values, axis=1, keepdims=True)
    row_max = np.max(values, axis=1, keepdims=True)
    denom = np.maximum(row_max - row_min, 1e-6)
    return (values - row_min) / denom


def edge_trim_count(band_count: int) -> int:
    return int(min(EDGE_TRIM_MAX, max(EDGE_TRIM_MIN, round(float(band_count) * EDGE_TRIM_FRACTION))))


def modality_cube_spectra(subset: dict[str, object], modality: str) -> np.ndarray:
    rows: list[np.ndarray] = []
    for sample in subset.get("samples", []):
        for measurement in sample.get("measurements", []):
            for cube in measurement.get("cubes", []):
                if str(cube["modality"]) != modality:
                    continue
                rows.append(np.asarray(cube["mean_spectrum"], dtype=np.float32))
    if not rows:
        raise ValueError(f"Subset {subset.get('subset_code')} has no cube spectra for modality {modality}.")
    return np.vstack(rows).astype(np.float32)


def spike_mask_from_spectra(spectra: np.ndarray, trim_count: int) -> tuple[np.ndarray, float, list[dict[str, float]]]:
    normalized = normalize_rows01(spectra)
    band_count = int(normalized.shape[1])
    band_scores = np.zeros(band_count, dtype=np.float32)
    if band_count > 2:
        roughness = np.abs(normalized[:, 2:] - (2.0 * normalized[:, 1:-1]) + normalized[:, :-2])
        band_scores[1:-1] = np.median(roughness, axis=0)

    interior_stop = max(trim_count + 1, band_count - trim_count)
    interior_scores = band_scores[trim_count:interior_stop]
    score_median = float(np.median(interior_scores)) if interior_scores.size else float(np.median(band_scores))
    mad = float(np.median(np.abs(interior_scores - score_median))) if interior_scores.size else 0.0
    threshold = score_median + (SPIKE_MAD_MULTIPLIER * max(mad, 1e-6))

    spike_mask = np.zeros(band_count, dtype=bool)
    for band_index in range(trim_count, max(trim_count, band_count - trim_count)):
        if band_index <= 0 or band_index >= band_count - 1:
            continue
        local_score = float(band_scores[band_index])
        if local_score <= threshold:
            continue
        if local_score >= float(band_scores[band_index - 1]) and local_score >= float(band_scores[band_index + 1]):
            spike_mask[band_index] = True

    top_candidates = np.argsort(band_scores)[::-1][:12]
    top_rows = [
        {
            "band_index": int(index),
            "score": round(float(band_scores[int(index)]), 6),
        }
        for index in top_candidates
    ]
    return spike_mask, round(threshold, 6), top_rows


def quality_rows_for_subset(subset: dict[str, object]) -> dict[str, object]:
    wavelength_map = subset.get("modality_wavelengths_nm", {})
    modality_rows = []
    for modality, wavelengths_any in sorted(wavelength_map.items()):
        wavelengths = np.asarray(wavelengths_any, dtype=np.float32)
        spectra = modality_cube_spectra(subset, modality)
        trim_count = edge_trim_count(int(wavelengths.shape[0]))
        edge_mask = np.zeros(wavelengths.shape[0], dtype=bool)
        edge_mask[:trim_count] = True
        edge_mask[-trim_count:] = True
        spike_mask, threshold, top_rows = spike_mask_from_spectra(spectra, trim_count)
        combined_mask = edge_mask | spike_mask
        masked_indices = np.flatnonzero(combined_mask).astype(np.int32)
        masked_wavelengths = wavelengths[masked_indices] if masked_indices.size else np.asarray([], dtype=np.float32)

        modality_rows.append(
            {
                "modality": modality,
                "band_count": int(wavelengths.shape[0]),
                "cube_spectrum_count": int(spectra.shape[0]),
                "wavelength_range_nm": {
                    "start": round(float(wavelengths[0]), 4),
                    "stop": round(float(wavelengths[-1]), 4),
                },
                "heuristic_policy": {
                    "edge_trim_count": int(trim_count),
                    "spike_threshold": threshold,
                    "masked_band_count": int(masked_indices.size),
                    "masked_fraction": round(float(masked_indices.size / max(1, wavelengths.shape[0])), 4),
                    "retained_band_count": int(wavelengths.shape[0] - masked_indices.size),
                    "retained_fraction": round(float((wavelengths.shape[0] - masked_indices.size) / max(1, wavelengths.shape[0])), 4),
                    "edge_mask_count": int(np.sum(edge_mask)),
                    "spike_mask_count": int(np.sum(spike_mask)),
                    "masked_indices": [int(index) for index in masked_indices.tolist()],
                    "masked_wavelengths_nm": [round(float(value), 2) for value in masked_wavelengths.tolist()],
                    "retained_indices": [
                        int(index)
                        for index in np.flatnonzero(~combined_mask).astype(np.int32).tolist()
                    ],
                    "retained_wavelengths_nm": [
                        round(float(value), 2)
                        for value in wavelengths[~combined_mask].tolist()
                    ],
                    "top_roughness_candidates": top_rows,
                },
            }
        )

    return {
        "subset_code": subset["subset_code"],
        "sample_count": int(subset["sample_count"]),
        "measurement_count_total": int(subset.get("measurement_count_total", subset["sample_count"])),
        "modalities": modality_rows,
    }


def main() -> None:
    curated = load_json(CURATED_PATH)
    subset_rows = [quality_rows_for_subset(subset) for subset in curated.get("subsets", [])]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "source": "HIDSAG wavelength-aware bad-band heuristic",
                "generated_at": str(date.today()),
                "policy": {
                    "edge_trim_fraction": EDGE_TRIM_FRACTION,
                    "edge_trim_min": EDGE_TRIM_MIN,
                    "edge_trim_max": EDGE_TRIM_MAX,
                    "spike_mad_multiplier": SPIKE_MAD_MULTIPLIER,
                    "notes": [
                        "This is a local quality heuristic, not an official vendor bad-band mask.",
                        "Edge trimming removes sensor extremes; spike masking uses robust second-difference roughness over cube-mean spectra.",
                    ],
                },
                "subsets": subset_rows,
            },
            handle,
            indent=2,
        )
    print(f"Wrote HIDSAG band-quality summary to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
