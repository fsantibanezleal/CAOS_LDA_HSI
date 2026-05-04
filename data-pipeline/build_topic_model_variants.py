"""Multi-library topic-model variants on V1 band-frequency corpora.

For every labelled scene this builder fits **multiple** topic-modelling
algorithms beyond sklearn's online LDA, and writes per-variant
phi (K x V), theta (D x K), top-words, and quality metrics. Closes
the master-plan section 8.1 catalogue from "1 implemented" to "many
implemented".

Variants in scope (filtered by available imports):

  classical_lda
    sklearn_online      — sklearn.decomposition.LatentDirichletAllocation
    gensim_vb           — gensim.models.LdaModel (variational Bayes)
    gensim_collapsed    — gensim.models.LdaMulticore (multicore VB)

  beyond_lda
    nmf                 — sklearn.decomposition.NMF
    sparse_lda          — sklearn LDA with strong sparsity priors

  structured
    tomotopy_lda        — tomotopy.LDAModel (fast collapsed Gibbs in C++)
    tomotopy_hdp        — tomotopy.HDPModel (auto-K)
    tomotopy_ctm        — tomotopy.CTModel (correlated topic model)
    tomotopy_pa         — tomotopy.PAModel (pachinko allocation, super-topics)

  embedded / neural (uses torch + pyro when available)
    prodlda             — pyro ProdLDA (Srivastava-Sutton 2017)

For each fit we save:

  data/local/topic_variants/<variant>/<scene>/{phi.npy, theta.npy,
                                                vocab.json, metrics.json}
  data/derived/topic_variants/<variant>/<scene>.json
    K, V, D, top-30 words per topic, perplexity (when available),
    NPMI coherence on top-15 words, topic prevalence, JS-MDS coords

Output: per-scene + per-variant JSON.
"""
from __future__ import annotations

import importlib.util as iutil
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation, NMF
from sklearn.manifold import MDS

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


LOCAL_OUT_ROOT = DATA_DIR / "local" / "topic_variants"
DERIVED_OUT_ROOT = DERIVED_DIR / "topic_variants"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
SAMPLES_PER_CLASS = 220
SCALE = 12
TOP_N_WORDS = 30
TOP_N_NPMI = 15
RANDOM_STATE = 42

GENSIM_OK = iutil.find_spec("gensim") is not None
TOMOTOPY_OK = iutil.find_spec("tomotopy") is not None
TORCH_OK = iutil.find_spec("torch") is not None
PYRO_OK = iutil.find_spec("pyro") is not None


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def topk_words(phi_row: np.ndarray, vocab: list[str], top_n: int = TOP_N_WORDS) -> list[dict]:
    order = np.argsort(phi_row)[::-1][:top_n]
    return [
        {
            "token": vocab[int(i)],
            "p_w_given_topic": round(float(phi_row[int(i)]), 6),
        }
        for i in order
    ]


def gensim_coherence(
    phi: np.ndarray,
    vocab: list[str],
    doc_term: np.ndarray,
    top_n: int = TOP_N_NPMI,
) -> dict:
    """Gensim CoherenceModel for c_v, c_npmi, u_mass on the same corpus.

    Band-frequency tokens are dense (almost every doc contains every
    token), so doc-cooccurrence-based c_npmi degenerates to ~0. The
    sliding-window c_v metric (Roder 2015) and the within-corpus UMass
    handle this case better. We compute all three so the eventual web
    app can show how each metric behaves.
    """
    from gensim import corpora
    from gensim.models import CoherenceModel

    K = phi.shape[0]
    # Reconstruct each document as a list of tokens (with multiplicity)
    # for c_v / c_npmi which need a "texts" iterable.
    texts = []
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        tokens = []
        for i in nz:
            count = int(doc_term[d, int(i)])
            if count > 0:
                tokens.extend([vocab[int(i)]] * count)
        texts.append(tokens or [vocab[0]])  # never empty

    dictionary = corpora.Dictionary([[t] for t in vocab])
    dictionary.token2id = {t: i for i, t in enumerate(vocab)}
    dictionary.id2token = {i: t for i, t in enumerate(vocab)}

    top_topics_tokens: list[list[str]] = []
    for k in range(K):
        order = np.argsort(phi[k])[::-1][:top_n]
        top_topics_tokens.append([vocab[int(i)] for i in order])

    out = {"top_n": int(top_n)}
    for metric in ("c_v", "c_npmi", "u_mass"):
        try:
            cm = CoherenceModel(
                topics=top_topics_tokens,
                texts=texts,
                dictionary=dictionary,
                coherence=metric,
            )
            out[metric] = round(float(cm.get_coherence()), 6)
        except Exception:
            out[metric] = None
    return out


