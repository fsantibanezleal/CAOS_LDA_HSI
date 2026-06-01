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
# Standard axes follow the scene x recipe grid (filename
# "{scene}_{recipe}_uniform_Q{q}.json"). F-17 (cross-scene transfer) is
# intentionally NOT here: it is a scene-PAIR x portable-recipe study
# ("{src}_to_{tgt}_{recipe}_..."), reported separately below.
AXES = [
    ("F-1",     "f1_per_fold",        "topic_routed_soft_mean", False),
    ("F-2",     "f2_coherence",       "c_v",                    False),
    ("F-7",     "f7_topic_to_label",  "normalised_mi",          False),
    ("F-13",    "f13_shap",           None,                     False),
    ("F-14",    "f14_repetitiveness", "mean_pairwise_jaccard",  True),
    ("F-15",    "f15_llm_alignment",  "f15_alignment",          False),
    ("F-18",    "f18_reliability",    "frac_above_0.7",         False),
    ("F-22",    "f22_counterfactual", "counterfactual_l1_median", False),
    ("HDP",     "hdp_backbone",       "f2_c_v",                 False),
    ("ProdLDA", "prodlda_backbone",   "f2_c_v",                 False),
    ("ETM",     "etm_backbone",       "f2_c_v",                 False),
]

# Q values tracked for the Q-extension axes
Q_VALUES = [8, 16, 32]


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
    q_matrix: dict[int, list[dict]] = {q: [] for q in Q_VALUES}
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

        # Q=16/32 coverage tracking — handle backbone alternate path
        backbone_alt = None
        if axis in ("HDP", "ProdLDA", "ETM"):
            backbone_alt = ("backbones_f7", axis.lower())
        for q in (16, 32):
            q_row = {"axis": axis, "Q": q, "have": 0, "cells_per_recipe": {}}
            for r in RECIPES:
                count = 0
                for sc in SCENES:
                    fq = SRC / d / f"{sc}_{r}_uniform_Q{q}.json"
                    if not fq.exists() and backbone_alt:
                        alt_dir, bb_lower = backbone_alt
                        fq = SRC / alt_dir / f"{bb_lower}_{sc}_{r}_uniform_Q{q}.json"
                    if fq.exists():
                        count += 1
                        q_row["have"] += 1
                if count > 0:
                    q_row["cells_per_recipe"][r] = count
            q_row["target"] = len(SCENES) * len(RECIPES)
            q_row["pct"] = round(100 * q_row["have"] / q_row["target"], 1)
            q_matrix[q].append(q_row)

    # F-17 cross-scene transfer: scene-PAIR x portable-recipe study,
    # not the scene x recipe grid. Report it separately so it is not
    # mis-counted against the 114-cell target.
    f17_dir = SRC / "f17_cross_scene"
    f17_files = sorted(f17_dir.glob("*_uniform_Q8.json")) if f17_dir.is_dir() else []
    f17_recipes: dict[str, int] = {}
    import re as _re
    for p in f17_files:
        m = _re.search(r"_(V\d+)_uniform_Q8\.json$", p.name)
        if m:
            f17_recipes[m.group(1)] = f17_recipes.get(m.group(1), 0) + 1
    f17_report = {
        "axis": "F-17",
        "note": "cross-scene transfer; scene-pair x vocab-portable-recipe (not the scene x recipe grid)",
        "have": len(f17_files),
        "recipes": sorted(f17_recipes),
        "cells_per_recipe": f17_recipes,
    }

    out = {
        "scenes": SCENES,
        "recipes": RECIPES,
        "axes": matrix,
        "transfer_f17": f17_report,
        "q_extension": {
            "Q=16": q_matrix[16],
            "Q=32": q_matrix[32],
        },
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
