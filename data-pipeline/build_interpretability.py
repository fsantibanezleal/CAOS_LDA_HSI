"""Topic / band / document interpretability cards.

For each labelled scene this builder reads the existing derived layer
(eda, topic_views, topic_to_data, topic_to_library, spatial,
external_validation) and emits three card types:

  topic_card[k]
    peak_wavelength_nm          from topic_views.topic_band_profiles
    fwhm_nm                     half-max width around the peak
    top_words_with_relevance    from topic_views.top_words_per_topic[lambda=0.6]
    closest_usgs                from topic_to_library.top_n_per_topic[k]
    closest_literature          from external_validation literature alignment
    p_label_given_topic         from topic_to_data
    kl_to_label_prior           from topic_to_data
    docs_with_dominant_topic    from topic_to_data.docs_per_topic_dominant
    spatial_iou_best_label      from spatial.topic_label_iou
    spatial_n_components        from spatial.connected_components_per_topic
    spectral_envelope_summary   percentile envelope from eda + topic dominance
    pyldavis_lambda_grid        list of lambdas where ranked words are stored

  band_card[b]
    wavelength_nm               from eda.wavelengths_nm
    fisher_ratio                from eda.band_discriminative
    f_stat                      from eda.band_discriminative
    p_value                     from eda.band_discriminative
    mutual_info_vs_label        from eda.band_discriminative
    contribution_per_topic      column b of topic_views.topic_band_profiles

  document_card[d]               (only for top-N documents per topic)
    doc_id                      from topic_to_data.top_documents_per_topic
    theta                       full theta vector
    label_id                    ground-truth label
    label_name                  resolved
    xy                          row, col
    dominant_topic_k

Output: data/derived/interpretability/<scene_id>/{topic_cards.json, band_cards.json, document_cards.json}
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

from research_core.class_catalog import CLASS_NAMES
from research_core.paths import DERIVED_DIR


SOURCES = {
    "eda": DERIVED_DIR / "eda" / "per_scene",
    "topic_views": DERIVED_DIR / "topic_views",
    "topic_to_data": DERIVED_DIR / "topic_to_data",
    "topic_to_library": DERIVED_DIR / "topic_to_library",
    "spatial": DERIVED_DIR / "spatial",
    "external_validation": DERIVED_DIR / "external_validation",
}
OUTPUT_DIR = DERIVED_DIR / "interpretability"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]


def safe_load(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.load(path.open("r", encoding="utf-8"))
    except Exception:
        return None


def fwhm_nm(profile: np.ndarray, wavelengths: np.ndarray) -> float | None:
    """Full width at half max around the global maximum of profile."""
    if profile.size < 3:
        return None
    peak_idx = int(np.argmax(profile))
    peak_val = float(profile[peak_idx])
    if peak_val <= 0:
        return None
    half = peak_val / 2.0
    # Walk left
    left = peak_idx
    while left > 0 and profile[left] > half:
        left -= 1
    right = peak_idx
    while right < profile.size - 1 and profile[right] > half:
        right += 1
    if left == right:
        return 0.0
    return float(wavelengths[right] - wavelengths[left])


def build_topic_cards(scene_id: str) -> tuple[list[dict] | None, dict]:
    tv = safe_load(SOURCES["topic_views"] / f"{scene_id}.json")
    t2d = safe_load(SOURCES["topic_to_data"] / f"{scene_id}.json")
    lib = safe_load(SOURCES["topic_to_library"] / f"{scene_id}.json")
    lit = safe_load(SOURCES["external_validation"] / f"{scene_id}_literature.json")
    spatial = safe_load(SOURCES["spatial"] / f"{scene_id}.json")

    if tv is None:
        return None, {}

    K = int(tv["topic_count"])
    profiles = np.array(tv["topic_band_profiles"], dtype=np.float64)
    wavelengths = np.array(tv["wavelengths_nm"], dtype=np.float64)
    top_words_grid = tv.get("top_words_per_topic", {})
    p_label = (t2d or {}).get("p_label_given_topic_dominant", [])
    kl = (t2d or {}).get("kl_to_label_prior_per_topic", [])
    docs_dom = (t2d or {}).get("docs_per_topic_dominant", [])
    iou_per_topic = (spatial or {}).get("topic_label_iou", [])
    components = (spatial or {}).get("connected_components_per_topic", {})
    library_per_topic = (lib or {}).get("top_n_per_topic", [])
    literature_per_topic = (lit or {}).get("per_topic_alignment", [])

    cards = []
    for k in range(K):
        prof = profiles[k]
        peak_idx = int(np.argmax(prof))
        peak_wl = float(wavelengths[peak_idx])
        card = {
            "topic_k": k,
            "peak_wavelength_nm": round(peak_wl, 2),
            "peak_value": round(float(prof[peak_idx]), 6),
            "fwhm_nm": round(float(fwhm_nm(prof, wavelengths) or 0.0), 2),
            "p_label_given_topic_top3": [
                {"label_id": entry["label_id"], "name": entry["name"], "p": entry["p"]}
                for entry in (p_label[k] if k < len(p_label) else [])
                [:3] if entry["p"] > 0
            ],
            "kl_to_label_prior": kl[k] if k < len(kl) else None,
            "docs_with_dominant_topic": docs_dom[k] if k < len(docs_dom) else None,
            "top_words_lambda_0p6": [],
            "closest_usgs_top3": (
                library_per_topic[k][:3] if k < len(library_per_topic) else []
            ),
            "closest_literature_category": (
                literature_per_topic[k] if k < len(literature_per_topic) else None
            ),
            "spatial_best_iou": (
                next(
                    (
                        {"label_id": e["best_label_id"], "label_name": e["best_label_name"], "iou": e["best_iou"]}
                        for e in iou_per_topic if e["topic_k"] == k
                    ),
                    None,
                )
            ),
            "spatial_components": components.get(str(k)),
        }
        # Top words at lambda=0.5 if present (closest to LDAvis lambda=0.6 default)
        if "lambda_0.5" in top_words_grid and k < len(top_words_grid["lambda_0.5"]):
            card["top_words_lambda_0p5"] = top_words_grid["lambda_0.5"][k][:10]
        if "lambda_0.7" in top_words_grid and k < len(top_words_grid["lambda_0.7"]):
            card["top_words_lambda_0p7"] = top_words_grid["lambda_0.7"][k][:10]
        cards.append(card)

    meta = {
        "K": K,
        "wavelength_count": int(wavelengths.size),
        "wavelength_first": round(float(wavelengths[0]), 2),
        "wavelength_last": round(float(wavelengths[-1]), 2),
    }
    return cards, meta


def build_band_cards(scene_id: str) -> list[dict] | None:
    eda = safe_load(SOURCES["eda"] / f"{scene_id}.json")
    tv = safe_load(SOURCES["topic_views"] / f"{scene_id}.json")
    if eda is None:
        return None

    bands_meta = eda.get("band_discriminative", []) or []
    profiles = np.array(tv["topic_band_profiles"], dtype=np.float64) if tv else None
    K = profiles.shape[0] if profiles is not None else 0

    cards = []
    for entry in bands_meta:
        band_index = int(entry["band_index"])
        card = {
            "band_index": band_index,
            "wavelength_nm": entry["wavelength_nm"],
            "fisher_ratio": entry["fisher_ratio"],
            "f_stat": entry["f_stat"],
            "p_value": entry["p_value"],
            "mutual_info_vs_label": entry["mutual_info_vs_label"],
        }
        if profiles is not None and band_index < profiles.shape[1]:
            card["contribution_per_topic"] = [
                round(float(profiles[k, band_index]), 6) for k in range(K)
            ]
        cards.append(card)
    return cards


def build_document_cards(scene_id: str, max_per_topic: int = 10) -> list[dict] | None:
    t2d = safe_load(SOURCES["topic_to_data"] / f"{scene_id}.json")
    if t2d is None:
        return None
    name_map = CLASS_NAMES.get(scene_id, {})
    cards = []
    top_per_topic = t2d.get("top_documents_per_topic", [])
    for k, docs in enumerate(top_per_topic):
        for d in docs[:max_per_topic]:
            cards.append({
                "doc_id": d.get("doc_id"),
                "topic_k_dominant": k,
                "theta_full": d.get("theta_full"),
                "theta_k_at_dominant": d.get("theta_k"),
                "label_id": d.get("label_id"),
                "label_name": name_map.get(int(d.get("label_id", 0)), d.get("label_name")),
                "xy": d.get("xy"),
            })
    return cards


def build_for_scene(scene_id: str) -> dict | None:
    out_dir = OUTPUT_DIR / scene_id
    out_dir.mkdir(parents=True, exist_ok=True)

    topic_cards, meta = build_topic_cards(scene_id)
    band_cards = build_band_cards(scene_id)
    document_cards = build_document_cards(scene_id)

    if topic_cards is None and band_cards is None and document_cards is None:
        return None

    written: list[str] = []
    if topic_cards is not None:
        path = out_dir / "topic_cards.json"
        with path.open("w", encoding="utf-8") as h:
            json.dump({
                "scene_id": scene_id,
                "K": meta.get("K"),
                "topic_cards": topic_cards,
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "builder_version": "build_interpretability v0.1",
            }, h, separators=(",", ":"))
        written.append(str(path.name))

    if band_cards is not None:
        path = out_dir / "band_cards.json"
        with path.open("w", encoding="utf-8") as h:
            json.dump({
                "scene_id": scene_id,
                "n_bands": len(band_cards),
                "band_cards": band_cards,
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "builder_version": "build_interpretability v0.1",
            }, h, separators=(",", ":"))
        written.append(str(path.name))

    if document_cards is not None:
        path = out_dir / "document_cards.json"
        with path.open("w", encoding="utf-8") as h:
            json.dump({
                "scene_id": scene_id,
                "n_documents": len(document_cards),
                "document_cards": document_cards,
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "builder_version": "build_interpretability v0.1",
            }, h, separators=(",", ":"))
        written.append(str(path.name))

    return {
        "scene_id": scene_id,
        "files_written": written,
        "topic_count": meta.get("K"),
        "n_band_cards": len(band_cards) if band_cards else 0,
        "n_document_cards": len(document_cards) if document_cards else 0,
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[interpretability] {scene_id} ...", flush=True)
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
        print(
            f"  K={payload['topic_count']} band_cards={payload['n_band_cards']} "
            f"doc_cards={payload['n_document_cards']} -> {payload['files_written']}",
            flush=True,
        )
        written += 1
    print(f"[interpretability] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
