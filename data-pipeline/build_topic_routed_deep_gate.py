"""B-3 follow-up: topic-routed classifier with CAE-1D latent as the GATE
(not the LDA θ). Tests the master-plan thesis "any encoder as a gate
beats raw" vs the alternative "θ specifically beats other gates".

For each labelled scene, builds gates from:
  - LDA θ (canonical, K=12 typical)         — the original B-3 method
  - CAE-1D K=8 latent                       — deep gate
  - β-VAE K=8 latent                        — deep gate with KL
  - PCA K=8 features                        — classical determinist gate

The K-dim latent is row-normalised via softmax to live on the simplex,
then used as `sample_weight` for K per-component logistic regressions
on the raw spectrum. Test prediction is the soft mixture
`Σ_k weight_k(x) · P_k(y|x)`.

Compared against `raw_logistic` (no gate baseline) on the same 5-fold
StratifiedKFold split.

Output: data/derived/topic_routed_deep_gate/<scene>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)


OUTPUT_DIR = DERIVED_DIR / "topic_routed_deep_gate"
LDA_FIT_DIR = DATA_DIR / "local" / "lda_fits"
REPR_DIR = DATA_DIR / "local" / "representations"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
GATE_METHODS = ["theta", "cae_1d_8", "beta_vae_8", "pca_8"]


def normalize_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = values.min(axis=1, keepdims=True)
    high = values.max(axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def softmax_rows(z: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = z.astype(np.float64) / max(temperature, 1e-6)
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def load_theta_for_scene(scene_id: str) -> np.ndarray | None:
    fit_dir = LDA_FIT_DIR / scene_id
    theta_path = fit_dir / "theta.npy"
    if not theta_path.exists():
        return None
    return np.load(theta_path)


def load_repr_for_scene(method: str, scene_id: str) -> np.ndarray | None:
    p = REPR_DIR / method / scene_id / "features.npy"
    if not p.exists():
        return None
    return np.load(p)


def build_gate(method: str, scene_id: str) -> np.ndarray | None:
    """Build a row-normalised gate matrix (N, K) for the given method."""
    if method == "theta":
        theta = load_theta_for_scene(scene_id)
        if theta is None:
            return None
        # theta already lives on simplex
        s = theta.sum(axis=1, keepdims=True)
        s = np.where(s < 1e-6, 1.0, s)
        return (theta / s).astype(np.float32)
    feats = load_repr_for_scene(method, scene_id)
    if feats is None:
        return None
    # Softmax to simplex; temperature 1.0 default
    return softmax_rows(feats, temperature=1.0).astype(np.float32)


def topic_routed_soft_predict(
    spectra_train: np.ndarray,
    spectra_test: np.ndarray,
    y_train: np.ndarray,
    gate_train: np.ndarray,
    gate_test: np.ndarray,
    classes_: np.ndarray,
) -> np.ndarray:
    K = gate_train.shape[1]
    n_test = spectra_test.shape[0]
    n_classes = len(classes_)
    proba = np.zeros((n_test, n_classes), dtype=np.float64)
    for k in range(K):
        w = gate_train[:, k]
        if w.sum() < 1e-6:
            continue
        try:
            clf = LogisticRegression(
                max_iter=500, C=1.0, multi_class="auto", solver="lbfgs"
            )
            clf.fit(spectra_train, y_train, sample_weight=w)
            class_to_col = {c: ci for ci, c in enumerate(classes_)}
            local_probs = clf.predict_proba(spectra_test)
            local_classes = clf.classes_
            for li, lc in enumerate(local_classes):
                if lc in class_to_col:
                    proba[:, class_to_col[lc]] += (
                        gate_test[:, k] * local_probs[:, li]
                    )
        except Exception:
            continue
    pred = classes_[proba.argmax(axis=1)]
    return pred


def fit_method(
    spectra: np.ndarray,
    labels: np.ndarray,
    gate: np.ndarray | None,
) -> dict:
    """5-fold StratifiedKFold. If gate is None, use raw_logistic
    baseline. Otherwise topic_routed_soft using the gate."""
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    f1s, accs, baccs = [], [], []
    classes = np.unique(labels)
    for tr, te in skf.split(spectra, labels):
        Xtr, Xte = spectra[tr], spectra[te]
        ytr, yte = labels[tr], labels[te]
        if gate is None:
            clf = LogisticRegression(
                max_iter=2000, C=1.0, multi_class="auto", solver="lbfgs"
            )
            clf.fit(Xtr, ytr)
            pred = clf.predict(Xte)
        else:
            pred = topic_routed_soft_predict(
                Xtr, Xte, ytr, gate[tr], gate[te], classes
            )
        f1s.append(float(f1_score(yte, pred, average="macro", zero_division=0)))
        accs.append(float(accuracy_score(yte, pred)))
        baccs.append(float(balanced_accuracy_score(yte, pred)))
    return {
        "macro_f1": {
            "per_fold": [round(v, 6) for v in f1s],
            "mean": round(float(np.mean(f1s)), 6),
            "std": round(float(np.std(f1s)), 6),
            "ci95_lo": round(float(np.mean(f1s) - 1.96 * np.std(f1s) / np.sqrt(5)), 6),
            "ci95_hi": round(float(np.mean(f1s) + 1.96 * np.std(f1s) / np.sqrt(5)), 6),
        },
        "accuracy": {
            "mean": round(float(np.mean(accs)), 6),
            "std": round(float(np.std(accs)), 6),
        },
        "balanced_accuracy": {
            "mean": round(float(np.mean(baccs)), 6),
            "std": round(float(np.std(baccs)), 6),
        },
    }


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra_raw = flat[pixel_indices]
    labels_full = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(
        labels_full, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    spectra = spectra_raw[sample_idx_local]
    labels = labels_full[sample_idx_local]
    spectra_norm = normalize_per_row(spectra)

    method_metrics: dict[str, dict] = {}
    method_metrics["raw_logistic"] = fit_method(spectra_norm, labels, gate=None)
    for gm in GATE_METHODS:
        gate = build_gate(gm, scene_id)
        if gate is None:
            method_metrics[f"{gm}_routed"] = {"error": f"gate {gm} unavailable"}
            continue
        if gate.shape[0] != labels.shape[0]:
            method_metrics[f"{gm}_routed"] = {
                "error": f"gate shape {gate.shape} mismatches labels {labels.shape}"
            }
            continue
        method_metrics[f"{gm}_routed"] = fit_method(spectra_norm, labels, gate=gate)
        method_metrics[f"{gm}_routed"]["gate_method"] = gm
        method_metrics[f"{gm}_routed"]["gate_K"] = int(gate.shape[1])

    ranked = sorted(
        [(k, v) for k, v in method_metrics.items() if "macro_f1" in v],
        key=lambda kv: kv[1]["macro_f1"]["mean"],
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "n_documents": int(labels.size),
        "n_classes": int(np.unique(labels).size),
        "gate_methods": GATE_METHODS,
        "method_metrics": method_metrics,
        "ranked_by_macro_f1_mean": [
            {
                "method": k,
                "macro_f1_mean": v["macro_f1"]["mean"],
                "macro_f1_ci95": [
                    v["macro_f1"]["ci95_lo"],
                    v["macro_f1"]["ci95_hi"],
                ],
            }
            for k, v in ranked
        ],
        "framework_axis": "B-3 follow-up: topic-routed classifier with deep encoders as gates (CAE-1D, beta-VAE, PCA, theta) — tests whether any encoder as gate beats raw, or theta specifically dominates",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_routed_deep_gate v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for sc in LABELLED_SCENES:
        print(f"[deep_gate] {sc} ...", flush=True)
        try:
            payload = build_for_scene(sc)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            continue
        out = OUTPUT_DIR / f"{sc}.json"
        out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        rk = payload["ranked_by_macro_f1_mean"]
        if rk:
            best = rk[0]
            print(f"  best: {best['method']} F1={best['macro_f1_mean']:.3f}", flush=True)
        written += 1
    print(f"[deep_gate] done -- {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