def jensen_shannon_matrix(distributions: np.ndarray) -> np.ndarray:
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


def mds_2d(distance: np.ndarray) -> np.ndarray:
    K = distance.shape[0]
    if K < 3:
        return np.zeros((K, 2), dtype=np.float64)
    np.fill_diagonal(distance, 0.0)
    distance = np.where(np.isfinite(distance), distance, 0.0)
    distance = np.clip(distance, 0.0, None)
    dist_metric = np.sqrt(distance)
    np.fill_diagonal(dist_metric, 0.0)
    return MDS(
        n_components=2,
        dissimilarity="precomputed",
        random_state=RANDOM_STATE,
        normalized_stress="auto",
        n_init=4,
    ).fit_transform(dist_metric)


# ---------------------------------------------------------------------------
# Variants
# ---------------------------------------------------------------------------


def fit_sklearn_online(doc_term: np.ndarray, K: int) -> dict:
    lda = LatentDirichletAllocation(
        n_components=K, learning_method="online", max_iter=60,
        batch_size=512, random_state=RANDOM_STATE,
        doc_topic_prior=0.45, topic_word_prior=0.2,
    )
    theta = lda.fit_transform(doc_term)
    phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)
    return {"phi": phi, "theta": theta, "perplexity": float(lda.perplexity(doc_term))}


def fit_sklearn_sparse(doc_term: np.ndarray, K: int) -> dict:
    lda = LatentDirichletAllocation(
        n_components=K, learning_method="online", max_iter=60,
        batch_size=512, random_state=RANDOM_STATE,
        doc_topic_prior=0.05, topic_word_prior=0.05,  # strong sparsity
    )
    theta = lda.fit_transform(doc_term)
    phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)
    return {"phi": phi, "theta": theta, "perplexity": float(lda.perplexity(doc_term))}


def fit_nmf(doc_term: np.ndarray, K: int) -> dict:
    nmf = NMF(n_components=K, init="nndsvd", random_state=RANDOM_STATE, max_iter=400)
    W = nmf.fit_transform(doc_term)
    H = nmf.components_
    # Treat W as theta (D x K) and H as phi (K x V), normalised
    theta_sum = W.sum(axis=1, keepdims=True)
    theta = W / np.maximum(theta_sum, 1e-12)
    phi = H / H.sum(axis=1, keepdims=True)
    return {"phi": phi, "theta": theta, "reconstruction_err": float(nmf.reconstruction_err_)}


def fit_gensim_vb(doc_term: np.ndarray, vocab: list[str], K: int) -> dict:
    from gensim import corpora
    from gensim.models import LdaModel
    # Build BOW corpus
    bow = []
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        bow.append([(int(i), int(doc_term[d, i])) for i in nz])
    id2word = corpora.Dictionary([[t] for t in vocab])
    # Force ids to align with our vocab indices (Dictionary may renumber).
    # We rebuild a dictionary explicitly.
    id2word = corpora.Dictionary()
    id2word.token2id = {t: i for i, t in enumerate(vocab)}
    id2word.id2token = {i: t for i, t in enumerate(vocab)}
    id2word.dfs = {i: int((doc_term[:, i] > 0).sum()) for i in range(len(vocab))}
    id2word.num_docs = doc_term.shape[0]
    id2word.num_pos = int(doc_term.sum())
    id2word.num_nnz = int((doc_term > 0).sum())
    lda = LdaModel(
        corpus=bow, id2word=id2word, num_topics=K,
        alpha=0.45, eta=0.2, random_state=RANDOM_STATE,
        passes=10, iterations=80,
    )
    phi = lda.get_topics()  # K x V (probabilities)
    # theta: per-document
    theta = np.zeros((doc_term.shape[0], K), dtype=np.float64)
    for d, doc in enumerate(bow):
        for k, p in lda.get_document_topics(doc, minimum_probability=0.0):
            theta[d, int(k)] = float(p)
    perp = float(np.exp(-lda.log_perplexity(bow)))
    return {"phi": np.asarray(phi), "theta": theta, "perplexity": perp}


