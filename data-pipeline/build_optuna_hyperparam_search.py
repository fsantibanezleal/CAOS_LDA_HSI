"""Optuna Bayesian hyperparameter search for canonical LDA fits.

Replaces the failed octis route with a focused Optuna TPE study per
labelled scene. Searches:

  K            integer in [4, 16]
  alpha        log-uniform in [0.01, 1.0]   (doc-topic prior)
  eta          log-uniform in [0.01, 1.0]   (topic-word prior)

Objective: maximise gensim's c_v coherence on top-15 words plus an L2
penalty on test perplexity. Each trial fits a sklearn LatentDirichletAllocation
with the proposed (K, alpha, eta) on a 80/20 train-test split of the V1
band-frequency corpus and computes both metrics; the composite objective
is `c_v - 0.001 * perplexity_test`.

Output: data/derived/lda_hyperparam_search/<scene>.json
        data/local/lda_hyperparam_search/<scene>/study.pkl
"""
from __future__ import annotations

import json
import pickle
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import optuna
from sklearn.decomposition import LatentDirichletAllocation

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
    approximate_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)
from _mlflow_helper import mlflow_run

warnings.filterwarnings("ignore")
optuna.logging.set_verbosity(optuna.logging.WARNING)


LOCAL_OUT_DIR = DATA_DIR / "local" / "lda_hyperparam_search"
DERIVED_OUT_DIR = DERIVED_DIR / "lda_hyperparam_search"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
N_TRIALS = 30
SAMPLES_PER_CLASS = 220
SCALE = 12
TRAIN_FRAC = 0.8
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def gensim_c_v(phi: np.ndarray, vocab: list[str], doc_term: np.ndarray, top_n: int = 15) -> float:
    from gensim import corpora
    from gensim.models import CoherenceModel

    K = phi.shape[0]
    texts = []
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        tokens = []
        for i in nz:
            count = int(doc_term[d, int(i)])
            if count > 0:
                tokens.extend([vocab[int(i)]] * count)
        texts.append(tokens or [vocab[0]])

    dictionary = corpora.Dictionary([[t] for t in vocab])
    dictionary.token2id = {t: i for i, t in enumerate(vocab)}
    dictionary.id2token = {i: t for i, t in enumerate(vocab)}

    top_topics_tokens = []
    for k in range(K):
        order = np.argsort(phi[k])[::-1][:top_n]
        top_topics_tokens.append([vocab[int(i)] for i in order])

    try:
        cm = CoherenceModel(
            topics=top_topics_tokens, texts=texts,
            dictionary=dictionary, coherence="c_v",
        )
        return float(cm.get_coherence())
    except Exception:
        return 0.0


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
    labels = flat_labels[pixel_indices]
    sample_idx = stratified_sample_indices(labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE)
    sample_spectra = spectra[sample_idx]
    doc_term = band_frequency_counts(sample_spectra, scale=SCALE).astype(np.float32)
    D = doc_term.shape[0]
    wavelengths = approximate_wavelengths(config, B)
    vocab = [f"{int(round(float(wavelengths[i]))):04d}nm" for i in range(B)]

    rng = np.random.default_rng(RANDOM_STATE)
    perm = rng.permutation(D)
    n_train = int(D * TRAIN_FRAC)
    train_idx = perm[:n_train]
    test_idx = perm[n_train:]
    doc_train = doc_term[train_idx]
    doc_test = doc_term[test_idx]

    def objective(trial: optuna.Trial) -> float:
        K = trial.suggest_int("K", 4, 16)
        alpha = trial.suggest_float("alpha", 0.01, 1.0, log=True)
        eta = trial.suggest_float("eta", 0.01, 1.0, log=True)
        lda = LatentDirichletAllocation(
            n_components=K, learning_method="online", max_iter=40,
            batch_size=512, random_state=RANDOM_STATE,
            doc_topic_prior=alpha, topic_word_prior=eta,
        )
        try:
            lda.fit(doc_train)
            phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)
            perp = float(lda.perplexity(doc_test))
            cv = gensim_c_v(phi, vocab, doc_term)
            return cv - 0.001 * perp
        except Exception:
            return -1e9

    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=RANDOM_STATE))
    study.optimize(objective, n_trials=N_TRIALS, show_progress_bar=False)

    local_dir = LOCAL_OUT_DIR / scene_id
    local_dir.mkdir(parents=True, exist_ok=True)
    with (local_dir / "study.pkl").open("wb") as h:
        pickle.dump(study, h)

    trials = [
        {
            "number": int(t.number),
            "value": (round(float(t.value), 6) if t.value is not None else None),
            "params": dict(t.params),
            "state": str(t.state),
        }
        for t in study.trials
    ]

    return {
        "scene_id": scene_id,
        "n_trials": int(N_TRIALS),
        "search_space": {
            "K": "int [4, 16]",
            "alpha": "log-uniform [0.01, 1.0]",
            "eta": "log-uniform [0.01, 1.0]",
        },
        "objective": "c_v(top_15) - 0.001 * perplexity_test",
        "best_value": round(float(study.best_value), 6),
        "best_params": dict(study.best_params),
        "trials": trials,
        "samples_per_class": SAMPLES_PER_CLASS,
        "wordification": "band-frequency",
        "quantization_scale": int(SCALE),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_optuna_hyperparam_search v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[optuna] {scene_id} ...", flush=True)
        with mlflow_run(
            "build_optuna_hyperparam_search",
            scene_id=scene_id,
            params={
                "n_trials": N_TRIALS,
                "samples_per_class": SAMPLES_PER_CLASS,
                "scale": SCALE,
                "train_fraction": TRAIN_FRAC,
                "random_state": RANDOM_STATE,
            },
        ) as run:
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
            bp = payload["best_params"]
            run.log_metric("best_value", float(payload["best_value"]))
            run.log_metric("best_K", float(bp["K"]))
            run.log_metric("best_alpha", float(bp["alpha"]))
            run.log_metric("best_eta", float(bp["eta"]))
            run.log_artifact(str(out_path))
            print(
                f"  best K={bp['K']} alpha={bp['alpha']:.3f} eta={bp['eta']:.3f} "
                f"objective={payload['best_value']:.4f}",
                flush=True,
            )
            written += 1
    print(f"[optuna] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
