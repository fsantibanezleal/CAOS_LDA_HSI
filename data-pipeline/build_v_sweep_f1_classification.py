"""V-sweep F-1 — topic-routed classification posterior across V1..V12.

The F-1 axis from the paper is the hierarchical-Bayesian classification
posterior over methods on a panel of labelled scenes. The existing
build_bayesian_classification_labelled writes its posterior over a
fixed set of methods (raw_logistic, topic_routed_soft, …) all derived
from the V1 canonical fit.

This builder is the V-sweep equivalent: for each recipe in V1..V12 we
re-derive the per-fold macro-F1 of *topic_routed_soft* and *raw_logistic*
using that recipe's pre-built doc_term matrix as the LDA-input, then
pool the 12 × 6 × 5 = 360 observations per method through the same
hierarchical normal model.

Output:
  data/derived/v_sweep/f1_per_fold/{scene}_{V}.json
  data/derived/v_sweep/f1_bayesian.json
  data/derived/v_sweep/f1_win_matrix.json

Tracks issue #608 (Cycle 3) under master #606.
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold

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

warnings.filterwarnings("ignore")

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F1_DERIVED_DIR = DERIVED_DIR / "v_sweep" / "f1_per_fold"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 21)]
SAMPLES_PER_CLASS = 220
N_FOLDS = 5
RANDOM_STATE = 42
LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.20
GATE_FLOOR = 0.01


def class_count_for(scene_id: str) -> int:
    if scene_id == "indian-pines-corrected":
        return 16
    if scene_id == "salinas-corrected":
        return 16
    if scene_id == "salinas-a-corrected":
        return 6
    if scene_id == "pavia-university":
        return 9
    if scene_id == "kennedy-space-center":
        return 13
    if scene_id == "botswana":
        return 14
    return 0


def k_for(scene_id: str, mean_doc: float) -> int:
    cls = class_count_for(scene_id)
    upper = max(4, min(12, cls)) if cls > 0 else 12
    if mean_doc < 2.5:
        return max(3, min(upper, 4))
    if mean_doc < 8:
        return max(3, min(upper, int(round(mean_doc / 2))))
    return upper


def load_doc_term(recipe: str, scheme: str, q: int, scene_id: str):
    corpus_dir = WORDIFICATION_LOCAL / recipe / f"{scheme}_Q{q}" / scene_id
    npz = corpus_dir / "doc_term.npz"
    vp = corpus_dir / "vocab.json"
    if not (npz.exists() and vp.exists()):
        return None
    return sp.load_npz(npz).tocsr()


def sample_for_scene(scene_id: str):
    """Re-derive the same stratified sample the wordification used."""
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    sample_spectra = spectra[sample_idx_local]
    sample_labels = labels[sample_idx_local]
    return sample_spectra, sample_labels


def topic_routed_soft_predict(
    spectra_train, y_train, theta_train,
    spectra_test, theta_test, classes,
):
    K = theta_train.shape[1]
    n_test = spectra_test.shape[0]
    C = classes.size
    proba_mix = np.zeros((n_test, C), dtype=np.float64)
    for k in range(K):
        w = theta_train[:, k].astype(np.float64)
        if w.sum() < 1.0 or float(w.sum()) / w.size < GATE_FLOOR:
            continue
        unique_with_mass = [c for c in classes if w[y_train == c].sum() > 0]
        if len(unique_with_mass) < 2:
            continue
        clf = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
        try:
            clf.fit(spectra_train, y_train, sample_weight=w)
        except Exception:
            continue
        proba_k = clf.predict_proba(spectra_test)
        col_index = np.searchsorted(classes, clf.classes_)
        full = np.zeros((n_test, C), dtype=np.float64)
        full[:, col_index] = proba_k
        proba_mix += theta_test[:, k:k + 1] * full
    row_sum = proba_mix.sum(axis=1, keepdims=True)
    fallback = (row_sum < 1e-12).ravel()
    proba_mix[fallback] = 1.0 / C
    proba_mix /= np.clip(proba_mix.sum(axis=1, keepdims=True), 1e-12, None)
    return classes[np.argmax(proba_mix, axis=1)]


def per_v_per_scene(recipe: str, scene_id: str, scheme: str = "uniform", q: int = 8) -> dict | None:
    doc_term = load_doc_term(recipe, scheme, q, scene_id)
    if doc_term is None:
        return {"recipe": recipe, "scene_id": scene_id, "status": "missing_corpus"}
    sample = sample_for_scene(scene_id)
    if sample is None:
        return {"recipe": recipe, "scene_id": scene_id, "status": "no_labels"}
    spectra, labels = sample
    if doc_term.shape[0] != spectra.shape[0]:
        return {
            "recipe": recipe,
            "scene_id": scene_id,
            "status": "shape_mismatch",
            "doc_term_rows": int(doc_term.shape[0]),
            "spectra_rows": int(spectra.shape[0]),
        }

    classes = np.array(sorted(int(c) for c in np.unique(labels)))
    mean_doc = float(np.asarray(doc_term.sum(axis=1)).reshape(-1).mean())
    K = k_for(scene_id, mean_doc)

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    raw_f1 = []
    routed_f1 = []
    for train_idx, test_idx in skf.split(spectra, labels):
        # Per-fold LDA refit (no leakage).
        dt_train = doc_term[train_idx]
        dt_test = doc_term[test_idx]
        lda = LatentDirichletAllocation(
            n_components=K,
            learning_method="online",
            max_iter=LDA_MAX_ITER,
            batch_size=512,
            evaluate_every=-1,
            random_state=RANDOM_STATE,
            doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
            topic_word_prior=LDA_TOPIC_WORD_PRIOR,
        )
        theta_train = lda.fit_transform(dt_train)
        theta_test = lda.transform(dt_test)
        theta_train /= np.clip(theta_train.sum(axis=1, keepdims=True), 1e-12, None)
        theta_test /= np.clip(theta_test.sum(axis=1, keepdims=True), 1e-12, None)

        # raw_logistic baseline (independent of recipe)
        rclf = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
        rclf.fit(spectra[train_idx], labels[train_idx])
        y_pred_raw = rclf.predict(spectra[test_idx])
        raw_f1.append(float(f1_score(labels[test_idx], y_pred_raw, average="macro")))

        # topic_routed_soft using this recipe's theta
        y_pred_routed = topic_routed_soft_predict(
            spectra[train_idx], labels[train_idx], theta_train,
            spectra[test_idx], theta_test, classes,
        )
        routed_f1.append(float(f1_score(labels[test_idx], y_pred_routed, average="macro")))

    return {
        "recipe": recipe,
        "scene_id": scene_id,
        "scheme": scheme,
        "Q": q,
        "K": int(K),
        "D": int(doc_term.shape[0]),
        "V": int(doc_term.shape[1]),
        "mean_doc_length": round(mean_doc, 4),
        "raw_logistic_per_fold": [round(x, 6) for x in raw_f1],
        "topic_routed_soft_per_fold": [round(x, 6) for x in routed_f1],
        "raw_logistic_mean": round(float(np.mean(raw_f1)), 6),
        "topic_routed_soft_mean": round(float(np.mean(routed_f1)), 6),
        "gain_routed_over_raw": round(float(np.mean(routed_f1) - np.mean(raw_f1)), 6),
        "status": "ok",
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }


def write_per_v(record: dict) -> None:
    if record.get("status") != "ok":
        return
    F1_DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    path = F1_DERIVED_DIR / f"{record['scene_id']}_{record['recipe']}_{record['scheme']}_Q{record['Q']}.json"
    with path.open("w", encoding="utf-8") as h:
        json.dump(record, h, indent=2)


def collect_win_matrix(records: list[dict]) -> dict:
    by_method = {"raw_logistic": {}, "topic_routed_soft": {}}
    by_method_and_recipe = {"raw_logistic": {}, "topic_routed_soft": {}}
    scenes = sorted({r["scene_id"] for r in records if r.get("status") == "ok"})
    recipes = sorted({r["recipe"] for r in records if r.get("status") == "ok"},
                     key=lambda x: int(x[1:]))
    for r in records:
        if r.get("status") != "ok":
            continue
        for method in ("raw_logistic", "topic_routed_soft"):
            by_method_and_recipe[method].setdefault(r["recipe"], {})[r["scene_id"]] = r[f"{method}_mean"]

    # Per-scene winner across recipes (topic_routed_soft is the headline method)
    winners = {}
    for scene in scenes:
        scene_scores = [
            (recipe, by_method_and_recipe["topic_routed_soft"].get(recipe, {}).get(scene))
            for recipe in recipes
        ]
        scored = [(r, s) for r, s in scene_scores if s is not None]
        if not scored:
            continue
        scored.sort(key=lambda x: -x[1])
        winners[scene] = {
            "best": scored[0][0],
            "best_score": scored[0][1],
            "ranking": [{"recipe": r, "score": s} for r, s in scored],
        }

    # Per-recipe mean across scenes
    per_recipe_mean = {}
    for method in ("raw_logistic", "topic_routed_soft"):
        per_recipe_mean[method] = {}
        for recipe in recipes:
            scores = [
                by_method_and_recipe[method].get(recipe, {}).get(scene)
                for scene in scenes
            ]
            scores = [s for s in scores if s is not None]
            if scores:
                per_recipe_mean[method][recipe] = {
                    "mean": round(float(np.mean(scores)), 6),
                    "std": round(float(np.std(scores)), 6),
                    "n_scenes": len(scores),
                }
    return {
        "recipes": recipes,
        "scenes": scenes,
        "by_method_recipe_scene": by_method_and_recipe,
        "per_scene_winner_topic_routed_soft": winners,
        "per_recipe_mean": per_recipe_mean,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-1 classifier sweep.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--scheme", default="uniform", choices=["uniform", "quantile", "lloyd_max"])
    parser.add_argument("--q", type=int, default=8, choices=[8, 16, 32])
    parser.add_argument("--skip-bayes", action="store_true",
                        help="Skip the hierarchical Bayesian fit at the end.")
    args = parser.parse_args()

    records: list[dict] = []
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe} {args.scheme} Q={args.q}"
            print(f"[f1] {tag} ...", flush=True)
            try:
                rec = per_v_per_scene(recipe, scene, args.scheme, args.q)
                if rec is None:
                    continue
                records.append(rec)
                write_per_v(rec)
                if rec.get("status") == "ok":
                    print(
                        f"  K={rec['K']} routed={rec['topic_routed_soft_mean']:.3f} "
                        f"raw={rec['raw_logistic_mean']:.3f} "
                        f"gain={rec['gain_routed_over_raw']:+.3f}",
                        flush=True,
                    )
                else:
                    print(f"  SKIP: {rec['status']}", flush=True)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                import traceback
                traceback.print_exc()

    matrix = collect_win_matrix(records)
    matrix_path = DERIVED_DIR / "v_sweep" / "f1_win_matrix.json"
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    with matrix_path.open("w", encoding="utf-8") as h:
        json.dump(matrix, h, indent=2)
    print(f"[f1] wrote win matrix to {matrix_path.name}", flush=True)

    # Print per-recipe headline ranking
    if "topic_routed_soft" in matrix["per_recipe_mean"]:
        ranking = sorted(
            matrix["per_recipe_mean"]["topic_routed_soft"].items(),
            key=lambda kv: -kv[1]["mean"],
        )
        print("\n[f1] Mean macro-F1 across scenes (topic_routed_soft):", flush=True)
        for recipe, stats in ranking:
            print(
                f"    {recipe:5s} {stats['mean']:+.4f} ± {stats['std']:.4f}  "
                f"(n={stats['n_scenes']})",
                flush=True,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
