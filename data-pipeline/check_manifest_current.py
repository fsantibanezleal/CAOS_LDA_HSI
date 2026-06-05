"""CI guard: the committed web manifest must list exactly the artifacts a
fresh walk of ``data/derived`` produces (#776 / #775).

The previous CI only checked that ``index.json`` parsed as JSON, so a
144-commit-stale manifest passed green. This compares the committed
artifact *path set* against a freshly-collected one (ignoring the
``git_sha`` / ``generated_at`` provenance fields, which legitimately change
every run). A mismatch means ``data/derived`` changed but
``curate_for_web.py`` was not re-run. Paths are posix-normalised by the
curator, so the check is OS-independent.

Run: ``python data-pipeline/check_manifest_current.py`` (exit 1 if stale).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "data-pipeline"))

from curate_for_web import collect_artifacts  # noqa: E402 — needs sys.path setup

MANIFEST = ROOT / "data" / "derived" / "manifests" / "index.json"


def main() -> int:
    committed = {
        a["path"] for a in json.loads(MANIFEST.read_text(encoding="utf-8"))["artifacts"]
    }
    fresh = {a["path"] for a in collect_artifacts()}

    missing = fresh - committed   # on disk, absent from the manifest
    extra = committed - fresh     # in the manifest, no longer on disk

    if missing or extra:
        print(
            f"MANIFEST STALE: {len(missing)} artifacts present in data/derived "
            f"but absent from the committed manifest; {len(extra)} listed in the "
            f"manifest but no longer on disk."
        )
        for p in sorted(missing)[:15]:
            print("  + missing from manifest:", p)
        for p in sorted(extra)[:15]:
            print("  - stale in manifest:", p)
        print(
            "Re-run `python data-pipeline/curate_for_web.py` and commit "
            "data/derived/manifests/index.json."
        )
        return 1

    print(f"manifest current: {len(committed)} artifacts match the data/derived tree")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
