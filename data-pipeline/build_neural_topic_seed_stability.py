"""Multi-seed neural topic model stability + comparison.

Runs ProdLDA and ETM at N seeds per scene, computes per-seed
KMeans(theta) ARI vs label and c_v topic coherence, then aggregates
mean ± std across seeds. Produces per-scene comparison JSON with
proper variance estimates that the cycle-61 single-seed comparison
lacked.

Output: data/derived/neural_topic_seed_stability/<scene>.json
API:    /api/neural-topic-seed-stability/{scene_id}

Companion to build_deep_seed_stability (cycle 19+) for the neural
topic family. Default N=5 (env CAOS_NEURAL_TOPIC_SEEDS).

GPU-accelerated via cycle 59 refactor (~30s per fit).
"""
from __future__ import annotations

import json
import os
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import load_scene
from research_core.class_catalog import has_labels

warnings.filterwarnings("ignore")

SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

OUTPUT_DIR = DERIVED_DIR / "neural_topic_seed_stability"
N_SEEDS = int(os.environ.get("CAOS_NEURAL_TOPIC_SEEDS", "5"))
SAMPLES_PER_CLASS = 220
SCALE = 20  # match build_topic_model_variants for c_v vocab compatibility


def stratified_sample_indices(labels: np.ndarray, per_class: int, random_state: int = 42) -> np.ndarray:
    rng = np.random.default_rng(random_state)
    out: list[int] = []
    classes = np.unique(labels)
    for c in classes:
        if int(c) <= 0:
            continue
        idx = np.flatnonzero(labels == c)
        if idx.size == 0:
            continue
        if idx.size > per_class:
            idx = rng.choice(idx, per_class, replace=False)
        out.extend(idx.tolist())
    return np.asarray(sorted(out), dtype=np.int64)


def valid_spectra_mask(flat_cube: np.ndarray) -> np.ndarray:
    return np.isfinite(flat_cube).all(axis=1) & (flat_cube.std(axis=1) > 1e-6)


def band_frequency_counts(spectra: np.ndarray, scale: int = SCALE) -> np.ndarray:
    lo = spectra.min(axis=1, keepdims=True)
    hi = spectra.max(axis=1, keepdims=True)
    rng = np.where(hi - lo > 1e-6, hi - lo, 1.0)
    norm = (spectra - lo) / rng
    return np.rint(norm * scale).astype(np.int32)


def approximate_wavelengths(config, B: int) -> np.ndarray:
    wls = getattr(config, "wavelengths_nm", None)
    if wls is not None and len(wls) == B:
        return np.asarray(wls, dtype=np.float32)
    return np.linspace(400.0, 2500.0, B, dtype=np.float32)


def kmeans_ari(theta: np.ndarray, labels: np.ndarray) -> dict:
    n_classes = int(np.unique(labels).size)
    if n_classes < 2:
        return {"ari": 0.0, "nmi": 0.0}
    km = KMeans(n_clusters=n_classes, n_init=10, random_state=42).fit(theta)
    return {
        "ari": round(float(adjusted_rand_score(labels, km.labels_)), 6),
        "nmi": round(float(normalized_mutual_info_score(labels, km.labels_)), 6),
    }


