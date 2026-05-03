"""B-5 Embedded baseline: does theta add signal beyond PCA-K?

Master plan Addendum B Axis C-3 (downstream task battery, embedded
concat readout).

For each labelled scene fit:

  - pca_K_logistic                  (fair K-dim baseline)
  - theta_concat_pcaK_logistic      (concatenate [theta | PCA-K])
  - theta_logistic                  (naive)
  - raw_logistic                    (strong baseline)

5-fold StratifiedKFold, macro F1 primary, bootstrap CI95. Wilcoxon-
Holm + Cliff's delta of `theta_concat_pcaK` against `pca_K`.

The question: when we glue theta onto a same-K PCA representation,
does the concat win against PCA alone? If yes, theta carries
*independent* information beyond what variance-maximisation captured.
If not, theta is redundant with the PCA span at this K.

Output: data/derived/embedded_baseline/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pingouin
from sklearn.decomposition import PCA, LatentDirichletAllocation
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "embedded_baseline"

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


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.size == 0 or b.size == 0:
        return 0.0
    diffs = a[:, None] - b[None, :]
    return float(((diffs > 0).sum() - (diffs < 0).sum()) / (a.size * b.size))


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


def fit_lda(doc_train: np.ndarray, K: int) -> LatentDirichletAllocation:
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=60,
        batch_size=512,
        evaluate_every=-1,
        random_state=RANDOM_STATE,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    return lda.fit(doc_train)


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro")),
    }


def lr_fit_predict(X_train, y_train, X_test) -> np.ndarray:
    clf = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
    clf.fit(X_train, y_train)
    return clf.predict(X_test)


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

    K = K_default
    fit_dir = LOCAL_FIT_DIR / scene_id
    if (fit_dir / "phi.npy").exists():
        try:
            phi = np.load(fit_dir / "phi.npy")
            K = int(phi.shape[0])
        except Exception:
            K = K_default

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    rng = np.random.default_rng(RANDOM_STATE)
    fold_metrics: dict[str, list[dict]] = {}

    for tr, te in skf.split(X, y):
        X_train, X_test = X[tr], X[te]
        y_train = y[tr]

        # LDA per fold to avoid leakage
        counts_train = band_frequency_counts(X_train).astype(np.float32)
        counts_test = band_frequency_counts(X_test).astype(np.float32)
        lda = fit_lda(counts_train, K)
        theta_train = lda.transform(counts_train)
        theta_train = theta_train / np.clip(theta_train.sum(axis=1, keepdims=True), 1e-12, None)
        theta_test = lda.transform(counts_test)
        theta_test = theta_test / np.clip(theta_test.sum(axis=1, keepdims=True), 1e-12, None)

        Kc = int(min(K, min(X_train.shape) - 1))
        pca = PCA(n_components=Kc, random_state=RANDOM_STATE)
        Z_train = pca.fit_transform(X_train)
        Z_test = pca.transform(X_test)

        concat_train = np.hstack([theta_train, Z_train])
        concat_test = np.hstack([theta_test, Z_test])

        method_preds = {
            "raw_logistic": lr_fit_predict(X_train, y_train, X_test),
            f"pca_{Kc}_logistic": lr_fit_predict(Z_train, y_train, Z_test),
            f"theta_concat_pca_{Kc}_logistic": lr_fit_predict(
                concat_train, y_train, concat_test
            ),
            "theta_logistic": lr_fit_predict(theta_train, y_train, theta_test),
        }
        for m, pred in method_preds.items():
            fold_metrics.setdefault(m, []).append(metrics(y[te], pred))

    summary: dict[str, dict] = {}
    f1_arrays: dict[str, np.ndarray] = {}
    for m, rows in fold_metrics.items():
        f1_arr = np.array([r["macro_f1"] for r in rows])
        acc_arr = np.array([r["accuracy"] for r in rows])
        bacc_arr = np.array([r["balanced_accuracy"] for r in rows])
        f1_arrays[m] = f1_arr
        summary[m] = {
            "macro_f1": {"per_fold": [round(float(v), 6) for v in f1_arr], **bootstrap_ci95(f1_arr, rng)},
            "accuracy": {"per_fold": [round(float(v), 6) for v in acc_arr], **bootstrap_ci95(acc_arr, rng)},
            "balanced_accuracy": {"per_fold": [round(float(v), 6) for v in bacc_arr], **bootstrap_ci95(bacc_arr, rng)},
        }

    # Wilcoxon-Holm + Cliff's delta: theta_concat_pca_K vs pca_K (the pivotal pair)
    pca_key = next(k for k in summary if k.startswith("pca_") and k.endswith("_logistic"))
    concat_key = next(k for k in summary if k.startswith("theta_concat_pca_"))
    a = f1_arrays[concat_key]
    b = f1_arrays[pca_key]
    if np.allclose(a, b):
        p, W = 1.0, 0.0
    else:
        try:
            res = pingouin.wilcoxon(a, b, alternative="two-sided")
            p = float(res["p-val"].iloc[0])
            W = float(res["W-val"].iloc[0])
        except Exception:
            p, W = 1.0, 0.0
    delta = cliffs_delta(a, b)

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
        "head": "LogisticRegression(max_iter=2000, C=1.0, l2)",
        "split": f"StratifiedKFold(n_splits={N_FOLDS}, shuffle=True, random_state={RANDOM_STATE})",
        "method_metrics": summary,
        "concat_vs_pca": {
            "concat_method": concat_key,
            "pca_method": pca_key,
            "macro_f1_diff_mean_concat_minus_pca": round(
                float(summary[concat_key]["macro_f1"]["mean"] - summary[pca_key]["macro_f1"]["mean"]),
                6,
            ),
            "wilcoxon_W": round(W, 6),
            "wilcoxon_p_two_sided": round(p, 6),
            "cliff_delta_concat_minus_pca": round(delta, 6),
        },
        "ranking_by_macro_f1_mean": [
            {
                "method": m,
                "macro_f1_mean": v["macro_f1"]["mean"],
                "macro_f1_ci95": [v["macro_f1"]["ci95_lo"], v["macro_f1"]["ci95_hi"]],
            }
            for m, v in ranking
        ],
        "framework_axis": "B-5 (master plan Addendum B Axis C-3): does theta add signal beyond PCA at the same K? — embedded concat readout",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_embedded_baseline v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[embedded] {scene_id} ...", flush=True)
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
                f"  {r['method']:35s} F1={r['macro_f1_mean']:.3f}  "
                f"CI95=[{r['macro_f1_ci95'][0]:.3f},{r['macro_f1_ci95'][1]:.3f}]",
                flush=True,
            )
        cv = payload["concat_vs_pca"]
        print(
            f"  concat - pca = {cv['macro_f1_diff_mean_concat_minus_pca']:+.4f}  "
            f"Wilcoxon p={cv['wilcoxon_p_two_sided']:.3f}  "
            f"Cliff delta={cv['cliff_delta_concat_minus_pca']:+.3f}",
            flush=True,
        )
        written += 1
    print(f"[embedded] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
