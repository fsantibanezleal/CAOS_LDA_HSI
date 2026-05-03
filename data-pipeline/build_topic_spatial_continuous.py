"""B-10 Continuous topic-abundance spatial autocorrelation.

Master plan Addendum B Axis B / extension of `build_spatial_validation`.

The existing spatial validation computes Moran's I on the **dominant-
topic categorical map** (a one-hot indicator per topic). This builder
adds:

  - Moran's I on the **continuous theta_k abundance map** (per-pixel
    soft assignment) using 4-neighbour rook contiguity
  - Geary's C as a complementary spatial-autocorrelation index per
    topic (Geary 1954)

Inputs come from the canonical LDA fit (`data/local/lda_fits/<scene>/`)
which stores theta (D x K) for the sampled document set together with
sample_pixel_indices mapping each document to its (flat) pixel
position. The continuous abundance map is built on the labelled pixel
mask (sentinel for unsampled pixels).

Boundary Displacement Error vs the ground-truth class boundary was
attempted on the subsampled grid and produced uninformative numbers
(too few neighbouring sample positions to host class boundaries). A
proper BDE requires recomputing per-pixel theta over the full
labelled mask via a fresh LDA transform, deferred to a follow-up.

Output: data/derived/topic_spatial_continuous/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import SCENES, load_scene

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
TOPIC_TO_DATA_DIR = DERIVED_DIR / "topic_to_data"
LOCAL_T2D_DIR = DATA_DIR / "local" / "topic_to_data"
OUTPUT_DIR = DERIVED_DIR / "topic_spatial_continuous"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]


def morans_I_continuous(x_grid: np.ndarray, mask: np.ndarray) -> float:
    """Moran's I on a continuous field with 4-neighbour rook weights.

    x_grid: H x W float; mask: H x W bool — valid pixels.
    Off-mask pixels do not contribute and have no neighbours.
    """
    if mask.sum() < 5:
        return 0.0
    x = x_grid.astype(np.float64) * mask
    x_mean = float(x[mask].mean())
    dev = (x - x_mean) * mask
    var = float((dev[mask] ** 2).sum())
    if var < 1e-12:
        return 0.0
    n = int(mask.sum())

    right = dev[:, :-1] * dev[:, 1:]
    down = dev[:-1, :] * dev[1:, :]
    right_w = mask[:, :-1] & mask[:, 1:]
    down_w = mask[:-1, :] & mask[1:, :]

    cross_sum = float(right[right_w].sum() + down[down_w].sum())
    W = float(right_w.sum() + down_w.sum())
    if W < 1:
        return 0.0
    return (n / W) * cross_sum / var


def gearys_C_continuous(x_grid: np.ndarray, mask: np.ndarray) -> float:
    """Geary's C on a continuous field with rook contiguity. Range
    typically [0, 2]; C < 1 = positive autocorrelation, C > 1 = negative."""
    if mask.sum() < 5:
        return 1.0
    x = x_grid.astype(np.float64) * mask
    x_mean = float(x[mask].mean())
    dev = (x - x_mean) * mask
    var = float((dev[mask] ** 2).sum())
    if var < 1e-12:
        return 1.0
    n = int(mask.sum())

    right_diff_sq = (x_grid[:, :-1] - x_grid[:, 1:]) ** 2
    down_diff_sq = (x_grid[:-1, :] - x_grid[1:, :]) ** 2
    right_w = mask[:, :-1] & mask[:, 1:]
    down_w = mask[:-1, :] & mask[1:, :]

    diff_sum = float(right_diff_sq[right_w].sum() + down_diff_sq[down_w].sum())
    W = float(right_w.sum() + down_w.sum())
    if W < 1:
        return 1.0
    return ((n - 1) / (2 * W)) * diff_sum / var


def boundary_pixels(grid: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Return a bool mask of pixels that sit on a class/topic boundary
    inside `mask`. A pixel is a boundary pixel if any of its 4
    rook-neighbours has a different value (and is also masked)."""
    H, W = grid.shape
    bnd = np.zeros((H, W), dtype=bool)
    # Right neighbour
    diff_r = (grid[:, :-1] != grid[:, 1:]) & mask[:, :-1] & mask[:, 1:]
    bnd[:, :-1] |= diff_r
    bnd[:, 1:] |= diff_r
    # Down neighbour
    diff_d = (grid[:-1, :] != grid[1:, :]) & mask[:-1, :] & mask[1:, :]
    bnd[:-1, :] |= diff_d
    bnd[1:, :] |= diff_d
    return bnd & mask