def coherence_cv(phi: np.ndarray, vocab: list[str], doc_term: np.ndarray, top_n: int = 15) -> float | None:
    try:
        from gensim import corpora
        from gensim.models import CoherenceModel
    except ImportError:
        return None
    K = phi.shape[0]
    texts = []
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        tokens: list[str] = []
        for i in nz:
            count = int(doc_term[d, int(i)])
            if count > 0:
                tokens.extend([vocab[int(i)]] * count)
        texts.append(tokens or [vocab[0]])
    dictionary = corpora.Dictionary([[t] for t in vocab])
    dictionary.token2id = {t: i for i, t in enumerate(vocab)}
    dictionary.id2token = {i: t for i, t in enumerate(vocab)}
    top_tokens = [
        [vocab[int(i)] for i in np.argsort(phi[k])[::-1][:top_n]]
        for k in range(K)
    ]
    try:
        # processes=1 avoids pthread_create errors observed in long
        # multi-seed sweeps where worker pools accumulate.
        cm = CoherenceModel(
            topics=top_tokens,
            texts=texts,
            dictionary=dictionary,
            coherence="c_v",
            processes=1,
        )
        return round(float(cm.get_coherence()), 6)
    except Exception:
        return None


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, config = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels_full = flat_labels[pixel_indices]
    sample_idx = stratified_sample_indices(labels_full, SAMPLES_PER_CLASS, random_state=42)
    sample_spectra = spectra[sample_idx]
    sample_labels = labels_full[sample_idx]
    doc_term = band_frequency_counts(sample_spectra, scale=SCALE).astype(np.float32)
    wavelengths = approximate_wavelengths(config, B)
    vocab = [f"{int(round(float(wavelengths[i]))):04d}nm" for i in range(B)]

    n_classes = int(np.unique(sample_labels).size)
    K = max(4, min(12, n_classes))

    sys.path.insert(0, str(Path(__file__).parent))
    from build_neural_topic_models import fit_prodlda, fit_etm

    methods: dict = {}
    for method_name in ("prodlda", "etm"):
        per_seed: list[dict] = []
        for seed in range(N_SEEDS):
            try:
                if method_name == "prodlda":
                    fit = fit_prodlda(doc_term, K, seed=seed)
                else:
                    fit = fit_etm(doc_term, K, seed=seed)
                ari = kmeans_ari(fit["theta"], sample_labels)
                cv = coherence_cv(fit["phi"], vocab, doc_term.astype(np.int32))
                per_seed.append({
                    "seed": seed,
                    "ari": ari["ari"],
                    "nmi": ari["nmi"],
                    "c_v": cv,
                })
            except Exception as exc:  # pragma: no cover
                per_seed.append({"seed": seed, "error": str(exc)})

        valid_ari = [s["ari"] for s in per_seed if "ari" in s]
        valid_cv = [s["c_v"] for s in per_seed if s.get("c_v") is not None]
        methods[method_name] = {
            "K": int(K),
            "n_seeds": N_SEEDS,
            "per_seed": per_seed,
            "ari_mean": round(float(np.mean(valid_ari)), 6) if valid_ari else None,
            "ari_std": round(float(np.std(valid_ari)), 6) if valid_ari else None,
            "ari_min": round(float(np.min(valid_ari)), 6) if valid_ari else None,
            "ari_max": round(float(np.max(valid_ari)), 6) if valid_ari else None,
            "c_v_mean": round(float(np.mean(valid_cv)), 6) if valid_cv else None,
            "c_v_std": round(float(np.std(valid_cv)), 6) if valid_cv else None,
        }

    ranking = sorted(
        [(name, m["ari_mean"]) for name, m in methods.items() if m.get("ari_mean") is not None],
        key=lambda x: x[1],
        reverse=True,
    )

    return {
        "scene_id": scene_id,
        "n_documents": int(sample_labels.shape[0]),
        "n_classes": n_classes,
        "K": int(K),
        "n_seeds": N_SEEDS,
        "methods": methods,
        "ranking_by_ari_mean": [{"method": n, "ari_mean": round(float(a), 6)} for n, a in ranking],
        "framework_axis": f"Cycle 63: ProdLDA + ETM seed stability (N={N_SEEDS}). Per-seed KMeans-vs-label ARI/NMI + c_v coherence with mean ± std aggregates.",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_neural_topic_seed_stability v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in SCENES:
        print(f"[neural_tm_seed] {scene_id} (N={N_SEEDS} seeds × 2 methods) ...", flush=True)
        payload = build_for_scene(scene_id)
        if not payload:
            print("  skipped (no LDA fit)", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        for name, m in payload["methods"].items():
            if m.get("ari_mean") is not None:
                print(
                    f"  {name:8s} ari={m['ari_mean']:+.3f}±{m['ari_std']:.3f} "
                    f"c_v={m['c_v_mean']:+.3f}±{m['c_v_std']:.3f}",
                    flush=True,
                )
        written += 1
    print(f"[neural_tm_seed] done — {written} scenes written", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
