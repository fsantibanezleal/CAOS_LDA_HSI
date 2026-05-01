"""Build a compact, versioned spectral subset from downloaded HIDSAG ZIP files."""
from __future__ import annotations

import json
import os
import tempfile
import zipfile
from datetime import date
from pathlib import Path

import h5py
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "hidsag"
OUTPUT_PATH = ROOT / "data" / "derived" / "core" / "hidsag_curated_subset.json"


def rounded_list(array: np.ndarray, decimals: int = 4) -> list[float]:
    return [round(float(value), decimals) for value in array.tolist()]


def summarize_global(array: np.ndarray) -> dict[str, float]:
    return {
        "min": round(float(np.min(array)), 4),
        "mean": round(float(np.mean(array)), 4),
        "max": round(float(np.max(array)), 4),
        "std": round(float(np.std(array)), 4),
    }


def load_h5_array(archive: zipfile.ZipFile, member_name: str) -> np.ndarray:
    with tempfile.NamedTemporaryFile(suffix=".h5", delete=False) as handle:
        handle.write(archive.read(member_name))
        temp_path = handle.name
    try:
        with h5py.File(temp_path, "r") as h5:
            return np.asarray(h5["hsi_data"], dtype=np.float32)
    finally:
        os.unlink(temp_path)


def build_cube_entry(
    archive: zipfile.ZipFile,
    cube_root: str,
    crop_id: str,
    modality: str,
    modality_payload: dict[str, object],
) -> dict[str, object]:
    cube_path = f"{cube_root}/{modality_payload['path_hsi']}"
    cube = load_h5_array(archive, cube_path)
    mean_spectrum = np.mean(cube, axis=(0, 1))
    std_spectrum = np.std(cube, axis=(0, 1))
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
        "global_intensity": summarize_global(cube),
        "mean_spectrum": rounded_list(mean_spectrum),
        "std_spectrum": rounded_list(std_spectrum),
    }


def build_subset(path: Path) -> dict[str, object]:
    with zipfile.ZipFile(path) as archive:
        metadata_names = sorted(name for name in archive.namelist() if name.endswith("metadata.json"))
        samples: list[dict[str, object]] = []
        variable_names: set[str] = set()
        dominant_tracker: dict[str, list[float]] = {}

        for metadata_name in metadata_names:
            payload = json.loads(archive.read(metadata_name))
            sample_name = str(payload["sample_name"])
            variables = {str(key): float(value) for key, value in payload.get("vars", {}).items()}
            for name, value in variables.items():
                variable_names.add(name)
                dominant_tracker.setdefault(name, []).append(value)

            dominant_targets = sorted(variables.items(), key=lambda item: item[1], reverse=True)[:5]
            cube_root = metadata_name.rsplit("/", 1)[0]
            cubes: list[dict[str, object]] = []
            crop_ids: list[str] = []
            for crop in payload.get("crops", []):
                for crop_id, crop_payload in crop.items():
                    if crop_id == "tags":
                        continue
                    crop_ids.append(crop_id)
                    if not isinstance(crop_payload, dict):
                        continue
                    for modality, modality_payload in crop_payload.items():
                        if not isinstance(modality_payload, dict):
                            continue
                        cubes.append(build_cube_entry(archive, cube_root, crop_id, modality, modality_payload))

            samples.append(
                {
                    "sample_name": sample_name,
                    "datarecord": payload.get("datarecord"),
                    "crop_ids": crop_ids,
                    "target_sum": round(sum(variables.values()), 4),
                    "targets": variables,
                    "dominant_targets": [
                        {"name": name, "value": round(value, 4)} for name, value in dominant_targets
                    ],
                    "cubes": cubes,
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

        return {
            "subset_code": path.stem,
            "zip_name": path.name,
            "size_bytes": path.stat().st_size,
            "sample_count": len(samples),
            "variable_count": len(variable_names),
            "variable_names": sorted(variable_names),
            "dominant_targets_by_mean": dominant_targets_by_mean[:10],
            "samples": samples,
            "caveats": [
                "Cube values are stored as raw local HIDSAG intensities, not cross-dataset calibrated reflectance.",
                "No wavelengths are shipped yet in this compact export; current spectra are indexed by band position.",
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
