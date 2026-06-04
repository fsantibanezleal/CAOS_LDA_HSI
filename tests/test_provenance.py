"""Provenance guard for derived V-sweep artefacts (#589).

Every V-sweep cell should carry an ISO-8601 UTC `generated_at` (…Z) and
a `builder` provenance stamp so a published number is traceable to the
script + run that produced it. Checks a representative sample across the
core axes (not every file, to stay fast and robust to partial sweeps).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

SWEEP = Path(__file__).resolve().parents[1] / "data" / "derived" / "v_sweep"
ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
AXES = ["f2_coherence", "f7_topic_to_label", "f18_reliability",
        "f22_counterfactual", "f15_llm_alignment"]


def _sample_cells():
    for axis in AXES:
        d = SWEEP / axis
        if not d.is_dir():
            continue
        files = sorted(d.glob("*_uniform_Q8.json"))[:4]
        for f in files:
            yield axis, f


def test_sweep_cells_have_iso_z_generated_at() -> None:
    checked = 0
    for axis, f in _sample_cells():
        d = json.loads(f.read_text(encoding="utf-8"))
        ts = d.get("generated_at")
        assert ts and ISO_Z.match(ts), f"{axis}/{f.name}: bad generated_at {ts!r}"
        checked += 1
    assert checked >= 8, f"too few provenance cells sampled ({checked})"


def test_sweep_cells_have_builder_stamp() -> None:
    for axis, f in _sample_cells():
        d = json.loads(f.read_text(encoding="utf-8"))
        assert d.get("builder") or d.get("builder_version"), (
            f"{axis}/{f.name}: missing builder/builder_version provenance"
        )
