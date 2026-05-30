"""V-sweep F-17 — cross-scene transfer of topic-label coupling.

For each (V, source_scene) where the recipe has a *scene-portable*
vocabulary, fit LDA on the source, then transform every other scene's
documents with that φ and compute the F-7 NMI between argmax-topic
and label on the target.

Only V2 (q-bin band-agnostic), V10 (VNIR/SWIR/SWIR-2 = 3 groups), and
V11 (M·Q product-quantisation codes) have natively portable vocabularies
across scenes. V1/V3/V4/V5/V6/V12 use (band, bin) vocabs where the
band count depends on the sensor (200 for Indian Pines, 204 for
Salinas, 103 for Pavia U, …) and a fair transfer requires resampling
to a common grid; that extension is deferred.

Output: data/derived/v_sweep/f17_cross_scene/{source}_to_{target}_{V}_uniform_Q8.json
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from itertools import permutations
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from sklearn.decomposition import LatentDirichletAllocation

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

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F17_DERIVED = DERIVED_DIR / "v_sweep" / "f17_cross_scene"

PORTABLE_RECIPES = ["V2", "V10", "V11", "V14"]
SCENES_LABELLED = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
EPS = 1e-12

LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.20


def class_count_for(scene_id: str) -> int:
    return {
        "indian-pines-corrected": 16, "salinas-corrected": 16,
        "salinas-a-corrected": 6, "pavia-university": 9,
        "kennedy-space-center": 13, "botswana": 14,
    }.get(scene_id, 0)


def k_for(scene_id: str, mean_doc: float) -> int:
    cls = class_count_for(scene_id)
    upper = max(4, min(12, cls)) if cls > 0 else 12
    if mean_doc < 2.5:
        return max(3, min(upper, 4))
    if mean_doc < 8:
        return max(3, min(upper, int(round(mean_doc / 2))))
    return upper


def load_doc_term(recipe: str, scene_id: str) -> sp.csr_matrix | None:
    p = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id / "doc_term.npz"
    if not p.exists():
        return None
    return sp.load_npz(p).tocsr()


def sample_labels(scene_id: str) -> np.ndarray | None:
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
    idx = stratified_sample_indices(labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE)
    return labels[idx]


def entropy(p):
    p = np.clip(p, EPS, None)
    p = p / p.sum()
    return float(-np.sum(p * np.log2(p)))


def nmi_topic_vs_label(theta: np.ndarray, labels: np.ndarray) -> dict:
    z = np.argmax(theta, axis=1)
    classes = np.array(sorted(int(c) for c in np.unique(labels)))
    C = classes.size
    cls_index = {c: i for i, c in enumerate(classes.tolist())}
    label_idx = np.array([cls_index[int(c)] for c in labels])
    p_label = np.bincount(label_idx, minlength=C).astype(np.float64)
    p_label /= max(p_label.sum(), EPS)
    H_label = entropy(p_label)
    H_cond_terms = []
    K = theta.shape[1]
    p_topic = np.bincount(z, minlength=K).astype(np.float64)
    p_topic /= max(p_topic.sum(), EPS)
    for k in range(K):
        mask = z == k
        if mask.sum() == 0:
            continue
        p_lk = np.bincount(label_idx[mask], minlength=C).astype(np.float64)
        p_lk /= p_lk.sum()
        H_cond_terms.append(p_topic[k] * entropy(p_lk))
    H_cond = float(np.sum(H_cond_terms))
    mi = H_label - H_cond
    return {
        "H_label_bits": round(H_label, 6),
        "H_label_given_topic_bits": round(H_cond, 6),
        "mutual_information_bits": round(mi, 6),
        "normalised_mi": round(mi / max(H_label, EPS), 6),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-17 cross-scene transfer.")
    parser.add_argument("--recipes", nargs="+", default=PORTABLE_RECIPES,
                        choices=PORTABLE_RECIPES)
    args = parser.parse_args()

    F17_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    summary_rows: list[dict] = []
    for recipe in args.recipes:
        # Pre-fit the LDA estimator on every source scene and keep it
        # around (we need full state for .transform()).
        lda_per_source: dict[str, LatentDirichletAllocation] = {}
        K_per_source: dict[str, int] = {}
        vocab_size_per_source: dict[str, int] = {}
        for src in SCENES_LABELLED:
            dt = load_doc_term(recipe, src)
            if dt is None:
                continue
            mean_doc = float(np.asarray(dt.sum(axis=1)).reshape(-1).mean())
            K = k_for(src, mean_doc)
            lda = LatentDirichletAllocation(
                n_components=K, learning_method="online",
                max_iter=LDA_MAX_ITER, batch_size=512, evaluate_every=-1,
                random_state=RANDOM_STATE,
                doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
                topic_word_prior=LDA_TOPIC_WORD_PRIOR,
            )
            lda.fit(dt)
            lda_per_source[src] = lda
            K_per_source[src] = K
            vocab_size_per_source[src] = dt.shape[1]

        # Cross transfer
        for src, tgt in permutations(SCENES_LABELLED, 2):
            if src not in lda_per_source:
                n_skip += 1
                continue
            tgt_dt = load_doc_term(recipe, tgt)
            if tgt_dt is None:
                n_skip += 1
                continue
            if vocab_size_per_source[src] != tgt_dt.shape[1]:
                n_skip += 1
                continue
            tgt_labels = sample_labels(tgt)
            if tgt_labels is None:
                n_skip += 1
                continue
            K = K_per_source[src]
            try:
                theta_tgt = lda_per_source[src].transform(tgt_dt)
            except Exception as exc:
                n_skip += 1
                print(f"  transform failed {src}->{tgt} {recipe}: {exc}", flush=True)
                continue
            theta_tgt = theta_tgt / np.clip(theta_tgt.sum(axis=1, keepdims=True), 1e-12, None)

            metrics = nmi_topic_vs_label(theta_tgt, tgt_labels)
            record = {
                "source_scene": src, "target_scene": tgt,
                "recipe": recipe, "scheme": "uniform", "Q": 8,
                "K": int(K),
                "source_vocab_size": int(vocab_size_per_source[src]),
                **metrics,
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_v_sweep_f17_cross_scene v0.1",
            }
            out = F17_DERIVED / f"{src}_to_{tgt}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(record, h, indent=2)
            n_ok += 1
            summary_rows.append(record)
            print(
                f"[f17] {recipe} {src} -> {tgt}  NMI={record['normalised_mi']:.3f}",
                flush=True,
            )

    # Per-recipe transfer-NMI mean
    if summary_rows:
        by_recipe = {}
        for r in summary_rows:
            by_recipe.setdefault(r["recipe"], []).append(r["normalised_mi"])
        print("\n[f17] Per-recipe mean transfer NMI:", flush=True)
        for r in sorted(by_recipe):
            v = by_recipe[r]
            print(f"    {r:5s} mean={np.mean(v):+.4f} ({len(v)} pairs)",
                  flush=True)
    print(f"[f17] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
