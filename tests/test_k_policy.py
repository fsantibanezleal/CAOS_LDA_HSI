"""One K per (recipe, scene) cell across the fixed-K backbones (#817).

F-7 = I(Z; Y) / H(Y) <= log K / H(Y), so LDA, ProdLDA and ETM must be compared
at the same K. The F-7 backbone builder used K_P1 for ProdLDA and ETM on every
recipe while LDA used the per-recipe K. These tests pin one shared policy and
check the archived F-7 backbone records against the LDA fit's K of each cell.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core import k_policy  # noqa: E402

V_SWEEP = ROOT / "data" / "derived" / "v_sweep"
SCENES = list(k_policy.CLASS_COUNTS)


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "data-pipeline" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_policy_values() -> None:
    assert [k_policy.k_p1(s) for s in SCENES] == [12, 12, 6, 9, 12, 12]
    assert k_policy.topic_count_for("indian-pines-corrected", 450.0) == 12
    assert k_policy.topic_count_for("indian-pines-corrected", 6.0) == 3   # V7, V15
    assert k_policy.topic_count_for("indian-pines-corrected", 3.0) == 3   # V10, V19
    assert k_policy.topic_count_for("pavia-university", 1.0) == 4         # V9, V10 on Pavia U
    assert k_policy.topic_count_for("salinas-a-corrected", 16.0) == 6


@pytest.mark.parametrize("builder,attr", [
    ("build_v_sweep_canonical_fit", "topic_count_for"),
    ("build_v_sweep_prodlda_backbone", "k_for"),
    ("build_v_sweep_backbones_f7", "k_for"),
])
def test_every_fixed_k_backbone_uses_the_same_policy(builder: str, attr: str) -> None:
    fn = getattr(_load(builder), attr)
    for scene in SCENES:
        for mean_doc in (0.5, 1.0, 2.4, 2.5, 3.0, 3.4, 4.0, 5.0, 6.0, 7.9, 8.0, 16.0, 450.0):
            assert fn(scene, mean_doc) == k_policy.topic_count_for(scene, mean_doc), (builder, scene, mean_doc)


def _records(backbone: str):
    pat = re.compile(rf"^{backbone}_(.+)_(V\d+)_uniform_Q(\d+)\.json$")
    for p in sorted((V_SWEEP / "backbones_f7").glob(f"{backbone}_*.json")):
        m = pat.match(p.name)
        if m:
            yield m.group(1), m.group(2), int(m.group(3)), json.loads(p.read_text(encoding="utf-8"))


@pytest.mark.parametrize("backbone", ["prodlda", "etm"])
def test_archived_f7_records_use_the_lda_k_of_their_cell(backbone: str) -> None:
    """Every ProdLDA / ETM F-7 record was fitted at the K of the LDA fit of that cell.

    v0.1 records carry no K field and were fitted at K_P1 of the scene.
    """
    checked = 0
    for scene, recipe, q, rec in _records(backbone):
        lda = V_SWEEP / "topic_views" / f"{scene}_{recipe}_uniform_Q{q}.json"
        if not lda.exists():
            continue
        lda_k = json.loads(lda.read_text(encoding="utf-8"))["K"]
        fitted_k = rec["K"] if "K" in rec else k_policy.k_p1(scene)
        assert fitted_k == lda_k, (backbone, scene, recipe, q, fitted_k, lda_k)
        checked += 1
    assert checked >= 114


def test_archived_hdp_f7_records_carry_the_topics_hdp_keeps() -> None:
    checked = 0
    for scene, recipe, q, rec in _records("hdp"):
        assert rec.get("K") is None
        assert 1 <= rec["K_used_argmax"] <= 20, (scene, recipe, q)
        assert rec["normalised_mi"] <= rec["f7_upper_bound"] + 1e-6, (scene, recipe, q)
        checked += 1
    assert checked >= 114