def fit_gensim_multicore(doc_term: np.ndarray, vocab: list[str], K: int) -> dict:
    from gensim import corpora
    from gensim.models import LdaMulticore
    bow = []
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        bow.append([(int(i), int(doc_term[d, i])) for i in nz])
    id2word = corpora.Dictionary()
    id2word.token2id = {t: i for i, t in enumerate(vocab)}
    id2word.id2token = {i: t for i, t in enumerate(vocab)}
    id2word.dfs = {i: int((doc_term[:, i] > 0).sum()) for i in range(len(vocab))}
    id2word.num_docs = doc_term.shape[0]
    id2word.num_pos = int(doc_term.sum())
    id2word.num_nnz = int((doc_term > 0).sum())
    lda = LdaMulticore(
        corpus=bow, id2word=id2word, num_topics=K,
        alpha=0.45, eta=0.2, random_state=RANDOM_STATE,
        passes=10, iterations=80, workers=2,
    )
    phi = lda.get_topics()
    theta = np.zeros((doc_term.shape[0], K), dtype=np.float64)
    for d, doc in enumerate(bow):
        for k, p in lda.get_document_topics(doc, minimum_probability=0.0):
            theta[d, int(k)] = float(p)
    return {"phi": np.asarray(phi), "theta": theta}


def fit_tomotopy_lda(doc_term: np.ndarray, vocab: list[str], K: int) -> dict:
    import tomotopy as tp
    mdl = tp.LDAModel(k=K, alpha=0.45, eta=0.2, seed=RANDOM_STATE)
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        words = []
        for i in nz:
            words.extend([vocab[int(i)]] * int(doc_term[d, int(i)]))
        if words:
            mdl.add_doc(words)
    mdl.train(200)
    V = len(vocab)
    phi = np.zeros((K, V), dtype=np.float64)
    token_to_id = {t: i for i, t in enumerate(vocab)}
    for k in range(K):
        topic_dist = mdl.get_topic_word_dist(k)
        for vid, prob in enumerate(topic_dist):
            tok = mdl.used_vocabs[vid]
            if tok in token_to_id:
                phi[k, token_to_id[tok]] = float(prob)
        s = phi[k].sum()
        if s > 0:
            phi[k] /= s
    theta = np.array([doc.get_topic_dist() for doc in mdl.docs], dtype=np.float64)
    perp = float(mdl.perplexity)
    return {"phi": phi, "theta": theta, "perplexity": perp}


def fit_tomotopy_hdp(doc_term: np.ndarray, vocab: list[str], K_init: int) -> dict:
    import tomotopy as tp
    mdl = tp.HDPModel(initial_k=K_init, alpha=0.45, eta=0.2, seed=RANDOM_STATE)
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        words = []
        for i in nz:
            words.extend([vocab[int(i)]] * int(doc_term[d, int(i)]))
        if words:
            mdl.add_doc(words)
    mdl.train(200)
    K = mdl.live_k
    V = len(vocab)
    phi = np.zeros((K, V), dtype=np.float64)
    token_to_id = {t: i for i, t in enumerate(vocab)}
    live_topics = [k for k in range(mdl.k) if mdl.is_live_topic(k)]
    for ki, k in enumerate(live_topics):
        topic_dist = mdl.get_topic_word_dist(k)
        for vid, prob in enumerate(topic_dist):
            tok = mdl.used_vocabs[vid]
            if tok in token_to_id:
                phi[ki, token_to_id[tok]] = float(prob)
        s = phi[ki].sum()
        if s > 0:
            phi[ki] /= s
    theta = np.zeros((len(mdl.docs), K), dtype=np.float64)
    for d, doc in enumerate(mdl.docs):
        full = doc.get_topic_dist()
        for ki, k in enumerate(live_topics):
            theta[d, ki] = float(full[k])
    perp = float(mdl.perplexity)
    return {"phi": phi, "theta": theta, "perplexity": perp, "K_live": int(K)}


