"""Shared filesystem paths for the local validation backend."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DERIVED_DIR = DATA_DIR / "derived"
MANIFESTS_DIR = DATA_DIR / "manifests"
CORE_DERIVED_DIR = DERIVED_DIR / "core"

