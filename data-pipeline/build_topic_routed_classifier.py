"""B-3 Topic-routed classifier with soft theta gating.

Master plan Addendum B Axis C-2 (downstream task battery, embedded use
of theta).

The user's correction (2026-05-03): "no se modela sobre theta — eso es
obviamente peor — se hace per-topic specialists con esquema embebido /
jerárquico". This builder implements that: for each labelled scene we
fit LDA at the recommended K, then for each topic k we fit a per-topic
logistic regression specialist on the **raw spectrum** with sample
weights = theta_d(k). At test time the prediction is a soft mixture of
specialist probabilities weighted by theta_d(k) of the test document.

Compare against:
  - raw_logistic                  (strong baseline; full spectrum LR)
  - theta_logistic                (naïve; theta as feature)
  - pca_K_logistic                (fair K-dim baseline)
  - topic_routed_soft (this)      (per-topic specialists + soft gating)
  - topic_routed_hard             (assignment to argmax_k(theta))

5-fold StratifiedKFold, macro F1 primary, bootstrap CI95 of the mean.

Output: data/derived/topic_routed_classifier/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA, LatentDirichletAllocation
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

warnings.filterwarnings("ignore")


DERIVED_OUT_DIR = DERIVED_DIR / "topic_routed_classifier"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
N_FOLDS = 5
SAMPLES_PER_CLASS = 220
SCALE = 12
RANDOM_STATE = 42
BOOTSTRAP_N = 1000
GATE_FLOOR = 1e-3  # Minimum weight per specialist for numerical stability


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def bootstrap_ci95(values: np.ndarray, rng: np.random.Generator) -> dict:
    if values.size == 0:
        return {"mean": None, "ci95_lo": None, "ci95_hi": None}
    boot = []
    for _ in range(BOOTSTRAP_N):
        sample = rng.choice(values, size=values.size, replace=True)
        boot.append(float(np.mean(sample)))
    boot = np.array(boot)
    return {
        "mean": round(float(values.mean()), 6),
        "std": round(float(values.std()), 6),
        "ci95_lo": round(float(np.percentile(boot, 2.5)), 6),
        "ci95_hi": round(float(np.percentile(boot, 97.5)), 6),
    }


def fit_lda(doc_train: np.ndarray, K: int, seed: int = RANDOM_STATE) -> LatentDirichletAllocation:
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=60,
        batch_size=512,
        evaluate_every=-1,
        random_state=seed,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    return lda.fit(doc_train)


def topic_routed_soft_predict(
    spectra_train: np.ndarray,
    y_train: np.ndarray,
    theta_train: np.ndarray,
    spectra_test: np.ndarray,
    theta_test: np.ndarray,
    classes: np.ndarray,
) -> np.ndarray:
    """Soft-gated per-topic specialist mixture.

    For each topic k, fit LR on spectra_train with sample_weight
    theta_train[:, k]. At test time, predict P(y|x_test) as
    sum_k theta_test[:, k] * P_k(y|x_test).
    """
    K = theta_train.shape[1]
    n_test = spectra_test.shape[0]
    C = classes.size
    proba_mix = np.zeros((n_test, C), dtype=np.float64)

    for k in range(K):
        w = theta_train[:, k].astype(np.float64)
        # Skip degenerate specialists where weight mass is tiny
        if w.sum() < 1.0 or float(w.sum()) / w.size < GATE_FLOOR:
            continue
        # Need >= 2 effective classes after weighting
        unique_with_mass = []
        for c in classes:
            if w[y_train == c].sum() > 0:
                unique_with_mass.append(c)
        if len(unique_with_mass) < 2:
            continue

        clf = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
        try:
            clf.fit(spectra_train, y_train, sample_weight=w)
        except Exception:
            continue
        proba_k = clf.predict_proba(spectra_test)
        # Reindex into the global classes axis
        col_index = np.searchsorted(classes, clf.classes_)
        full = np.zeros((n_test, C), dtype=np.float64)
        full[:, col_index] = proba_k
        gate = theta_test[:, k:k + 1]
        proba_mix += gate * full

    # Renormalise (rows whose gate sum was 0 fall back to uniform)
    row_sum = proba_mix.sum(axis=1, keepdims=True)
    fallback = (row_sum < 1e-12).ravel()
    proba_mix[fallback] = 1.0 / C
    row_sum = proba_mix.sum(axis=1, keepdims=True)
    proba_mix = proba_mix / np.clip(row_sum, 1e-12, None)
    pred = classes[np.argmax(proba_mix, axis=1)]
    return pred


def topic_routed_hard_predict(
    spectra_train: np.ndarray,
    y_train: np.ndarray,
    theta_train: np.ndarray,
    spectra_test: np.ndarray,
    theta_test: np.ndarray,
    classes: np.ndarray,
) -> np.ndarray:
    """Hard routing: each specialist trained on its dominant docs only;
    test docs assigned to argmax_k(theta_test)."""
    K = theta_train.shape[1]
    train_dom = np.argmax(theta_train, axis=1)
    test_dom = np.argmax(theta_test, axis=1)
    pred = np.empty(spectra_test.shape[0], dtype=y_train.dtype)

    # Train specialists per dominant topic
    specialists: dict[int, tuple[LogisticRegression, np.ndarray]] = {}
    for k in range(K):
        mask = train_dom == k
        if mask.sum() < max(5, classes.size):
            continue
        if np.unique(y_train[mask]).size < 2:
            continue
        clf = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
        try:
            clf.fit(spectra_train[mask], y_train[mask])
            specialists[k] = (clf, clf.classes_)
        except Exception:
            continue

    # Fallback global model for orphan test docs
    fallback = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
    fallback.fit(spectra_train, y_train)

    for i, k in enumerate(test_dom):
        if int(k) in specialists:
            clf, _ = specialists[int(k)]
            pred[i] = clf.predict(spectra_test[i:i + 1])[0]
        else:
            pred[i] = fallback.predict(spectra_test[i:i + 1])[0]
    return pred


def run_methods_one_fold(
    X_full: np.ndarray,
    y: np.ndarray,
    train_idx: np.ndarray,
    test_idx: np.ndarray,
    K: int,
    classes: np.ndarray,
) -> dict[str, np.ndarray]:
    """Returns predictions per method for this fold."""
    X_train, X_test = X_full[train_idx], X_full[test_idx]
    y_train = y[train_idx]

    # Build doc-term per fold (LDA must be re-fit per fold, no leakage)
    counts_train = band_frequency_counts(X_train).astype(np.float32)
    counts_test = band_frequency_counts(X_test).astype(np.float32)
    lda = fit_lda(counts_train, K)
    theta_train = lda.transform(counts_train)
    theta_train = theta_train / np.clip(theta_train.sum(axis=1, keepdims=True), 1e-12, None)
    theta_test = lda.transform(counts_test)
    theta_test = theta_test / np.clip(theta_test.sum(axis=1, keepdims=True), 1e-12, None)

    preds: dict[str, np.ndarray] = {}

    # Baseline: raw spectrum LR
    raw = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
    raw.fit(X_train, y_train)
    preds["raw_logistic"] = raw.predict(X_test)

    # Naïve: theta as feature
    th = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
    th.fit(theta_train, y_train)
    preds["theta_logistic"] = th.predict(theta_test)

    # Fair K-dim: PCA-K
    Kc = int(min(K, min(X_train.shape) - 1))
    pca = PCA(n_components=Kc, random_state=RANDOM_STATE)
    Z_train = pca.fit_transform(X_train)
    Z_test = pca.transform(X_test)
    pc = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
    pc.fit(Z_train, y_train)
    preds[f"pca_{Kc}_logistic"] = pc.predict(Z_test)

    # Embedded: per-topic specialists with soft theta gating
    preds["topic_routed_soft"] = topic_routed_soft_predict(
        X_train, y_train, theta_train, X_test, theta_test, classes
    )

    # Hard router
    preds["topic_routed_hard"] = topic_routed_hard_predict(
        X_train, y_train, theta_train, X_test, theta_test, classes
    )

    return preds


def metrics_per_fold(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro")),
    }


def build_for_scene(scene_id: str, K_default: int = 8) -> dict | None:
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
    X = spectra[sample_idx_local]
    y = labels[sample_idx_local]
    classes = np.sort(np.unique(y))
    if classes.size < 2:
        return None

    # K from the existing fit if available (so we mirror canonical config)
    fit_dir = ROOT / "data" / "local" / "lda_fits" / scene_id
    K = K_default
    if (fit_dir / "phi.npy").exists():
        try:
            phi = np.load(fit_dir / "phi.npy")
            K = int(phi.shape[0])
        except Exception:
            K = K_default

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    rng = np.random.default_rng(RANDOM_STATE)

    fold_metrics: dict[str, list[dict]] = {}
    for fold_idx, (tr, te) in enumerate(skf.split(X, y)):
        fold_preds = run_methods_one_fold(X, y, tr, te, K, classes)
        for method, pred in fold_preds.items():
            fold_metrics.setdefault(method, []).append(metrics_per_fold(y[te], pred))

    summary: dict[str, dict] = {}
    for method, rows in fold_metrics.items():
        f1_arr = np.array([r["macro_f1"] for r in rows])
        acc_arr = np.array([r["accuracy"] for r in rows])
        bacc_arr = np.array([r["balanced_accuracy"] for r in rows])
        summary[method] = {
            "macro_f1": {
                "per_fold": [round(float(v), 6) for v in f1_arr],
                **bootstrap_ci95(f1_arr, rng),
            },
            "accuracy": {
                "per_fold": [round(float(v), 6) for v in acc_arr],
                **bootstrap_ci95(acc_arr, rng),
            },
            "balanced_accuracy": {
                "per_fold": [round(float(v), 6) for v in bacc_arr],
                **bootstrap_ci95(bacc_arr, rng),
            },
        }

    ranking = sorted(
        summary.items(),
        key=lambda kv: kv[1]["macro_f1"]["mean"] if kv[1]["macro_f1"]["mean"] is not None else -np.inf,
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "K": int(K),
        "n_classes": int(classes.size),
        "n_documents": int(y.size),
        "samples_per_class": SAMPLES_PER_CLASS,
        "wordification": "band-frequency",
        "quantization_scale": SCALE,
        "head": "LogisticRegression(max_iter=2000, C=1.0, l2)",
        "split": f"StratifiedKFold(n_splits={N_FOLDS}, shuffle=True, random_state={RANDOM_STATE})",
        "method_metrics": summary,
        "ranking_by_macro_f1_mean": [
            {
                "method": m,
                "macro_f1_mean": v["macro_f1"]["mean"],
                "macro_f1_ci95": [v["macro_f1"]["ci95_lo"], v["macro_f1"]["ci95_hi"]],
            }
            for m, v in ranking
        ],
        "framework_axis": "B-3 (master plan Addendum B Axis C-2): topic-routed classifier with soft theta gating — embedded / hierarchical use of theta on top of per-topic specialists, NOT modelled on theta directly",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_routed_classifier v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[topic_routed] {scene_id} ...", flush=True)
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
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        for r in payload["ranking_by_macro_f1_mean"]:
            print(
                f"  {r['method']:24s} F1={r['macro_f1_mean']:.3f}  "
                f"CI95=[{r['macro_f1_ci95'][0]:.3f},{r['macro_f1_ci95'][1]:.3f}]",
                flush=True,
            )
        written += 1
    print(f"[topic_routed] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
