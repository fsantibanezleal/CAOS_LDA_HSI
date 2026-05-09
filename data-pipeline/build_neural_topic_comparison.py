"""Cross-method comparison of LDA / ProdLDA / ETM topic mixtures.

Loads each variant's theta from data/local/* and the canonical LDA
sample labels (data/local/lda_fits/<scene>/sample_labels.npy), then
computes a battery of downstream metrics directly comparable across
methods:

  - KMeans(theta, K=n_classes) ARI / NMI vs ground-truth labels
  - silhouette score per method
  - per-method posterior mean of theta entropy (concentration)

Writes a per-scene JSON at:
  data/derived/neural_topic_comparison/<scene>.json

This closes the cycle-59 ETM gap: cycle 59 added the ETM topic
variant alongside ProdLDA, but the three topic models (LDA topic
fits, ProdLDA, ETM) had no head-to-head comparison file. Now the
Benchmarks UI can render a single table answering "which neural
variant produces the most class-discriminative theta?"
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    normalized_mutual_info_score,
    silhouette_score,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR

warnings.filterwarnings("ignore")

SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

OUTPUT_DIR = DERIVED_DIR / "neural_topic_comparison"


def _kmeans_metrics(theta: np.ndarray, labels: np.ndarray) -> dict:
    n_classes = int(np.unique(labels).size)
    if n_classes < 2:
        return {"ari": 0.0, "nmi": 0.0, "silhouette": 0.0, "n_classes": n_classes}
    try:
        km = KMeans(n_clusters=n_classes, n_init=10, random_state=42).fit(theta)
        sil = float(silhouette_score(theta, km.labels_)) if theta.shape[0] > n_classes else 0.0
        return {
            "ari": round(float(adjusted_rand_score(labels, km.labels_)), 6),
            "nmi": round(float(normalized_mutual_info_score(labels, km.labels_)), 6),
            "silhouette": round(sil, 6),
            "n_classes": n_classes,
        }
    except Exception as exc:  # pragma: no cover
        return {"ari": 0.0, "nmi": 0.0, "silhouette": 0.0, "n_classes": n_classes, "error": str(exc)}


def _entropy_summary(theta: np.ndarray) -> dict:
    eps = 1e-12
    p = np.clip(theta, eps, 1.0)
    p = p / p.sum(axis=-1, keepdims=True)
    h = -(p * np.log(p)).sum(axis=-1)
    K = theta.shape[1]
    h_max = float(np.log(K))
    return {
        "K": int(K),
        "max_entropy_uniform": round(h_max, 6),
        "doc_entropy_mean": round(float(h.mean()), 6),
        "doc_entropy_std": round(float(h.std()), 6),
        "doc_entropy_normalised_mean": round(float(h.mean() / h_max), 6),
    }


def build_for_scene(scene_id: str) -> dict | None:
    lda_dir = DATA_DIR / "local" / "lda_fits" / scene_id
    prodlda_dir = DATA_DIR / "local" / "topic_variants" / "prodlda" / scene_id
    etm_dir = DATA_DIR / "local" / "topic_variants" / "etm" / scene_id

    labels_path = lda_dir / "sample_labels.npy"
    if not labels_path.exists():
        return None
    labels = np.load(labels_path)

    method_paths = {
        "lda": lda_dir / "theta.npy",
        "prodlda": prodlda_dir / "theta.npy",
        "etm": etm_dir / "theta.npy",
    }

    methods: dict[str, dict] = {}
    for name, theta_path in method_paths.items():
        if not theta_path.exists():
            continue
        theta = np.load(theta_path).astype(np.float32)
        if theta.shape[0] != labels.shape[0]:
            methods[name] = {"error": f"shape mismatch: theta {theta.shape} vs labels {labels.shape}"}
            continue
        methods[name] = {
            "K": int(theta.shape[1]),
            "downstream_kmeans_vs_label": _kmeans_metrics(theta, labels),
            "theta_entropy": _entropy_summary(theta),
        }

    ranking = sorted(
        [
            (name, m["downstream_kmeans_vs_label"]["ari"])
            for name, m in methods.items()
            if "error" not in m
        ],
        key=lambda x: x[1],
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "n_documents": int(labels.shape[0]),
        "n_classes": int(np.unique(labels).size),
        "methods": methods,
        "ranking_by_ari": [{"method": n, "ari": round(float(a), 6)} for n, a in ranking],
        "framework_axis": "Cycle 61 follow-up to cycle 59 ETM addition: head-to-head LDA vs ProdLDA vs ETM clustering quality on the canonical 220-per-class stratified sample.",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_neural_topic_comparison v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in SCENES:
        print(f"[neural_tm_compare] {scene_id} ...", flush=True)
        payload = build_for_scene(scene_id)
        if not payload:
            print(f"  skipped (no LDA fit)", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        ranking = " > ".join(f"{x['method']}={x['ari']:+.3f}" for x in payload["ranking_by_ari"])
        print(f"  ranking: {ranking}", flush=True)
        written += 1
    print(f"[neural_tm_compare] done — {written} scenes written", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
