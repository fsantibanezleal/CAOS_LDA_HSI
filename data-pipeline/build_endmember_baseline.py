"""B-11 Endmember-extraction baseline (NFINDR / ATGP / NNLS unmixing).

Master plan Addendum B Axis G — fair HSI baseline alongside NMF and
LDA. Extends `build_segmentation_baselines.py`.

For each labelled scene:

  - Extract K endmembers via NFINDR (Winter 1999, custom implementation
    via PCA reduction + simplex-volume swap; pysptools' NFINDR is
    broken on current scipy due to scipy.linalg._flinalg removal) and
    ATGP (Ren-Chang 2003) from pysptools as a sanity check
  - Compute abundance maps via NNLS (scipy.optimize.nnls per pixel)
    with post-hoc sum-to-one renormalisation. This is a substitute
    for the FCLS in pysptools (which requires cvxopt that is not in
    the pipeline stack); the constraint set is the same shape (a >= 0,
    sum = 1) and the abundance pattern matches FCLS in practice.
  - Per-endmember: best matched topic from the canonical LDA fit by
    cosine of band profiles (uses `topic_views` / phi)

K is read from the existing LDA fit so endmembers and topics are
compared at the same dimensionality.

Output: data/derived/endmember_baseline/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import nnls

# pysptools 0.15.0 still uses np.int / np.float / np.bool which were
# removed in NumPy 1.24+. Patch the deprecated aliases before import.
if not hasattr(np, "int"):
    np.int = int  # type: ignore[attr-defined]
if not hasattr(np, "float"):
    np.float = float  # type: ignore[attr-defined]
if not hasattr(np, "bool"):
    np.bool = bool  # type: ignore[attr-defined]

from pysptools.eea import ATGP  # noqa: E402

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
TOPIC_VIEWS_DIR = DERIVED_DIR / "topic_views"
DERIVED_OUT_DIR = DERIVED_DIR / "endmember_baseline"

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
NFINDR_MAX_ITER = 3
SUM_TO_ONE_DELTA = 100.0  # Penalty weight in the augmented NNLS for sum-to-one


def safe_cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _augmented_volume(reduced_em: np.ndarray) -> float:
    """Volume of the simplex spanned by `reduced_em` (K rows, K-1 cols)
    via |det| of [1 | reduced_em] (without the (K-1)! factor — only
    the relative ordering matters)."""
    K = reduced_em.shape[0]
    aug = np.empty((K, K), dtype=np.float64)
    aug[:, 0] = 1.0
    aug[:, 1:] = reduced_em
    sign, logdet = np.linalg.slogdet(aug)
    if not np.isfinite(logdet):
        return 0.0
    return float(np.exp(logdet))


def custom_nfindr(X: np.ndarray, K: int, atgp_init: np.ndarray, seed: int = RANDOM_STATE) -> np.ndarray:
    """N-FINDR (Winter 1999) endmember extractor.

    X: (D, B) labelled-pixel set. Returns endmembers (K, B).
    """
    D, B = X.shape
    # PCA-reduce to K-1 dims
    Xc = X - X.mean(axis=0, keepdims=True)
    U, _, _ = np.linalg.svd(Xc, full_matrices=False)
    reduced = (U[:, : K - 1] * np.sqrt(D - 1)).astype(np.float64)  # (D, K-1)

    # Initial endmember indices from ATGP, fall back to random
    init_indices = np.asarray(atgp_init, dtype=np.int64).ravel()
    if init_indices.size != K:
        rng = np.random.default_rng(seed)
        init_indices = rng.choice(D, size=K, replace=False)

    em_idx = init_indices.copy()
    cur_em = reduced[em_idx]
    cur_vol = _augmented_volume(cur_em)

    for _ in range(NFINDR_MAX_ITER):
        improved = False
        for j in range(D):
            for i in range(K):
                trial = cur_em.copy()
                trial[i] = reduced[j]
                trial_vol = _augmented_volume(trial)
                if trial_vol > cur_vol * 1.0001:
                    cur_em = trial
                    cur_vol = trial_vol
                    em_idx[i] = j
                    improved = True
        if not improved:
            break

    return X[em_idx]


def nnls_unmix(X: np.ndarray, endmembers: np.ndarray, delta: float = SUM_TO_ONE_DELTA) -> np.ndarray:
    """Per-pixel non-negative least-squares unmixing with a sum-to-one
    penalty. Returns abundance matrix (D, K). Falls back to clipped
    UCLS for any pixel where NNLS exceeds its iteration budget."""
    D, B = X.shape
    K = endmembers.shape[0]
    A = np.vstack([endmembers.T, delta * np.ones((1, K))])  # (B+1, K)
    A_pinv = np.linalg.pinv(endmembers.T)  # (K, B) for UCLS fallback
    abund = np.zeros((D, K), dtype=np.float64)
    for j in range(D):
        b = np.append(X[j], delta)
        try:
            a, _ = nnls(A, b, maxiter=10 * (B + K + 1))
        except RuntimeError:
            # Fallback: unconstrained least-squares clipped to [0, inf)
            a = np.clip(A_pinv @ X[j], 0.0, None)
        s = a.sum()
        if s > 1e-12:
            a = a / s
        abund[j] = a
    return abund


def build_for_scene(scene_id: str, K_default: int = 8) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    fit_dir = LOCAL_FIT_DIR / scene_id
    K = K_default
    if (fit_dir / "phi.npy").exists():
        try:
            phi = np.load(fit_dir / "phi.npy")
            K = int(phi.shape[0])
        except Exception:
            K = K_default

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
    X = spectra[sample_idx_local].astype(np.float64)  # (D, B)
    D, B = X.shape
    if D < K:
        return None

    # ATGP (pysptools) — also returns the indices we use as NFINDR init
    atgp = ATGP()
    X_cube = X.reshape(D, 1, B).astype(np.float32)
    atgp_em = np.asarray(atgp.extract(X_cube, q=K, normalize=False), dtype=np.float64)
    if atgp_em.shape == (B, K):
        atgp_em = atgp_em.T
    # ATGP indices are stored on the instance after extract
    atgp_idx = np.asarray(getattr(atgp, "idx", []), dtype=np.int64).ravel()
    if atgp_idx.size != K:
        # Fallback: pick the K rows whose distance to X minus their cosine
        # mean is largest (heuristic). Use random instead for simplicity.
        rng = np.random.default_rng(RANDOM_STATE)
        atgp_idx = rng.choice(D, size=K, replace=False)

    # Custom NFINDR (Winter 1999) — geometric, volume-maximising
    nfindr_em = custom_nfindr(X, K=K, atgp_init=atgp_idx, seed=RANDOM_STATE)

    # NNLS-with-sum-to-one unmixing on NFINDR endmembers
    fcls_like_abund = nnls_unmix(X, nfindr_em, delta=SUM_TO_ONE_DELTA)

    # Reconstruction RMSE: X ~ A @ E
    recon = fcls_like_abund @ nfindr_em
    diff = X - recon
    rmse = float(np.sqrt(np.mean(diff * diff)))
    rmse_normalised = rmse / float(np.std(X)) if np.std(X) > 1e-12 else float("nan")

    # Topic ↔ endmember matching via cosine on band profiles
    tv_path = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    topic_endmember_match = None
    if tv_path.exists():
        tv = json.load(tv_path.open("r", encoding="utf-8"))
        profiles = np.asarray(tv["topic_band_profiles"], dtype=np.float64)
        if profiles.shape[1] == B:
            cos_matrix = np.zeros((profiles.shape[0], K), dtype=np.float64)
            for i in range(profiles.shape[0]):
                for j in range(K):
                    cos_matrix[i, j] = safe_cosine(profiles[i], nfindr_em[j])
            best_per_topic = np.argmax(cos_matrix, axis=1)
            best_per_endmember = np.argmax(cos_matrix, axis=0)
            topic_endmember_match = {
                "best_endmember_per_topic": [
                    {
                        "topic_id": int(i + 1),
                        "endmember_id": int(best_per_topic[i] + 1),
                        "cosine": round(float(cos_matrix[i, best_per_topic[i]]), 6),
                    }
                    for i in range(profiles.shape[0])
                ],
                "best_topic_per_endmember": [
                    {
                        "endmember_id": int(j + 1),
                        "topic_id": int(best_per_endmember[j] + 1),
                        "cosine": round(float(cos_matrix[best_per_endmember[j], j]), 6),
                    }
                    for j in range(K)
                ],
                "topic_x_endmember_cosine": [
                    [round(float(v), 6) for v in row] for row in cos_matrix
                ],
            }

    return {
        "scene_id": scene_id,
        "K": int(K),
        "n_pixels_used": int(D),
        "n_bands": int(B),
        "endmember_extractors": ["custom_NFINDR_winter1999", "ATGP_pysptools"],
        "unmixing_method": "scipy.optimize.nnls + sum-to-one penalty (delta=100) + post-hoc normalisation",
        "nfindr_endmembers": [
            [round(float(v), 6) for v in em.tolist()] for em in nfindr_em
        ],
        "atgp_endmembers": [
            [round(float(v), 6) for v in em.tolist()] for em in atgp_em
        ],
        "reconstruction_rmse_full_set": round(rmse, 6),
        "reconstruction_rmse_normalised": round(rmse_normalised, 6),
        "topic_endmember_match": topic_endmember_match,
        "framework_axis": "B-11 (master plan Addendum B Axis G + Axis B): NFINDR / ATGP endmembers + NNLS-with-sum-to-one unmixing as a fair HSI baseline alongside NMF and LDA",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_endmember_baseline v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[endmember] {scene_id} ...", flush=True)
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
        print(
            f"  K={payload['K']:2d}  D={payload['n_pixels_used']}  B={payload['n_bands']}  "
            f"NFINDR+NNLS rmse={payload['reconstruction_rmse_full_set']:.4f}  "
            f"normalised={payload['reconstruction_rmse_normalised']:.3f}",
            flush=True,
        )
        if payload["topic_endmember_match"]:
            top3 = payload["topic_endmember_match"]["best_endmember_per_topic"][:3]
            for r in top3:
                print(
                    f"    topic {r['topic_id']:2d} -> endmember {r['endmember_id']:2d}  cos={r['cosine']:.3f}",
                    flush=True,
                )
        written += 1
    print(f"[endmember] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
