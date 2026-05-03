"""Spatial-validation metrics for the dominant-topic map.

Reads the dominant_topic_map produced by build_topic_to_data.py and
computes spatial-coherence statistics that the master plan section 14
requires:

- Moran's I (global spatial autocorrelation) of the dominant-topic map
- connected-component count and size distribution per topic
- IoU per (topic, label) class — how well topic dominance overlaps with
  ground-truth class regions

Output: data/derived/spatial/<scene>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.ndimage import label as nd_label

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import CLASS_NAMES, has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import SCENES, load_scene


TOPIC_TO_DATA_DIR = DERIVED_DIR / "topic_to_data"
LOCAL_T2D_DIR = DATA_DIR / "local" / "topic_to_data"
OUTPUT_DIR = DERIVED_DIR / "spatial"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]


def morans_I_categorical(grid: np.ndarray, mask: np.ndarray) -> float:
    """Moran's I for a categorical assignment, computed via one-hot mean.

    For each topic k, treat (grid == k) as a binary indicator and compute
    Moran's I with a 4-neighbour rook contiguity. Average across topics
    weighted by their support.

    grid: H x W of int with sentinel values for unassigned, masked by `mask`.
    mask: H x W bool — True where the pixel has a valid topic assignment.
    """
    h, w = grid.shape
    n = int(mask.sum())
    if n < 2:
        return 0.0
    topics = sorted(int(t) for t in np.unique(grid[mask]))
    weighted_sum = 0.0
    total_weight = 0.0
    for k in topics:
        ind = (grid == k) & mask
        n_k = int(ind.sum())
        if n_k < 2:
            continue
        x = ind.astype(np.float64)
        x_mean = float(x[mask].mean())
        deviations = (x - x_mean) * mask
        # 4-neighbour Moran's I
        # Sum over (i, j) and one of its rook neighbours of deviation
        # products. We compute right and down neighbours and double via
        # symmetry: the standard Moran formula doubles by including (j, i).
        right_pairs = deviations[:, :-1] * deviations[:, 1:]
        down_pairs = deviations[:-1, :] * deviations[1:, :]
        right_mask = mask[:, :-1] & mask[:, 1:]
        down_mask = mask[:-1, :] & mask[1:, :]
        cross_sum = float(right_pairs[right_mask].sum() + down_pairs[down_mask].sum())
        # Unique neighbour pairs (i, j) with i adjacent to j. The classical
        # Moran's I formula sums over ordered pairs (i, j) and (j, i) and
        # divides by S0 = sum of all symmetric weights = 2 * (unique pairs).
        # cross_sum already iterates each unique pair once; the doubled
        # numerator (2 * cross_sum) divides by the doubled S0 (2 * W),
        # which leaves the same ratio. So I = (n / W) * cross_sum / var.
        W = float(right_mask.sum() + down_mask.sum())
        if W < 1:
            continue
        var = float((deviations[mask] ** 2).sum())
        if var < 1e-12:
            continue
        I = (n / W) * cross_sum / var
        weighted_sum += I * n_k
        total_weight += n_k
    if total_weight < 1:
        return 0.0
    return weighted_sum / total_weight


def connected_components_per_topic(grid: np.ndarray, mask: np.ndarray) -> dict:
    out = {}
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=int)
    for k in sorted(int(t) for t in np.unique(grid[mask])):
        ind = ((grid == k) & mask).astype(np.int32)
        labeled, n_comp = nd_label(ind, structure=structure)
        sizes = np.bincount(labeled.ravel())[1:]  # drop background
        if sizes.size == 0:
            out[str(k)] = {"n_components": 0, "size_p50": 0, "size_max": 0, "support": 0}
            continue
        out[str(k)] = {
            "n_components": int(n_comp),
            "support": int(ind.sum()),
            "size_p50": int(np.median(sizes)),
            "size_p95": int(np.percentile(sizes, 95)),
            "size_max": int(sizes.max()),
        }
    return out


def topic_label_iou(grid: np.ndarray, gt: np.ndarray, mask: np.ndarray, name_map: dict) -> list[dict]:
    """For each topic k, find the label with highest IoU and report both."""
    out = []
    for k in sorted(int(t) for t in np.unique(grid[mask])):
        topic_ind = (grid == k) & mask
        best_iou = 0.0
        best_label = None
        ious_per_label = {}
        for cls in sorted(int(c) for c in np.unique(gt[mask])):
            if cls == 0:
                continue
            label_ind = (gt == cls) & mask
            inter = int((topic_ind & label_ind).sum())
            union = int((topic_ind | label_ind).sum())
            if union == 0:
                continue
            iou = inter / union
            ious_per_label[str(cls)] = round(float(iou), 6)
            if iou > best_iou:
                best_iou = iou
                best_label = cls
        out.append({
            "topic_k": k,
            "best_label_id": best_label,
            "best_label_name": name_map.get(int(best_label), None) if best_label else None,
            "best_iou": round(float(best_iou), 6),
            "iou_per_label": ious_per_label,
        })
    return out


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    t2d_path = TOPIC_TO_DATA_DIR / f"{scene_id}.json"
    map_path = LOCAL_T2D_DIR / f"{scene_id}_dominant_topic_map.bin"
    if not t2d_path.exists() or not map_path.exists():
        return None

    t2d = json.load(t2d_path.open("r", encoding="utf-8"))
    H, W = t2d["spatial_shape"]
    K = int(t2d["topic_count"])

    grid_u8 = np.frombuffer(map_path.read_bytes(), dtype=np.uint8).reshape(H, W)
    sentinel = t2d["dominant_topic_map"]["sentinel_unlabelled"]
    mask = grid_u8 != sentinel
    grid = grid_u8.astype(np.int32)

    cube, gt, _ = load_scene(scene_id)
    gt = gt.astype(np.int32)

    morans_I = morans_I_categorical(grid, mask)
    components = connected_components_per_topic(grid, mask)
    name_map = CLASS_NAMES.get(scene_id, {})
    iou = topic_label_iou(grid, gt, mask, name_map)

    return {
        "scene_id": scene_id,
        "spatial_shape": [int(H), int(W)],
        "topic_count": K,
        "n_assigned_pixels": int(mask.sum()),
        "morans_I_weighted_by_topic_support": round(float(morans_I), 6),
        "connected_components_per_topic": components,
        "topic_label_iou": iou,
        "best_iou_summary": {
            "max_iou_overall": round(float(max((e["best_iou"] for e in iou), default=0.0)), 6),
            "mean_best_iou": round(float(np.mean([e["best_iou"] for e in iou])), 6) if iou else 0.0,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_spatial_validation v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[spatial_validation] {scene_id} ...", flush=True)
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
        print(
            f"  Moran's I = {payload['morans_I_weighted_by_topic_support']:.3f}, "
            f"max IoU = {payload['best_iou_summary']['max_iou_overall']:.3f}, "
            f"mean best IoU = {payload['best_iou_summary']['mean_best_iou']:.3f}",
            flush=True,
        )
        written += 1
    print(f"[spatial_validation] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
