"""Inspect downloaded HIDSAG ZIP subsets without full extraction."""
from __future__ import annotations

import json
import statistics
import zipfile
from datetime import date
from pathlib import Path
from typing import cast


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "hidsag"
OUTPUT_PATH = ROOT / "data" / "derived" / "core" / "hidsag_subset_inventory.json"


def summarize_numeric(values: list[float | int]) -> dict[str, float] | None:
    if not values:
        return None
    return {
        "min": round(float(min(values)), 4),
        "median": round(float(statistics.median(values)), 4),
        "max": round(float(max(values)), 4),
        "mean": round(float(statistics.mean(values)), 4),
    }


def summarize_zip(path: Path) -> dict[str, object]:
    with zipfile.ZipFile(path) as archive:
        file_infos = [info for info in archive.infolist() if not info.is_dir()]
        suffix_counts: dict[str, int] = {}
        top_level: dict[str, int] = {}
        header_examples: list[dict[str, object]] = []
        metadata_keys: set[str] = set()
        variable_names: set[str] = set()
        variable_values: dict[str, list[float]] = {}
        sample_rows: list[dict[str, object]] = []
        modality_stats: dict[str, dict[str, list[float] | set[float] | int]] = {}
        crop_count = 0

        for info in file_infos:
            suffix = Path(info.filename).suffix.lower() or "<no-extension>"
            suffix_counts[suffix] = suffix_counts.get(suffix, 0) + 1
            top = info.filename.split("/", 1)[0]
            top_level[top] = top_level.get(top, 0) + 1

            if suffix in {".csv", ".txt"} and len(header_examples) < 8:
                with archive.open(info.filename) as handle:
                    first_line = handle.readline().decode("utf-8", errors="replace").strip()
                header_examples.append(
                    {
                        "path": info.filename,
                        "header": first_line[:400],
                    }
                )
            if info.filename.endswith("metadata.json"):
                payload = json.loads(archive.read(info.filename))
                metadata_keys.update(payload.keys())
                variables = {str(key): float(value) for key, value in payload.get("vars", {}).items()}
                for name, value in variables.items():
                    variable_names.add(name)
                    variable_values.setdefault(name, []).append(value)

                top_variables = sorted(variables.items(), key=lambda item: item[1], reverse=True)[:5]
                nonzero_variables = [name for name, value in variables.items() if value > 0]
                composition_sum = round(sum(variables.values()), 4)
                crop_ids: list[str] = []
                modalities_seen: set[str] = set()

                for crop in payload.get("crops", []):
                    for crop_id, crop_payload in crop.items():
                        if crop_id == "tags":
                            continue
                        crop_count += 1
                        crop_ids.append(crop_id)
                        if not isinstance(crop_payload, dict):
                            continue
                        for modality, modality_payload in crop_payload.items():
                            modalities_seen.add(modality)
                            stats = modality_stats.setdefault(
                                modality,
                                {
                                    "cube_count": 0,
                                    "image_widths": [],
                                    "image_heights": [],
                                    "real_widths": [],
                                    "real_heights": [],
                                    "spectral_binning": set(),
                                    "spatial_binning": set(),
                                    "sample_frequency": set(),
                                    "integration_time": set(),
                                    "dolly_speed": set(),
                                },
                            )
                            stats["cube_count"] = int(stats["cube_count"]) + 1
                            image_dims = modality_payload.get("image_dims", {})
                            real_dims = modality_payload.get("real_dims", {})
                            if "width" in image_dims:
                                cast(list[float], stats["image_widths"]).append(float(image_dims["width"]))
                            if "height" in image_dims:
                                cast(list[float], stats["image_heights"]).append(float(image_dims["height"]))
                            if "width" in real_dims:
                                cast(list[float], stats["real_widths"]).append(float(real_dims["width"]))
                            if "height" in real_dims:
                                cast(list[float], stats["real_heights"]).append(float(real_dims["height"]))
                            for field_name, key in [
                                ("spectral_binning", "spectral_binning"),
                                ("spatial_binning", "spatial_binning"),
                                ("sample_frequency", "sample_frequency"),
                                ("integration_time", "integrations_time"),
                                ("dolly_speed", "dolly_speed"),
                            ]:
                                value = modality_payload.get(key)
                                if value is not None:
                                    cast(set[float], stats[field_name]).add(float(value))

                sample_rows.append(
                    {
                        "sample_name": payload.get("sample_name"),
                        "crop_ids": crop_ids,
                        "modalities": sorted(modalities_seen),
                        "composition_sum": composition_sum,
                        "nonzero_variable_count": len(nonzero_variables),
                        "dominant_variables": [
                            {"name": name, "value": round(value, 4)} for name, value in top_variables
                        ],
                    }
                )

        dominant_variables_by_mean = [
            {
                "name": name,
                "mean": round(float(statistics.mean(values)), 4),
                "max": round(float(max(values)), 4),
                "nonzero_samples": sum(1 for value in values if value > 0),
            }
            for name, values in variable_values.items()
            if values
        ]
        dominant_variables_by_mean.sort(key=lambda item: item["mean"], reverse=True)

        modality_summary = {}
        for modality, stats in modality_stats.items():
            modality_summary[modality] = {
                "cube_count": int(stats["cube_count"]),
                "image_width_stats": summarize_numeric(cast(list[float], stats["image_widths"])),
                "image_height_stats": summarize_numeric(cast(list[float], stats["image_heights"])),
                "real_width_stats": summarize_numeric(cast(list[float], stats["real_widths"])),
                "real_height_stats": summarize_numeric(cast(list[float], stats["real_heights"])),
                "spectral_binning_values": sorted(cast(set[float], stats["spectral_binning"])),
                "spatial_binning_values": sorted(cast(set[float], stats["spatial_binning"])),
                "sample_frequency_values": sorted(cast(set[float], stats["sample_frequency"])),
                "integration_time_values": sorted(cast(set[float], stats["integration_time"])),
                "dolly_speed_values": sorted(cast(set[float], stats["dolly_speed"])),
            }

        return {
            "zip_name": path.name,
            "subset_code": path.stem,
            "size_bytes": path.stat().st_size,
            "file_count": len(file_infos),
            "suffix_counts": suffix_counts,
            "top_level_entries": top_level,
            "header_examples": header_examples,
            "metadata_json_count": suffix_counts.get(".json", 0),
            "sample_count": len(sample_rows),
            "crop_count": crop_count,
            "cube_file_count": suffix_counts.get(".h5", 0),
            "rgb_preview_count": suffix_counts.get(".png", 0),
            "metadata_keys": sorted(metadata_keys),
            "variable_count": len(variable_names),
            "variable_names": sorted(variable_names),
            "composition_sum_stats": summarize_numeric([row["composition_sum"] for row in sample_rows]),
            "nonzero_variable_count_stats": summarize_numeric([row["nonzero_variable_count"] for row in sample_rows]),
            "dominant_variables_by_mean": dominant_variables_by_mean[:10],
            "modality_summary": modality_summary,
            "sample_previews": sample_rows[:6],
        }


def main() -> None:
    rows = []
    for path in sorted(RAW_DIR.glob("*.zip")):
        rows.append(summarize_zip(path))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "source": "HIDSAG ZIP inspection",
                "generated_at": str(date.today()),
                "subsets": rows,
            },
            handle,
            indent=2,
        )
    print(f"Wrote HIDSAG subset inventory to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
