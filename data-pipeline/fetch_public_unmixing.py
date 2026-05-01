"""Download public HSI unmixing examples from Borsoi et al.

These scenes are useful because they are small, familiar in the unmixing
literature, and include spectral-library files for material-level workflows.
Raw MATLAB files stay out of Git; derived products should be compact JSON and
preview images.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "borsoi_mua"
MANIFEST_PATH = RAW_DIR / "download_manifest.json"
MAX_LOCAL_DOWNLOAD_BYTES = int(os.getenv("CAOS_MAX_LOCAL_DOWNLOAD_BYTES", "0")) or None
SOURCE_URL = "https://github.com/ricardoborsoi/MUA_SparseUnmixing/tree/master/real_data"
RAW_BASE = "https://raw.githubusercontent.com/ricardoborsoi/MUA_SparseUnmixing/master/real_data"

DATASETS = [
    {
        "id": "samson-unmixing-roi",
        "files": [
            {"name": "samson_1.mat", "kind": "hsi_unmixing_scene"},
            {"name": "spectral_library_samson.mat", "kind": "spectral_library"},
        ],
    },
    {
        "id": "jasper-ridge-unmixing-roi",
        "files": [
            {"name": "jasperRidge2_R198.mat", "kind": "hsi_unmixing_scene"},
            {"name": "spectral_library_jasperRidge.mat", "kind": "spectral_library"},
        ],
    },
    {
        "id": "urban-unmixing-roi",
        "files": [
            {"name": "Urban_R162.mat", "kind": "hsi_unmixing_scene"},
            {"name": "spectral_library_urban.mat", "kind": "spectral_library"},
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
        "source": "MUA_SparseUnmixing real_data",
        "source_url": SOURCE_URL,
        "max_local_download_bytes": MAX_LOCAL_DOWNLOAD_BYTES,
        "datasets": [],
    }

    for dataset in DATASETS:
        dataset_entry = {"id": dataset["id"], "files": []}
        for entry in dataset["files"]:
            url = f"{RAW_BASE}/{entry['name']}"
            destination = RAW_DIR / entry["name"]
            expected_size = remote_size(url)
            if MAX_LOCAL_DOWNLOAD_BYTES is not None and expected_size is not None and expected_size > MAX_LOCAL_DOWNLOAD_BYTES:
                raise RuntimeError(
                    f"{entry['name']} is {expected_size} bytes, above the "
                    f"{MAX_LOCAL_DOWNLOAD_BYTES} byte configured local-download policy."
                )

            local_size = destination.stat().st_size if destination.exists() else None
            if not destination.exists() or (expected_size is not None and local_size != expected_size):
                print(f"Downloading {entry['name']} ...")
                download_file(url, destination, expected_size=expected_size)
            else:
                print(f"Skipping existing {entry['name']}")

            dataset_entry["files"].append(
                {
                    "name": entry["name"],
                    "kind": entry["kind"],
                    "url": url,
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
