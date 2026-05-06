"""Real metric values for the validation blocks defined in
`data/manifests/corpus_recipes.json`.

Replaces the all-`null` `metric_value` fields in `data/derived/subsets/*.json`
with computed numbers.

Implemented blocks (per scene where applicable):
- corpus-integrity: document_count, vocabulary_size, document-length
  distribution quartiles, zero-token-doc rate
- topic-stability: refits LDA with 3 seeds {42, 7, 19} and computes
  Hungarian-matched cosine, mean and min, plus average top-N word Jaccard
- supervision-association: ARI / NMI of K-means clustering on theta vs the
  ground-truth label, plus a logistic-regression macro-F1 trained on theta

Wired blocks reading dedicated builders:
- quantization-sensitivity: surfaces build_quantization_sensitivity payload
  (canonical config, per-probe matched_cosine + ARI vs canonical, summary verdict)
- document-definition-sensitivity: build_cross_method_agreement payload
  (mean / min / max ARI and NMI across the 8 document constructors,
  plus per-method ARI/NMI vs label and vs topic-dominant)
- spectral-library-alignment: build_topic_to_library + build_topic_to_usgs_v7
  payload (per-topic best cosine summary on AVIRIS-Classic 1997 library
  + USGS v7 plurality-chapter assignment per topic + chapter counts)

Output: data/derived/validation_blocks/<scene>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    adjusted_rand_score,
    f1_score,
    normalized_mutual_info_score,
)
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


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
LOCAL_STAB_DIR = DATA_DIR / "local" / "topic_stability"
DERIVED_OUT_DIR = DERIVED_DIR / "validation_blocks"
QUANT_SENS_DIR = DERIVED_DIR / "quantization_sensitivity"
CROSS_METHOD_DIR = DERIVED_DIR / "cross_method_agreement"
TOPIC_TO_LIBRARY_DIR = DERIVED_DIR / "topic_to_library"
TOPIC_TO_USGS_V7_DIR = DERIVED_DIR / "topic_to_usgs_v7"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

STABILITY_SEEDS = [42, 7, 19]
TOPIC_STAB_TOP_N = 15


def normalize01(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = float(np.nanmin(values))
    high = float(np.nanmax(values))
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = 12) -> np.ndarray:
    return np.rint(normalize01(values) * scale).astype(np.int32)


def fit_lda(doc_term: np.ndarray, K: int, seed: int) -> tuple[np.ndarray, np.ndarray, float]:
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=60,
        batch_size=512,
        evaluate_every=-1,
        random_state=seed,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    theta = lda.fit_transform(doc_term)
    phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)
    return phi, theta, float(lda.perplexity(doc_term))


def matched_cosine(phi_a: np.ndarray, phi_b: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Hungarian-matched topic-pair cosine. Returns (per_match, mean, min)."""
    norms_a = np.linalg.norm(phi_a, axis=1, keepdims=True)
    norms_b = np.linalg.norm(phi_b, axis=1, keepdims=True)
    a = phi_a / np.where(norms_a < 1e-12, 1.0, norms_a)
    b = phi_b / np.where(norms_b < 1e-12, 1.0, norms_b)
    cos = a @ b.T  # shape K x K
    cost = -cos
    row_ind, col_ind = linear_sum_assignment(cost)
    matches = cos[row_ind, col_ind]
    return matches, float(np.mean(matches)), float(np.min(matches))


def matched_jaccard_top_words(phi_a: np.ndarray, phi_b: np.ndarray, top_n: int) -> tuple[np.ndarray, float]:
    K = phi_a.shape[0]
    top_a = [set(np.argsort(phi_a[k])[::-1][:top_n].tolist()) for k in range(K)]
    top_b = [set(np.argsort(phi_b[k])[::-1][:top_n].tolist()) for k in range(K)]
    jac = np.zeros((K, K), dtype=np.float64)
    for i in range(K):
        for j in range(K):
            inter = len(top_a[i] & top_b[j])
            union = len(top_a[i] | top_b[j])
            jac[i, j] = inter / max(union, 1)
    cost = -jac
    row_ind, col_ind = linear_sum_assignment(cost)
    matches = jac[row_ind, col_ind]
    return matches, float(np.mean(matches))


def compute_corpus_integrity(doc_term: np.ndarray) -> dict:
    D, V = doc_term.shape
    doc_lengths = doc_term.sum(axis=1)
    zero_token = int((doc_lengths == 0).sum())
    return {
        "block_id": "corpus-integrity",
        "status": "ready",
        "metrics": {
            "document_count": int(D),
            "vocabulary_size": int(V),
            "document_length_distribution": {
                "mean": round(float(doc_lengths.mean()), 4),
                "std": round(float(doc_lengths.std()), 4),
                "min": int(doc_lengths.min()),
                "p25": float(np.percentile(doc_lengths, 25)),
                "p50": float(np.percentile(doc_lengths, 50)),
                "p75": float(np.percentile(doc_lengths, 75)),
                "max": int(doc_lengths.max()),
            },
            "zero_token_documents": zero_token,
            "zero_token_documents_rate": round(zero_token / max(D, 1), 6),
        },
    }


