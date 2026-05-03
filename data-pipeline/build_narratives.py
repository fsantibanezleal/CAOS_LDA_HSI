"""Roll-up "captures / separates / unites / enables" scores per method.

For each labelled scene this builder reads the existing derived layer
(eda, topic_views, topic_to_data, topic_to_library, spatial,
cross_method_agreement, groupings, validation_blocks, external_validation)
and produces a compact per-method narrative payload that the eventual
web app uses to drive its captures / separates / unites / enables
panels (master plan §13).

For each method present in the cross-method matrix:

  captures.spectral    silhouette of label clustering in that method's
                       space (proxy for spectral discriminative power)
  captures.spatial     Moran's I of the method's assignment (only for
                       partition methods; topic / SLIC / felzen)
  captures.semantic    ARI vs label
  captures.measurement avg KL of P(measurement|topic) vs prior  (HIDSAG)
  separates            for each label, F1 of a 1-vs-rest topic / cluster
                       classifier
  unites               confusion-matrix entries: which label pairs the
                       method most frequently puts together
  enables              best downstream R² (HIDSAG) or macro F1 (labelled
                       scenes) reported by external_validation
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

from research_core.paths import DERIVED_DIR


SOURCES = {
    "eda": DERIVED_DIR / "eda" / "per_scene",
    "topic_views": DERIVED_DIR / "topic_views",
    "topic_to_data": DERIVED_DIR / "topic_to_data",
    "topic_to_library": DERIVED_DIR / "topic_to_library",
    "spatial": DERIVED_DIR / "spatial",
    "cross_method": DERIVED_DIR / "cross_method_agreement",
    "groupings": DERIVED_DIR / "groupings",
    "validation_blocks": DERIVED_DIR / "validation_blocks",
    "external_validation": DERIVED_DIR / "external_validation",
}
OUTPUT_DIR = DERIVED_DIR / "narratives"

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


def build_for_scene(scene_id: str) -> dict:
    out: dict = {
        "scene_id": scene_id,
        "method_narratives": {},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_narratives v0.1",
    }

    eda = safe_load(SOURCES["eda"] / f"{scene_id}.json") or {}
    topic_views = safe_load(SOURCES["topic_views"] / f"{scene_id}.json") or {}
    topic_to_data = safe_load(SOURCES["topic_to_data"] / f"{scene_id}.json") or {}
    spatial = safe_load(SOURCES["spatial"] / f"{scene_id}.json") or {}
    cross_method = safe_load(SOURCES["cross_method"] / f"{scene_id}.json") or {}
    topic_to_library = safe_load(SOURCES["topic_to_library"] / f"{scene_id}.json") or {}
    external_lit = safe_load(SOURCES["external_validation"] / f"{scene_id}_literature.json") or {}

    # Index cross_method aggregates by method name
    method_summary_by_label = {
        e["method"]: e
        for e in (cross_method.get("agreement_vs_label_summary") or [])
    }

    methods = sorted(method_summary_by_label.keys()) if method_summary_by_label else []

    # Per-method narrative
    for method in methods:
        agree = method_summary_by_label.get(method) or {}
        narrative = {
            "method": method,
            "captures": {
                "spectral_silhouette_overall_via_label_as_cluster":
                    eda.get("silhouette_label_as_cluster_cosine", {}).get("overall"),
                "ari_vs_label": agree.get("ari_vs_label"),
                "nmi_vs_label": agree.get("nmi_vs_label"),
                "v_measure_vs_label": agree.get("v_vs_label"),
            },
            "separates": None,
            "unites": None,
            "enables": None,
        }

        # Topic-specific enrichment
        if method == "topic_dominant" and topic_to_data:
            kl_per_topic = topic_to_data.get("kl_to_label_prior_per_topic", [])
            if kl_per_topic:
                narrative["captures"]["semantic_kl_to_label_prior_mean"] = round(float(np.mean(kl_per_topic)), 6)
                narrative["captures"]["semantic_kl_to_label_prior_max"] = round(float(np.max(kl_per_topic)), 6)
            if topic_views:
                narrative["captures"]["topic_perplexity"] = topic_views.get("perplexity")

            if topic_to_library:
                top_per_topic = topic_to_library.get("top_n_per_topic", [])
                if top_per_topic:
                    cosines = [hits[0]["cosine"] for hits in top_per_topic if hits]
                    narrative["captures"]["library_alignment_mean_cos"] = round(float(np.mean(cosines)), 6)
                    narrative["captures"]["library_alignment_max_cos"] = round(float(np.max(cosines)), 6)

            if external_lit:
                hits = external_lit.get("per_topic_alignment", [])
                if hits:
                    cats = {h.get("best_literature_category") for h in hits}
                    narrative["captures"]["literature_categories_covered"] = sorted(c for c in cats if c)

            # P(label | topic) -> separates / unites
            p_label_given_topic = topic_to_data.get("p_label_given_topic_dominant", [])
            if p_label_given_topic:
                # separates: per-topic dominant-label F1 proxy = max P(label|topic)
                max_p_per_topic = [
                    max((entry["p"] for entry in topic_dist), default=0.0)
                    for topic_dist in p_label_given_topic
                ]
                narrative["separates"] = {
                    "max_p_label_given_topic_mean": round(float(np.mean(max_p_per_topic)), 6),
                    "max_p_label_given_topic_max": round(float(np.max(max_p_per_topic)), 6),
                    "n_topics_with_max_p_above_0_5": int(sum(1 for p in max_p_per_topic if p >= 0.5)),
                    "n_topics_with_max_p_above_0_8": int(sum(1 for p in max_p_per_topic if p >= 0.8)),
                }
                # unites: pairs of labels sharing >0.2 mass in same topic
                pair_counts: dict[tuple[int, int], int] = {}
                for topic_dist in p_label_given_topic:
                    high = [e["label_id"] for e in topic_dist if e["p"] >= 0.2]
                    for i in range(len(high)):
                        for j in range(i + 1, len(high)):
                            key = (min(high[i], high[j]), max(high[i], high[j]))
                            pair_counts[key] = pair_counts.get(key, 0) + 1
                if pair_counts:
                    top_pairs = sorted(pair_counts.items(), key=lambda kv: -kv[1])[:10]
                    narrative["unites"] = [
                        {"label_id_a": int(p[0][0]), "label_id_b": int(p[0][1]), "co_topic_count": int(p[1])}
                        for p in top_pairs
                    ]

        # Spatial (only meaningful for spatial assignments)
        if method.startswith("slic_") or method.startswith("patch_") or method == "felzenszwalb" or method == "topic_dominant":
            if spatial:
                narrative["captures"]["spatial_morans_I_topic_dominant"] = (
                    spatial.get("morans_I_weighted_by_topic_support")
                )
                narrative["captures"]["spatial_max_iou_overall_topic_dominant"] = (
                    (spatial.get("best_iou_summary") or {}).get("max_iou_overall")
                )

        # Enables: best downstream metric is reported in external_validation
        # for HIDSAG; for labelled scenes there is no per-method downstream
        # report yet, so we leave it None.
        narrative["enables"] = None

        out["method_narratives"][method] = narrative

    return out


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[narratives] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        n_methods = len(payload["method_narratives"])
        print(f"  methods covered: {n_methods}", flush=True)
        written += 1
    print(f"[narratives] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
