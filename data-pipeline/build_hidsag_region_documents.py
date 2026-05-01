"""Build patch-level HIDSAG region documents for local benchmarks and future UI subsets."""
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
CURATED_PATH = ROOT / "data" / "derived" / "core" / "hidsag_curated_subset.json"
OUTPUT_JSON_PATH = ROOT / "data" / "derived" / "core" / "hidsag_region_documents.json"
OUTPUT_NPZ_PATH = ROOT / "data" / "derived" / "core" / "hidsag_region_documents.npz"
HIDSAG_MODALITY_ORDER = ["swir_low", "vnir_low", "vnir_high"]
PATCH_GRID_ROWS = 3
PATCH_GRID_COLS = 3


def load_json(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_h5_array(archive: zipfile.ZipFile, member_name: str) -> np.ndarray:
    with tempfile.NamedTemporaryFile(suffix=".h5", delete=False) as handle:
        handle.write(archive.read(member_name))
        temp_path = handle.name
    try:
        with h5py.File(temp_path, "r") as h5:
            return np.asarray(h5["hsi_data"], dtype=np.float32)
    finally:
        os.unlink(temp_path)


def rounded_list(values: np.ndarray, decimals: int = 4) -> list[float]:
    return [round(float(value), decimals) for value in values.tolist()]


def stats(values: list[int]) -> dict[str, float]:
    if not values:
        return {"min": 0.0, "median": 0.0, "max": 0.0, "mean": 0.0}
    array = np.asarray(values, dtype=np.float32)
    return {
        "min": round(float(np.min(array)), 4),
        "median": round(float(np.median(array)), 4),
        "max": round(float(np.max(array)), 4),
        "mean": round(float(np.mean(array)), 4),
    }


def subset_by_code(payload: dict[str, object], subset_code: str) -> dict[str, object]:
    for subset in payload.get("subsets", []):
        if str(subset.get("subset_code")) == subset_code:
            return subset
    raise KeyError(f"Subset {subset_code} not found in {CURATED_PATH}")


def feature_layout(subset: dict[str, object]) -> tuple[list[dict[str, object]], dict[str, int], int]:
    samples = subset.get("samples", [])
    if not samples:
        raise ValueError(f"Subset {subset.get('subset_code')} has no samples.")
    first_sample = samples[0]
    first_measurement = first_sample["measurements"][0]
    cubes_by_modality = {cube["modality"]: cube for cube in first_measurement["cubes"]}
    layout = []
    modality_offsets: dict[str, int] = {}
    offset = 0
    for modality in HIDSAG_MODALITY_ORDER:
        cube = cubes_by_modality[modality]
        band_count = int(cube["spectral_band_count"])
        modality_offsets[modality] = offset
        offset += band_count
        layout.append(
            {
                "modality": modality,
                "band_count": band_count,
                "source": "patch_mean_spectrum",
            }
        )
    return layout, modality_offsets, offset


def subset_zip_path(subset_code: str) -> Path:
    zip_path = RAW_DIR / f"{subset_code}.zip"
    if not zip_path.exists():
        raise FileNotFoundError(zip_path)
    return zip_path


def patch_slices(size: int, parts: int) -> list[tuple[int, int]]:
    indices = np.array_split(np.arange(size), parts)
    slices = []
    for block in indices:
        if block.size == 0:
            continue
        slices.append((int(block[0]), int(block[-1]) + 1))
    return slices


def build_subset_region_docs(subset: dict[str, object]) -> tuple[dict[str, object], dict[str, np.ndarray]]:
    subset_code = str(subset["subset_code"])
    layout, modality_offsets, total_bands = feature_layout(subset)
    zip_path = subset_zip_path(subset_code)
    sample_names: list[str] = []
    measurement_names: list[str] = []
    doc_ids: list[str] = []
    features: list[np.ndarray] = []
    sample_owner: list[int] = []
    measurement_owner: list[int] = []
    patch_row_index: list[int] = []
    patch_col_index: list[int] = []
    measurement_docs_per_sample: list[int] = []
    docs_per_measurement: list[int] = []
    sample_previews: list[dict[str, object]] = []

    with zipfile.ZipFile(zip_path) as archive:
        global_measurement_index = 0
        for sample_index, sample in enumerate(subset.get("samples", [])):
            sample_name = str(sample["sample_name"])
            sample_names.append(sample_name)
            measurement_tag_counter = Counter()
            sample_doc_count = 0
            measurement_preview_rows = []

            for measurement in sample.get("measurements", []):
                crop_id = str(measurement["crop_id"])
                tags = [str(tag) for tag in measurement.get("tags", [])]
                measurement_tag_counter.update(tags)
                measurement_name = f"{sample_name}:{crop_id}"
                measurement_names.append(measurement_name)
                measurement_doc_count = 0
                preview_region_ids: list[str] = []
                cube_arrays = {}
                for cube in measurement.get("cubes", []):
                    modality = str(cube["modality"])
                    cube_path = f"{subset_code}/{sample_name}/{cube['path_hsi']}"
                    cube_arrays[modality] = load_h5_array(archive, cube_path)

                row_ranges_by_modality = {
                    modality: patch_slices(int(cube_arrays[modality].shape[0]), PATCH_GRID_ROWS)
                    for modality in HIDSAG_MODALITY_ORDER
                }
                col_ranges_by_modality = {
                    modality: patch_slices(int(cube_arrays[modality].shape[1]), PATCH_GRID_COLS)
                    for modality in HIDSAG_MODALITY_ORDER
                }

                for patch_row in range(PATCH_GRID_ROWS):
                    for patch_col in range(PATCH_GRID_COLS):
                        row = np.zeros(total_bands, dtype=np.float32)
                        for modality in HIDSAG_MODALITY_ORDER:
                            cube_array = cube_arrays[modality]
                            band_count = int(cube_array.shape[2])
                            r0, r1 = row_ranges_by_modality[modality][patch_row]
                            c0, c1 = col_ranges_by_modality[modality][patch_col]
                            patch = cube_array[r0:r1, c0:c1, :]
                            mean_spectrum = np.mean(patch, axis=(0, 1)).astype(np.float32)
                            start = modality_offsets[modality]
                            row[start : start + band_count] = mean_spectrum

                        region_id = f"{measurement_name}:patch-r{patch_row + 1}c{patch_col + 1}"
                        features.append(row)
                        sample_owner.append(sample_index)
                        measurement_owner.append(global_measurement_index)
                        patch_row_index.append(patch_row)
                        patch_col_index.append(patch_col)
                        doc_ids.append(region_id)
                        measurement_doc_count += 1
                        sample_doc_count += 1
                        if len(preview_region_ids) < 3:
                            preview_region_ids.append(region_id)

                docs_per_measurement.append(measurement_doc_count)
                measurement_preview_rows.append(
                    {
                        "measurement_name": measurement_name,
                        "tags": tags,
                        "region_document_count": measurement_doc_count,
                        "preview_region_ids": preview_region_ids,
                    }
                )
                global_measurement_index += 1

            measurement_docs_per_sample.append(sample_doc_count)
            if len(sample_previews) < 8:
                sample_previews.append(
                    {
                        "sample_name": sample_name,
                        "measurement_count": int(sample.get("measurement_count", 0)),
                        "measurement_tag_summary": dict(sorted(measurement_tag_counter.items())),
                        "region_document_count": sample_doc_count,
                        "measurement_previews": measurement_preview_rows[:2],
                    }
                )

    summary = {
        "subset_code": subset_code,
        "sample_count": int(subset["sample_count"]),
        "measurement_count_total": int(subset.get("measurement_count_total", len(measurement_names))),
        "region_document_count": int(len(doc_ids)),
        "feature_layout": layout,
        "patch_grid": {"rows": PATCH_GRID_ROWS, "cols": PATCH_GRID_COLS},
        "documents_per_measurement_stats": stats(docs_per_measurement),
        "documents_per_sample_stats": stats(measurement_docs_per_sample),
        "sample_previews": sample_previews,
        "caveats": [
            "Region documents are fixed-grid patch means, not semantic segments or SLIC superpixels.",
            "Patch coordinates are stored in pixel space only; wavelength metadata is still band-index based.",
            "These features are intended for local validation and future interactive subsets, not direct publication claims.",
        ],
    }
    arrays = {
        f"{subset_code}__features": np.vstack(features).astype(np.float32),
        f"{subset_code}__sample_owner": np.asarray(sample_owner, dtype=np.int32),
        f"{subset_code}__measurement_owner": np.asarray(measurement_owner, dtype=np.int32),
        f"{subset_code}__patch_row_index": np.asarray(patch_row_index, dtype=np.int8),
        f"{subset_code}__patch_col_index": np.asarray(patch_col_index, dtype=np.int8),
        f"{subset_code}__doc_ids": np.asarray(doc_ids),
        f"{subset_code}__sample_names": np.asarray(sample_names),
        f"{subset_code}__measurement_names": np.asarray(measurement_names),
    }
    return summary, arrays


def main() -> None:
    curated = load_json(CURATED_PATH)
    subset_summaries = []
    arrays: dict[str, np.ndarray] = {}

    for subset in curated.get("subsets", []):
        summary, subset_arrays = build_subset_region_docs(subset)
        subset_summaries.append(summary)
        arrays.update(subset_arrays)

    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON_PATH.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "source": "Patch-level HIDSAG region documents derived from local raw ZIP archives",
                "generated_at": str(date.today()),
                "patch_grid": {"rows": PATCH_GRID_ROWS, "cols": PATCH_GRID_COLS},
                "npz_path": str(OUTPUT_NPZ_PATH),
                "subsets": subset_summaries,
            },
            handle,
            indent=2,
        )
    np.savez_compressed(OUTPUT_NPZ_PATH, **arrays)
    print(f"Wrote HIDSAG region-document summary to {OUTPUT_JSON_PATH}")
    print(f"Wrote HIDSAG region-document arrays to {OUTPUT_NPZ_PATH}")


if __name__ == "__main__":
    main()