def compute_topic_stability(doc_term: np.ndarray, K: int) -> dict:
    fits = []
    for seed in STABILITY_SEEDS:
        phi, theta, perp = fit_lda(doc_term, K, seed)
        fits.append({"seed": seed, "phi": phi, "theta": theta, "perplexity": perp})

    pair_results = []
    cos_matches_all = []
    jac_matches_all = []
    for i in range(len(fits)):
        for j in range(i + 1, len(fits)):
            cos_match, cos_mean, cos_min = matched_cosine(fits[i]["phi"], fits[j]["phi"])
            jac_match, jac_mean = matched_jaccard_top_words(
                fits[i]["phi"], fits[j]["phi"], TOPIC_STAB_TOP_N
            )
            pair_results.append({
                "seed_a": fits[i]["seed"],
                "seed_b": fits[j]["seed"],
                "matched_cosine_mean": round(cos_mean, 6),
                "matched_cosine_min": round(cos_min, 6),
                "matched_jaccard_top15_mean": round(jac_mean, 6),
            })
            cos_matches_all.append(cos_mean)
            jac_matches_all.append(jac_mean)

    return {
        "block_id": "topic-stability",
        "status": "ready",
        "metrics": {
            "n_seeds": len(STABILITY_SEEDS),
            "seeds": STABILITY_SEEDS,
            "perplexity_per_seed": [round(f["perplexity"], 4) for f in fits],
            "matched_cosine_overall_mean": round(float(np.mean(cos_matches_all)), 6),
            "matched_cosine_overall_min": round(float(np.min(cos_matches_all)), 6),
            "matched_jaccard_top15_overall_mean": round(float(np.mean(jac_matches_all)), 6),
            "pairwise": pair_results,
        },
    }


def compute_supervision_association(theta: np.ndarray, labels: np.ndarray) -> dict:
    K = theta.shape[1]
    n_classes = len(np.unique(labels))

    # K-means(theta) → ARI / NMI vs label, with K_cluster = n_classes
    km = KMeans(n_clusters=n_classes, n_init=10, random_state=42)
    cluster_pred = km.fit_predict(theta)
    ari_kmeans_theta = float(adjusted_rand_score(labels, cluster_pred))
    nmi_kmeans_theta = float(normalized_mutual_info_score(labels, cluster_pred))

    # Logistic regression on theta with stratified 5-fold
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    f1_scores = []
    for train_idx, test_idx in skf.split(theta, labels):
        clf = LogisticRegression(
            max_iter=2000, multi_class="auto", random_state=42, n_jobs=1
        )
        clf.fit(theta[train_idx], labels[train_idx])
        pred = clf.predict(theta[test_idx])
        f1_scores.append(f1_score(labels[test_idx], pred, average="macro"))

    return {
        "block_id": "supervision-association",
        "status": "ready",
        "metrics": {
            "topic_count": int(K),
            "ari_kmeans_theta_vs_label": round(ari_kmeans_theta, 6),
            "nmi_kmeans_theta_vs_label": round(nmi_kmeans_theta, 6),
            "logistic_regression_on_theta_macro_f1": {
                "mean": round(float(np.mean(f1_scores)), 6),
                "std": round(float(np.std(f1_scores)), 6),
                "folds": [round(float(s), 6) for s in f1_scores],
            },
        },
    }


def compute_quantization_sensitivity_block(scene_id: str) -> dict:
    """Surface the build_quantization_sensitivity payload as a
    validation block. Falls back to status=blocked when the file is
    absent."""
    src = QUANT_SENS_DIR / f"{scene_id}.json"
    if not src.is_file():
        return make_blocked_block(
            "quantization-sensitivity",
            f"build_quantization_sensitivity has not produced "
            f"{src.relative_to(DERIVED_DIR.parent)} yet",
        )
    payload = json.loads(src.read_text(encoding="utf-8"))
    summary = payload.get("summary", {}) or {}
    probes = payload.get("probes", []) or []
    probe_metrics = [
        {
            "config": p.get("config"),
            "status": p.get("status"),
            "matched_cosine_mean": p.get("matched_cosine_mean"),
            "matched_cosine_min": p.get("matched_cosine_min"),
            "ari_dominant_vs_canonical": p.get("ari_dominant_vs_canonical"),
        }
        for p in probes
    ]
    return {
        "block_id": "quantization-sensitivity",
        "status": "ready",
        "metrics": {
            "canonical_recipe": payload.get("canonical_recipe"),
            "canonical_scheme": payload.get("canonical_scheme"),
            "canonical_Q": payload.get("canonical_Q"),
            "topic_count": payload.get("topic_count"),
            "n_configs_compared": int(summary.get("n_configs_compared", len(probes))),
            "matched_cosine_mean_overall_mean": summary.get(
                "matched_cosine_mean_overall_mean"
            ),
            "matched_cosine_mean_overall_min": summary.get(
                "matched_cosine_mean_overall_min"
            ),
            "ari_overall_mean": summary.get("ari_overall_mean"),
            "ari_overall_min": summary.get("ari_overall_min"),
            "verdict": summary.get("verdict"),
            "per_probe": probe_metrics,
        },
        "source": str(src.relative_to(DERIVED_DIR.parent)).replace("\\", "/"),
    }


