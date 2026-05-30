"""Print F-2 c_v and F-7 NMI tables for V13..V20 across the labelled-scene panel.

Reads the per-cell JSON outputs from
``data/derived/v_sweep/{f2_coherence,f7_topic_to_label}/`` and emits a
LaTeX-friendly tabular row per scene plus a summary row per recipe.
Used to refresh Tables in journal_v_sweep/tex/main.tex (#c397).
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
F2 = ROOT / "data" / "derived" / "v_sweep" / "f2_coherence"
F7 = ROOT / "data" / "derived" / "v_sweep" / "f7_topic_to_label"

SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SCENE_SHORT = {
    "indian-pines-corrected": "IndianPines",
    "salinas-corrected":       "Salinas",
    "salinas-a-corrected":     "Salinas-A",
    "pavia-university":        "PaviaU",
    "kennedy-space-center":    "KennedySC",
    "botswana":                "Botswana",
}
RECIPES = ["V1", "V3", "V12", "V13", "V14", "V15", "V17", "V18", "V19", "V20"]


def load_metric(dirpath: Path, scene: str, recipe: str, key_candidates: list[str]) -> float | None:
    fname = f"{scene}_{recipe}_uniform_Q8.json"
    fpath = dirpath / fname
    if not fpath.exists():
        return None
    with fpath.open() as h:
        data = json.load(h)
    for key in key_candidates:
        if key in data and data[key] is not None:
            try:
                return float(data[key])
            except (TypeError, ValueError):
                continue
    return None


def main() -> int:
    print("F-2 c_v table")
    header = "scene".ljust(14) + "".join(f"  {r:>5}" for r in RECIPES)
    print(header)
    for scene in SCENES:
        row = [SCENE_SHORT[scene].ljust(12)]
        for r in RECIPES:
            v = load_metric(F2, scene, r, ["c_v", "cv", "mean_cv", "score"])
            row.append(f"  {v:5.2f}" if v is not None else "     . ")
        print("".join(row))
    # Mean across scenes
    means: dict[str, list[float]] = {r: [] for r in RECIPES}
    for scene in SCENES:
        for r in RECIPES:
            v = load_metric(F2, scene, r, ["c_v", "cv", "mean_cv", "score"])
            if v is not None:
                means[r].append(v)
    print("mean".ljust(14) + "".join(
        f"  {statistics.mean(means[r]):5.2f}" if means[r] else "     . "
        for r in RECIPES
    ))

    print()
    print("F-7 NMI table")
    print(header)
    for scene in SCENES:
        row = [SCENE_SHORT[scene].ljust(12)]
        for r in RECIPES:
            v = load_metric(F7, scene, r, ["normalised_mi", "nmi", "topic_label_nmi", "score"])
            row.append(f"  {v:5.2f}" if v is not None else "     . ")
        print("".join(row))
    means = {r: [] for r in RECIPES}
    for scene in SCENES:
        for r in RECIPES:
            v = load_metric(F7, scene, r, ["normalised_mi", "nmi", "topic_label_nmi", "score"])
            if v is not None:
                means[r].append(v)
    print("mean".ljust(14) + "".join(
        f"  {statistics.mean(means[r]):5.2f}" if means[r] else "     . "
        for r in RECIPES
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
