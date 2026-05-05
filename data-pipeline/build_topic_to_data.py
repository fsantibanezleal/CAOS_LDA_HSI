"""Posterior interpretation of topics in terms of observed data.

For each labelled scene this builder reads the local LDA fit produced by
build_topic_views.py (full theta D x K and the per-document pixel index
into the original cube) and computes the posterior interpretations the
master plan calls for in section 18.4:

    derived/topic_to_data/<scene>.json

Each output answers, for every topic k:

- P(label | topic = k): histogram of labels among documents whose
  argmax(theta) == k, and the same conditioning at theta_k > 0.5
- top_documents_per_topic[k]: the top-N documents by theta_k with their
  spatial coordinates, label, and theta vector
- dominant_topic_map: H x W array assigning each labelled pixel the
  argmax of its theta (-1 for unlabelled or non-sampled pixels). Stored
  as a binary uint8 sidecar in local/.

This is the single most-asked-for analysis in the master plan and the
audit's #4 gap. It replaces the previous class_topic_loadings (which
computed P(topic | class), the inverse direction).
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
from research_core.raw_scenes import SCENES, load_scene


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
LOCAL_OUT_DIR = DATA_DIR / "local" / "topic_to_data"
DERIVED_OUT_DIR = DERIVED_DIR / "topic_to_data"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
TOP_DOCS_PER_TOPIC = 50
DOMINANT_THETA_THRESHOLD = 0.5


def label_distribution(
    labels_in_topic: np.ndarray, all_labels: list[int], scene_id: str
) -> list[dict]:
    counts = {int(c): 0 for c in all_labels}
    for label in labels_in_topic:
        counts[int(label)] = counts.get(int(label), 0) + 1
    total = max(int(labels_in_topic.size), 1)
    name_map = CLASS_NAMES.get(scene_id, {})
    out = []
    for c in sorted(counts.keys()):
        n = counts[c]
        out.append({
            "label_id": int(c),
            "name": name_map.get(int(c), f"class_{int(c)}"),
            "color": class_color(int(c)),
            "count": int(n),
            "p": round(n / total, 6),
        })
    return out


def kl_divergence(p: np.ndarray, q: np.ndarray) -> float:
    """KL(p || q) in nats, both must be probability vectors of same length."""
    p_safe = np.clip(p, 1e-12, None)
    q_safe = np.clip(q, 1e-12, None)
    return float(np.sum(p_safe * np.log(p_safe / q_safe)))


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    fit_dir = LOCAL_FIT_DIR / scene_id
    theta_path = fit_dir / "theta.npy"
    if not theta_path.exists():
        print(f"  no fit at {fit_dir} — run build_topic_views.py first", flush=True)
        return None

    theta = np.load(theta_path)  # [D, K]
    sample_pixel_indices = np.load(fit_dir / "sample_pixel_indices.npy")
    sample_labels = np.load(fit_dir / "sample_labels.npy")

    cube, gt, config = load_scene(scene_id)
    h, w, _ = cube.shape

    D, K = theta.shape
    dominant = np.argmax(theta, axis=1)
    confidence = np.max(theta, axis=1)

    all_labels = sorted({int(c) for c in CLASS_NAMES[scene_id].keys()} | {int(c) for c in np.unique(sample_labels)})
    name_map = CLASS_NAMES.get(scene_id, {})

    # Empirical P(label) — the prior over labels in this corpus
    p_label_prior_counts = np.zeros(max(all_labels) + 1, dtype=np.int64)
    for lbl in sample_labels:
        p_label_prior_counts[int(lbl)] += 1
    p_label_prior = p_label_prior_counts / max(p_label_prior_counts.sum(), 1)

    p_label_given_topic_dominant: list[list[dict]] = []
    p_label_given_topic_strict: list[list[dict]] = []
    kl_to_prior_dominant: list[float] = []
    top_docs_per_topic: list[list[dict]] = []
    docs_per_topic_count_dominant: list[int] = []
    docs_per_topic_count_strict: list[int] = []

    for k in range(K):
        # Dominant: argmax(theta) == k
        mask_dominant = dominant == k
        labels_dom = sample_labels[mask_dominant]
        dist_dom = label_distribution(labels_dom, all_labels, scene_id)
        p_label_given_topic_dominant.append(dist_dom)
        docs_per_topic_count_dominant.append(int(mask_dominant.sum()))

        # Strict: theta_k > tau
        mask_strict = theta[:, k] > DOMINANT_THETA_THRESHOLD
        labels_strict = sample_labels[mask_strict]
        dist_strict = label_distribution(labels_strict, all_labels, scene_id)
        p_label_given_topic_strict.append(dist_strict)
        docs_per_topic_count_strict.append(int(mask_strict.sum()))

        # KL(P(label|topic=k) || P(label)) — how much does the label distribution
        # for this topic deviate from the prior? Higher = more discriminative.
        if labels_dom.size > 0:
            p_post = np.array([entry["p"] for entry in dist_dom])
            label_ids_in_dist = [entry["label_id"] for entry in dist_dom]
            p_prior_aligned = p_label_prior[label_ids_in_dist]
            kl = kl_divergence(p_post, p_prior_aligned)
        else:
            kl = 0.0
        kl_to_prior_dominant.append(round(kl, 6))

        # Top documents by theta_k
        order = np.argsort(theta[:, k])[::-1][:TOP_DOCS_PER_TOPIC]
        docs = []
        for d_idx in order:
            pixel_idx = int(sample_pixel_indices[int(d_idx)])
            row, col = divmod(pixel_idx, w)
            docs.append({
                "doc_id": f"px_{int(row):04d}_{int(col):04d}",
                "theta_k": round(float(theta[int(d_idx), k]), 6),
                "label_id": int(sample_labels[int(d_idx)]),
                "label_name": name_map.get(int(sample_labels[int(d_idx)]), None),
                "xy": [int(row), int(col)],
                "theta_full": [round(float(v), 4) for v in theta[int(d_idx)].tolist()],
            })
        top_docs_per_topic.append(docs)

    # Dominant topic map H x W — uint8 with sentinel 255 for unlabelled / not sampled
    dominant_map = np.full(h * w, fill_value=255, dtype=np.uint8)
    for d_idx, pixel_idx in enumerate(sample_pixel_indices):
        dominant_map[int(pixel_idx)] = int(dominant[d_idx])
    dominant_map_2d = dominant_map.reshape(h, w)

    # Save dominant_topic_map both locally (legacy) and under derived/
    # so the public web app can read it via /generated/topic_to_data/.
    LOCAL_OUT_DIR.mkdir(parents=True, exist_ok=True)
    map_path = LOCAL_OUT_DIR / f"{scene_id}_dominant_topic_map.bin"
    map_path.write_bytes(dominant_map_2d.tobytes())
    derived_map_path = (
        DERIVED_DIR / "topic_to_data" / f"{scene_id}_dominant_topic_map.bin"
    )
    derived_map_path.parent.mkdir(parents=True, exist_ok=True)
    derived_map_path.write_bytes(dominant_map_2d.tobytes())

    # Theta projection 2D via PCA — useful for the document-embedding panel
    theta_centered = theta - theta.mean(axis=0, keepdims=True)
    u, s, _ = np.linalg.svd(theta_centered, full_matrices=False)
    theta_pca_2d = (u[:, :2] * s[:2])
    theta_pca_3d = (u[:, :3] * s[:3]) if K >= 3 else theta_pca_2d

    # Subsample to 2k for embedding payload size
    if D > 2000:
        rng = np.random.default_rng(42)
        sub_idx = rng.choice(D, size=2000, replace=False)
    else:
        sub_idx = np.arange(D)

    return {
        "scene_id": scene_id,
        "scene_name": config.name,
        "topic_count": int(K),
        "document_count": int(D),
        "spatial_shape": [int(h), int(w)],
        "p_label_given_topic_dominant": p_label_given_topic_dominant,
        "p_label_given_topic_strict_theta_gt_0_5": p_label_given_topic_strict,
        "docs_per_topic_dominant": docs_per_topic_count_dominant,
        "docs_per_topic_strict": docs_per_topic_count_strict,
        "kl_to_label_prior_per_topic": kl_to_prior_dominant,
        "top_documents_per_topic": top_docs_per_topic,
        "dominant_topic_map": {
            "format": "binary_uint8",
            "shape": [int(h), int(w)],
            "sentinel_unlabelled": 255,
            "path": str(map_path.relative_to(ROOT)).replace("\\", "/"),
            "served_path": str(derived_map_path.relative_to(ROOT)).replace("\\", "/"),
        },
        "theta_embedding_pca_2d": [
            {
                "doc_id": int(i),
                "x": round(float(theta_pca_2d[int(i), 0]), 6),
                "y": round(float(theta_pca_2d[int(i), 1]), 6),
                "label_id": int(sample_labels[int(i)]),
                "dominant_topic_k": int(dominant[int(i)]),
                "confidence": round(float(confidence[int(i)]), 4),
            }
            for i in sub_idx
        ],
        "theta_embedding_pca_3d": [
            {
                "doc_id": int(i),
                "x": round(float(theta_pca_3d[int(i), 0]), 6),
                "y": round(float(theta_pca_3d[int(i), 1]), 6),
                "z": round(float(theta_pca_3d[int(i), 2]), 6) if K >= 3 else 0.0,
                "label_id": int(sample_labels[int(i)]),
                "dominant_topic_k": int(dominant[int(i)]),
                "confidence": round(float(confidence[int(i)]), 4),
            }
            for i in sub_idx
        ],
        "theta_embedding_explained_variance": [round(float(v), 6) for v in (s[:3] ** 2 / (s ** 2).sum()).tolist()],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_to_data v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[topic_to_data] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print(f"  skipped", flush=True)
            continue
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        # Show a peek at the highest-KL topic so the user can immediately see
        # which topic best discriminates labels.
        kl_values = payload["kl_to_label_prior_per_topic"]
        best_topic_k = int(np.argmax(kl_values))
        best_kl = kl_values[best_topic_k]
        dominant_label_pct = max(
            (entry["p"] * 100 for entry in payload["p_label_given_topic_dominant"][best_topic_k]),
            default=0,
        )
        print(
            f"  K={payload['topic_count']}, D={payload['document_count']}, "
            f"best discriminative topic={best_topic_k} (KL_to_prior={best_kl:.3f}, "
            f"dominant label = {dominant_label_pct:.1f}%) -> "
            f"{out_path.relative_to(ROOT)} ({size_kb:.1f} KB)",
            flush=True,
        )
        written += 1
    print(f"[topic_to_data] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
