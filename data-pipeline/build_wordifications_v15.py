"""V15 — spectral indices as tokens (#673).

Classical remote-sensing vegetation / water / soil indices computed
per pixel, binned to Q levels, emitted as discrete (index, bin)
tokens. Vocab size = N_INDICES * Q where N_INDICES = 6.

Indices computed:
- NDVI (Normalised Difference Vegetation Index): (NIR - RED) / (NIR + RED)
- MNDWI (Modified Normalised Difference Water Index): (GREEN - SWIR1) / (GREEN + SWIR1)
- NBR (Normalised Burn Ratio): (NIR - SWIR2) / (NIR + SWIR2)
- NDSI (Normalised Difference Snow Index): (GREEN - SWIR1) / (GREEN + SWIR1)
- EVI (Enhanced Vegetation Index): 2.5 * (NIR - RED) / (NIR + 6 RED - 7.5 BLUE + 1)
- SAVI (Soil Adjusted Vegetation Index): 1.5 * (NIR - RED) / (NIR + RED + 0.5)

The wavelength windows are inferred from each scene's
approximate_wavelengths() — bands closest to the canonical centers
(490 BLUE, 560 GREEN, 660 RED, 850 NIR, 1610 SWIR1, 2200 SWIR2).

This is the classical remote-sensing baseline. Closes the reviewer
defence "did you compare against the standard hand-crafted index
recipe?".

Tracks #673.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES,
    approximate_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V15"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
Q_DEFAULT = 8

# Canonical band centres in nanometres.
BAND_CENTERS_NM = {
    "BLUE": 490, "GREEN": 560, "RED": 660,
    "NIR": 850, "SWIR1": 1610, "SWIR2": 2200,
}


def closest_band(wavelengths: np.ndarray, target_nm: float) -> int | None:
    """Return the band index whose centre is closest to `target_nm`,
    or None if no band falls within 100 nm."""
    diffs = np.abs(wavelengths - target_nm)
    idx = int(np.argmin(diffs))
    if diffs[idx] > 100:
        return None
    return idx


def safe_div(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    return num / np.where(np.abs(den) < 1e-6, 1e-6, den)


def compute_indices(spectra: np.ndarray, wavelengths: np.ndarray) -> dict[str, np.ndarray]:
    """Return a dict {index_name: per-pixel value} for the 6 indices.

    Each index is returned as a [D] array; skipped (None) if the scene
    lacks the required bands.
    """
    bands = {
        name: closest_band(wavelengths, centre)
        for name, centre in BAND_CENTERS_NM.items()
    }
    out: dict[str, np.ndarray] = {}

    if bands["NIR"] is not None and bands["RED"] is not None:
        nir = spectra[:, bands["NIR"]]
        red = spectra[:, bands["RED"]]
        out["NDVI"] = safe_div(nir - red, nir + red)
        out["SAVI"] = 1.5 * safe_div(nir - red, nir + red + 0.5)
        if bands["BLUE"] is not None:
            blue = spectra[:, bands["BLUE"]]
            out["EVI"] = 2.5 * safe_div(nir - red, nir + 6 * red - 7.5 * blue + 1)

    if bands["GREEN"] is not None and bands["SWIR1"] is not None:
        green = spectra[:, bands["GREEN"]]
        swir1 = spectra[:, bands["SWIR1"]]
        out["MNDWI"] = safe_div(green - swir1, green + swir1)
        out["NDSI"] = safe_div(green - swir1, green + swir1)

    if bands["NIR"] is not None and bands["SWIR2"] is not None:
        swir2 = spectra[:, bands["SWIR2"]]
        nir = spectra[:, bands["NIR"]]
        out["NBR"] = safe_div(nir - swir2, nir + swir2)

    return out


def quantize_per_index(values: np.ndarray, q: int) -> np.ndarray:
    """Uniform quantisation per index. Maps to [0, q-1] integers."""
    lo = float(np.percentile(values, 1))
    hi = float(np.percentile(values, 99))
    rng = max(hi - lo, 1e-6)
    bins = np.clip(np.floor((values - lo) / rng * q), 0, q - 1).astype(np.int32)
    return bins


def build_for_scene(scene_id: str, q: int = Q_DEFAULT) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, config = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_idx = np.flatnonzero(labelled_mask)
    labels = flat_labels[pixel_idx]
    sample_local = stratified_sample_indices(labels, SAMPLES_PER_CLASS,
                                              random_state=RANDOM_STATE)
    spectra = flat[pixel_idx[sample_local]]
    D = spectra.shape[0]
    wavelengths = approximate_wavelengths(config, B)

    # Normalise spectra to [0, 1] per pixel before computing indices —
    # safer when reflectance is in raw DN units rather than reflectance.
    lo = spectra.min(axis=1, keepdims=True)
    hi = spectra.max(axis=1, keepdims=True)
    spectra01 = (spectra - lo) / np.maximum(hi - lo, 1e-12)

    indices = compute_indices(spectra01, wavelengths)
    if not indices:
        return None

    # Build sparse doc-term [D, len(indices)*q] with one nonzero per
    # (doc, index) pair carrying the bin id as count.
    rows = []
    cols = []
    data = []
    vocab = []
    for i, (name, vals) in enumerate(sorted(indices.items())):
        bins = quantize_per_index(vals, q)
        rows.extend(range(D))
        cols.extend((i * q + bins).tolist())
        data.extend([1] * D)  # presence indicator
        for b in range(q):
            vocab.append(f"{name}_q{b:02d}")
    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, len(indices) * q),
        dtype=np.int32,
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "indices_computed": sorted(indices.keys()),
        "Q": int(q), "vocab_size": len(vocab),
        "doc_term": doc_term, "vocab": vocab,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V15 spectral-index wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    parser.add_argument("--q", type=int, default=Q_DEFAULT)
    args = parser.parse_args()
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V15] {scene} ...", flush=True)
        try:
            res = build_for_scene(scene, args.q)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            n_skip += 1
            continue
        if res is None:
            print("  SKIP", flush=True)
            n_skip += 1
            continue
        out_dir = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}" / scene
        out_dir.mkdir(parents=True, exist_ok=True)
        sp.save_npz(out_dir / "doc_term.npz", res["doc_term"])
        with (out_dir / "vocab.json").open("w", encoding="utf-8") as h:
            json.dump({
                "vocab": res["vocab"], "recipe": "V15",
                "scheme": "uniform", "Q": args.q,
                "B": res["B"],
                "indices_computed": res["indices_computed"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v15 v0.1",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} indices={res['indices_computed']} "
            f"vocab={res['vocab_size']}",
            flush=True,
        )
    print(f"[V15] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
