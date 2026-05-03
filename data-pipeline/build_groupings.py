"""Alternative document-construction methods.

Different methods of grouping spectra into documents change the LDA
output entirely. This builder produces three light-weight alternatives
to the canonical pixel-as-document baseline:

  pixel       trivial baseline; one document per labelled pixel
  slic_S      SLIC superpixels with target n_segments S in {500, 2000}
  patch_W     fixed-grid patches with W in {7, 15}
  felzen      Felzenszwalb graph-based segmentation

For each (method, scene) we save:

  data/local/groupings/<method>/<scene>/assignment.bin    uint16 H x W
  data/derived/groupings/<method>/<scene>.json            small summary

The summary contains group sizes, per-group mean spectra, between/
within variance ratio, agreement vs ground-truth label (ARI / NMI / V).
The full assignment array stays under data/local/.

Heavier groupings (semantic segmentation U-Net, CAE+kmeans) are
deliberately deferred to a later wave that requires GPU training time.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from skimage.segmentation import slic, felzenszwalb
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score, v_measure_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    valid_spectra_mask,
)


LOCAL_OUT_ROOT = DATA_DIR / "local" / "groupings"
DERIVED_OUT_ROOT = DERIVED_DIR / "groupings"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SLIC_NS = [500, 2000]
PATCH_WS = [7, 15]


def normalize_per_pixel(cube: np.ndarray) -> np.ndarray:
    """Per-spectrum normalisation to [0, 1] for SLIC/Felzenszwalb."""
    flat = cube.reshape(-1, cube.shape[-1]).astype(np.float32)
    low = flat.min(axis=1, keepdims=True)
    high = flat.max(axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    n = (flat - low) / denom
    return n.reshape(cube.shape)


def assignment_summary(
    assignment: np.ndarray,
    spectra: np.ndarray,
    labels: np.ndarray,
    valid_mask: np.ndarray,
) -> dict:
    """Compute group sizes + per-group mean spectrum + agreement vs label.

    `assignment` is H x W of int (group id), `valid_mask` is H x W bool.
    `spectra` is H*W x B; `labels` is H*W ints (0 = no label).
    """
    h, w = assignment.shape
    flat_assign = assignment.reshape(-1)
    valid_flat = valid_mask.reshape(-1)
    label_flat = labels.reshape(-1)
    sup_mask = valid_flat & (label_flat > 0)

    # Group sizes (over valid pixels)
    group_ids, counts = np.unique(flat_assign[valid_flat], return_counts=True)
    n_groups = int(group_ids.size)

    # Per-group mean spectrum
    means = []
    if spectra.size > 0:
        for gid in group_ids[:200]:  # cap to keep payload size sane
            mask = (flat_assign == int(gid)) & valid_flat
            if mask.sum() == 0:
                continue
            mu = spectra[mask].mean(axis=0)
            means.append({
                "group_id": int(gid),
                "size": int(mask.sum()),
                "mean": [round(float(v), 6) for v in mu.tolist()],
            })

    # Between/within variance (using mean spectra as features)
    # Per-pixel deviation from group mean -> "within" sum of squares.
    # Per-group mean deviation from grand mean -> "between" sum of squares.
    if spectra.size > 0 and group_ids.size > 1:
        grand = spectra[valid_flat].mean(axis=0)
        within_ss = 0.0
        between_ss = 0.0
        # Subsample for speed on Indian Pines etc.
        max_pixels_for_var = 5000
        idx_valid = np.flatnonzero(valid_flat)
        if idx_valid.size > max_pixels_for_var:
            rng = np.random.default_rng(42)
            idx_valid = rng.choice(idx_valid, size=max_pixels_for_var, replace=False)
        for gid in group_ids:
            sub_mask = (flat_assign[idx_valid] == int(gid))
            if not np.any(sub_mask):
                continue
            sub = spectra[idx_valid[sub_mask]]
            mu = sub.mean(axis=0)
            within_ss += float(((sub - mu) ** 2).sum())
            between_ss += float(sub.shape[0] * ((mu - grand) ** 2).sum())
        ratio = between_ss / max(within_ss, 1e-12)
    else:
        ratio = 0.0

    # Agreement vs ground-truth label, restricted to labelled valid pixels
    if sup_mask.sum() > 1:
        ari = float(adjusted_rand_score(label_flat[sup_mask], flat_assign[sup_mask]))
        nmi = float(normalized_mutual_info_score(label_flat[sup_mask], flat_assign[sup_mask]))
        vmeas = float(v_measure_score(label_flat[sup_mask], flat_assign[sup_mask]))
    else:
        ari = nmi = vmeas = 0.0

    sizes = counts.astype(np.int64)
    return {
        "n_groups": n_groups,
        "group_size_distribution": {
            "min": int(sizes.min()) if sizes.size else 0,
            "p25": int(np.percentile(sizes, 25)) if sizes.size else 0,
            "p50": int(np.percentile(sizes, 50)) if sizes.size else 0,
            "p75": int(np.percentile(sizes, 75)) if sizes.size else 0,
            "max": int(sizes.max()) if sizes.size else 0,
        },
        "between_within_variance_ratio": round(ratio, 4),
        "agreement_vs_label": {
            "ari": round(ari, 6),
            "nmi": round(nmi, 6),
            "v_measure": round(vmeas, 6),
            "n_labelled_pixels": int(sup_mask.sum()),
        },
        "mean_spectrum_per_group": means,
    }


def slic_assignment(cube_norm: np.ndarray, n_segments: int) -> np.ndarray:
    return slic(
        cube_norm.astype(np.float32),
        n_segments=n_segments,
        compactness=0.1,
        channel_axis=2,
        start_label=0,
        enforce_connectivity=True,
    ).astype(np.int32)


def patch_assignment(h: int, w: int, W: int) -> np.ndarray:
    """Fixed-grid W x W patches; one group id per patch."""
    rows = np.arange(h) // W
    cols = np.arange(w) // W
    n_cols = (w + W - 1) // W
    grid = rows[:, None] * n_cols + cols[None, :]
    return grid.astype(np.int32)


def felzenszwalb_assignment(cube_norm: np.ndarray, scale: float = 100.0) -> np.ndarray:
    """First three principal-component bands as RGB, then Felzenszwalb."""
    h, w, b = cube_norm.shape
    flat = cube_norm.reshape(-1, b)
    flat = flat - flat.mean(axis=0, keepdims=True)
    u, s, _ = np.linalg.svd(flat, full_matrices=False)
    coords = (u[:, :3] * s[:3]).reshape(h, w, 3)
    coords = (coords - coords.min()) / (np.ptp(coords) + 1e-9)
    return felzenszwalb(coords.astype(np.float32), scale=scale, sigma=0.8, min_size=20).astype(np.int32)


def build_for_scene(scene_id: str) -> list[dict]:
    if scene_id not in SCENES or not has_labels(scene_id):
        return []
    cube, gt, config = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    valid_2d = valid.reshape(h, w)
    cube_norm = normalize_per_pixel(cube)
    flat_labels = gt.reshape(-1)

    summaries: list[dict] = []
    methods: list[tuple[str, np.ndarray]] = []

    # Pixel baseline
    methods.append(("pixel", np.arange(h * w, dtype=np.int32).reshape(h, w)))

    # SLIC at multiple sizes
    for n in SLIC_NS:
        methods.append((f"slic_{n}", slic_assignment(cube_norm, n_segments=n)))

    # Patch grids
    for W in PATCH_WS:
        methods.append((f"patch_{W}", patch_assignment(h, w, W)))

    # Felzenszwalb
    methods.append(("felzenszwalb", felzenszwalb_assignment(cube_norm)))

    for method_name, assignment in methods:
        # Save assignment binary
        local_dir = LOCAL_OUT_ROOT / method_name / scene_id
        local_dir.mkdir(parents=True, exist_ok=True)
        # Cap to uint16 for sane size; pixel baseline can exceed uint16 so use uint32.
        max_id = int(assignment.max())
        if max_id < (1 << 16):
            arr = assignment.astype(np.uint16)
            fmt = "binary_uint16_le"
        else:
            arr = assignment.astype(np.uint32)
            fmt = "binary_uint32_le"
        bin_path = local_dir / "assignment.bin"
        bin_path.write_bytes(arr.tobytes())

        summary = assignment_summary(assignment, flat, flat_labels, valid_2d)
        summary["scene_id"] = scene_id
        summary["method"] = method_name
        summary["spatial_shape"] = [int(h), int(w)]
        summary["assignment_path"] = str(bin_path.relative_to(ROOT)).replace("\\", "/")
        summary["assignment_format"] = fmt
        summary["assignment_dtype_max_id"] = int(max_id)
        summary["wavelengths_nm"] = [round(float(x), 2) for x in approximate_wavelengths(config, b).tolist()]
        summary["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        summary["builder_version"] = "build_groupings v0.1"

        out_dir = DERIVED_OUT_ROOT / method_name
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(summary, handle, separators=(",", ":"))
        summaries.append({
            "method": method_name,
            "n_groups": summary["n_groups"],
            "ari": summary["agreement_vs_label"]["ari"],
            "nmi": summary["agreement_vs_label"]["nmi"],
            "between_within": summary["between_within_variance_ratio"],
        })
    return summaries


def main() -> int:
    DERIVED_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    written_total = 0
    for scene_id in LABELLED_SCENES:
        print(f"[groupings] {scene_id} ...", flush=True)
        try:
            summaries = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        for s in summaries:
            print(
                f"  {s['method']:18s} n={s['n_groups']:5d}  "
                f"ARI={s['ari']:+.3f}  NMI={s['nmi']:.3f}  "
                f"between/within={s['between_within']:.2f}",
                flush=True,
            )
        written_total += len(summaries)
    print(f"[groupings] done — {written_total} (method x scene) outputs.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