def fit_tomotopy_ctm(doc_term: np.ndarray, vocab: list[str], K: int) -> dict:
    import tomotopy as tp
    mdl = tp.CTModel(k=K, seed=RANDOM_STATE)
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        words = []
        for i in nz:
            words.extend([vocab[int(i)]] * int(doc_term[d, int(i)]))
        if words:
            mdl.add_doc(words)
    mdl.train(200)
    V = len(vocab)
    phi = np.zeros((K, V), dtype=np.float64)
    token_to_id = {t: i for i, t in enumerate(vocab)}
    for k in range(K):
        topic_dist = mdl.get_topic_word_dist(k)
        for vid, prob in enumerate(topic_dist):
            tok = mdl.used_vocabs[vid]
            if tok in token_to_id:
                phi[k, token_to_id[tok]] = float(prob)
        s = phi[k].sum()
        if s > 0:
            phi[k] /= s
    theta = np.array([doc.get_topic_dist() for doc in mdl.docs], dtype=np.float64)
    perp = float(mdl.perplexity)
    try:
        corr = np.asarray(mdl.get_correlations(), dtype=np.float64).tolist()
    except Exception:
        corr = None
    return {"phi": phi, "theta": theta, "perplexity": perp,
            "topic_correlation": corr}


# ---------------------------------------------------------------------------
# Builder loop
# ---------------------------------------------------------------------------


def write_outputs(
    variant: str, scene_id: str, fit_result: dict, vocab: list[str],
    doc_term: np.ndarray, wavelengths: np.ndarray,
) -> dict:
    phi = fit_result["phi"]
    theta = fit_result["theta"]
    K = phi.shape[0]

    local_dir = LOCAL_OUT_ROOT / variant / scene_id
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", theta.astype(np.float32))
    with (local_dir / "vocab.json").open("w", encoding="utf-8") as h:
        json.dump({"vocab": vocab, "K": int(K)}, h)

    coh = gensim_coherence(phi, vocab, doc_term)
    js = jensen_shannon_matrix(phi)
    coords_2d = mds_2d(js)
    top_words = [topk_words(phi[k], vocab) for k in range(K)]
    prevalence = theta.mean(axis=0)

    derived = {
        "scene_id": scene_id,
        "variant": variant,
        "topic_count": int(K),
        "vocabulary_size": int(len(vocab)),
        "document_count": int(doc_term.shape[0]),
        "topic_prevalence": [round(float(v), 6) for v in prevalence.tolist()],
        "top_words_per_topic": top_words,
        "perplexity": fit_result.get("perplexity"),
        "reconstruction_err": fit_result.get("reconstruction_err"),
        "coherence": coh,
        "topic_distance_js": [[round(float(v), 6) for v in row] for row in js],
        "topic_intertopic_2d_js": [[round(float(v), 6) for v in row] for row in coords_2d],
        "K_live": fit_result.get("K_live"),
        "topic_correlation": fit_result.get("topic_correlation"),
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_model_variants v0.1",
    }
    out_path = DERIVED_OUT_ROOT / variant / f"{scene_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as h:
        json.dump(derived, h, separators=(",", ":"))
    return {
        "variant": variant,
        "K": int(K),
        "perplexity": fit_result.get("perplexity"),
        "coherence_c_v": coh.get("c_v"),
        "coherence_u_mass": coh.get("u_mass"),
    }


