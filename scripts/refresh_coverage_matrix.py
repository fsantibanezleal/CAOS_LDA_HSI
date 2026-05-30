"""Regenerate ``data/derived/v_sweep/coverage_matrix.json``.

Walks the v_sweep artefact directories, builds a per-axis × scene × recipe
boolean grid plus per-recipe means and value extrema. Used by the
/api/v-sweep/coverage endpoint and the BenchmarksSummary panel.

Run after any sweep extension (e.g. new (V, scene, scheme, q) cells).
"""
from __future__ import annotations

import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "derived" / "v_sweep"

SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]

# (axis label, sub-dir, JSON key, lower_is_better)
AXES = [
    ("F-1",     "f1_per_fold",        "topic_routed_soft_mean", False),
    ("F-2",     "f2_coherence",       "c_v",                    False),
    ("F-7",     "f7_topic_to_label",  "normalised_mi",          False),
    ("F-13",    "f13_shap",           None,                     False),
    ("F-14",    "f14_repetitiveness", "mean_pairwise_jaccard",  True),
    ("F-18",    "f18_reliability",    "frac_above_0.7",         False),
    ("F-22",    "f22_counterfactual", "counterfactual_l1_median", False),
    ("HDP",     "hdp_backbone",       "f2_c_v",                 False),
    ("ProdLDA", "prodlda_backbone",   "f2_c_v",                 False),
    ("ETM",     "etm_backbone",       "f2_c_v",                 False),
]


def load_value(axis_dir: str, scene: str, recipe: str, key: str | None) -> float | None:
    if key is None:
        return None
    f = SRC / axis_dir / f"{scene}_{recipe}_uniform_Q8.json"
    if not f.exists():
        return None
    data = json.load(f.open())
    v = data.get(key)
    if v is None and axis_dir == "f1_per_fold":
        per = data.get("per_fold")
        if per:
            vals = [r.get("topic_routed_soft") for r in per]
            vals = [x for x in vals if x is not None]
            if vals:
                return float(sum(vals) / len(vals))
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main() -> int:
    matrix: list[dict] = []
    for axis, d, key, lib in AXES:
        row: dict = {
            "axis": axis,
            "cells": {},
            "values": {},
            "have": 0,
            "lower_is_better": lib,
        }
        all_vals: list[tuple[str, float]] = []
        for sc in SCENES:
            row["cells"][sc] = {}
            row["values"][sc] = {}
            for r in RECIPES:
                f = SRC / d / f"{sc}_{r}_uniform_Q8.json"
                present = f.exists()
                row["cells"][sc][r] = present
                if present:
                    row["have"] += 1
                    v = load_value(d, sc, r, key)
                    if v is not None:
                        row["values"][sc][r] = v
                        all_vals.append((r, v))
        row["target"] = len(SCENES) * len(RECIPES)
        row["pct"] = round(100 * row["have"] / row["target"], 1)
        by_recipe: dict[str, list[float]] = {}
        for r, v in all_vals:
            by_recipe.setdefault(r, []).append(v)
        row["recipe_means"] = {
            r: round(statistics.mean(v), 4) for r, v in by_recipe.items()
        }
        if all_vals:
            vals = [v for _, v in all_vals]
            row["value_min"] = round(min(vals), 4)
            row["value_max"] = round(max(vals), 4)
        matrix.append(row)

    out = {
        "scenes": SCENES,
        "recipes": RECIPES,
        "axes": matrix,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }
    target_path = SRC / "coverage_matrix.json"
    with target_path.open("w") as h:
        json.dump(out, h, indent=2)
    total_have = sum(a["have"] for a in matrix)
    total_target = sum(a["target"] for a in matrix)
    print(
        f"[coverage] wrote {target_path.name} — "
        f"{total_have}/{total_target} ({100 * total_have / total_target:.1f}%)",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
