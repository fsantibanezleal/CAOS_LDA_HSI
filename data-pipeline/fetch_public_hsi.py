"""Download public HSI benchmark scenes from official source pages.

Raw files are stored under ``data/raw/`` and intentionally kept out of Git.
The repository should track only manifests plus compact derived assets. Large
raw local downloads are allowed because local validation is the primary goal.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "upv_ehu"
MANIFEST_PATH = ROOT / "data" / "raw" / "download_manifest.json"
MAX_LOCAL_DOWNLOAD_BYTES = int(os.getenv("CAOS_MAX_LOCAL_DOWNLOAD_BYTES", "0")) or None

DATASETS = [
    {
        "id": "indian-pines-corrected",
        "files": [
            {
                "name": "Indian_pines_corrected.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/6/67/Indian_pines_corrected.mat",
                "kind": "cube",
            },
            {
                "name": "Indian_pines_gt.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/c/c4/Indian_pines_gt.mat",
                "kind": "ground_truth",
            },
        ],
    },
    {
        "id": "salinas-corrected",
        "files": [
            {
                "name": "Salinas_corrected.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/a/a3/Salinas_corrected.mat",
                "kind": "cube",
            },
            {
                "name": "Salinas_gt.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/f/fa/Salinas_gt.mat",
                "kind": "ground_truth",
            },
        ],
    },
    {
        "id": "salinas-a-corrected",
        "files": [
            {
                "name": "SalinasA_corrected.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/1/1a/SalinasA_corrected.mat",
                "kind": "cube",
            },
            {
                "name": "SalinasA_gt.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/a/aa/SalinasA_gt.mat",
                "kind": "ground_truth",
            },
        ],
    },
    {
        "id": "cuprite-aviris-reflectance",
        "files": [
            {
                "name": "Cuprite_f970619t01p02_r02_sc03.a.rfl.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/7/7d/Cuprite_f970619t01p02_r02_sc03.a.rfl.mat",
                "kind": "reflectance_cube",
            },
        ],
    },
    {
        "id": "pavia-university",
        "files": [
            {
                "name": "PaviaU.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/e/ee/PaviaU.mat",
                "kind": "cube",
            },
            {
                "name": "PaviaU_gt.mat",
                "url": "https://www.ehu.eus/ccwintco/uploads/5/50/PaviaU_gt.mat",
                "kind": "ground_truth",
            },
        ],
    },
    {
        "id": "kennedy-space-center",
        "files": [
            {
                "name": "KSC.mat",
                "url": "https://www.ehu.es/ccwintco/uploads/2/26/KSC.mat",
                "kind": "cube",
            },
            {
                "name": "KSC_gt.mat",
                "url": "https://www.ehu.es/ccwintco/uploads/a/a6/KSC_gt.mat",
                "kind": "ground_truth",
            },
        ],
    },
    {
        "id": "botswana",
        "files": [
            {
                "name": "Botswana.mat",
                "url": "https://www.ehu.es/ccwintco/uploads/7/72/Botswana.mat",
                "kind": "cube",
            },
            {
                "name": "Botswana_gt.mat",
                "url": "https://www.ehu.es/ccwintco/uploads/5/58/Botswana_gt.mat",
                "kind": "ground_truth",
            },
        ],
    },
]


def sha256_of(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; CAOS-LDA-HSI/0.1; +https://github.com/fsantibanezleal/CAOS_LDA_HSI)",
            "Accept-Encoding": "identity",
        },
    )


def remote_size(url: str) -> int | None:
    request = _request(url)
    request.method = "HEAD"
    with urllib.request.urlopen(request) as response:
        content_length = response.headers.get("Content-Length")
        return int(content_length) if content_length else None


def download_file(url: str, destination: Path, expected_size: int | None = None, retries: int = 3) -> None:
    for attempt in range(1, retries + 1):
        temp_path = destination.with_suffix(destination.suffix + ".part")
        if temp_path.exists():
            temp_path.unlink()

        request = _request(url)
        with urllib.request.urlopen(request) as response, temp_path.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)

        actual_size = temp_path.stat().st_size
        if expected_size is None or actual_size == expected_size:
            temp_path.replace(destination)
            return

        temp_path.unlink(missing_ok=True)
        if attempt == retries:
            raise RuntimeError(
                f"Size mismatch for {url}: expected {expected_size} bytes but downloaded {actual_size} bytes."
            )
        time.sleep(1.0)


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "source": "UPV/EHU Hyperspectral Remote Sensing Scenes",
        "source_url": "https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        "max_local_download_bytes": MAX_LOCAL_DOWNLOAD_BYTES,
        "datasets": [],
    }

    for dataset in DATASETS:
        dataset_entry = {"id": dataset["id"], "files": []}
        for entry in dataset["files"]:
            destination = RAW_DIR / entry["name"]
            expected_size = remote_size(entry["url"])
            if MAX_LOCAL_DOWNLOAD_BYTES is not None and expected_size is not None and expected_size > MAX_LOCAL_DOWNLOAD_BYTES:
                raise RuntimeError(
                    f"{entry['name']} is {expected_size} bytes, above the "
                    f"{MAX_LOCAL_DOWNLOAD_BYTES} byte configured local-download policy."
                )

            local_size = destination.stat().st_size if destination.exists() else None

            if not destination.exists() or (expected_size is not None and local_size != expected_size):
                print(f"Downloading {entry['name']} ...")
                download_file(entry["url"], destination, expected_size=expected_size)
            else:
                print(f"Skipping existing {entry['name']}")

            dataset_entry["files"].append(
                {
                    "name": entry["name"],
                    "kind": entry["kind"],
                    "url": entry["url"],
                    "size_bytes": destination.stat().st_size,
                    "expected_size_bytes": expected_size,
                    "sha256": sha256_of(destination),
                }
            )
        manifest["datasets"].append(dataset_entry)

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print(f"Wrote download manifest to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
