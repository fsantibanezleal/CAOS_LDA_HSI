"""B-7 Topic-to-USGS alignment with the full splib07 AVIRIS-1997 set.

Master plan Addendum B Axis B (external alignment to non-target ground
truth, USGS v7).

`build_topic_to_library` already covers AVIRIS-1997-convolved topic ↔
library cosine but only against 13 hand-curated samples in
`derived/spectral/library_samples.json`. This builder reads the full
splib07 AVIRIS-1997 ZIP (~2464 spectra across 7 chapters: artificial,
coatings, liquids, minerals, organics, soils, vegetation) and reports
per-scene per-topic alignment.

For each labelled scene:

  - cosine and SAM (radians) of every topic band-profile against every
    USGS spectrum on the AVIRIS-1997 wavelength grid (400-2500 nm, 224
    bands)
  - top-N = 20 nearest USGS samples per topic (cosine and SAM)
  - per-chapter best match per topic (mineral, vegetation, soil, ...)
  - chapter histogram (where do topics tend to land?)

Output: data/derived/topic_to_usgs_v7/<scene>.json
"""
from __future__ import annotations

import json
import re
import sys
import warnings
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR

warnings.filterwarnings("ignore")


SPLIB_ZIP = DATA_DIR / "raw" / "usgs_splib07" / "ASCIIdata_splib07b_cvAVIRISc1997.zip"
TOPIC_VIEWS_DIR = DERIVED_DIR / "topic_views"
OUTPUT_DIR = DERIVED_DIR / "topic_to_usgs_v7"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
TOP_N = 20
AVIRIS_WAVELENGTHS_NM = np.linspace(400.0, 2500.0, 224)


CHAPTER_KEYS = {
    "ChapterA_ArtificialMaterials": "artificial",
    "ChapterC_Coatings": "coatings",
    "ChapterL_Liquids": "liquids",
    "ChapterM_Minerals": "minerals",
    "ChapterO_OrganicCompounds": "organics",
    "ChapterS_SoilsAndMixtures": "soils",
    "ChapterV_Vegetation": "vegetation",
}


def parse_spectrum_text(text: str) -> tuple[str, np.ndarray]:
    lines = text.splitlines()
    header = lines[0] if lines else ""
    name = header
    m = re.search(r"Record=\d+:\s*(.+?)\s*$", header)
    if m:
        name = m.group(1)
    floats: list[float] = []
    for ln in lines[1:]:
        ln = ln.strip()
        if not ln:
            continue
        try:
            floats.append(float(ln))
        except ValueError:
            continue
    return name.strip(), np.asarray(floats, dtype=np.float64)


def load_splib07() -> tuple[list[dict], np.ndarray]:
    """Returns (list of {name, chapter, spectrum, valid_mask}, wavelengths)."""
    samples: list[dict] = []
    with zipfile.ZipFile(SPLIB_ZIP, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            if "/errorbars/" in info.filename:
                continue
            chapter_match = re.search(r"/([^/]+)/[^/]+\.txt$", info.filename)
            if not chapter_match:
                continue
            chapter = chapter_match.group(1)
            chapter_key = CHAPTER_KEYS.get(chapter)
            if chapter_key is None:
                continue
            with zf.open(info) as fh:
                text = fh.read().decode("utf-8", errors="replace")
            name, spec = parse_spectrum_text(text)
            if spec.size != AVIRIS_WAVELENGTHS_NM.size:
                continue
            valid = (spec > -0.5) & np.isfinite(spec)
            if valid.sum() < 50:
                continue
            samples.append({
                "name": name,
                "chapter": chapter_key,
                "filename": info.filename.split("/")[-1],
                "spectrum": spec,
                "valid_mask": valid,
            })
    return samples, AVIRIS_WAVELENGTHS_NM


def safe_resample(source_x: np.ndarray, source_y: np.ndarray, target_x: np.ndarray) -> np.ndarray:
    sx = np.asarray(source_x, dtype=np.float64)
    sy = np.asarray(source_y, dtype=np.float64)
    tx = np.asarray(target_x, dtype=np.float64)
    out = np.full(tx.shape, fill_value=np.nan, dtype=np.float64)
    mask = (tx >= sx.min()) & (tx <= sx.max())
    out[mask] = np.interp(tx[mask], sx, sy)
    return out


def cosine_with_nan(a: np.ndarray, b: np.ndarray) -> float:
    mask = np.isfinite(a) & np.isfinite(b)
    if mask.sum() < 5:
        return 0.0
    a_v = a[mask]
    b_v = b[mask]
    na = float(np.linalg.norm(a_v))
    nb = float(np.linalg.norm(b_v))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(a_v, b_v) / (na * nb))


