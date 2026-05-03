"""Sampled-spectra binary browser for the web app.

For each labelled scene, sample up to N labelled spectra (stratified by
label, then random fill), pack them as a contiguous binary float32 array
shape [N, B], and write a JSON sidecar with per-document metadata for
brushing-and-linking.

Outputs:
    derived/spectral_browser/<scene>/spectra.bin       (binary float32)
    derived/spectral_browser/<scene>/metadata.json     (sidecar)

Schema: master-plan.md section 18.5.

The web app reads the binary once via fetch -> arrayBuffer ->
new Float32Array, and the metadata once via JSON. Together they let the
user render thousands of spectra at once on a canvas / WebGL surface,
coloured by any field of the metadata (label, dominant_topic, theta_k,
measurement bin).
"""
from __future__ import annotations

import json
import struct
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
    stratified_sample_indices,
    valid_spectra_mask,
)


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "spectral_browser"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
TARGET_SAMPLE = 8000  # per scene; capped by labelled-pixel availability
MIN_PER_CLASS = 50
RANDOM_STATE = 42


def stratified_sample_with_target(
    labels: np.ndarray, target_total: int, random_state: int = 42
) -> np.ndarray:
    """Pick up to target_total indices, stratified by label, with at least
    MIN_PER_CLASS per class when available."""
    rng = np.random.default_rng(random_state)
    classes = sorted(int(c) for c in np.unique(labels))
    per_class = max(MIN_PER_CLASS, target_total // max(len(classes), 1))
    chosen: list[np.ndarray] = []
    for cls in classes:
        idx = np.flatnonzero(labels == cls)
        take = min(per_class, idx.size)
        chosen.append(rng.choice(idx, size=take, replace=False))
    out = np.concatenate(chosen)
    # If we have spare budget, top-up with random-fill from the remainder.
    if out.size < target_total:
        remainder = np.setdiff1d(np.arange(labels.size), out, assume_unique=False)
        extra = min(target_total - out.size, remainder.size)
        if extra > 0:
            out = np.concatenate([out, rng.choice(remainder, size=extra, replace=False)])
    return np.unique(out)


def load_topic_assignment_for_pixels(scene_id: str, pixel_indices: np.ndarray) -> tuple[np.ndarray | None, np.ndarray | None]:
    """If a build_topic_views fit exists for this scene, look up the dominant
    topic and full theta for each requested pixel. Returns (dominant, theta)
    where any unknown pixel gets dominant=-1, theta filled with NaN."""
    fit_dir = LOCAL_FIT_DIR / scene_id
    theta_path = fit_dir / "theta.npy"
    spi_path = fit_dir / "sample_pixel_indices.npy"
    if not theta_path.exists() or not spi_path.exists():
        return None, None
    theta = np.load(theta_path)  # [D, K]
    spi = np.load(spi_path)
    K = theta.shape[1]
    # Build map: pixel_index -> doc_index
    doc_by_pixel = {int(p): int(i) for i, p in enumerate(spi)}
    dominant = np.full(pixel_indices.size, fill_value=-1, dtype=np.int32)
    theta_full = np.full((pixel_indices.size, K), fill_value=np.nan, dtype=np.float32)
    for j, p in enumerate(pixel_indices):
        d = doc_by_pixel.get(int(p))
        if d is not None:
            t = theta[d]
            theta_full[j] = t
            dominant[j] = int(np.argmax(t))
    return dominant, theta_full


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

    labels_at_labelled = flat_labels[pixel_indices_global]
    sample_idx_local = stratified_sample_with_target(
        labels_at_labelled, target_total=TARGET_SAMPLE, random_state=RANDOM_STATE
    )
    chosen_pixels = pixel_indices_global[sample_idx_local]
    spectra = flat[chosen_pixels]
    labels = flat_labels[chosen_pixels]
    N, B = spectra.shape
    wavelengths = approximate_wavelengths(config, b)
    name_map = CLASS_NAMES.get(scene_id, {})

    dominant, theta_full = load_topic_assignment_for_pixels(scene_id, chosen_pixels)

    # Pack to disk
    out_scene_dir = DERIVED_OUT_DIR / scene_id
    out_scene_dir.mkdir(parents=True, exist_ok=True)

    # Binary spectra: float32 little-endian, contiguous
    spectra_path = out_scene_dir / "spectra.bin"
    spectra_path.write_bytes(spectra.astype("<f4").tobytes())

    # Per-row metadata
    rows = []
    for j in range(N):
        row, col = divmod(int(chosen_pixels[j]), w)
        entry = {
            "i": int(j),
            "label_id": int(labels[j]),
            "label_name": name_map.get(int(labels[j]), f"class_{int(labels[j])}"),
            "color": class_color(int(labels[j])),
            "xy": [int(row), int(col)],
        }
        if dominant is not None and dominant[j] >= 0:
            entry["dominant_topic_k"] = int(dominant[j])
        if theta_full is not None and not np.any(np.isnan(theta_full[j])):
            entry["theta"] = [round(float(v), 4) for v in theta_full[j].tolist()]
        rows.append(entry)

    metadata = {
        "scene_id": scene_id,
        "scene_name": config.name,
        "spatial_shape": [int(h), int(w)],
        "sampling_strategy": "stratified_by_label_then_random_fill",
        "random_state": RANDOM_STATE,
        "N": int(N),
        "B": int(B),
        "format": "binary_f32_le",
        "spectra_path": str(spectra_path.relative_to(ROOT)).replace("\\", "/"),
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "rows": rows,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_spectral_browser v0.1",
    }
    metadata_path = out_scene_dir / "metadata.json"
    with metadata_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, separators=(",", ":"))
    return {
        "metadata_path": str(metadata_path.relative_to(ROOT)).replace("\\", "/"),
        "spectra_path": str(spectra_path.relative_to(ROOT)).replace("\\", "/"),
        "N": N,
        "B": B,
        "spectra_bytes": spectra_path.stat().st_size,
        "metadata_bytes": metadata_path.stat().st_size,
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[spectral_browser] {scene_id} ...", flush=True)
        try:
            info = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if info is None:
            print("  skipped", flush=True)
            continue
        spectra_kb = info["spectra_bytes"] / 1024
        metadata_kb = info["metadata_bytes"] / 1024
        print(
            f"  N={info['N']}, B={info['B']} -> "
            f"spectra.bin {spectra_kb:.1f} KB + metadata.json {metadata_kb:.1f} KB",
            flush=True,
        )
        written += 1
    print(f"[spectral_browser] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
