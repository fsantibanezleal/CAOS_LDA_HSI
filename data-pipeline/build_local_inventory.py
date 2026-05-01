"""Build a unified local inventory for the validation backend."""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.inventory import build_local_inventory
from research_core.paths import CORE_DERIVED_DIR


OUTPUT_PATH = CORE_DERIVED_DIR / "local_dataset_inventory.json"


def main() -> None:
    payload = build_local_inventory()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote local inventory to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
