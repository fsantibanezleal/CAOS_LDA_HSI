"""B-10 follow-up: full-pixel-mask spatial autocorrelation + BDE.

The B-10 builder `build_topic_spatial_continuous` runs on the
**subsampled** position set used by the canonical LDA fit (220 per
class). The Boundary Displacement Error metric the master plan asks
for needs **contiguous boundaries**, which the sampled grid cannot
host (neighbouring sample positions are rare). This builder closes
that gap by:

  - Refitting LDA at the canonical K on a band-frequency doc-term
    matrix built from **every labelled pixel** in the scene
  - Transforming every labelled pixel to obtain a full per-pixel
    theta map (K, H, W)
  - Computing Moran's I and Geary's C on the dense continuous
    abundance maps
  - Computing the symmetric BDE between the dominant-topic boundary
    and the ground-truth class boundary

The full-pixel LDA refit is heavier than the canonical fit (60-300x
more documents) and produces a slightly different topic basis, so
both readings are kept side by side: the sampled-subset one (B-10)
is the canonical match to other builders' theta; the full-pixel one
(here) is the spatially-faithful reading for BDE.

Output: data/derived/topic_spatial_full/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.ndimage import distance_transform_edt
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import SCENES, load_scene, valid_spectra_mask

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "topic_spatial_full"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SCALE = 12
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def fit_lda(doc_term: np.ndarray, K: int) -> LatentDirichletAllocation:
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=40,
        batch_size=1024,
        evaluate_every=-1,
        random_state=RANDOM_STATE,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    return lda.fit(doc_term)


def morans_I_continuous(x_grid: np.ndarray, mask: np.ndarray) -> float:
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
    H, W = grid.shape
    bnd = np.zeros((H, W), dtype=bool)
    diff_r = (grid[:, :-1] != grid[:, 1:]) & mask[:, :-1] & mask[:, 1:]
    bnd[:, :-1] |= diff_r
    bnd[:, 1:] |= diff_r
    diff_d = (grid[:-1, :] != grid[1:, :]) & mask[:-1, :] & mask[1:, :]
    bnd[:-1, :] |= diff_d
    bnd[1:, :] |= diff_d
    return bnd & mask


def boundary_displacement_error(topic_grid: np.ndarray, gt_grid: np.ndarray, mask: np.ndarray) -> dict:
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
    K = 8
    if (fit_dir / "phi.npy").exists():
        try:
            phi_existing = np.load(fit_dir / "phi.npy")
            K = int(phi_existing.shape[0])
        except Exception:
            K = 8

    cube, gt, _ = load_scene(scene_id)
    H, W, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask_flat = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask_flat)
    spectra = flat[pixel_indices]

    print(f"  {scene_id}: refitting LDA at K={K} on {pixel_indices.size} labelled pixels ...", flush=True)
    doc_term = band_frequency_counts(spectra, scale=SCALE).astype(np.float32)
    lda = fit_lda(doc_term, K)
    theta = lda.transform(doc_term)
    theta = theta / np.clip(theta.sum(axis=1, keepdims=True), 1e-12, None)

    # Build per-pixel abundance maps
    mask = labelled_mask_flat.reshape(H, W)
    abundance_grids = np.zeros((K, H, W), dtype=np.float32)
    for k in range(K):
        flat_k = np.zeros(H * W, dtype=np.float32)
        flat_k[pixel_indices] = theta[:, k].astype(np.float32)
        abundance_grids[k] = flat_k.reshape(H, W)

    per_topic = []
    for k in range(K):
        I = morans_I_continuous(abundance_grids[k], mask)
        C = gearys_C_continuous(abundance_grids[k], mask)
        per_topic.append({
            "topic_id": int(k + 1),
            "morans_I_continuous_full": round(float(I), 6),
            "gearys_C_continuous_full": round(float(C), 6),
            "mean_abundance_in_mask": round(float(abundance_grids[k][mask].mean()), 6),
        })

    aggregated_I = float(np.mean([t["morans_I_continuous_full"] for t in per_topic]))
    aggregated_C = float(np.mean([t["gearys_C_continuous_full"] for t in per_topic]))

    dominant_topic = np.full((H, W), fill_value=-1, dtype=np.int32)
    dominant_topic[mask] = np.argmax(
        abundance_grids.transpose(1, 2, 0)[mask], axis=-1
    )
    bde = boundary_displacement_error(dominant_topic, gt.astype(np.int32), mask)

    return {
        "scene_id": scene_id,
        "topic_count": int(K),
        "spatial_shape": [int(H), int(W)],
        "n_labelled_pixels": int(mask.sum()),
        "lda_refit_note": "LDA refit at canonical K on the full labelled-pixel set (max_iter=40, batch_size=1024). Topic basis differs slightly from the canonical fit which uses 220-per-class subsampling; this trade buys spatially-faithful Moran's I, Geary's C, and meaningful BDE.",
        "per_topic_continuous_spatial_full": per_topic,
        "aggregated_morans_I_mean_over_topics": round(aggregated_I, 6),
        "aggregated_gearys_C_mean_over_topics": round(aggregated_C, 6),
        "boundary_displacement_error": bde,
        "framework_axis": "B-10 follow-up: full-pixel-mask Moran's I + Geary's C on continuous theta_k abundance maps + BDE vs GT class boundaries on the full labelled mask",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_spatial_full v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[spatial_full] {scene_id} ...", flush=True)
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
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        bde = payload["boundary_displacement_error"]
        print(
            f"  K={payload['topic_count']:2d} "
            f"D_full={payload['n_labelled_pixels']:6d}  "
            f"mean_I={payload['aggregated_morans_I_mean_over_topics']:.3f}  "
            f"mean_C={payload['aggregated_gearys_C_mean_over_topics']:.3f}",
            flush=True,
        )
        print(
            f"  BDE topic_b={bde['topic_boundary_pixel_count']:5d} gt_b={bde['gt_boundary_pixel_count']:5d} "
            f"symmetric={bde.get('bde_symmetric')}",
            flush=True,
        )
        written += 1
    print(f"[spatial_full] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
