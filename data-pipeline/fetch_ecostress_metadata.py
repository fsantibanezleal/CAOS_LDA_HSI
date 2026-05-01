"""Record ECOSTRESS library category metadata and current bulk-access blocker.

The ECOSTRESS spectral library exposes category-level download requests on the
public site, but the bulk checkout flow currently redirects to a login form.
This script records reproducible public metadata so the repo can distinguish
between:

- publicly visible category structure and counts
- bulk-download access that currently requires a session/login
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "ecostress"
MANIFEST_PATH = RAW_DIR / "download_manifest.json"
DOWNLOAD_URL = "https://speclib.jpl.nasa.gov/download"
CHECKOUT_URL = "https://speclib.jpl.nasa.gov/download/checkout-form"
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CAOS-LDA-HSI/0.1; +https://github.com/fsantibanezleal/CAOS_LDA_HSI)",
    "Accept-Encoding": "identity",
}


def extract_categories(html: str) -> list[dict[str, object]]:
    pattern = re.compile(r"orderall\('([^']+)'\);\">([^<]+)\((\d+) files\)</a>", flags=re.I)
    rows = []
    for token, label, count in pattern.findall(html):
        rows.append(
            {
                "token": token,
                "label": label.strip(),
                "file_count": int(count),
            }
        )
    return rows


def detect_checkout_login(html: str) -> bool:
    return "__ac_password" in html and "buttons.login" in html


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    download_page = requests.get(DOWNLOAD_URL, headers=REQUEST_HEADERS, timeout=60).text
    checkout_page = requests.get(CHECKOUT_URL, headers=REQUEST_HEADERS, timeout=60).text
    manifest = {
        "source": "NASA/JPL ECOSTRESS Spectral Library",
        "source_url": "https://speclib.jpl.nasa.gov/",
        "download_page_url": DOWNLOAD_URL,
        "checkout_url": CHECKOUT_URL,
        "bulk_checkout_requires_login": detect_checkout_login(checkout_page),
        "notes": [
            "The public download page exposes category counts and a cart workflow.",
            "The checkout form currently resolves to a login page for bulk download requests.",
            "Use this manifest as a reproducible access note until a session-backed or per-spectrum export workflow is implemented.",
        ],
        "datasets": [
            {
                "id": f"ecostress-{row['token']}",
                "name": row["label"],
                "token": row["token"],
                "files": [],
                "visible_file_count": row["file_count"],
                "downloaded": False,
                "access_blocker": "bulk checkout requires login/session",
            }
            for row in extract_categories(download_page)
        ],
    }
    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    print(f"Wrote ECOSTRESS access manifest to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