def _off_diagonal_summary(matrix: list[list[float]]) -> dict:
    """Mean / min / max of the off-diagonal entries of a symmetric matrix."""
    arr = np.array(matrix, dtype=np.float64)
    n = arr.shape[0]
    if n < 2:
        return {"mean": None, "min": None, "max": None, "n_pairs": 0}
    iu = np.triu_indices(n, k=1)
    vals = arr[iu]
    return {
        "mean": round(float(np.mean(vals)), 6),
        "min": round(float(np.min(vals)), 6),
        "max": round(float(np.max(vals)), 6),
        "n_pairs": int(vals.size),
    }


def compute_document_definition_sensitivity_block(scene_id: str) -> dict:
    """Surface the build_cross_method_agreement payload as a validation
    block. Reports off-diagonal ARI/NMI mean/min/max across all eight
    document-constructor methods (felzenszwalb, label, patch_15,
    patch_7, pixel, slic_2000, slic_500, topic_dominant) plus the
    per-method ARI/NMI summaries vs label and vs topic-dominant.
    Falls back to status=blocked when the upstream file is absent."""
    src = CROSS_METHOD_DIR / f"{scene_id}.json"
    if not src.is_file():
        return make_blocked_block(
            "document-definition-sensitivity",
            f"build_cross_method_agreement has not produced "
            f"{src.relative_to(DERIVED_DIR.parent)} yet",
        )
    payload = json.loads(src.read_text(encoding="utf-8"))
    methods = list(payload.get("method_names", []))
    ari_off = _off_diagonal_summary(payload.get("ari_matrix", []))
    nmi_off = _off_diagonal_summary(payload.get("nmi_matrix", []))
    v_off = _off_diagonal_summary(payload.get("v_measure_matrix", []))
    return {
        "block_id": "document-definition-sensitivity",
        "status": "ready",
        "metrics": {
            "n_methods_compared": len(methods),
            "methods": methods,
            "n_compared_pixels": payload.get("n_compared_pixels"),
            "off_diagonal_ari": ari_off,
            "off_diagonal_nmi": nmi_off,
            "off_diagonal_v_measure": v_off,
            "agreement_vs_label_summary": payload.get(
                "agreement_vs_label_summary", []
            ),
            "agreement_vs_topic_dominant_summary": payload.get(
                "agreement_vs_topic_dominant_summary", []
            ),
        },
        "source": str(src.relative_to(DERIVED_DIR.parent)).replace("\\", "/"),
    }