def boundary_displacement_error(topic_grid: np.ndarray, gt_grid: np.ndarray, mask: np.ndarray) -> dict:
    """Mean Euclidean distance from each topic-boundary pixel to the
    nearest GT-boundary pixel (and vice versa)."""
    bnd_topic = boundary_pixels(topic_grid, mask)
    bnd_gt = boundary_pixels(gt_grid, mask)
    out = {
        "topic_boundary_pixel_count": int(bnd_topic.sum()),
        "gt_boundary_pixel_count": int(bnd_gt.sum()),
    }
    if bnd_topic.sum() == 0 or bnd_gt.sum() == 0:
        out.update({
            "mean_topic_to_gt": None,
            "mean_gt_to_topic": None,
            "bde_symmetric": None,
        })
        return out
    # Distance transform: distance to nearest True pixel of input
    dist_to_gt = distance_transform_edt(~bnd_gt)
    dist_to_topic = distance_transform_edt(~bnd_topic)
    mean_t2g = float(dist_to_gt[bnd_topic].mean())
    mean_g2t = float(dist_to_topic[bnd_gt].mean())
    bde = 0.5 * (mean_t2g + mean_g2t)
    out.update({
        "mean_topic_to_gt": round(mean_t2g, 6),
        "mean_gt_to_topic": round(mean_g2t, 6),
        "bde_symmetric": round(bde, 6),
    })
    return out


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    fit_dir = LOCAL_FIT_DIR / scene_id
    needed = ["theta.npy", "sample_pixel_indices.npy"]
    for fn in needed:
        if not (fit_dir / fn).exists():
            return None
    theta = np.load(fit_dir / "theta.npy")  # (D, K)
    pixel_indices = np.load(fit_dir / "sample_pixel_indices.npy")  # (D,) flat

    # Need cube shape to reshape
    cube, gt, _ = load_scene(scene_id)
    H, W, _ = cube.shape
    K = int(theta.shape[1])

    # Build per-pixel mask + per-topic continuous abundance map on the
    # subsampled positions (others are sentinel)
    flat_size = int(H * W)
    if pixel_indices.size != theta.shape[0]:
        return None
    mask_flat = np.zeros(flat_size, dtype=bool)
    mask_flat[pixel_indices] = True
    mask = mask_flat.reshape(H, W)

    abundance_grids = np.zeros((K, H, W), dtype=np.float32)
    for k in range(K):
        flat = np.zeros(flat_size, dtype=np.float32)
        flat[pixel_indices] = theta[:, k].astype(np.float32)
        abundance_grids[k] = flat.reshape(H, W)

    # Per-topic Moran's I and Geary's C on the continuous abundance map
    per_topic = []
    for k in range(K):
        I = morans_I_continuous(abundance_grids[k], mask)
        C = gearys_C_continuous(abundance_grids[k], mask)
        per_topic.append({
            "topic_id": int(k + 1),
            "morans_I_continuous": round(float(I), 6),
            "gearys_C_continuous": round(float(C), 6),
            "mean_abundance_in_mask": round(float(abundance_grids[k][mask].mean()), 6),
        })

    aggregated_I = float(np.mean([t["morans_I_continuous"] for t in per_topic]))
    aggregated_C = float(np.mean([t["gearys_C_continuous"] for t in per_topic]))

    return {
        "scene_id": scene_id,
        "topic_count": K,
        "spatial_shape": [int(H), int(W)],
        "n_sampled_pixels": int(mask.sum()),
        "per_topic_continuous_spatial": per_topic,
        "aggregated_morans_I_mean_over_topics": round(aggregated_I, 6),
        "aggregated_gearys_C_mean_over_topics": round(aggregated_C, 6),
        "framework_axis": "B-10 (master plan Addendum B Axis B): Moran's I + Geary's C on continuous theta_k abundance maps",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_spatial_continuous v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[spatial_continuous] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped (missing fit data)", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        print(
            f"  K={payload['topic_count']:2d}  mean_I={payload['aggregated_morans_I_mean_over_topics']:.3f}  "
            f"mean_C={payload['aggregated_gearys_C_mean_over_topics']:.3f}",
            flush=True,
        )
        written += 1
    print(f"[spatial_continuous] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
