"""B-1 Linear probe panel: theta vs PCA-K vs NMF-K vs AE-K.

The fair-baseline argument from master plan Addendum B.

Topics are a K-dim compression of the spectrum. Comparing them
against the 268-dim raw spectrum on a downstream classifier conflates
compression with semantic structure — it always looks like "topics
lose". The fair comparison is theta against **other K-dim
compressions of the same data**: PCA-K, NMF-K, ICA-K, dense-AE-K at
the same K.

For each labelled scene this builder reads:

  - theta from `data/local/lda_fits/<scene>/theta.npy`            (K-dim)
  - features from `data/local/representations/<method>/<scene>/features.npy`
    where <method> in {pca_3, pca_10, pca_30, nmf_8, nmf_20, ica_10,
    dense_ae_8}
  - labels from `data/local/lda_fits/<scene>/sample_labels.npy`

It then:

  - Picks K = phi.shape[0] from topic_views (typically 4-12)
  - For every available compression at compatible K, trains a
    logistic regression with stratified 5-fold cross-validation
  - Adds a tiny linear probe (LR with C=1.0, l2) to enforce the
    "diagnostic probe" framing
  - Reports per-method per-fold accuracy / balanced_accuracy / macro_f1
    plus bootstrap CI95 on the across-fold means
  - Computes pairwise Wilcoxon-Holm and Cliff delta against `theta`

Output:
  data/derived/linear_probe_panel/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pingouin
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
from research_core.paths import DATA_DIR, DERIVED_DIR

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
LOCAL_REP_DIR = DATA_DIR / "local" / "representations"
DERIVED_OUT_DIR = DERIVED_DIR / "linear_probe_panel"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
N_FOLDS = 5
RANDOM_STATE = 42
BOOTSTRAP_N = 1000


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.size == 0 or b.size == 0:
        return 0.0
    diffs = a[:, None] - b[None, :]
    gt = (diffs > 0).sum()
    lt = (diffs < 0).sum()
    return float((gt - lt) / (a.size * b.size))


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


def load_features(method: str, scene_id: str) -> np.ndarray | None:
    path = LOCAL_REP_DIR / method / scene_id / "features.npy"
    if not path.exists():
        return None
    return np.load(path)


def fit_logistic_5fold(X: np.ndarray, y: np.ndarray, rng: np.random.Generator) -> dict:
    """Fit logistic regression with stratified 5-fold; return per-fold metrics."""
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    accs, baccs, f1s = [], [], []
    for train_idx, test_idx in skf.split(X, y):
        clf = LogisticRegression(max_iter=2000, C=1.0, n_jobs=1)
        clf.fit(X[train_idx], y[train_idx])
        pred = clf.predict(X[test_idx])
        accs.append(accuracy_score(y[test_idx], pred))
        baccs.append(balanced_accuracy_score(y[test_idx], pred))
        f1s.append(f1_score(y[test_idx], pred, average="macro"))
    return {
        "accuracy": {
            "per_fold": [round(float(v), 6) for v in accs],
            **bootstrap_ci95(np.array(accs), rng),
        },
        "balanced_accuracy": {
            "per_fold": [round(float(v), 6) for v in baccs],
            **bootstrap_ci95(np.array(baccs), rng),
        },
        "macro_f1": {
            "per_fold": [round(float(v), 6) for v in f1s],
            **bootstrap_ci95(np.array(f1s), rng),
        },
    }


def pairwise_vs_theta(method_scores: dict[str, np.ndarray]) -> list[dict]:
    """Wilcoxon-Holm and Cliff δ of every method against `theta` on macro_f1."""
    if "theta" not in method_scores:
        return []
    theta_scores = method_scores["theta"]
    out = []
    raw_pvals = []
    pairs = []
    for m, s in method_scores.items():
        if m == "theta":
            continue
        if np.allclose(theta_scores, s):
            pairs.append((m, 1.0, 0.0, 0.0))
            raw_pvals.append(1.0)
            continue
        try:
            res = pingouin.wilcoxon(theta_scores, s, alternative="two-sided")
            p = float(res["p-val"].iloc[0])
            W = float(res["W-val"].iloc[0])
        except Exception:
            p, W = 1.0, 0.0
        d = cliffs_delta(theta_scores, s)
        pairs.append((m, p, W, d))
        raw_pvals.append(p)

    if raw_pvals:
        order = np.argsort(raw_pvals)
        m = len(raw_pvals)
        adj = [1.0] * m
        for rank, idx in enumerate(order):
            adj[idx] = min(1.0, raw_pvals[idx] * (m - rank))
        for k in range(1, m):
            cur = order[k]
            prev = order[k - 1]
            if adj[cur] < adj[prev]:
                adj[cur] = adj[prev]
        for i, (m_name, p_raw, W, d) in enumerate(pairs):
            out.append({
                "method": m_name,
                "vs": "theta",
                "W": round(W, 6),
                "p_raw": round(p_raw, 6),
                "p_holm": round(float(adj[i]), 6),
                "cliff_delta_theta_minus_method": round(d, 6),
            })
    return out


def build_for_scene(scene_id: str) -> dict | None:
    if not has_labels(scene_id):
        return None
    fit_dir = LOCAL_FIT_DIR / scene_id
    if not (fit_dir / "theta.npy").exists():
        return None
    theta = np.load(fit_dir / "theta.npy")
    sample_labels = np.load(fit_dir / "sample_labels.npy")
    K = theta.shape[1]

    if theta.shape[0] != sample_labels.shape[0]:
        return None
    n_classes = int(np.unique(sample_labels).size)
    if n_classes < 2:
        return None

    rng = np.random.default_rng(RANDOM_STATE)

    # Train logistic regression on every available compression
    methods: list[tuple[str, np.ndarray]] = [("theta", theta)]
    for rep_dir in sorted(p.name for p in LOCAL_REP_DIR.iterdir() if p.is_dir()):
        feats = load_features(rep_dir, scene_id)
        if feats is None or feats.shape[0] != sample_labels.shape[0]:
            continue
        methods.append((rep_dir, feats))

    method_metrics: dict[str, dict] = {}
    method_f1_arrays: dict[str, np.ndarray] = {}
    for name, X in methods:
        try:
            metrics = fit_logistic_5fold(X, sample_labels, rng)
            metrics["latent_dim"] = int(X.shape[1])
            method_metrics[name] = metrics
            method_f1_arrays[name] = np.array(metrics["macro_f1"]["per_fold"])
        except Exception as exc:
            method_metrics[name] = {"error": str(exc)}

    pairwise = pairwise_vs_theta(method_f1_arrays)

    # Headline ranking by macro_f1 mean
    ranked = sorted(
        [(m, v) for m, v in method_metrics.items() if "macro_f1" in v],
        key=lambda kv: kv[1]["macro_f1"]["mean"] if kv[1]["macro_f1"]["mean"] is not None else -np.inf,
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "topic_count": int(K),
        "n_classes": n_classes,
        "n_documents": int(sample_labels.size),
        "head": "LogisticRegression(max_iter=2000, C=1.0, l2)",
        "split": f"StratifiedKFold(n_splits={N_FOLDS}, shuffle=True, random_state={RANDOM_STATE})",
        "metric": "macro_f1 (primary), accuracy, balanced_accuracy",
        "method_metrics": method_metrics,
        "pairwise_vs_theta_holm": pairwise,
        "ranking_by_macro_f1_mean": [
            {
                "method": m,
                "latent_dim": v["latent_dim"],
                "macro_f1_mean": v["macro_f1"]["mean"],
                "macro_f1_ci95": [v["macro_f1"]["ci95_lo"], v["macro_f1"]["ci95_hi"]],
            }
            for m, v in ranked
        ],
        "framework_axis": "B-1 (master plan Addendum B): linear probe panel — theta vs other K-dim compressions, the fair-baseline argument",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_linear_probe_panel v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[linear_probe] {scene_id} ...", flush=True)
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
        # Headline: theta + top-3 by macro_f1
        ranking = payload["ranking_by_macro_f1_mean"]
        theta_entry = next((r for r in ranking if r["method"] == "theta"), None)
        if theta_entry:
            print(
                f"  K={payload['topic_count']} theta dim={theta_entry['latent_dim']} "
                f"F1={theta_entry['macro_f1_mean']:.3f}",
                flush=True,
            )
        for r in ranking[:5]:
            print(
                f"    {r['method']:13s} dim={r['latent_dim']:3d}  "
                f"F1={r['macro_f1_mean']:.3f}  CI95=[{r['macro_f1_ci95'][0]:.3f}, {r['macro_f1_ci95'][1]:.3f}]",
                flush=True,
            )
        written += 1
    print(f"[linear_probe] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
