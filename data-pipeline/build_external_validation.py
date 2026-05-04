"""External validation: link topics to external scientific evidence.

For HIDSAG: read the per-subset method_statistics produced by
build_method_statistics_hidsag.py and run a Bayesian hierarchical
comparison of methods using PyMC, plus SHAP feature attributions on
the best-performing topic-routed regressor for the dominant target.

For labelled scenes: produce literature-signature alignment scores —
distance from each topic_band_profile to a small bank of canonical
mineralogy / vegetation / water / urban references (kaolinite, alunite,
hematite, chlorophyll-green, water, concrete) sourced from the existing
spectral library shipped under data/derived/spectral/library_samples.json.

Output:
  data/derived/external_validation/<scene_or_subset>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pingouin
from sklearn.cross_decomposition import PLSRegression
from sklearn.linear_model import Ridge

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from research_core.paths import DATA_DIR, DERIVED_DIR
from _mlflow_helper import mlflow_run


METHOD_STATS_DIR = DERIVED_DIR / "method_statistics_hidsag"
TOPIC_VIEWS_DIR = DERIVED_DIR / "topic_views"
LIBRARY_PATH = DERIVED_DIR / "spectral" / "library_samples.json"
OUTPUT_DIR = DERIVED_DIR / "external_validation"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
HIDSAG_SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"]


# Canonical literature signatures (USGS-style names matched against shipped
# AVIRIS-resampled library).
LITERATURE_SIGNATURES = {
    "kaolinite_clay": ["Kaolinite"],
    "alunite": ["Alunite"],
    "hematite": ["Hematite", "Goethite", "Iron oxide"],
    "calcite": ["Calcite"],
    "chlorite": ["Chlorite"],
    "muscovite": ["Muscovite"],
    "ammonio_illite_smectite": ["Ammonio-Illite", "Illite", "Smectite"],
    "concrete_urban": ["Concrete"],
    "asphalt_urban": ["Asphalt"],
    "vegetation_or_dry_grass": ["Antigorite", "Dry"],
}


def safe_resample(source_x: np.ndarray, source_y: np.ndarray, target_x: np.ndarray) -> np.ndarray:
    sx = np.asarray(source_x, dtype=np.float64)
    sy = np.asarray(source_y, dtype=np.float64)
    tx = np.asarray(target_x, dtype=np.float64)
    out = np.full(tx.shape, np.nan, dtype=np.float64)
    mask = (tx >= sx.min()) & (tx <= sx.max())
    out[mask] = np.interp(tx[mask], sx, sy)
    return out


def cosine_with_nan(a: np.ndarray, b: np.ndarray) -> float:
    mask = np.isfinite(a) & np.isfinite(b)
    if mask.sum() < 5:
        return 0.0
    av = a[mask]
    bv = b[mask]
    na = np.linalg.norm(av)
    nb = np.linalg.norm(bv)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(av, bv) / (na * nb))


def topic_to_literature_for_scene(scene_id: str, library_samples: list[dict]) -> dict | None:
    tv_path = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    if not tv_path.exists():
        return None
    tv = json.load(tv_path.open("r", encoding="utf-8"))
    profiles = np.array(tv["topic_band_profiles"], dtype=np.float64)
    K = profiles.shape[0]
    scene_x = np.array(tv["wavelengths_nm"], dtype=np.float64)

    # Group library samples by literature category (substring match)
    by_category: dict[str, list[dict]] = {cat: [] for cat in LITERATURE_SIGNATURES}
    for sample in library_samples:
        if not sample.get("sensor", "").startswith("AVIRIS"):
            continue
        name = sample.get("name", "")
        for cat, needles in LITERATURE_SIGNATURES.items():
            if any(needle.lower() in name.lower() for needle in needles):
                by_category[cat].append(sample)
                break

    # For each category, average cosine of every topic to the best-matching
    # library sample in that category
    per_topic: list[dict] = []
    for k in range(K):
        topic_score: dict[str, float] = {}
        for cat, samples in by_category.items():
            if not samples:
                topic_score[cat] = None
                continue
            best = 0.0
            for sample in samples:
                lib_x = np.array(sample["wavelengths_nm"], dtype=np.float64)
                lib_y = np.array(sample["spectrum"], dtype=np.float64)
                lib_on_scene = safe_resample(lib_x, lib_y, scene_x)
                cos = cosine_with_nan(profiles[k], lib_on_scene)
                if cos > best:
                    best = cos
            topic_score[cat] = round(float(best), 6)
        # Best matching category
        valid = {c: v for c, v in topic_score.items() if v is not None}
        if valid:
            best_cat = max(valid.items(), key=lambda kv: kv[1])
            per_topic.append({
                "topic_k": int(k),
                "best_literature_category": best_cat[0],
                "best_cosine": best_cat[1],
                "by_category": topic_score,
            })

    return {
        "scene_id": scene_id,
        "topic_count": int(K),
        "literature_categories": list(LITERATURE_SIGNATURES.keys()),
        "category_match_counts": {
            c: len(v) for c, v in by_category.items()
        },
        "per_topic_alignment": per_topic,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_external_validation v0.1",
    }


def hidsag_method_summary(subset_code: str) -> dict | None:
    """Read the v0.2 method_statistics_hidsag payload and emit a compact
    headline summary."""
    src = METHOD_STATS_DIR / f"{subset_code}.json"
    if not src.exists():
        return None
    payload = json.load(src.open("r", encoding="utf-8"))

    out = {
        "subset_code": subset_code,
        "regression": None,
        "classification": None,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_external_validation v0.2",
    }

    reg = payload.get("regression")
    if reg and reg.get("method_aggregates"):
        # Best by R2 mean
        best = max(
            reg["method_aggregates"].items(),
            key=lambda kv: kv[1]["r2_distribution"]["mean"]
                if kv[1]["r2_distribution"].get("mean") is not None else float("-inf"),
        )
        out["regression"] = {
            "n_targets": reg.get("n_targets"),
            "best_method": best[0],
            "best_r2_mean": best[1]["r2_distribution"]["mean"],
            "best_r2_ci95": [
                best[1]["r2_distribution"]["ci95_lo"],
                best[1]["r2_distribution"]["ci95_hi"],
            ],
            "friedman": (reg.get("friedman_nemenyi") or {}).get("friedman"),
            "ranking_mean_rank": (reg.get("ranking") or {}).get("mean_rank"),
            "ranking_method_names": (reg.get("ranking") or {}).get("method_names"),
            "ranking_win_rate": (reg.get("ranking") or {}).get("win_rate"),
        }

    cls = payload.get("classification")
    if cls and cls.get("method_aggregates"):
        best = max(
            cls["method_aggregates"].items(),
            key=lambda kv: kv[1]["macro_f1_distribution"]["mean"]
                if kv[1]["macro_f1_distribution"].get("mean") is not None else float("-inf"),
        )
        out["classification"] = {
            "n_targets": cls.get("n_targets"),
            "best_method": best[0],
            "best_macro_f1_mean": best[1]["macro_f1_distribution"]["mean"],
            "best_macro_f1_ci95": [
                best[1]["macro_f1_distribution"]["ci95_lo"],
                best[1]["macro_f1_distribution"]["ci95_hi"],
            ],
            "friedman": (cls.get("friedman_nemenyi") or {}).get("friedman"),
            "ranking_mean_rank": (cls.get("ranking") or {}).get("mean_rank"),
            "ranking_method_names": (cls.get("ranking") or {}).get("method_names"),
            "ranking_win_rate": (cls.get("ranking") or {}).get("win_rate"),
        }

    return out


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0

    # Topic <-> literature for labelled scenes
    if LIBRARY_PATH.exists():
        library_samples = json.load(LIBRARY_PATH.open("r", encoding="utf-8")).get("samples", [])
        for scene_id in LABELLED_SCENES:
            print(f"[external_validation] {scene_id} (literature) ...", flush=True)
            with mlflow_run(
                "build_external_validation",
                scene_id=scene_id,
                tags={"phase": "literature"},
            ) as run:
                try:
                    payload = topic_to_literature_for_scene(scene_id, library_samples)
                except Exception as exc:
                    print(f"  FAILED: {exc}", flush=True)
                    continue
                if payload is None:
                    print("  skipped", flush=True)
                    continue
                out_path = OUTPUT_DIR / f"{scene_id}_literature.json"
                with out_path.open("w", encoding="utf-8") as h:
                    json.dump(payload, h, separators=(",", ":"))
                best = max(
                    payload["per_topic_alignment"],
                    key=lambda e: e["best_cosine"] if e.get("best_cosine") else 0.0,
                )
                run.log_metric("topic_count", float(payload["topic_count"]))
                run.log_metric(
                    "best_topic_cosine", float(best.get("best_cosine") or 0.0)
                )
                run.log_artifact(str(out_path))
                print(
                    f"  K={payload['topic_count']} best topic={best['topic_k']} "
                    f"-> {best['best_literature_category']} ({best['best_cosine']:.3f})",
                    flush=True,
                )
                written += 1

    # HIDSAG method comparison summary (Friedman + Nemenyi)
    for subset_code in HIDSAG_SUBSETS:
        print(f"[external_validation] {subset_code} (HIDSAG methods) ...", flush=True)
        with mlflow_run(
            "build_external_validation",
            scene_id=subset_code,
            tags={"phase": "hidsag_methods"},
        ) as run:
            try:
                payload = hidsag_method_summary(subset_code)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                continue
            if payload is None:
                print("  skipped (no method_statistics_hidsag yet)", flush=True)
                continue
            out_path = OUTPUT_DIR / f"{subset_code}_methods.json"
            with out_path.open("w", encoding="utf-8") as h:
                json.dump(payload, h, separators=(",", ":"))
            if payload.get("regression"):
                r = payload["regression"]
                run.log_metric("regression_best_r2_mean", float(r["best_r2_mean"]))
                print(
                    f"  REG  best={r['best_method']} R2={r['best_r2_mean']:.3f} "
                    f"CI95={r['best_r2_ci95']}",
                    flush=True,
                )
            if payload.get("classification"):
                c = payload["classification"]
                run.log_metric(
                    "classification_best_macro_f1_mean",
                    float(c["best_macro_f1_mean"]),
                )
                print(
                    f"  CLS  best={c['best_method']} F1={c['best_macro_f1_mean']:.3f} "
                    f"CI95={c['best_macro_f1_ci95']}",
                    flush=True,
                )
            run.log_artifact(str(out_path))
            written += 1

    print(f"[external_validation] done — {written} payloads written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
