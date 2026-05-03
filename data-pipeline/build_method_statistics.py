"""Statistical depth for the supervised classification methods.

Re-runs the labelled-scene supervised pipeline with k=5 stratified
k-fold cross validation x n_seeds LDA seeds and records every fold +
seed score (not just the mean). Then computes paired-comparison
statistics between methods (raw / PCA / topic mixtures): mean delta,
std delta, Wilcoxon signed-rank p-value, Cohen's d, win rate, and a
short natural-language verdict.

This is the payload the interactive Workspace consumes to render
confidence intervals, paired diff plots, and method ranking with
statistical significance — instead of point estimates.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from scipy import stats as scipy_stats
from sklearn.decomposition import LatentDirichletAllocation, PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import CORE_DERIVED_DIR
from research_core.raw_scenes import (
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)


OUTPUT_PATH = CORE_DERIVED_DIR / "method_statistics.json"

LABELED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "pavia-university",
    "botswana",
]
N_FOLDS = 5
LDA_SEEDS = [42, 7, 19, 99, 31]
PER_CLASS_SAMPLE = 120
ALPHA_SIG = 0.05
BOOTSTRAP_SAMPLES = 1000
BOOTSTRAP_SEED = 1234


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def normalize_rows01(values: np.ndarray) -> np.ndarray:
    rows_min = values.min(axis=1, keepdims=True)
    rows_max = values.max(axis=1, keepdims=True)
    rng = np.where(rows_max > rows_min, rows_max - rows_min, 1.0)
    return (values - rows_min) / rng


def band_frequency_counts(values: np.ndarray, scale: int = 12) -> np.ndarray:
    normalised = normalize_rows01(values)
    return np.round(normalised * scale).astype(int)


def fit_lda(counts: np.ndarray, n_topics: int, seed: int, max_iter: int = 25):
    model = LatentDirichletAllocation(
        n_components=n_topics,
        learning_method="online",
        random_state=seed,
        max_iter=max_iter,
        evaluate_every=-1,
    )
    transformed = model.fit_transform(counts)
    return model, transformed


def make_logreg() -> LogisticRegression:
    return LogisticRegression(max_iter=1000, n_jobs=None)


def safe_pca_components(sample_count: int, feature_count: int) -> int:
    return max(2, min(20, sample_count // 4, feature_count))


def topic_count_for_labels(label_count: int) -> int:
    return max(4, min(label_count, 16))


def metrics_from_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
    }


def bootstrap_ci(
    values: np.ndarray, samples: int = BOOTSTRAP_SAMPLES, seed: int = BOOTSTRAP_SEED
) -> tuple[float, float]:
    if values.size == 0:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    means = np.empty(samples, dtype=float)
    for i in range(samples):
        idx = rng.integers(0, values.size, values.size)
        means[i] = values[idx].mean()
    lo, hi = np.quantile(means, [0.025, 0.975])
    return float(lo), float(hi)


def summarise(values: np.ndarray) -> dict[str, float | list[float]]:
    if values.size == 0:
        return {"mean": float("nan"), "std": float("nan"), "ci95_lo": float("nan"), "ci95_hi": float("nan"), "values": []}
    lo, hi = bootstrap_ci(values)
    return {
        "mean": float(values.mean()),
        "std": float(values.std(ddof=1)) if values.size > 1 else 0.0,
        "median": float(np.median(values)),
        "ci95_lo": lo,
        "ci95_hi": hi,
        "min": float(values.min()),
        "max": float(values.max()),
        "values": [round(float(v), 6) for v in values],
    }


def cohen_d_paired(deltas: np.ndarray) -> float:
    if deltas.size <= 1:
        return float("nan")
    sd = float(deltas.std(ddof=1))
    if sd < 1e-12:
        return float("nan") if abs(deltas.mean()) < 1e-12 else math.copysign(float("inf"), deltas.mean())
    return float(deltas.mean() / sd)


def wilcoxon_pvalue(deltas: np.ndarray) -> float:
    nonzero = deltas[deltas != 0]
    if nonzero.size < 1:
        return float("nan")
    try:
        result = scipy_stats.wilcoxon(nonzero, zero_method="zsplit", alternative="two-sided")
        return float(result.pvalue)
    except ValueError:
        return float("nan")


def paired_compare(
    a: np.ndarray, b: np.ndarray, label_a: str, label_b: str
) -> dict[str, Any]:
    deltas = b - a
    win_rate = float((deltas > 0).mean()) if deltas.size else float("nan")
    p_value = wilcoxon_pvalue(deltas)
    d = cohen_d_paired(deltas)
    mean_delta = float(deltas.mean()) if deltas.size else float("nan")
    significance = "n/a"
    if not math.isnan(p_value):
        significance = "significant" if p_value < ALPHA_SIG else "not_significant"
    direction = "tie"
    if not math.isnan(mean_delta):
        if mean_delta > 0:
            direction = f"{label_b} better"
        elif mean_delta < 0:
            direction = f"{label_a} better"
    verdict = (
        f"{label_b} − {label_a} = {mean_delta:+.3f} "
        f"(Wilcoxon p={p_value:.3f}, Cohen d={d:.2f}, win rate={win_rate:.0%})"
    )
    return {
        "a": label_a,
        "b": label_b,
        "delta_mean": mean_delta,
        "delta_std": float(deltas.std(ddof=1)) if deltas.size > 1 else 0.0,
        "delta_min": float(deltas.min()) if deltas.size else float("nan"),
        "delta_max": float(deltas.max()) if deltas.size else float("nan"),
        "delta_values": [round(float(v), 6) for v in deltas],
        "wilcoxon_p": p_value,
        "cohens_d": d,
        "win_rate": win_rate,
        "significance": significance,
        "direction": direction,
        "verdict": verdict,
    }


# ---------------------------------------------------------------------------
# Per-scene runner
# ---------------------------------------------------------------------------


def run_scene_statistics(dataset_id: str) -> dict[str, Any]:
    cube, gt, config = load_scene(dataset_id)
    assert gt is not None
    rows, cols, bands = cube.shape
    flat_cube = cube.reshape(-1, bands)
    flat_gt = gt.reshape(-1)
    mask = valid_spectra_mask(flat_cube) & (flat_gt > 0)
    spectra = flat_cube[mask]
    labels = flat_gt[mask]

    sampled = stratified_sample_indices(
        labels, per_class=PER_CLASS_SAMPLE, random_state=42
    )
    spectra = spectra[sampled]
    labels = labels[sampled]
    counts = band_frequency_counts(spectra)
    unique_labels = np.unique(labels)
    n_topics = topic_count_for_labels(unique_labels.size)
    pca_components = safe_pca_components(spectra.shape[0], spectra.shape[1])

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)

    per_method_metrics: dict[str, list[dict[str, float]]] = {
        "raw_logistic_regression": [],
        "pca_logistic_regression": [],
        "topic_logistic_regression": [],
    }
    fold_summaries: list[dict[str, Any]] = []

    for fold_idx, (train_idx, test_idx) in enumerate(skf.split(spectra, labels)):
        for seed in LDA_SEEDS:
            x_train = spectra[train_idx]
            x_test = spectra[test_idx]
            y_train = labels[train_idx]
            y_test = labels[test_idx]
            counts_train = counts[train_idx]
            counts_test = counts[test_idx]

            # Raw logistic
            raw_pipe = Pipeline(
                [("scale", StandardScaler()), ("clf", make_logreg())]
            )
            raw_pipe.fit(x_train, y_train)
            y_pred_raw = raw_pipe.predict(x_test)

            # PCA logistic
            pca_pipe = Pipeline(
                [
                    ("scale", StandardScaler()),
                    ("pca", PCA(n_components=pca_components, random_state=seed)),
                    ("clf", make_logreg()),
                ]
            )
            pca_pipe.fit(x_train, y_train)
            y_pred_pca = pca_pipe.predict(x_test)

            # Topic logistic
            lda = LatentDirichletAllocation(
                n_components=n_topics,
                learning_method="online",
                random_state=seed,
                max_iter=25,
                evaluate_every=-1,
            )
            topic_train = lda.fit_transform(counts_train)
            topic_test = lda.transform(counts_test)
            topic_clf = make_logreg()
            topic_clf.fit(topic_train, y_train)
            y_pred_topic = topic_clf.predict(topic_test)

            for name, y_pred in (
                ("raw_logistic_regression", y_pred_raw),
                ("pca_logistic_regression", y_pred_pca),
                ("topic_logistic_regression", y_pred_topic),
            ):
                per_method_metrics[name].append(metrics_from_predictions(y_test, y_pred))

            fold_summaries.append(
                {
                    "fold": int(fold_idx),
                    "lda_seed": int(seed),
                    "train_size": int(train_idx.size),
                    "test_size": int(test_idx.size),
                }
            )
        print(
            f"  [{dataset_id}] fold {fold_idx + 1}/{N_FOLDS} done", flush=True
        )

    methods_block: dict[str, dict[str, Any]] = {}
    for name, runs in per_method_metrics.items():
        accuracy = np.array([r["accuracy"] for r in runs], dtype=float)
        balanced = np.array([r["balanced_accuracy"] for r in runs], dtype=float)
        macro = np.array([r["macro_f1"] for r in runs], dtype=float)
        methods_block[name] = {
            "n_evaluations": int(accuracy.size),
            "accuracy": summarise(accuracy),
            "balanced_accuracy": summarise(balanced),
            "macro_f1": summarise(macro),
        }

    pairs = [
        ("raw_logistic_regression", "pca_logistic_regression"),
        ("raw_logistic_regression", "topic_logistic_regression"),
        ("pca_logistic_regression", "topic_logistic_regression"),
    ]
    paired_block: dict[str, list[dict[str, Any]]] = {}
    for metric_name in ("accuracy", "balanced_accuracy", "macro_f1"):
        comparisons: list[dict[str, Any]] = []
        for a, b in pairs:
            arr_a = np.array(
                [r[metric_name] for r in per_method_metrics[a]], dtype=float
            )
            arr_b = np.array(
                [r[metric_name] for r in per_method_metrics[b]], dtype=float
            )
            comp = paired_compare(arr_a, arr_b, a, b)
            comp["metric"] = metric_name
            comparisons.append(comp)
        paired_block[metric_name] = comparisons

    # Per-fold ranking table: which method had the highest macro_f1 in each evaluation
    macro_arrays = {
        name: np.array([r["macro_f1"] for r in runs], dtype=float)
        for name, runs in per_method_metrics.items()
    }
    method_names = list(macro_arrays.keys())
    rank_counts = {name: {"first": 0, "second": 0, "third": 0} for name in method_names}
    n_evals = next(iter(macro_arrays.values())).size
    for i in range(n_evals):
        scores = [(name, macro_arrays[name][i]) for name in method_names]
        scores.sort(key=lambda kv: kv[1], reverse=True)
        for rank_pos, (name, _) in enumerate(scores):
            key = ["first", "second", "third"][rank_pos] if rank_pos < 3 else None
            if key:
                rank_counts[name][key] += 1
    average_rank: dict[str, float] = {}
    for name in method_names:
        ranks = []
        for i in range(n_evals):
            scores = [(other, macro_arrays[other][i]) for other in method_names]
            scores.sort(key=lambda kv: kv[1], reverse=True)
            for pos, (n, _) in enumerate(scores):
                if n == name:
                    ranks.append(pos + 1)
                    break
        average_rank[name] = round(float(np.mean(ranks)), 3) if ranks else float("nan")

    return {
        "dataset_id": dataset_id,
        "dataset_name": config.name,
        "family_id": config.family_id,
        "split_protocol": {
            "type": "stratified-k-fold",
            "n_folds": N_FOLDS,
            "lda_seeds": LDA_SEEDS,
            "evaluations": int(N_FOLDS * len(LDA_SEEDS)),
            "per_class_sample_cap": PER_CLASS_SAMPLE,
        },
        "scene_summary": {
            "cube_shape": [int(rows), int(cols), int(bands)],
            "sampled_documents": int(spectra.shape[0]),
            "class_count": int(unique_labels.size),
            "topic_count": n_topics,
            "pca_components": pca_components,
        },
        "fold_summaries": fold_summaries,
        "methods": methods_block,
        "paired_comparisons": paired_block,
        "ranking": {
            "metric": "macro_f1",
            "average_rank": average_rank,
            "rank_counts": rank_counts,
            "n_evaluations": int(n_evals),
        },
    }


# ---------------------------------------------------------------------------
# Cross-dataset ranking (Demsar-style, simplified)
# ---------------------------------------------------------------------------


def cross_dataset_ranking(scene_results: list[dict[str, Any]]) -> dict[str, Any]:
    methods = ["raw_logistic_regression", "pca_logistic_regression", "topic_logistic_regression"]
    ranks_per_dataset: dict[str, list[float]] = {m: [] for m in methods}
    for res in scene_results:
        for name in methods:
            avg = res["ranking"]["average_rank"].get(name, float("nan"))
            if not math.isnan(avg):
                ranks_per_dataset[name].append(avg)
    average_rank = {
        m: round(float(np.mean(ranks_per_dataset[m])), 3)
        if ranks_per_dataset[m]
        else float("nan")
        for m in methods
    }
    # Friedman-style global p-value if scipy available
    try:
        scores_per_dataset = []
        for res in scene_results:
            row = []
            for name in methods:
                row.append(res["methods"][name]["macro_f1"]["mean"])
            scores_per_dataset.append(row)
        if len(scores_per_dataset) >= 3:
            arr = np.array(scores_per_dataset)
            stat, p = scipy_stats.friedmanchisquare(*[arr[:, i] for i in range(arr.shape[1])])
            friedman = {"statistic": float(stat), "p_value": float(p)}
        else:
            friedman = {"statistic": float("nan"), "p_value": float("nan")}
    except Exception:  # noqa: BLE001
        friedman = {"statistic": float("nan"), "p_value": float("nan")}
    return {
        "metric": "macro_f1",
        "average_rank": average_rank,
        "ranks_per_dataset": ranks_per_dataset,
        "friedman": friedman,
        "datasets": [r["dataset_id"] for r in scene_results],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    scenes: list[dict[str, Any]] = []
    for dataset_id in LABELED_SCENES:
        print(f"=== {dataset_id} ===", flush=True)
        try:
            scenes.append(run_scene_statistics(dataset_id))
        except FileNotFoundError as exc:  # noqa: PERF203
            print(f"  skip {dataset_id}: {exc}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  error on {dataset_id}: {exc}", flush=True)

    payload: dict[str, Any] = {
        "source": "Statistical depth — k-fold x multi-seed evaluations with paired comparisons",
        "generated_at": date.today().isoformat(),
        "method_definitions": {
            "raw_logistic_regression": "Logistic regression on standardised raw reflectance.",
            "pca_logistic_regression": (
                "Logistic regression on PCA features (n_components capped by sample/feature size)."
            ),
            "topic_logistic_regression": (
                "Logistic regression on K-dimensional LDA topic mixtures from band-frequency counts."
            ),
        },
        "alpha_significance": ALPHA_SIG,
        "labeled_scenes": scenes,
        "cross_dataset": cross_dataset_ranking(scenes) if scenes else None,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Wrote method statistics: {OUTPUT_PATH}")
    print(f"  scenes: {len(scenes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