def compute_spectral_library_alignment_block(scene_id: str) -> dict:
    """Surface build_topic_to_library + build_topic_to_usgs_v7 as a
    validation block. Reports per-topic best cosine on the AVIRIS-Classic
    1997 library plus USGS v7 plurality-chapter assignment per topic
    and overall chapter counts. Falls back to status=blocked when
    neither file exists."""
    lib_path = TOPIC_TO_LIBRARY_DIR / f"{scene_id}.json"
    usgs_path = TOPIC_TO_USGS_V7_DIR / f"{scene_id}.json"
    if not lib_path.is_file() and not usgs_path.is_file():
        return make_blocked_block(
            "spectral-library-alignment",
            "Neither build_topic_to_library nor build_topic_to_usgs_v7 has produced an artifact for this scene yet",
        )

    metrics: dict = {}
    sources: list[str] = []

    if lib_path.is_file():
        sources.append(
            str(lib_path.relative_to(DERIVED_DIR.parent)).replace("\\", "/")
        )
        payload = json.loads(lib_path.read_text(encoding="utf-8"))
        cos = np.asarray(payload.get("topic_x_library_cosine", []), dtype=np.float64)
        if cos.size > 0:
            best_per_topic = cos.max(axis=1)
            metrics["library_aviris_classic"] = {
                "library_subset": payload.get("library_sensor_subset"),
                "library_sample_count": int(payload.get("library_sample_count", 0)),
                "topic_count": int(cos.shape[0]),
                "best_cosine_per_topic_mean": round(float(best_per_topic.mean()), 6),
                "best_cosine_per_topic_min": round(float(best_per_topic.min()), 6),
                "best_cosine_per_topic_max": round(float(best_per_topic.max()), 6),
                "best_cosine_per_topic": [round(float(v), 6) for v in best_per_topic],
            }

    if usgs_path.is_file():
        sources.append(
            str(usgs_path.relative_to(DERIVED_DIR.parent)).replace("\\", "/")
        )
        payload = json.loads(usgs_path.read_text(encoding="utf-8"))
        chapter_counts = payload.get("library_chapter_counts", {}) or {}
        # chapter_histogram_top50_per_topic is a list[K] of dicts
        # {chapter: count_in_top_50}; pick each topic's plurality chapter.
        chapter_top50 = payload.get("chapter_histogram_top50_per_topic", []) or []
        chapter_top1_counts: dict[str, int] = {}
        for histogram in chapter_top50:
            if not isinstance(histogram, dict) or not histogram:
                continue
            best_chapter = max(histogram.items(), key=lambda kv: kv[1])[0]
            chapter_top1_counts[best_chapter] = (
                chapter_top1_counts.get(best_chapter, 0) + 1
            )
        metrics["library_usgs_v7"] = {
            "library_subset": payload.get("library_subset"),
            "library_sample_count": int(payload.get("library_sample_count", 0)),
            "library_chapter_counts": chapter_counts,
            "topic_count_with_top50_histogram": len(chapter_top50),
            "best_chapter_count_per_topic": chapter_top1_counts,
        }

    return {
        "block_id": "spectral-library-alignment",
        "status": "ready",
        "metrics": metrics,
        "sources": sources,
    }


def make_blocked_block(block_id: str, reason: str) -> dict:
    return {
        "block_id": block_id,
        "status": "blocked",
        "metrics": None,
        "reason": reason,
    }


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    fit_dir = LOCAL_FIT_DIR / scene_id
    if not (fit_dir / "vocab.json").exists():
        print(f"  no fit at {fit_dir} — run build_topic_views.py first", flush=True)
        return None

    # Reconstruct doc_term from cube (matches the recipe used by build_topic_views)
    cube, gt, config = load_scene(scene_id)
    flat = cube.reshape(-1, cube.shape[-1]).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(labels, 220, random_state=42)
    sample_spectra = spectra[sample_idx_local]
    sample_labels = labels[sample_idx_local]
    doc_term = band_frequency_counts(sample_spectra, scale=12).astype(np.float32)

    vocab_meta = json.load((fit_dir / "vocab.json").open("r", encoding="utf-8"))
    K = int(vocab_meta["K"])

    theta = np.load(fit_dir / "theta.npy")

    blocks = [
        compute_corpus_integrity(doc_term),
        compute_topic_stability(doc_term, K),
        compute_supervision_association(theta, sample_labels),
        compute_quantization_sensitivity_block(scene_id),
        compute_document_definition_sensitivity_block(scene_id),
        compute_spectral_library_alignment_block(scene_id),
    ]

    return {
        "scene_id": scene_id,
        "scene_name": config.name,
        "blocks": blocks,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_validation_blocks v0.4",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[validation_blocks] {scene_id} ...", flush=True)
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
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))

        # Show key numbers
        block_map = {b["block_id"]: b for b in payload["blocks"]}
        ci = block_map["corpus-integrity"]["metrics"]
        ts = block_map["topic-stability"]["metrics"]
        sa = block_map["supervision-association"]["metrics"]
        qs_block = block_map.get("quantization-sensitivity", {})
        qs_metrics = (
            qs_block.get("metrics") if qs_block.get("status") == "ready" else None
        )
        qs_summary = (
            f"quant={qs_metrics.get('verdict')}"
            if qs_metrics
            else f"quant={qs_block.get('status')}"
        )
        dd_block = block_map.get("document-definition-sensitivity", {})
        dd_metrics = (
            dd_block.get("metrics") if dd_block.get("status") == "ready" else None
        )
        if dd_metrics:
            ari_off = dd_metrics.get("off_diagonal_ari", {}) or {}
            dd_summary = (
                f"docdef_n={dd_metrics.get('n_methods_compared')} "
                f"ARI_off={ari_off.get('mean', 0):.3f}"
            )
        else:
            dd_summary = f"docdef={dd_block.get('status', '?')}"
        print(
            f"  D={ci['document_count']} V={ci['vocabulary_size']} "
            f"matched_cos={ts['matched_cosine_overall_mean']:.3f} "
            f"ARI={sa['ari_kmeans_theta_vs_label']:.3f} "
            f"theta_F1={sa['logistic_regression_on_theta_macro_f1']['mean']:.3f} "
            f"{qs_summary} {dd_summary}",
            flush=True,
        )
        written += 1
    print(f"[validation_blocks] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
