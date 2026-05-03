"""B-4 Mutual information: theta vs label and theta vs measurement.

Master plan Addendum B Axis D (information-theoretic).

For each labelled scene, compute MI(theta; label) and conditional
entropy H(label | theta) using the topic mixture theta as features.
For HIDSAG subsets, do the same for measurements (continuous targets)
using `mutual_info_regression`. Compare against MI(PCA-K; label) and
MI(NMF-K; label) at the same K to give the "theta vs other K-dim
compressions" fair-baseline reading on the information-theoretic axis.

Output:
  data/derived/mutual_information/<scene>.json
  data/derived/mutual_information/hidsag/<subset>.json (when DMR fit
                                                       available)
"""
from __future__ import annotations

import json
import math
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.feature_selection import mutual_info_classif, mutual_info_regression

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
LOCAL_REP_DIR = DATA_DIR / "local" / "representations"
LOCAL_DMR_DIR = DATA_DIR / "local" / "topic_variants" / "dmr_lda_hidsag"
HIDSAG_CURATED_PATH = DERIVED_DIR / "core" / "hidsag_curated_subset.json"
DERIVED_OUT_DIR = DERIVED_DIR / "mutual_information"
DERIVED_HIDSAG_DIR = DERIVED_OUT_DIR / "hidsag"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RANDOM_STATE = 42


def label_entropy(y: np.ndarray) -> float:
    """Shannon entropy H(Y) in nats."""
    _, counts = np.unique(y, return_counts=True)
    p = counts / counts.sum()
    return float(-np.sum(p * np.log(np.clip(p, 1e-12, None))))


def total_mi_classif(X: np.ndarray, y: np.ndarray) -> dict:
    """Per-feature MI vs label, plus joint estimate via sum-then-clip
    against the label entropy."""
    per_feat = mutual_info_classif(X, y, random_state=RANDOM_STATE)
    H_y = label_entropy(y)
    sum_mi = float(per_feat.sum())
    # Joint MI is bounded above by H(Y); per-feature sum overestimates.
    joint_proxy = min(sum_mi, H_y)
    return {
        "label_entropy_nats": round(float(H_y), 6),
        "per_feature_mi_sum_nats": round(sum_mi, 6),
        "joint_mi_clipped_to_label_entropy": round(joint_proxy, 6),
        "conditional_entropy_proxy_H_y_given_x": round(max(H_y - joint_proxy, 0.0), 6),
        "per_feature_mi": [round(float(v), 6) for v in per_feat.tolist()],
    }


def total_mi_regress(X: np.ndarray, y: np.ndarray) -> dict:
    per_feat = mutual_info_regression(X, y, random_state=RANDOM_STATE)
    return {
        "per_feature_mi_sum_nats": round(float(per_feat.sum()), 6),
        "per_feature_mi_max": round(float(per_feat.max()), 6) if per_feat.size else 0.0,
        "per_feature_mi": [round(float(v), 6) for v in per_feat.tolist()],
    }


def load_features(method: str, scene_id: str) -> np.ndarray | None:
    path = LOCAL_REP_DIR / method / scene_id / "features.npy"
    if not path.exists():
        return None
    return np.load(path)


def build_for_labelled_scene(scene_id: str) -> dict | None:
    if not has_labels(scene_id):
        return None
    fit_dir = LOCAL_FIT_DIR / scene_id
    if not (fit_dir / "theta.npy").exists():
        return None
    theta = np.load(fit_dir / "theta.npy")
    sample_labels = np.load(fit_dir / "sample_labels.npy")
    if theta.shape[0] != sample_labels.shape[0]:
        return None

    method_results: dict[str, dict] = {
        "theta": total_mi_classif(theta, sample_labels)
    }
    method_results["theta"]["latent_dim"] = int(theta.shape[1])

    for method_dir in sorted(p.name for p in LOCAL_REP_DIR.iterdir() if p.is_dir()):
        feats = load_features(method_dir, scene_id)
        if feats is None or feats.shape[0] != sample_labels.shape[0]:
            continue
        try:
            res = total_mi_classif(feats, sample_labels)
            res["latent_dim"] = int(feats.shape[1])
            method_results[method_dir] = res
        except Exception:
            pass

    # Headline ranking by joint_mi_clipped
    ranking = sorted(
        [(m, v) for m, v in method_results.items()],
        key=lambda kv: kv[1]["joint_mi_clipped_to_label_entropy"],
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "topic_count": int(theta.shape[1]),
        "n_documents": int(sample_labels.size),
        "label_entropy_nats": method_results["theta"]["label_entropy_nats"],
        "label_entropy_bits": round(method_results["theta"]["label_entropy_nats"] / math.log(2), 6),
        "method_mi": method_results,
        "ranking_by_joint_mi": [
            {
                "method": m,
                "latent_dim": v["latent_dim"],
                "joint_mi_clipped": v["joint_mi_clipped_to_label_entropy"],
                "fraction_of_label_entropy_recovered": round(
                    v["joint_mi_clipped_to_label_entropy"]
                    / max(v["label_entropy_nats"], 1e-12),
                    6,
                ),
            }
            for m, v in ranking
        ],
        "framework_axis": "B-4 (master plan Addendum B Axis D): MI(theta; label) vs MI(other K-dim compressions; label)",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_mutual_information v0.1",
    }


