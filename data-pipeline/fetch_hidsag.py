"""Fetch HIDSAG collection metadata and optionally download selected subsets.

HIDSAG is published as a Figshare collection with five large ZIP archives.
This script always records collection/article/file metadata locally and can
optionally download selected subsets into `data/raw/hidsag/`.

Environment variables:

- `CAOS_HIDSAG_DOWNLOAD_IDS`: comma-separated subset codes or article ids.
  Supported subset codes: `GEOMET`, `PORPHYRY`, `GEOCHEM`, `MINERAL1`,
  `MINERAL2`.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "hidsag"
MANIFEST_PATH = RAW_DIR / "download_manifest.json"
COLLECTION_ID = 5983921
COLLECTION_URL = f"https://api.figshare.com/v2/collections/{COLLECTION_ID}/articles?page_size=20"
DOWNLOAD_SELECTION = {
    token.strip().lower()
    for token in os.getenv("CAOS_HIDSAG_DOWNLOAD_IDS", "").split(",")
    if token.strip()
}

TITLE_TO_CODE = {
    "GEOMET data": "GEOMET",
    "PORPHYRY data": "PORPHYRY",
    "GEOCHEM data": "GEOCHEM",
    "MINERAL1 data": "MINERAL1",
    "MINERAL2 data": "MINERAL2",
}

REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CAOS-LDA-HSI/0.1; +https://github.com/fsantibanezleal/CAOS_LDA_HSI)",
    "Accept-Encoding": "identity",
}


def hashes_of(path: Path) -> tuple[str, str]:
    md5 = hashlib.md5()
    sha256 = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            md5.update(chunk)
            sha256.update(chunk)
    return md5.hexdigest(), sha256.hexdigest()


def download_file(url: str, destination: Path, expected_size: int | None, retries: int = 4) -> None:
    for attempt in range(1, retries + 1):
        temp_path = destination.with_suffix(destination.suffix + ".part")
        temp_path.unlink(missing_ok=True)
        try:
            with requests.get(url, headers=REQUEST_HEADERS, stream=True, timeout=(30, 600)) as response:
                response.raise_for_status()
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
        time.sleep(float(attempt * 2))


def resolve_subset_code(title: str) -> str:
    for suffix, code in TITLE_TO_CODE.items():
        if title.endswith(suffix):
            return code
    return title.replace(" ", "_").upper()


def should_download(article_id: int, subset_code: str) -> bool:
    if not DOWNLOAD_SELECTION:
        return False
    return str(article_id) in DOWNLOAD_SELECTION or subset_code.lower() in DOWNLOAD_SELECTION


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    collection_rows = requests.get(COLLECTION_URL, headers=REQUEST_HEADERS, timeout=60).json()
    manifest: dict[str, object] = {
        "source": "HIDSAG Figshare collection",
        "source_url": "https://springernature.figshare.com/collections/HIDSAG_Hyperspectral_Image_Database_for_Supervised_Analysis_in_Geometallurgy/5983921/1",
        "collection_doi": "10.6084/m9.figshare.c.5983921.v1",
        "download_selection": sorted(DOWNLOAD_SELECTION),
        "datasets": [],
    }

    for row in collection_rows:
        article = requests.get(row["url_public_api"], headers=REQUEST_HEADERS, timeout=60).json()
        subset_code = resolve_subset_code(str(article["title"]))
        dataset_id = f"hidsag-{subset_code.lower()}"
        dataset_entry = {
            "id": dataset_id,
            "name": article["title"],
            "subset_code": subset_code,
            "article_id": article["id"],
            "doi": article.get("doi"),
            "figshare_url": article.get("url_public_html"),
            "license": article.get("license", {}).get("name") if isinstance(article.get("license"), dict) else None,
            "description": article.get("description"),
            "files": [],
        }
        for file_entry in article.get("files", []):
            destination = RAW_DIR / file_entry["name"]
            selected = should_download(int(article["id"]), subset_code)
            downloaded = destination.exists()
            if selected and not downloaded:
                print(f"Downloading HIDSAG subset {subset_code}: {file_entry['name']} ...")
                download_file(file_entry["download_url"], destination, expected_size=file_entry.get("size"))
                downloaded = True
            elif selected and downloaded:
                print(f"Skipping existing HIDSAG file {file_entry['name']}")

            computed_md5 = None
            sha256 = None
            size_bytes = 0
            local_path = None
            if downloaded:
                computed_md5, sha256 = hashes_of(destination)
                size_bytes = destination.stat().st_size
                local_path = str(destination)

            dataset_entry["files"].append(
                {
                    "name": file_entry["name"],
                    "kind": "hidsag_zip",
                    "url": file_entry["download_url"],
                    "downloaded": downloaded,
                    "size_bytes": size_bytes,
                    "expected_size_bytes": file_entry.get("size"),
                    "supplied_md5": file_entry.get("supplied_md5"),
                    "computed_md5": computed_md5,
                    "sha256": sha256,
                    "local_path": local_path,
                }
            )
        manifest["datasets"].append(dataset_entry)

    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print(f"Wrote HIDSAG manifest to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
