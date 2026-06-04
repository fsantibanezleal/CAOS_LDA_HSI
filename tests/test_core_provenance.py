"""Provenance-contract guard for the 3 core benchmark builders (#589 Tier 1).

The audit flagged that ``method_statistics.json``,
``local_core_benchmarks.json`` and ``hidsag_preprocessing_sensitivity.json``
shipped a bare ``date.today()`` and carried no ``builder_version`` /
``git_sha``. The builders now stamp all three via
``research_core.provenance``. These builders re-train models, so their
on-disk artefacts are regenerated only in a deliberate benchmark window —
we therefore lock the *source contract* here (cheap, no retrain) rather
than asserting against the published JSON.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPE = ROOT / "data-pipeline"
ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

CORE_BUILDERS = [
    "build_method_statistics.py",
    "run_local_core_benchmarks.py",
    "run_hidsag_preprocessing_sensitivity.py",
]


def test_provenance_helpers_behave() -> None:
    import sys

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from research_core.provenance import git_sha, iso_z_now

    ts = iso_z_now()
    assert ISO_Z.match(ts), f"iso_z_now() not ISO-8601 Z: {ts!r}"

    sha = git_sha()
    assert sha is None or re.fullmatch(r"[0-9a-f]{40}", sha), (
        f"git_sha() should be a 40-hex sha or None, got {sha!r}"
    )


def test_core_builders_stamp_git_sha() -> None:
    for name in CORE_BUILDERS:
        src = (PIPE / name).read_text(encoding="utf-8")
        assert "from research_core.provenance import git_sha" in src, (
            f"{name}: missing git_sha import (provenance contract #589)"
        )
        assert '"git_sha": git_sha()' in src, (
            f"{name}: must stamp git_sha in its output payload (#589)"
        )
        assert '"builder_version":' in src, (
            f"{name}: must stamp builder_version (#589)"
        )
