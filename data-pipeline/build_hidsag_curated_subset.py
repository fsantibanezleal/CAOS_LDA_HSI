"""Build a compact, versioned spectral subset from downloaded HIDSAG ZIP files."""
from __future__ import annotations

import json
import os
import tempfile
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path

import h5py
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "hidsag"
OUTPUT_PATH = ROOT / "data" / "derived" / "core" / "hidsag_curated_subset.json"
HIDSAG_MODALITY_ORDER = ["swir_low", "vnir_low", "vnir_high"]


def rounded_list(array: np.ndarray, decimals: int = 4) -> list[float]:
    return [round(float(value), decimals) for value in array.tolist()]


def summarize_global(array: np.ndarray) -> dict[str, float]:
    return {
        "min": round(float(np.min(array)), 4),
        "mean": round(float(np.mean(array)), 4),
        "max": round(float(np.max(array)), 4),
        "std": round(float(np.std(array)), 4),
    }


def split_targets(payload_vars: dict[str, object]) -> tuple[dict[str, float], dict[str, str]]:
    numeric_targets: dict[str, float] = {}
    categorical_targets: dict[str, str] = {}
    for key, value in payload_vars.items():
        name = str(key)
        if isinstance(value, (int, float)):
            numeric_targets[name] = float(value)
        else:
            categorical_targets[name] = str(value)
    return numeric_targets, categorical_targets


def load_h5_cube(archive: zipfile.ZipFile, member_name: str) -> tuple[np.ndarray, np.ndarray | None]:
    with tempfile.NamedTemporaryFile(suffix=".h5", delete=False) as handle:
        handle.write(archive.read(member_name))
        temp_path = handle.name
    try:
        with h5py.File(temp_path, "r") as h5:
            dataset = h5["hsi_data"]
            wavelengths = dataset.attrs.get("wavelengths")
            wavelength_array = np.asarray(wavelengths, dtype=np.float32) if wavelengths is not None else None
            return np.asarray(dataset, dtype=np.float32), wavelength_array
    finally:
        os.unlink(temp_path)


def build_cube_entry(
    archive: zipfile.ZipFile,
    cube_root: str,
    crop_id: str,
    modality: str,
    modality_payload: dict[str, object],
    modality_wavelengths: dict[str, np.ndarray],
) -> dict[str, object]:
    cube_path = f"{cube_root}/{modality_payload['path_hsi']}"
    cube, wavelengths = load_h5_cube(archive, cube_path)
    if wavelengths is not None and modality not in modality_wavelengths:
        modality_wavelengths[modality] = wavelengths
    mean_spectrum = np.mean(cube, axis=(0, 1))
    std_spectrum = np.std(cube, axis=(0, 1))
    wavelength_range_nm = None
    if wavelengths is not None and wavelengths.size:
        wavelength_range_nm = {
            "start": round(float(wavelengths[0]), 4),
            "stop": round(float(wavelengths[-1]), 4),
        }
    return {
        "crop_id": crop_id,
        "modality": modality,
        "path_hsi": modality_payload["path_hsi"],
        "path_rgb": modality_payload.get("path_rgb"),
        "shape": list(cube.shape),
        "spectral_band_count": int(cube.shape[2]),
        "image_dims": modality_payload.get("image_dims"),
        "real_dims": modality_payload.get("real_dims"),
        "spectral_binning": modality_payload.get("spectral_binning"),
        "spatial_binning": modality_payload.get("spatial_binning"),
        "sample_frequency": modality_payload.get("sample_frequency"),
        "integration_time": modality_payload.get("integrations_time"),
        "dolly_speed": modality_payload.get("dolly_speed"),
        "wavelength_range_nm": wavelength_range_nm,
        "global_intensity": summarize_global(cube),
        "mean_spectrum": rounded_list(mean_spectrum),
        "std_spectrum": rounded_list(std_spectrum),
    }


def build_measurement_entry(
    archive: zipfile.ZipFile,
    cube_root: str,
    crop: dict[str, object],
    modality_wavelengths: dict[str, np.ndarray],
) -> dict[str, object]:
    tags = [str(tag) for tag in crop.get("tags", [])]
    for crop_id, crop_payload in crop.items():
        if crop_id == "tags" or not isinstance(crop_payload, dict):
            continue
        cubes = []
        modalities = []
        for modality in HIDSAG_MODALITY_ORDER:
            modality_payload = crop_payload.get(modality)
            if not isinstance(modality_payload, dict):
                continue
            cubes.append(build_cube_entry(archive, cube_root, crop_id, modality, modality_payload, modality_wavelengths))
            modalities.append(modality)
        return {
            "crop_id": crop_id,
            "tags": tags,
            "cube_count": len(cubes),
            "modalities": modalities,
            "cubes": cubes,
        }
    raise ValueError(f"Crop payload at {cube_root} did not contain any measurement dictionaries.")


