"""Precomputed spectral density heatmaps (band x reflectance) per group.

For every labelled scene this builder bins reflectance values per band
into a fixed grid and writes a stack of [B, R] count matrices: one
overall, one per label, one per dominant topic. The web app renders
these as heatmaps so the user can see the distribution of *thousands* of
spectra per group without rendering individual lines.

Outputs:
    derived/spectral_density/<scene>/density_global.bin
    derived/spectral_density/<scene>/density_by_label/<label_id>.bin
    derived/spectral_density/<scene>/density_by_topic/<k>.bin
    derived/spectral_density/<scene>/manifest.json

Each .bin is a binary uint32 little-endian array shape [B, R].
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import CLASS_NAMES, class_color, has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    valid_spectra_mask,
)


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "spectral_density"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
R_BINS = 100  # reflectance bins
SUBSAMPLE_PER_GROUP = 5000  # cap on pixels per group for speed
PERCENTILE_CLIP = (1, 99)  # use [p1, p99] of overall reflectance for the bin range


def density_per_band(spectra: np.ndarray, ref_min: float, ref_max: float, R: int) -> np.ndarray:
    """For each band, histogram of reflectance values into R bins.
    Returns uint32 array shape [B, R].
    """
    N, B = spectra.shape
    if N == 0:
        return np.zeros((B, R), dtype=np.uint32)
    edges = np.linspace(ref_min, ref_max, R + 1)
    out = np.zeros((B, R), dtype=np.uint32)
    for b in range(B):
        h, _ = np.histogram(spectra[:, b], bins=edges)
        out[b] = h.astype(np.uint32)
    return out


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, config = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices_global = np.flatnonzero(labelled_mask)
    if pixel_indices_global.size == 0:
        return None

    spectra = flat[pixel_indices_global]
    labels = flat_labels[pixel_indices_global]

    # Robust reflectance range
    ref_min, ref_max = np.percentile(spectra, PERCENTILE_CLIP)
    ref_min, ref_max = float(ref_min), float(ref_max)
    if ref_max <= ref_min:
        ref_max = ref_min + 1.0

    wavelengths = approximate_wavelengths(config, b)

    # Output dir
    scene_dir = DERIVED_OUT_DIR / scene_id
    by_label_dir = scene_dir / "density_by_label"
    by_topic_dir = scene_dir / "density_by_topic"
    by_label_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(42)

    def maybe_subsample(arr: np.ndarray, cap: int) -> np.ndarray:
        if arr.shape[0] > cap:
            sel = rng.choice(arr.shape[0], size=cap, replace=False)
            return arr[sel]
        return arr

    # Global
    sample_global = maybe_subsample(spectra, SUBSAMPLE_PER_GROUP * 4)
    density_global = density_per_band(sample_global, ref_min, ref_max, R_BINS)
    (scene_dir / "density_global.bin").write_bytes(density_global.tobytes())

    # Per label
    label_files: list[dict] = []
    name_map = CLASS_NAMES.get(scene_id, {})
    for cls in sorted(int(c) for c in np.unique(labels)):
        mask = labels == cls
        sub = maybe_subsample(spectra[mask], SUBSAMPLE_PER_GROUP)
        density = density_per_band(sub, ref_min, ref_max, R_BINS)
        fname = by_label_dir / f"{int(cls)}.bin"
        fname.write_bytes(density.tobytes())
        label_files.append({
            "label_id": int(cls),
            "name": name_map.get(int(cls), f"class_{int(cls)}"),
            "color": class_color(int(cls)),
            "n_pixels": int(mask.sum()),
            "path": str(fname.relative_to(ROOT)).replace("\\", "/"),
        })

    # Per dominant topic (if a fit is available)
    topic_files: list[dict] = []
    fit_dir = LOCAL_FIT_DIR / scene_id
    if (fit_dir / "theta.npy").exists():
        theta = np.load(fit_dir / "theta.npy")
        spi = np.load(fit_dir / "sample_pixel_indices.npy")
        K = theta.shape[1]
        dominant = np.argmax(theta, axis=1)
        # Map each labelled pixel index to fit-doc index when available
        doc_by_pixel = {int(p): int(i) for i, p in enumerate(spi)}
        sample_dominant = np.full(spectra.shape[0], fill_value=-1, dtype=np.int32)
        for j, p in enumerate(pixel_indices_global):
            d = doc_by_pixel.get(int(p))
            if d is not None:
                sample_dominant[j] = int(dominant[d])
        by_topic_dir.mkdir(parents=True, exist_ok=True)
        for k in range(K):
            mask = sample_dominant == k
            if not np.any(mask):
                continue
            sub = maybe_subsample(spectra[mask], SUBSAMPLE_PER_GROUP)
            density = density_per_band(sub, ref_min, ref_max, R_BINS)
            fname = by_topic_dir / f"{k}.bin"
            fname.write_bytes(density.tobytes())
            topic_files.append({
                "topic_k": int(k),
                "n_pixels_dominant": int(mask.sum()),
                "path": str(fname.relative_to(ROOT)).replace("\\", "/"),
            })

    manifest = {
        "scene_id": scene_id,
        "scene_name": config.name,
        "B": int(b),
        "R_bins": int(R_BINS),
        "reflectance_range": [ref_min, ref_max],
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "format": "binary_uint32_le",
        "shape_per_file": [int(b), int(R_BINS)],
        "density_global": {
            "path": str((scene_dir / "density_global.bin").relative_to(ROOT)).replace("\\", "/"),
            "n_pixels_sampled": int(sample_global.shape[0]),
        },
        "density_by_label": label_files,
        "density_by_topic": topic_files,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_spectral_density v0.1",
    }
    manifest_path = scene_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, separators=(",", ":"))
    return manifest


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[spectral_density] {scene_id} ...", flush=True)
        try:
            manifest = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if manifest is None:
            print("  skipped", flush=True)
            continue
        print(
            f"  B={manifest['B']}, R={manifest['R_bins']}, "
            f"by_label={len(manifest['density_by_label'])}, "
            f"by_topic={len(manifest['density_by_topic'])}",
            flush=True,
        )
        written += 1
    print(f"[spectral_density] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