def build_for_hidsag_subset(curated: dict, subset_code: str) -> dict | None:
    """For each HIDSAG subset where DMR-LDA fitted, compute
    MI(theta; numeric_target) for every numeric variable."""
    fit_dir = LOCAL_DMR_DIR / subset_code
    theta_path = fit_dir / "theta.npy"
    vocab_path = fit_dir / "vocab.json"
    if not theta_path.exists() or not vocab_path.exists():
        return None
    theta = np.load(theta_path)
    vocab = json.load(vocab_path.open("r", encoding="utf-8"))
    doc_names: list[str] = vocab.get("doc_names", []) or []
    sample_names: list[str] = vocab.get("sample_names", []) or []

    # Find the subset
    subset = next((s for s in curated.get("subsets", []) if s.get("subset_code") == subset_code), None)
    if subset is None:
        return None

    # Build sample_id -> targets map
    sample_targets: dict[str, dict] = {}
    for sample in subset.get("samples", []) or []:
        sid = sample.get("sample_name") or sample.get("datarecord")
        if sid is None:
            continue
        t = sample.get("targets") or {}
        if isinstance(t, dict):
            sample_targets[str(sid)] = {k: float(v) for k, v in t.items() if isinstance(v, (int, float))}

    var_names = subset.get("numeric_variable_names", []) or []
    if not var_names or not sample_targets:
        return None

    # Build a (D, V_target) matrix by aligning theta rows (per-cube)
    # with the parent sample's targets
    D = theta.shape[0]
    if D != len(sample_names):
        return None

    # Per-target MI vs theta
    target_mi = {}
    for target in var_names:
        y = np.array(
            [sample_targets.get(str(sn), {}).get(target, np.nan) for sn in sample_names],
            dtype=np.float64,
        )
        mask = np.isfinite(y)
        if mask.sum() < 5 or np.std(y[mask]) < 1e-9:
            continue
        try:
            res = total_mi_regress(theta[mask], y[mask])
            res["n_observed"] = int(mask.sum())
            target_mi[target] = res
        except Exception:
            pass

    return {
        "subset_code": subset_code,
        "topic_count": int(theta.shape[1]),
        "document_count": int(D),
        "covariates_in_dmr": vocab.get("covariates"),
        "target_mi_against_theta": target_mi,
        "ranking_by_max_mi": sorted(
            [
                {"target": t, "max_topic_mi": v["per_feature_mi_max"], "n_observed": v["n_observed"]}
                for t, v in target_mi.items()
            ],
            key=lambda kv: kv["max_topic_mi"],
            reverse=True,
        )[:10],
        "framework_axis": "B-4 (master plan Addendum B Axis D): MI(theta; HIDSAG measurement)",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_mutual_information v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    DERIVED_HIDSAG_DIR.mkdir(parents=True, exist_ok=True)
    written = 0

    # Labelled scenes
    for scene_id in LABELLED_SCENES:
        print(f"[mi] {scene_id} ...", flush=True)
        try:
            payload = build_for_labelled_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            continue
        if payload is None:
            print("  skipped", flush=True)
            continue
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        ranking = payload["ranking_by_joint_mi"]
        for r in ranking[:4]:
            print(
                f"  {r['method']:13s} dim={r['latent_dim']:3d}  "
                f"MI_joint={r['joint_mi_clipped']:.3f}  "
                f"frac_H_y={r['fraction_of_label_entropy_recovered']:.3f}",
                flush=True,
            )
        written += 1

    # HIDSAG subsets via DMR-LDA
    if HIDSAG_CURATED_PATH.exists():
        curated = json.load(HIDSAG_CURATED_PATH.open("r", encoding="utf-8"))
        for code in ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"]:
            print(f"[mi] HIDSAG {code} ...", flush=True)
            try:
                payload = build_for_hidsag_subset(curated, code)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                continue
            if payload is None:
                print("  skipped", flush=True)
                continue
            out_path = DERIVED_HIDSAG_DIR / f"{code}.json"
            with out_path.open("w", encoding="utf-8") as h:
                json.dump(payload, h, separators=(",", ":"))
            top = payload["ranking_by_max_mi"][:3]
            for r in top:
                print(
                    f"  target={r['target']:15s} max_topic_MI={r['max_topic_mi']:.3f} "
                    f"n_obs={r['n_observed']}",
                    flush=True,
                )
            written += 1

    print(f"[mi] done — {written} payloads written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
