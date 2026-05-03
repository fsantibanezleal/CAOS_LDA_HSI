"""B-9 Topic-anomaly score: 1 - max(theta) and reconstruction NLL.

Master plan Addendum B Axis B / extension of `build_validation_blocks`.

For each labelled scene compute, per sampled document:

  - confidence = max_k theta_d(k); anomaly_softmax = 1 - confidence
  - reconstruction NLL = - sum_w doc_w * log(theta_d @ phi)_w on the
    band-frequency document — large NLL means the LDA mixture poorly
    explains the document
  - per-class summary: median + p95 of each anomaly score, plus
    Spearman correlation between confidence and the document's
    macro-F1 contribution (proxy: 1[predicted_class == true_class])

The HIDSAG XRD-flagged-outlier ROC requested by the master plan is
deferred — it requires per-cube flag labels not currently in the
curated subset metadata. The labelled-scene readouts above already
deliver Axis B's anomaly-indicator framing.

Output: data/derived/topic_anomaly/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import CLASS_NAMES, has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "topic_anomaly"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SCALE = 12
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def per_doc_negative_log_likelihood(theta: np.ndarray, phi: np.ndarray, doc_term: np.ndarray) -> np.ndarray:
    """NLL_d = - sum_w doc_term[d, w] * log((theta @ phi)[d, w] + eps).

    Returns (D,)."""
    eps = 1e-12
    pwd = theta @ phi  # (D, V)
    log_pwd = np.log(np.clip(pwd, eps, None))
    return -np.einsum("dw,dw->d", doc_term, log_pwd)


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    fit_dir = LOCAL_FIT_DIR / scene_id
    needed = ["theta.npy", "phi.npy", "sample_labels.npy"]
    for fn in needed:
        if not (fit_dir / fn).exists():
            return None
    theta = np.load(fit_dir / "theta.npy")  # (D, K)
    phi = np.load(fit_dir / "phi.npy")  # (K, V)
    sample_labels = np.load(fit_dir / "sample_labels.npy")
    if theta.shape[0] != sample_labels.shape[0]:
        return None
    K = int(theta.shape[1])

    # Reconstruct the band-frequency doc-term matrix for the sampled
    # documents (so NLL is on the same data the LDA was fit on).
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
    if X.shape[0] != theta.shape[0]:
        return None
    doc_term = band_frequency_counts(X, scale=SCALE).astype(np.float32)

    confidence = theta.max(axis=1)
    anomaly_softmax = 1.0 - confidence
    nll = per_doc_negative_log_likelihood(theta, phi, doc_term)

    # Theta-logistic prediction as the proxy for "is this doc easy to classify"
    clf = LogisticRegression(max_iter=2000, C=1.0)
    clf.fit(theta, sample_labels)
    pred = clf.predict(theta)
    correct = (pred == sample_labels).astype(np.int32)

    # Spearman correlations between anomaly indicators and (1 - correct)
    rho_softmax, p_softmax = spearmanr(anomaly_softmax, 1 - correct)
    rho_nll, p_nll = spearmanr(nll, 1 - correct)

    # Per-class summary
    name_map = CLASS_NAMES.get(scene_id, {})
    classes = np.sort(np.unique(sample_labels))
    per_class = []
    for c in classes:
        mask = sample_labels == c
        if mask.sum() < 5:
            continue
        per_class.append({
            "class_id": int(c),
            "class_name": name_map.get(int(c), None),
            "n_documents": int(mask.sum()),
            "anomaly_softmax_median": round(float(np.median(anomaly_softmax[mask])), 6),
            "anomaly_softmax_p95": round(float(np.percentile(anomaly_softmax[mask], 95)), 6),
            "nll_median": round(float(np.median(nll[mask])), 6),
            "nll_p95": round(float(np.percentile(nll[mask], 95)), 6),
            "fraction_misclassified": round(float(1.0 - correct[mask].mean()), 6),
        })

    return {
        "scene_id": scene_id,
        "topic_count": K,
        "n_documents": int(theta.shape[0]),
        "indicators": {
            "anomaly_softmax_global": {
                "mean": round(float(anomaly_softmax.mean()), 6),
                "median": round(float(np.median(anomaly_softmax)), 6),
                "p95": round(float(np.percentile(anomaly_softmax, 95)), 6),
                "max": round(float(anomaly_softmax.max()), 6),
            },
            "nll_global": {
                "mean": round(float(nll.mean()), 6),
                "median": round(float(np.median(nll)), 6),
                "p95": round(float(np.percentile(nll, 95)), 6),
                "max": round(float(nll.max()), 6),
            },
        },
        "anomaly_to_misclassification_correlation": {
            "spearman_rho_softmax": round(float(rho_softmax), 6),
            "spearman_p_softmax": round(float(p_softmax), 6),
            "spearman_rho_nll": round(float(rho_nll), 6),
            "spearman_p_nll": round(float(p_nll), 6),
            "comment": "Positive rho means docs with higher anomaly indicator are more likely misclassified by theta_logistic.",
        },
        "per_class_summary": per_class,
        "framework_axis": "B-9 (master plan Addendum B Axis B): topic-anomaly indicators 1 - max(theta) and reconstruction NLL with per-class summary",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_anomaly v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[anomaly] {scene_id} ...", flush=True)
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
        ind = payload["indicators"]
        cor = payload["anomaly_to_misclassification_correlation"]
        print(
            f"  K={payload['topic_count']:2d}  "
            f"softmax median={ind['anomaly_softmax_global']['median']:.3f}  "
            f"NLL median={ind['nll_global']['median']:.1f}  "
            f"rho(softmax,miscls)={cor['spearman_rho_softmax']:+.3f}  "
            f"rho(NLL,miscls)={cor['spearman_rho_nll']:+.3f}",
            flush=True,
        )
        written += 1
    print(f"[anomaly] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
