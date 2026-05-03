"""Match each topic's reconstructed spectrum to the closest USGS / Sentinel-2
spectral-library samples.

For every labelled scene with a topic-views fit, this builder:

1. Reads the topic_band_profiles (= phi for band-frequency LDA, which is
   numerically equivalent to the reconstructed reflectance-bin
   distribution)
2. Reads the curated spectral library
   (`data/derived/spectral/library_samples.json`)
3. For every (topic, library-sample) pair where the band counts allow
   (we restrict to the AVIRIS-resampled subset which has 224 bands —
   close enough to all UPV/EHU AVIRIS scenes after linear resampling),
   computes cosine similarity and SAM (radians) over the common
   wavelength range
4. Writes per-topic top-N nearest minerals plus a full topic x library
   distance matrix per scene

Output: `data/derived/topic_to_library/<scene>.json`
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

from research_core.paths import DATA_DIR, DERIVED_DIR


LIBRARY_PATH = DERIVED_DIR / "spectral" / "library_samples.json"
TOPIC_VIEWS_DIR = DERIVED_DIR / "topic_views"
OUTPUT_DIR = DERIVED_DIR / "topic_to_library"


TOP_N = 5


def safe_resample(source_x: np.ndarray, source_y: np.ndarray, target_x: np.ndarray) -> np.ndarray:
    """Linear interpolation; values outside source range are NaN."""
    sx = np.asarray(source_x, dtype=np.float64)
    sy = np.asarray(source_y, dtype=np.float64)
    tx = np.asarray(target_x, dtype=np.float64)
    out = np.full(tx.shape, fill_value=np.nan, dtype=np.float64)
    mask = (tx >= sx.min()) & (tx <= sx.max())
    out[mask] = np.interp(tx[mask], sx, sy)
    return out


def cosine_with_nan_handling(a: np.ndarray, b: np.ndarray) -> float:
    mask = np.isfinite(a) & np.isfinite(b)
    if mask.sum() < 5:
        return 0.0
    a_v = a[mask]
    b_v = b[mask]
    na = np.linalg.norm(a_v)
    nb = np.linalg.norm(b_v)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(a_v, b_v) / (na * nb))


def sam_radians(a: np.ndarray, b: np.ndarray) -> float:
    cos = np.clip(cosine_with_nan_handling(a, b), -1.0, 1.0)
    return float(np.arccos(cos))


def build_for_scene(scene_id: str, library_samples: list[dict]) -> dict | None:
    tv_path = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    if not tv_path.exists():
        return None
    tv = json.load(tv_path.open("r", encoding="utf-8"))
    profiles = np.array(tv["topic_band_profiles"], dtype=np.float64)
    K = profiles.shape[0]
    scene_wavelengths = np.array(tv["wavelengths_nm"], dtype=np.float64)

    # Library: keep AVIRIS-Classic samples (224 bands, full VNIR-SWIR).
    aviris_samples = [s for s in library_samples if s.get("sensor", "").startswith("AVIRIS")]
    if not aviris_samples:
        return None

    matrix = np.zeros((K, len(aviris_samples)), dtype=np.float64)
    sam_matrix = np.zeros((K, len(aviris_samples)), dtype=np.float64)
    sample_names = [s["name"] for s in aviris_samples]
    sample_groups = [s.get("group", "?") for s in aviris_samples]

    for j, sample in enumerate(aviris_samples):
        lib_x = np.array(sample["wavelengths_nm"], dtype=np.float64)
        lib_y = np.array(sample["spectrum"], dtype=np.float64)
        # Resample library to scene's grid for direct comparison.
        lib_y_on_scene = safe_resample(lib_x, lib_y, scene_wavelengths)
        for k in range(K):
            cos = cosine_with_nan_handling(profiles[k], lib_y_on_scene)
            sam = sam_radians(profiles[k], lib_y_on_scene)
            matrix[k, j] = cos
            sam_matrix[k, j] = sam

    # Top-N nearest per topic
    top_per_topic = []
    for k in range(K):
        order = np.argsort(matrix[k])[::-1][:TOP_N]
        top_per_topic.append([
            {
                "rank": int(rank),
                "library_sample_id": str(aviris_samples[int(j_idx)].get("id", j_idx)),
                "name": sample_names[int(j_idx)],
                "group": sample_groups[int(j_idx)],
                "cosine": round(float(matrix[k, int(j_idx)]), 6),
                "sam_radians": round(float(sam_matrix[k, int(j_idx)]), 6),
            }
            for rank, j_idx in enumerate(order)
        ])

    return {
        "scene_id": scene_id,
        "topic_count": int(K),
        "library_sensor_subset": "AVIRIS-Classic 1997 convolution",
        "library_sample_names": sample_names,
        "library_sample_groups": sample_groups,
        "library_sample_count": len(aviris_samples),
        "topic_x_library_cosine": [
            [round(float(v), 6) for v in row] for row in matrix
        ],
        "topic_x_library_sam_radians": [
            [round(float(v), 6) for v in row] for row in sam_matrix
        ],
        "top_n_per_topic": top_per_topic,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_to_library v0.1",
    }


def main() -> int:
    if not LIBRARY_PATH.exists():
        print(f"  no library at {LIBRARY_PATH}", flush=True)
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    library_samples = json.load(LIBRARY_PATH.open("r", encoding="utf-8")).get("samples", [])
    print(f"[topic_to_library] {len(library_samples)} library samples loaded", flush=True)

    written = 0
    for tv_file in sorted(TOPIC_VIEWS_DIR.glob("*.json")):
        scene_id = tv_file.stem
        print(f"[topic_to_library] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id, library_samples)
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

        # Show the top-1 mineral per topic for the first few topics so the
        # user immediately sees real matches.
        first_three = payload["top_n_per_topic"][:3]
        for k, hits in enumerate(first_three):
            top = hits[0]
            print(
                f"  T{k}: best match = {top['name']} ({top['group']}) "
                f"cos={top['cosine']:.3f} SAM={top['sam_radians']:.3f}",
                flush=True,
            )
        written += 1
    print(f"[topic_to_library] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
