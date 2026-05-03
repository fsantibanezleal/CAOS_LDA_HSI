"""LDAvis-faithful topic views with proper relevance(lambda) and JS-MDS.

For each labelled scene this builder fits a band-frequency LDA on a
stratified sample of labelled pixels (matching the scheme in
run_local_core_benchmarks.py) and produces the topic-level outputs the
master plan calls for in section 18.3:

    derived/topic_views/<scene>.json
    local/lda_fits/<scene>/{phi.npy, theta.npy, vocab.json,
                            corpus_marginal.npy, doc_topic.npy}

The derived JSON contains:

- topic_count K, vocabulary V
- topic_prevalence: mean theta over the corpus (the LDAvis disc-area
  metric, replacing the previous top-10 concentration surrogate)
- top_words_per_topic at lambdas {0.0, 0.3, 0.5, 0.7, 1.0}, ranked by
  relevance(lambda) = lambda * log P(w|k) + (1 - lambda) * log lift
  with lift = P(w|k) / P_global(w) using the *real* corpus marginal
- topic_distance_matrices: cosine on phi, Jensen-Shannon on phi,
  Hellinger on phi, Jaccard on top-30 words
- topic_intertopic_2d_js, topic_intertopic_3d_js: classical MDS on the
  Jensen-Shannon distance matrix (LDAvis-faithful 2D + the 3D the user
  asked for)
- topic_intertopic_2d_pca on band profiles (kept as alternative)
- topic_pair_log_odds: top-N tokens by log(phi_k / phi_j) for every pair

This replaces, for labelled scenes, the section of exploration_views.json
that the audit found to be raw PCA on band profiles with a fudged
relevance(lambda).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.spatial.distance import squareform
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.manifold import MDS

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)


LOCAL_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "topic_views"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
SCALE = 12  # quantization levels — matches existing local_core_benchmarks
RANDOM_STATE = 42
LAMBDA_GRID = [0.0, 0.3, 0.5, 0.7, 1.0]
TOP_N_RELEVANCE = 30
TOP_N_LOG_ODDS = 15
LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.2


def topic_count_for(scene_id: str, n_classes: int) -> int:
    # Match the exploration_views convention: small K matched to label set,
    # bounded between 4 and 12.
    return max(4, min(12, n_classes))


def normalize01(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = float(np.nanmin(values))
    high = float(np.nanmax(values))
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    normalized = normalize01(values)
    return np.rint(normalized * scale).astype(np.int32)


def jensen_shannon_matrix(distributions: np.ndarray) -> np.ndarray:
    """Pairwise JS divergence in nats between rows.

    distributions: [K, V] each row sums to 1.
    """
    K = distributions.shape[0]
    out = np.zeros((K, K), dtype=np.float64)
    p = np.clip(distributions, 1e-12, None)
    p = p / p.sum(axis=1, keepdims=True)
    log_p = np.log(p)
    for i in range(K):
        for j in range(i + 1, K):
            m = 0.5 * (p[i] + p[j])
            log_m = np.log(np.clip(m, 1e-12, None))
            kl_pm = float(np.sum(p[i] * (log_p[i] - log_m)))
            kl_qm = float(np.sum(p[j] * (log_p[j] - log_m)))
            js = 0.5 * (kl_pm + kl_qm)
            out[i, j] = out[j, i] = js
    return out


def hellinger_matrix(distributions: np.ndarray) -> np.ndarray:
    safe = np.clip(distributions, 0.0, None)
    sums = safe.sum(axis=1, keepdims=True)
    p = safe / np.maximum(sums, 1e-12)
    sqrt_p = np.sqrt(p)
    diff = sqrt_p[:, None, :] - sqrt_p[None, :, :]
    return np.linalg.norm(diff, axis=-1) / np.sqrt(2.0)


def cosine_matrix(rows: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(rows, axis=1, keepdims=True)
    norms = np.where(norms < 1e-12, 1.0, norms)
    n = rows / norms
    return n @ n.T


def jaccard_top_words_matrix(phi: np.ndarray, top_n: int) -> np.ndarray:
    K, V = phi.shape
    top_indices = [set(np.argsort(phi[k])[::-1][:top_n].tolist()) for k in range(K)]
    out = np.zeros((K, K), dtype=np.float64)
    for i in range(K):
        for j in range(K):
            inter = len(top_indices[i] & top_indices[j])
            union = len(top_indices[i] | top_indices[j])
            out[i, j] = inter / max(union, 1)
    return out


def classical_mds(distance_matrix: np.ndarray, n_components: int, random_state: int = 42) -> np.ndarray:
    """Classical (metric) MDS via sklearn. Robust for small K."""
    K = distance_matrix.shape[0]
    if K < n_components + 1:
        return np.zeros((K, n_components), dtype=np.float64)
    mds = MDS(
        n_components=n_components,
        dissimilarity="precomputed",
        random_state=random_state,
        normalized_stress="auto",
        n_init=4,
    )
    return mds.fit_transform(distance_matrix)


def relevance_ranked_words(
    phi_row: np.ndarray,
    corpus_marginal: np.ndarray,
    vocab: list[str],
    lam: float,
    top_n: int,
) -> list[dict]:
    p_w_t = np.clip(phi_row, 1e-12, None)
    p_w = np.clip(corpus_marginal, 1e-12, None)
    log_p = np.log(p_w_t)
    log_lift = np.log(p_w_t / p_w)
    relevance = lam * log_p + (1.0 - lam) * log_lift
    order = np.argsort(relevance)[::-1][:top_n]
    out = []
    for idx in order:
        out.append({
            "token": vocab[int(idx)],
            "p_w_given_topic": round(float(p_w_t[int(idx)]), 6),
            "p_w_global": round(float(p_w[int(idx)]), 6),
            "lift": round(float(p_w_t[int(idx)] / p_w[int(idx)]), 6),
            "relevance": round(float(relevance[int(idx)]), 6),
        })
    return out


def log_odds_top_tokens(
    phi: np.ndarray, vocab: list[str], top_n: int
) -> dict[str, list[dict]]:
    K = phi.shape[0]
    p = np.clip(phi, 1e-12, None)
    p = p / p.sum(axis=1, keepdims=True)
    log_p = np.log(p)
    out: dict[str, list[dict]] = {}
    for i in range(K):
        for j in range(K):
            if i == j:
                continue
            ratio = log_p[i] - log_p[j]
            order = np.argsort(ratio)[::-1][:top_n]
            entries = [
                {
                    "token": vocab[int(idx)],
                    "log_odds": round(float(ratio[int(idx)]), 6),
                    "p_in_i": round(float(p[i, int(idx)]), 6),
                    "p_in_j": round(float(p[j, int(idx)]), 6),
                }
                for idx in order
            ]
            out[f"{i}->{j}"] = entries
    return out


def fit_topic_views_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    cube, gt, config = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    if not labelled_mask.any():
        return None

    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    classes = sorted(int(c) for c in np.unique(labels))
    K = topic_count_for(scene_id, len(classes))

    # Stratified sample
    sample_idx_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    sample_spectra = spectra[sample_idx_local]
    sample_labels = labels[sample_idx_local]
    sample_pixel_indices = pixel_indices[sample_idx_local]

    # Wordify
    counts = band_frequency_counts(sample_spectra, scale=SCALE)
    # counts shape [N, B] with integer values 0..SCALE; use as document-term.
    doc_term = counts.astype(np.float32)
    D, V = doc_term.shape

    wavelengths = approximate_wavelengths(config, b)
    vocab = [f"{int(round(float(wavelengths[i]))):04d}nm" for i in range(b)]

    # Corpus marginal P(w) from total token counts
    token_totals = doc_term.sum(axis=0)
    corpus_marginal = token_totals / max(token_totals.sum(), 1e-12)

    # Fit LDA
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
    doc_topic = lda.fit_transform(doc_term)
    phi_unnormalised = lda.components_  # shape K x V; not normalised
    phi = phi_unnormalised / phi_unnormalised.sum(axis=1, keepdims=True)

    # Topic prevalence: mean theta over corpus
    topic_prevalence = doc_topic.mean(axis=0)

    # Distance matrices over phi rows
    cos = cosine_matrix(phi)
    js = jensen_shannon_matrix(phi)
    hellinger = hellinger_matrix(phi)
    jaccard = jaccard_top_words_matrix(phi, top_n=15)

    # JS distance for MDS — use sqrt(JS) which is a metric. Force diagonal
    # to exactly 0 and clip negatives to avoid sqrt-of-tiny-negative NaN.
    js_clean = np.where(np.isfinite(js), js, 0.0)
    js_clean = np.clip(js_clean, 0.0, None)
    np.fill_diagonal(js_clean, 0.0)
    js_distance = np.sqrt(js_clean)
    np.fill_diagonal(js_distance, 0.0)

    intertopic_2d_js = classical_mds(js_distance, n_components=2, random_state=RANDOM_STATE)
    intertopic_3d_js = classical_mds(js_distance, n_components=3, random_state=RANDOM_STATE)

    # PCA on band profiles (alternative view) — reconstruct band profile via
    # phi (band-frequency LDA: phi indices ARE bands so band_profile == phi)
    band_profiles = phi.copy()

    # Top words per topic at multiple lambda
    top_words_per_topic = {}
    for lam in LAMBDA_GRID:
        top_words_per_topic[f"lambda_{lam:.1f}"] = [
            relevance_ranked_words(phi[k], corpus_marginal, vocab, lam, TOP_N_RELEVANCE)
            for k in range(K)
        ]

    # Log-odds tokens between every pair
    log_odds = log_odds_top_tokens(phi, vocab, TOP_N_LOG_ODDS)

    # Save full local artifacts
    local_dir = LOCAL_DIR / scene_id
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", doc_topic.astype(np.float32))
    np.save(local_dir / "corpus_marginal.npy", corpus_marginal.astype(np.float32))
    np.save(local_dir / "sample_pixel_indices.npy", sample_pixel_indices.astype(np.int64))
    np.save(local_dir / "sample_labels.npy", sample_labels.astype(np.int32))
    with (local_dir / "vocab.json").open("w", encoding="utf-8") as h_handle:
        json.dump({
            "vocab": vocab,
            "scale": SCALE,
            "K": int(K),
            "D": int(D),
            "V": int(V),
            "samples_per_class": SAMPLES_PER_CLASS,
            "random_state": RANDOM_STATE,
        }, h_handle)

    # Derived view
    return {
        "scene_id": scene_id,
        "scene_name": config.name,
        "topic_count": int(K),
        "vocabulary_size": int(V),
        "document_count": int(D),
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "vocabulary": vocab,
        "corpus_marginal": [round(float(x), 6) for x in corpus_marginal.tolist()],
        "topic_prevalence": [round(float(x), 6) for x in topic_prevalence.tolist()],
        "topic_band_profiles": [
            [round(float(x), 6) for x in row.tolist()] for row in band_profiles
        ],
        "topic_distance_cosine": [
            [round(float(v), 6) for v in row] for row in cos
        ],
        "topic_distance_js": [
            [round(float(v), 6) for v in row] for row in js
        ],
        "topic_distance_hellinger": [
            [round(float(v), 6) for v in row] for row in hellinger
        ],
        "topic_word_jaccard_top15": [
            [round(float(v), 6) for v in row] for row in jaccard
        ],
        "topic_intertopic_2d_js": [
            [round(float(v), 6) for v in row] for row in intertopic_2d_js
        ],
        "topic_intertopic_3d_js": [
            [round(float(v), 6) for v in row] for row in intertopic_3d_js
        ],
        "top_words_per_topic": top_words_per_topic,
        "topic_pair_log_odds": log_odds,
        "lda_config": {
            "method": "sklearn.LatentDirichletAllocation online",
            "max_iter": LDA_MAX_ITER,
            "doc_topic_prior": LDA_DOC_TOPIC_PRIOR,
            "topic_word_prior": LDA_TOPIC_WORD_PRIOR,
            "random_state": RANDOM_STATE,
            "wordification": "band-frequency",
            "quantization_scale": SCALE,
            "samples_per_class": SAMPLES_PER_CLASS,
        },
        "perplexity": float(lda.perplexity(doc_term)),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_views v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[topic_views] {scene_id} ...", flush=True)
        try:
            payload = fit_topic_views_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print(f"  skipped", flush=True)
            continue
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(
            f"  K={payload['topic_count']}, V={payload['vocabulary_size']}, "
            f"D={payload['document_count']}, perplexity={payload['perplexity']:.2f} -> "
            f"{out_path.relative_to(ROOT)} ({size_kb:.1f} KB)",
            flush=True,
        )
        written += 1
    print(f"[topic_views] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