def build_subset(path: Path) -> dict[str, object]:
    with zipfile.ZipFile(path) as archive:
        metadata_names = sorted(name for name in archive.namelist() if name.endswith("metadata.json"))
        samples: list[dict[str, object]] = []
        variable_names: set[str] = set()
        numeric_variable_names: set[str] = set()
        categorical_variable_names: set[str] = set()
        dominant_tracker: dict[str, list[float]] = {}
        categorical_values: dict[str, Counter[str]] = {}
        measurement_counts: list[int] = []
        tag_counter: Counter[str] = Counter()
        modality_wavelengths: dict[str, np.ndarray] = {}

        for metadata_name in metadata_names:
            payload = json.loads(archive.read(metadata_name))
            sample_name = str(payload["sample_name"])
            numeric_targets, categorical_targets = split_targets(payload.get("vars", {}))
            for name, value in numeric_targets.items():
                variable_names.add(name)
                numeric_variable_names.add(name)
                dominant_tracker.setdefault(name, []).append(value)
            for name, value in categorical_targets.items():
                variable_names.add(name)
                categorical_variable_names.add(name)
                categorical_values.setdefault(name, Counter()).update([value])

            dominant_targets = sorted(numeric_targets.items(), key=lambda item: item[1], reverse=True)[:5]
            cube_root = metadata_name.rsplit("/", 1)[0]
            measurements = [
                build_measurement_entry(archive, cube_root, crop, modality_wavelengths) for crop in payload.get("crops", [])
            ]
            measurement_counts.append(len(measurements))
            crop_ids = [str(measurement["crop_id"]) for measurement in measurements]
            sample_tag_counter = Counter(tag for measurement in measurements for tag in measurement.get("tags", []))
            tag_counter.update(sample_tag_counter)

            samples.append(
                {
                    "sample_name": sample_name,
                    "datarecord": payload.get("datarecord"),
                    "crop_ids": crop_ids,
                    "measurement_count": len(measurements),
                    "measurement_tag_summary": dict(sorted(sample_tag_counter.items())),
                    "target_sum": round(sum(numeric_targets.values()), 4),
                    "targets": numeric_targets,
                    "categorical_targets": categorical_targets,
                    "dominant_targets": [
                        {"name": name, "value": round(value, 4)} for name, value in dominant_targets
                    ],
                    "measurements": measurements,
                }
            )

        dominant_targets_by_mean = [
            {
                "name": name,
                "mean": round(float(np.mean(values)), 4),
                "max": round(float(np.max(values)), 4),
                "nonzero_samples": int(sum(1 for value in values if value > 0)),
            }
            for name, values in dominant_tracker.items()
            if values
        ]
        dominant_targets_by_mean.sort(key=lambda item: item["mean"], reverse=True)
        modality_wavelength_rows = {
            modality: rounded_list(wavelengths, decimals=2)
            for modality, wavelengths in modality_wavelengths.items()
        }
        modality_wavelength_ranges = {
            modality: {
                "band_count": int(wavelengths.shape[0]),
                "start": round(float(wavelengths[0]), 4),
                "stop": round(float(wavelengths[-1]), 4),
            }
            for modality, wavelengths in modality_wavelengths.items()
            if wavelengths.size
        }

        return {
            "subset_code": path.stem,
            "zip_name": path.name,
            "size_bytes": path.stat().st_size,
            "sample_count": len(samples),
            "measurement_count_total": int(sum(measurement_counts)),
            "measurement_count_stats": {
                "min": int(min(measurement_counts)) if measurement_counts else 0,
                "median": round(float(np.median(measurement_counts)), 4) if measurement_counts else 0.0,
                "max": int(max(measurement_counts)) if measurement_counts else 0,
                "mean": round(float(np.mean(measurement_counts)), 4) if measurement_counts else 0.0,
            },
            "variable_count": len(variable_names),
            "variable_names": sorted(variable_names),
            "numeric_variable_count": len(numeric_variable_names),
            "numeric_variable_names": sorted(numeric_variable_names),
            "categorical_variable_count": len(categorical_variable_names),
            "categorical_variable_names": sorted(categorical_variable_names),
            "categorical_value_counts": {
                name: [{"value": value, "count": int(count)} for value, count in counter.most_common(12)]
                for name, counter in sorted(categorical_values.items())
            },
            "measurement_tags_top": [
                {"tag": tag, "count": int(count)}
                for tag, count in tag_counter.most_common(12)
            ],
            "modality_wavelength_ranges_nm": modality_wavelength_ranges,
            "modality_wavelengths_nm": modality_wavelength_rows,
            "dominant_targets_by_mean": dominant_targets_by_mean[:10],
            "samples": samples,
            "caveats": [
                "Cube values are stored as raw local HIDSAG intensities, not cross-dataset calibrated reflectance.",
                "Wavelength vectors are preserved from HIDSAG h5 attributes when available.",
                "HIDSAG does not provide an explicit bad-band mask in the current local export.",
                "This artifact is intended for local validation and future interactive inspection, not final modeling claims.",
            ],
        }


def main() -> None:
    subset_rows = [build_subset(path) for path in sorted(RAW_DIR.glob("*.zip"))]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "source": "Curated HIDSAG local subset",
                "generated_at": str(date.today()),
                "subsets": subset_rows,
            },
            handle,
            indent=2,
        )
    print(f"Wrote HIDSAG curated subset to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
