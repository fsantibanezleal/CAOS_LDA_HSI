"""Download compact public spectral-library archives used by the demo.

The full USGS Spectral Library Version 7 release is multi-gigabyte, so the
pipeline pulls only official ASCII subsets that are already convolved or
resampled to useful HSI / MSI sensors. The raw zip archives remain outside
Git; compact derived JSON assets are generated separately.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "usgs_splib07"
MANIFEST_PATH = RAW_DIR / "download_manifest.json"
MAX_PUBLIC_FILE_BYTES = 100 * 1024 * 1024

DATASETS = [
    {
        "id": "usgs-splib07-aviris-1997",
        "name": "USGS Spectral Library v7 convolved to AVIRIS-Classic 1997",
        "source_url": "https://www.sciencebase.gov/catalog/item/586e8c88e4b0f5ce109fccae",
        "files": [
            {
                "name": "ASCIIdata_splib07b_cvAVIRISc1997.zip",
                "url": "https://www.sciencebase.gov/catalog/file/get/586e8c88e4b0f5ce109fccae?f=__disk__e4%2F7d%2F6f%2Fe47d6f9fd757caea738bea3a605a17df48c3df77",
                "kind": "spectral_library_ascii_zip",
            },
        ],
    },
    {
        "id": "usgs-splib07-sentinel2",
        "name": "USGS Spectral Library v7 resampled to Sentinel-2 MSI",
        "source_url": "https://www.sciencebase.gov/catalog/item/586e8c88e4b0f5ce109fccae",
        "files": [
            {
                "name": "ASCIIdata_splib07b_rsSentinel2.zip",
                "url": "https://www.sciencebase.gov/catalog/file/get/586e8c88e4b0f5ce109fccae?f=__disk__b4%2Fc4%2Ffd%2Fb4c4fdcbfcda3a1d8bdf8d9823278349b3b294e2",
                "kind": "spectral_library_ascii_zip",
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


REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CAOS-LDA-HSI/0.1; +https://github.com/fsantibanezleal/CAOS_LDA_HSI)",
    "Accept-Encoding": "identity",
}


def remote_size(url: str) -> int | None:
    try:
        response = requests.head(url, headers=REQUEST_HEADERS, allow_redirects=True, timeout=(30, 120))
        response.raise_for_status()
    except requests.RequestException:
        return None
    content_length = response.headers.get("Content-Length")
    return int(content_length) if content_length else None


def download_file(url: str, destination: Path, expected_size: int | None = None, retries: int = 5) -> None:
    for attempt in range(1, retries + 1):
        temp_path = destination.with_suffix(destination.suffix + ".part")
        if temp_path.exists():
            temp_path.unlink()

        try:
            with requests.get(url, headers=REQUEST_HEADERS, stream=True, timeout=(30, 120)) as response:
                response.raise_for_status()
                if expected_size is None:
                    content_length = response.headers.get("Content-Length")
                    expected_size = int(content_length) if content_length else None
                with temp_path.open("wb") as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            handle.write(chunk)
        except requests.RequestException:
            temp_path.unlink(missing_ok=True)
            if attempt == retries:
                raise
            time.sleep(float(attempt * 3))
            continue

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
        "source": "USGS Spectral Library Version 7 Data",
        "source_url": "https://www.sciencebase.gov/catalog/item/586e8c88e4b0f5ce109fccae",
        "max_public_file_bytes": MAX_PUBLIC_FILE_BYTES,
        "datasets": [],
    }

    for dataset in DATASETS:
        dataset_entry = {
            "id": dataset["id"],
            "name": dataset["name"],
            "source_url": dataset["source_url"],
            "files": [],
        }
        for entry in dataset["files"]:
            destination = RAW_DIR / entry["name"]
            expected_size = remote_size(entry["url"])
            if expected_size is not None and expected_size > MAX_PUBLIC_FILE_BYTES:
                raise RuntimeError(
                    f"{entry['name']} is {expected_size} bytes, above the "
                    f"{MAX_PUBLIC_FILE_BYTES} byte per-file policy."
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

    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print(f"Wrote download manifest to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
