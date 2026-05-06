"""Build a unified local inventory across curated manifests and raw downloads."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from research_core.paths import MANIFESTS_DIR, RAW_DIR


DOWNLOAD_MANIFESTS = [
    RAW_DIR / "download_manifest.json",
    RAW_DIR / "borsoi_mua" / "download_manifest.json",
    RAW_DIR / "hidsag" / "download_manifest.json",
    RAW_DIR / "micasense" / "download_manifest.json",
    RAW_DIR / "usgs_splib07" / "download_manifest.json",
]

RAW_DATASET_ALIASES = {
    "micasense-rededge-samples": [
        "micasense-example-1",
        "micasense-example-2",
        "micasense-example-3",
    ],
    "unmixing-roi-suite": [
        "samson-unmixing-roi",
        "jasper-ridge-unmixing-roi",
        "urban-unmixing-roi",
    ],
    "usgs-splib07": [
        "usgs-splib07-aviris-1997",
        "usgs-splib07-sentinel2",
    ],
    "hidsag-geometallurgy": [
        "hidsag-geomet",
        "hidsag-porphyry",
        "hidsag-geochem",
        "hidsag-mineral1",
        "hidsag-mineral2",
    ],
    # cuprite-upv-reflectance and cuprite-aviris-reflectance are two
    # catalog entries pointing at the same UPV/EHU .mat file (both
    # consume `Cuprite_f970619t01p02_r02_sc03.a.rfl.mat`). The alias
    # lets the inventory mark the cuprite-upv entry as locally
    # available without duplicating the download.
    "cuprite-upv-reflectance": [
        "cuprite-aviris-reflectance",
    ],
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def source_group_id(manifest_path: Path) -> str:
    return "upv_ehu" if manifest_path.parent == RAW_DIR else manifest_path.parent.name


def flatten_raw_downloads() -> dict[str, dict[str, Any]]:
    flattened: dict[str, dict[str, Any]] = {}
    for manifest_path in DOWNLOAD_MANIFESTS:
        if not manifest_path.exists():
            continue
        manifest = load_json(manifest_path)
        group_id = source_group_id(manifest_path)
        for dataset in manifest.get("datasets", []):
            flattened[str(dataset["id"])] = {
                "id": str(dataset["id"]),
                "name": dataset.get("name"),
                "source": manifest.get("source"),
                "source_url": manifest.get("source_url"),
                "source_group": group_id,
                "files": dataset.get("files", []),
            }
    return flattened


def raw_records_for_dataset(dataset_id: str, flattened: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    raw_ids = RAW_DATASET_ALIASES.get(dataset_id, [dataset_id])
    return [flattened[raw_id] for raw_id in raw_ids if raw_id in flattened]


def family_lookup() -> dict[str, dict[str, Any]]:
    payload = load_json(MANIFESTS_DIR / "data_families.json")
    return {str(family["id"]): family for family in payload.get("families", [])}


def build_local_inventory() -> dict[str, Any]:
    datasets_payload = load_json(MANIFESTS_DIR / "datasets.json")
    families = family_lookup()
    flattened = flatten_raw_downloads()

    inventory_rows: list[dict[str, Any]] = []
    total_raw_bytes = 0
    local_raw_count = 0
    source_totals: dict[str, int] = {}
    family_totals: dict[str, dict[str, int]] = {}
    domain_groups: dict[str, list[str]] = {}

    for dataset in datasets_payload.get("datasets", []):
        dataset_id = str(dataset["id"])
        records = raw_records_for_dataset(dataset_id, flattened)
        raw_files: list[dict[str, Any]] = []
        for record in records:
            for file_entry in record.get("files", []):
                if not bool(file_entry.get("downloaded", True)):
                    continue
                raw_files.append(
                    {
                        "raw_dataset_id": record["id"],
                        "source_group": record["source_group"],
                        "source": record["source"],
                        "name": file_entry.get("name"),
                        "kind": file_entry.get("kind"),
                        "url": file_entry.get("url"),
                        "size_bytes": file_entry.get("size_bytes"),
                        "sha256": file_entry.get("sha256"),
                    }
                )

        raw_total_size_bytes = int(sum(int(file_entry.get("size_bytes") or 0) for file_entry in raw_files))
        local_raw_available = raw_total_size_bytes > 0
        if local_raw_available:
            local_raw_count += 1
            total_raw_bytes += raw_total_size_bytes

        family_id = str(dataset["supervision"]["family_id"])
        family = families.get(family_id, {})
        family_title = family.get("title", {}).get("en", family_id)

        for domain in dataset.get("domains", []):
            domain_groups.setdefault(str(domain), []).append(dataset_id)

        for record in records:
            downloaded_here = any(bool(file_entry.get("downloaded", True)) for file_entry in record.get("files", []))
            if not downloaded_here:
                continue
            source_totals[record["source_group"]] = source_totals.get(record["source_group"], 0) + 1

        family_summary = family_totals.setdefault(family_id, {"cataloged": 0, "local_raw": 0})
        family_summary["cataloged"] += 1
        if local_raw_available:
            family_summary["local_raw"] += 1

        inventory_rows.append(
            {
                "id": dataset_id,
                "name": dataset["name"],
                "family_id": family_id,
                "family_title": family_title,
                "modality": dataset["modality"],
                "domains": dataset.get("domains", []),
                "fit_for_demo": dataset.get("fit_for_demo"),
                "supervision_states": dataset["supervision"]["states"],
                "label_scope": dataset["supervision"]["label_scope"],
                "measurement_scope": dataset["supervision"]["measurement_scope"],
                "supervision_caveat": dataset["supervision"]["caveat"],
                "acquisition_status": dataset["acquisition"]["status"],
                "access": dataset["acquisition"]["access"],
                "direct_download": dataset["acquisition"]["direct_download"],
                "license_note": dataset["acquisition"]["license_note"],
                "checksum_status": dataset["acquisition"]["checksum_status"],
                "raw_asset_policy": dataset["acquisition"]["raw_asset_policy"],
                "last_verified": dataset["acquisition"].get("last_verified"),
                "local_raw_available": local_raw_available,
                "raw_dataset_ids": [record["id"] for record in records],
                "raw_file_count": len(raw_files),
                "raw_total_size_bytes": raw_total_size_bytes,
                "raw_total_size_gb": round(raw_total_size_bytes / (1024 ** 3), 4),
                "sha256_complete": bool(raw_files) and all(file_entry.get("sha256") for file_entry in raw_files),
                "raw_files": raw_files,
                "ready_for_local_validation": local_raw_available,
            }
        )

    theme_groups = [
        {
            "domain": domain,
            "dataset_ids": sorted(dataset_ids),
            "count": len(dataset_ids),
        }
        for domain, dataset_ids in sorted(domain_groups.items())
    ]

    family_views = [
        {
            "family_id": family_id,
            "family_title": families.get(family_id, {}).get("title", {}).get("en", family_id),
            "cataloged_count": counts["cataloged"],
            "local_raw_count": counts["local_raw"],
        }
        for family_id, counts in sorted(family_totals.items())
    ]

    return {
        "source": "Unified local inventory for the CAOS LDA HSI validation backend",
        "generated_at": str(date.today()),
        "summary": {
            "cataloged_dataset_count": len(inventory_rows),
            "datasets_with_local_raw": local_raw_count,
            "raw_total_size_bytes": total_raw_bytes,
            "raw_total_size_gb": round(total_raw_bytes / (1024 ** 3), 4),
            "source_group_counts": source_totals,
        },
        "family_views": family_views,
        "theme_groups": theme_groups,
        "datasets": inventory_rows,
    }