def sam_radians(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.arccos(np.clip(cosine_with_nan(a, b), -1.0, 1.0)))


def build_for_scene(scene_id: str, samples: list[dict]) -> dict | None:
    tv_path = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    if not tv_path.exists():
        return None
    tv = json.load(tv_path.open("r", encoding="utf-8"))
    profiles = np.array(tv["topic_band_profiles"], dtype=np.float64)
    K = profiles.shape[0]
    scene_wavelengths = np.array(tv["wavelengths_nm"], dtype=np.float64)

    # Pre-resample every USGS sample to scene wavelengths once
    resampled = []
    for s in samples:
        spec = s["spectrum"].copy()
        # NaN-out invalid bands so resample handles it gracefully
        spec[~s["valid_mask"]] = np.nan
        resampled.append(safe_resample(AVIRIS_WAVELENGTHS_NM, spec, scene_wavelengths))

    cos_matrix = np.zeros((K, len(samples)), dtype=np.float64)
    sam_matrix = np.zeros((K, len(samples)), dtype=np.float64)
    for k in range(K):
        for j, lib in enumerate(resampled):
            cos_matrix[k, j] = cosine_with_nan(profiles[k], lib)
            sam_matrix[k, j] = sam_radians(profiles[k], lib)

    # Top-N per topic
    top_per_topic = []
    chapter_hist_per_topic = []
    for k in range(K):
        order = np.argsort(cos_matrix[k])[::-1][:TOP_N]
        top_per_topic.append([
            {
                "rank": int(rank),
                "name": samples[int(j)]["name"],
                "chapter": samples[int(j)]["chapter"],
                "filename": samples[int(j)]["filename"],
                "cosine": round(float(cos_matrix[k, int(j)]), 6),
                "sam_radians": round(float(sam_matrix[k, int(j)]), 6),
            }
            for rank, j in enumerate(order)
        ])
        # Chapter histogram of the top-50 matches (broader signal)
        order50 = np.argsort(cos_matrix[k])[::-1][:50]
        hist: dict[str, int] = {}
        for j in order50:
            ch = samples[int(j)]["chapter"]
            hist[ch] = hist.get(ch, 0) + 1
        chapter_hist_per_topic.append(hist)

    # Best match per chapter for each topic
    best_per_chapter_per_topic = []
    chapters_present = sorted({s["chapter"] for s in samples})
    chapter_indices = {ch: [j for j, s in enumerate(samples) if s["chapter"] == ch] for ch in chapters_present}
    for k in range(K):
        rec: dict[str, dict] = {}
        for ch, idxs in chapter_indices.items():
            if not idxs:
                continue
            sub_cos = cos_matrix[k, idxs]
            best_local = int(np.argmax(sub_cos))
            j = idxs[best_local]
            rec[ch] = {
                "name": samples[j]["name"],
                "filename": samples[j]["filename"],
                "cosine": round(float(cos_matrix[k, j]), 6),
                "sam_radians": round(float(sam_matrix[k, j]), 6),
            }
        best_per_chapter_per_topic.append(rec)

    return {
        "scene_id": scene_id,
        "topic_count": int(K),
        "library_subset": "USGS Spectral Library v7 — AVIRIS-Classic 1997 convolution (full)",
        "library_sample_count": len(samples),
        "library_chapter_counts": {
            ch: sum(1 for s in samples if s["chapter"] == ch) for ch in chapters_present
        },
        "top_n_per_topic": top_per_topic,
        "chapter_histogram_top50_per_topic": chapter_hist_per_topic,
        "best_match_per_chapter_per_topic": best_per_chapter_per_topic,
        "framework_axis": "B-7 (master plan Addendum B Axis B): topic ↔ full USGS splib07 v7 (AVIRIS-1997) external-alignment readout",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_to_usgs_v7 v0.1",
    }


def main() -> int:
    if not SPLIB_ZIP.exists():
        print(f"  splib07 zip not found at {SPLIB_ZIP}", flush=True)
        return 1
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[usgs_v7] loading splib07 from {SPLIB_ZIP.name} ...", flush=True)
    samples, _ = load_splib07()
    print(f"[usgs_v7] {len(samples)} usable spectra loaded", flush=True)

    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[usgs_v7] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id, samples)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped (no topic_views)", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        for k in range(payload["topic_count"]):
            top = payload["top_n_per_topic"][k][0]
            print(
                f"  topic {k+1:2d} -> {top['name'][:60]:60s} "
                f"(chapter={top['chapter']:11s} cos={top['cosine']:.3f})",
                flush=True,
            )
        written += 1
    print(f"[usgs_v7] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
