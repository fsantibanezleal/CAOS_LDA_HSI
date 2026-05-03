"""Cross-method agreement matrices: how do different ways of grouping
spectra agree with each other and with ground-truth labels?

For each labelled scene, this builder collects every available
partition (label, dominant LDA topic, every grouping built by
build_groupings.py) and computes pairwise ARI / NMI / V-measure between
all of them. The output is a small dense matrix per scene that the
eventual web app can render as a heatmap to answer the methodological
question: which grouping methods agree and which disagree?

Output: data/derived/cross_method_agreement/<scene>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    adjusted_rand_score,
    normalized_mutual_info_score,
    v_measure_score,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import SCENES, load_scene, valid_spectra_mask


GROUPINGS_LOCAL = DATA_DIR / "local" / "groupings"
TOPIC_TO_DATA_LOCAL = DATA_DIR / "local" / "topic_to_data"
TOPIC_TO_DATA_DERIVED = DERIVED_DIR / "topic_to_data"
OUTPUT_DIR = DERIVED_DIR / "cross_method_agreement"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]


def load_assignment_uint(path: Path, h: int, w: int, byte_size: int) -> np.ndarray:
    arr = np.frombuffer(path.read_bytes(), dtype=f"<u{byte_size}").reshape(h, w)
    return arr.astype(np.int64)


def collect_partitions(scene_id: str, h: int, w: int) -> dict[str, np.ndarray]:
    """Returns dict of method_name -> H*W flat int64 array of group ids."""
    out: dict[str, np.ndarray] = {}

    # Topic dominance map
    map_path = TOPIC_TO_DATA_LOCAL / f"{scene_id}_dominant_topic_map.bin"
    if map_path.exists():
        t2d = json.load((TOPIC_TO_DATA_DERIVED / f"{scene_id}.json").open("r", encoding="utf-8"))
        sentinel = t2d["dominant_topic_map"]["sentinel_unlabelled"]
        topic_grid = np.frombuffer(map_path.read_bytes(), dtype=np.uint8).reshape(h, w)
        # Replace sentinel with -1 to mask later
        flat = topic_grid.reshape(-1).astype(np.int64)
        flat = np.where(flat == sentinel, -1, flat)
        out["topic_dominant"] = flat

    # Every grouping under data/local/groupings/<method>/<scene>/assignment.bin
    if GROUPINGS_LOCAL.exists():
        for method_dir in sorted(GROUPINGS_LOCAL.iterdir()):
            if not method_dir.is_dir():
                continue
            scene_dir = method_dir / scene_id
            assignment_path = scene_dir / "assignment.bin"
            if not assignment_path.exists():
                continue
            # Try uint16 first (matches build_groupings default); detect size
            size_bytes = assignment_path.stat().st_size
            n_pixels = h * w
            if size_bytes == n_pixels * 2:
                flat = load_assignment_uint(assignment_path, h, w, 2).reshape(-1)
            elif size_bytes == n_pixels * 4:
                flat = load_assignment_uint(assignment_path, h, w, 4).reshape(-1)
            else:
                # Skip if size doesn't match (data drift)
                continue
            out[method_dir.name] = flat
    return out


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, _ = cube.shape

    flat = cube.reshape(-1, cube.shape[-1]).astype(np.float32)
    valid = valid_spectra_mask(flat)
    label_flat = gt.reshape(-1).astype(np.int64)
    sup_mask = valid & (label_flat > 0)
    if sup_mask.sum() < 2:
        return None

    partitions = collect_partitions(scene_id, h, w)
    partitions["label"] = label_flat
    method_names = sorted(partitions.keys())
    n = len(method_names)

    ari_matrix = np.zeros((n, n), dtype=np.float64)
    nmi_matrix = np.zeros((n, n), dtype=np.float64)
    v_matrix = np.zeros((n, n), dtype=np.float64)

    # Restrict to labelled valid pixels for fair comparison.
    base_mask = sup_mask.copy()
    # Also drop any pixel where any partition has -1 (sentinel)
    for arr in partitions.values():
        base_mask &= (arr != -1)

    if base_mask.sum() < 2:
        return None

    for i, mi in enumerate(method_names):
        ai = partitions[mi][base_mask]
        for j, mj in enumerate(method_names):
            if j < i:
                ari_matrix[i, j] = ari_matrix[j, i]
                nmi_matrix[i, j] = nmi_matrix[j, i]
                v_matrix[i, j] = v_matrix[j, i]
                continue
            if i == j:
                ari_matrix[i, j] = 1.0
                nmi_matrix[i, j] = 1.0
                v_matrix[i, j] = 1.0
                continue
            aj = partitions[mj][base_mask]
            ari_matrix[i, j] = float(adjusted_rand_score(ai, aj))
            nmi_matrix[i, j] = float(normalized_mutual_info_score(ai, aj))
            v_matrix[i, j] = float(v_measure_score(ai, aj))

    # Highlight: agreement of every method with the label, and with topic_dominant
    label_idx = method_names.index("label") if "label" in method_names else None
    topic_idx = method_names.index("topic_dominant") if "topic_dominant" in method_names else None

    summary_vs_label = []
    summary_vs_topic = []
    for k, name in enumerate(method_names):
        if label_idx is not None and k != label_idx:
            summary_vs_label.append({
                "method": name,
                "ari_vs_label": round(float(ari_matrix[k, label_idx]), 6),
                "nmi_vs_label": round(float(nmi_matrix[k, label_idx]), 6),
                "v_vs_label": round(float(v_matrix[k, label_idx]), 6),
            })
        if topic_idx is not None and k != topic_idx:
            summary_vs_topic.append({
                "method": name,
                "ari_vs_topic_dominant": round(float(ari_matrix[k, topic_idx]), 6),
                "nmi_vs_topic_dominant": round(float(nmi_matrix[k, topic_idx]), 6),
            })

    return {
        "scene_id": scene_id,
        "spatial_shape": [int(h), int(w)],
        "n_compared_pixels": int(base_mask.sum()),
        "method_names": method_names,
        "ari_matrix": [[round(float(v), 6) for v in row] for row in ari_matrix],
        "nmi_matrix": [[round(float(v), 6) for v in row] for row in nmi_matrix],
        "v_measure_matrix": [[round(float(v), 6) for v in row] for row in v_matrix],
        "agreement_vs_label_summary": summary_vs_label,
        "agreement_vs_topic_dominant_summary": summary_vs_topic,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_cross_method_agreement v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[cross_method] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        # Show method-vs-label table
        print(f"  methods compared: {len(payload['method_names'])}, n_pixels = {payload['n_compared_pixels']}")
        for entry in sorted(
            payload["agreement_vs_label_summary"],
            key=lambda e: e["ari_vs_label"],
            reverse=True,
        )[:5]:
            print(
                f"  {entry['method']:18s} ARI vs label = {entry['ari_vs_label']:+.3f}  "
                f"NMI = {entry['nmi_vs_label']:.3f}",
                flush=True,
            )
        written += 1
    print(f"[cross_method] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
