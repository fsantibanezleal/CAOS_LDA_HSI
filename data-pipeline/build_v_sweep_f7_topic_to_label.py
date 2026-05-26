"""V-sweep F-7 — topic-label coupling H(L | t) + KL across V1..V12.

Reads the local LDA fits written by build_v_sweep_canonical_fit and
the sample labels recovered via stratified_sample_indices to compute:

- ``H_L_given_topic``: conditional entropy of the label distribution
  given the argmax topic. Lower is better (topics align to labels).
- ``H_L_marginal``: entropy of the label marginal, for normalisation.
- ``mutual_information``: H(L) - H(L | t).
- ``kl_label_distribution_per_topic``: KL(P(L | t) || P(L)) per topic,
  measuring how peaked each topic's label distribution is relative to
  the global marginal.

These are computed at theta-argmax assignment. A future extension can
weight by theta_k explicitly.

Output: data/derived/v_sweep/f7_topic_to_label/{scene}_{V}_{scheme}_Q{q}.json

Tracks issue #609 (Cycle 4) under master #606.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
F7_DERIVED = DERIVED_DIR / "v_sweep" / "f7_topic_to_label"
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
EPS = 1e-12


def sample_labels_for_scene(scene_id: str) -> np.ndarray | None:
    """Re-derive the same labels used to build the corpus."""
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    labels = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    return labels[sample_idx_local]


def entropy(p: np.ndarray) -> float:
    p = np.clip(p, EPS, None)
    p = p / p.sum()
    return float(-np.sum(p * np.log2(p)))


def kl(p: np.ndarray, q: np.ndarray) -> float:
    p = np.clip(p, EPS, None)
    q = np.clip(q, EPS, None)
    return float(np.sum(p * np.log2(p / q)))


def compute_for_fit(theta_path: Path, labels: np.ndarray) -> dict | None:
    theta = np.load(theta_path)
    if theta.shape[0] != labels.shape[0]:
        return None
    K = theta.shape[1]
    z = np.argmax(theta, axis=1)
    classes = np.array(sorted(int(c) for c in np.unique(labels)))
    C = classes.size
    cls_index = {c: i for i, c in enumerate(classes.tolist())}
    label_idx = np.array([cls_index[int(c)] for c in labels])

    # Marginal label distribution
    p_label = np.bincount(label_idx, minlength=C).astype(np.float64)
    p_label /= max(p_label.sum(), EPS)
    H_label = entropy(p_label)

    # Conditional H(L | t) and per-topic KL
    H_cond_terms: list[float] = []
    kl_per_topic = []
    p_topic = np.bincount(z, minlength=K).astype(np.float64)
    p_topic /= max(p_topic.sum(), EPS)
    for k in range(K):
        mask = z == k
        n_k = int(mask.sum())
        if n_k == 0:
            kl_per_topic.append({"topic": k, "n_docs": 0,
                                 "label_distribution": None, "kl_vs_marginal": None})
            continue
        p_l_given_t = np.bincount(label_idx[mask], minlength=C).astype(np.float64)
        p_l_given_t /= p_l_given_t.sum()
        H_cond_terms.append(p_topic[k] * entropy(p_l_given_t))
        kl_per_topic.append({
            "topic": k,
            "n_docs": n_k,
            "p_topic": round(float(p_topic[k]), 6),
            "label_distribution": [round(float(x), 6) for x in p_l_given_t.tolist()],
            "kl_vs_marginal": round(kl(p_l_given_t, p_label), 6),
        })

    H_cond = float(np.sum(H_cond_terms))
    mi = H_label - H_cond
    normalised_mi = mi / max(H_label, EPS)
    return {
        "K": int(K),
        "n_classes": int(C),
        "classes": [int(c) for c in classes.tolist()],
        "H_label_marginal_bits": round(H_label, 6),
        "H_label_given_topic_bits": round(H_cond, 6),
        "mutual_information_bits": round(mi, 6),
        "normalised_mi": round(normalised_mi, 6),
        "per_topic": kl_per_topic,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-7 topic-to-label.")
    parser.add_argument("--scenes", nargs="+", default=None)
    parser.add_argument("--recipes", nargs="+", default=None)
    parser.add_argument("--scheme", default="uniform")
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()

    F7_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0

    label_cache: dict[str, np.ndarray] = {}
    for fit_dir in sorted(SWEEP_LOCAL.glob("*")):
        stem = fit_dir.name
        parts = stem.rsplit("_", 2)
        if len(parts) != 3 or not parts[2].startswith("Q"):
            continue
        try:
            q = int(parts[2][1:])
        except ValueError:
            continue
        scheme = parts[1]
        prefix = parts[0]
        sr = prefix.rsplit("_", 1)
        if len(sr) != 2:
            continue
        scene_id, recipe = sr
        if args.scenes and scene_id not in args.scenes:
            continue
        if args.recipes and recipe not in args.recipes:
            continue
        if args.scheme and scheme != args.scheme:
            continue
        if args.q and q != args.q:
            continue

        if scene_id not in label_cache:
            labels = sample_labels_for_scene(scene_id)
            if labels is None:
                continue
            label_cache[scene_id] = labels
        labels = label_cache[scene_id]

        theta_path = fit_dir / "theta.npy"
        if not theta_path.exists():
            n_skip += 1
            continue
        try:
            result = compute_for_fit(theta_path, labels)
        except Exception as exc:
            print(f"[f7] {stem} FAILED: {exc}", flush=True)
            n_skip += 1
            continue
        if result is None:
            n_skip += 1
            continue

        result.update({
            "scene_id": scene_id,
            "recipe": recipe,
            "scheme": scheme,
            "Q": q,
            "generated_at": datetime.now(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z"),
            "builder": "build_v_sweep_f7_topic_to_label v0.1",
        })
        out_path = F7_DERIVED / f"{scene_id}_{recipe}_{scheme}_Q{q}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(result, h, indent=2)
        n_ok += 1
        print(
            f"[f7] {scene_id} {recipe} K={result['K']} "
            f"H(L)={result['H_label_marginal_bits']:.3f} "
            f"H(L|t)={result['H_label_given_topic_bits']:.3f} "
            f"NMI={result['normalised_mi']:.3f}",
            flush=True,
        )
    print(f"[f7] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