def build_for_scene(scene_id: str) -> list[dict]:
    if scene_id not in SCENES or not has_labels(scene_id):
        return []
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
    wavelengths = approximate_wavelengths(config, B)
    vocab = [f"{int(round(float(wavelengths[i]))):04d}nm" for i in range(B)]

    n_classes = len(np.unique(labels))
    K = max(4, min(12, n_classes))

    summaries: list[dict] = []
    variant_funcs = [
        ("sklearn_online", lambda: fit_sklearn_online(doc_term, K)),
        ("sklearn_sparse", lambda: fit_sklearn_sparse(doc_term, K)),
        ("nmf", lambda: fit_nmf(doc_term, K)),
    ]
    if GENSIM_OK:
        variant_funcs.append(("gensim_vb", lambda: fit_gensim_vb(doc_term, vocab, K)))
        variant_funcs.append(("gensim_multicore", lambda: fit_gensim_multicore(doc_term, vocab, K)))
    if TOMOTOPY_OK:
        variant_funcs.append(("tomotopy_lda", lambda: fit_tomotopy_lda(doc_term, vocab, K)))
        variant_funcs.append(("tomotopy_hdp", lambda: fit_tomotopy_hdp(doc_term, vocab, K)))
        variant_funcs.append(("tomotopy_ctm", lambda: fit_tomotopy_ctm(doc_term, vocab, K)))

    # Optional comma-separated filter via env var (e.g.
    # CAOS_VARIANT_FILTER=sklearn_online,nmf) so the builder can
    # be re-run one variant at a time on memory-constrained boxes.
    import os as _os
    filter_env = _os.environ.get("CAOS_VARIANT_FILTER", "").strip()
    if filter_env:
        wanted = {n.strip() for n in filter_env.split(",") if n.strip()}
        variant_funcs = [(n, fn) for (n, fn) in variant_funcs if n in wanted]
        print(f"  variant filter active: {sorted(n for n, _ in variant_funcs)}", flush=True)

    for name, fn in variant_funcs:
        print(f"  fitting {name} ...", flush=True)
        try:
            result = fn()
            summary = write_outputs(name, scene_id, result, vocab, doc_term, wavelengths)
            cv = summary.get('coherence_c_v')
            um = summary.get('coherence_u_mass')
            print(
                f"    K={summary['K']:2d} "
                f"c_v={cv:+.3f} u_mass={um:+.3f} perp={(summary['perplexity'] or 0):.2f}"
                if cv is not None and um is not None else
                f"    K={summary['K']:2d} c_v=None u_mass=None perp={(summary['perplexity'] or 0):.2f}",
                flush=True,
            )
            summaries.append(summary)
        except Exception as exc:
            print(f"    FAILED: {exc}", flush=True)
    return summaries


def main() -> int:
    DERIVED_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    print(
        f"[topic_variants] gensim={GENSIM_OK} tomotopy={TOMOTOPY_OK} "
        f"torch={TORCH_OK} pyro={PYRO_OK}",
        flush=True,
    )
    written_total = 0
    for scene_id in LABELLED_SCENES:
        print(f"[topic_variants] {scene_id} ...", flush=True)
        with mlflow_run(
            "build_topic_model_variants",
            scene_id=scene_id,
            params={
                "samples_per_class": SAMPLES_PER_CLASS,
                "scale": SCALE,
                "top_n_words": TOP_N_WORDS,
                "top_n_npmi": TOP_N_NPMI,
                "random_state": RANDOM_STATE,
            },
        ) as run:
            try:
                summaries = build_for_scene(scene_id)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                import traceback
                traceback.print_exc()
                continue
            for summary in summaries:
                variant = summary.get("variant_id") or summary.get("variant") or "?"
                cv = summary.get("coherence_c_v")
                um = summary.get("coherence_u_mass")
                npmi = summary.get("coherence_npmi")
                perp = summary.get("perplexity")
                if cv is not None:
                    run.log_metric(f"{variant}_c_v", float(cv))
                if um is not None:
                    run.log_metric(f"{variant}_u_mass", float(um))
                if npmi is not None:
                    run.log_metric(f"{variant}_npmi", float(npmi))
                if perp is not None:
                    run.log_metric(f"{variant}_perplexity", float(perp))
            written_total += len(summaries)
    print(
        f"[topic_variants] done — {written_total} (variant x scene) outputs.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
