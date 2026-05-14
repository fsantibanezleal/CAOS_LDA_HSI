"""HIDSAG companion to build_band_masked_topic_models.py (cycle 138).

Same Step 8 band-mask sweep but for the five HIDSAG mineral/geochem
subsets (GEOMET, MINERAL1, MINERAL2, GEOCHEM, PORPHYRY). Reads the
`swir_low` modality (1000-2500 nm) from the curated subset payload at
`data/derived/core/hidsag_curated_subset.json`, fits a canonical LDA
(not DMR-LDA — simpler + comparable to the labelled-scene sweep), and
writes per-(subset, mask) summaries.

HIDSAG specifics vs labelled scenes:

- **No spatial grid**: each document is a single mean spectrum per
  (sample, measurement, cube). The output therefore has *no*
  `dominant_topic_map.bin` or `theta_grid.bin` sidecars — just a flat
  D × K theta matrix and a `summary.json`.
- **No pixel-level ground-truth label**: instead, each document
  carries a `covariate` tag (the first measurement tag, e.g. lithology
  / mineralogy). The analogue of `P(L | t)` becomes `P(covariate | t)`.
- **`vnir` mask is auto-skipped** because `swir_low` modality has
  no VNIR bands (1000-2500 nm only).
- **`top_50_fisher` mask** uses a different rule: HIDSAG has no
  per-pixel label, so Fisher discriminant doesn't apply. We rank bands
  by *per-band variance across covariates* (between-covariate
  variance / total variance — a clustering-discriminative proxy).
  Documented in the per-tuple summary.

Outputs:

  data/derived/band_masks_hidsag/<subset>/<mask>/summary.json
  data/derived/band_masks_hidsag/index.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR

DERIVED_OUT_DIR = DERIVED_DIR / "band_masks_hidsag"
HIDSAG_CURATED_PATH = DERIVED_DIR / "core" / "hidsag_curated_subset.json"

SCALE = 12
RANDOM_STATE = 42
LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.2
PRIMARY_MODALITY = "swir_low"

HIDSAG_SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"]
HIDSAG_SUBSET_TOPIC_COUNTS = {
    "GEOMET": 6,
    "MINERAL1": 6,
    "MINERAL2": 4,
    "GEOCHEM": 5,
    "PORPHYRY": 6,
}

WATER_BANDS_NM = [
    (1350.0, 1430.0),
    (1800.0, 1950.0),
    (2480.0, 2500.0),
]


def mask_vnir(wavelengths: np.ndarray) -> np.ndarray:
    return (wavelengths >= 400.0) & (wavelengths <= 1100.0)


def mask_swir(wavelengths: np.ndarray) -> np.ndarray:
    return (wavelengths >= 1100.0) & (wavelengths <= 2500.0)


def mask_no_water(wavelengths: np.ndarray) -> np.ndarray:
    keep = np.ones_like(wavelengths, dtype=bool)
    for lo, hi in WATER_BANDS_NM:
        keep &= ~((wavelengths >= lo) & (wavelengths <= hi))
    return keep


def mask_top_between_cov_variance(
    spectra: np.ndarray, covariates: list[str], top_n: int = 50
) -> np.ndarray:
    """HIDSAG-specific top-N selector: rank bands by the fraction of
    variance explained by the *between-covariate* split. High value
    means the band varies systematically across the covariate values
    (≈ Fisher discriminant on a clustering proxy)."""
    n_bands = spectra.shape[1]
    if n_bands == 0:
        return np.zeros(0, dtype=bool)
    unique_covs = sorted(set(covariates))
    if len(unique_covs) < 2:
        return np.ones(n_bands, dtype=bool)
    overall_mean = spectra.mean(axis=0)
    between = np.zeros(n_bands)
    within = np.zeros(n_bands)
    for cov in unique_covs:
        mask = np.array([c == cov for c in covariates])
        n_k = int(mask.sum())
        if n_k == 0:
            continue
        cov_mean = spectra[mask].mean(axis=0)
        between += n_k * (cov_mean - overall_mean) ** 2
        within += ((spectra[mask] - cov_mean) ** 2).sum(axis=0)
    total = between + within
    ratio = np.where(total > 0, between / np.maximum(total, 1e-9), 0.0)
    order = np.argsort(-ratio)[:top_n]
    keep = np.zeros(n_bands, dtype=bool)
    keep[order] = True
    return keep


MASKS = ["vnir", "swir", "no_water", "top_50_fisher"]
MASK_LABELS = {
    "vnir": "VNIR-only (400-1100 nm)",
    "swir": "SWIR-only (1100-2500 nm)",
    "no_water": "Water-bands removed (1350-1430 + 1800-1950 + 2480-2500 nm)",
    "top_50_fisher": "Top-50 between-covariate variance bands",
}
MASK_DESCRIPTIONS = {
    "vnir": "Visible + near-infrared only. Auto-skipped for HIDSAG swir_low modality (no VNIR bands).",
    "swir": "Shortwave-infrared only. On HIDSAG swir_low this keeps the full spectrum (no-op).",
    "no_water": "Drop atmospheric water-vapour absorption bands.",
    "top_50_fisher": "Top-50 bands by between-covariate variance ratio. HIDSAG analogue of the labelled-scene Fisher selector — replaces Fisher discriminant on labels with between-covariate-group variance share.",
}


def band_frequency_counts(spectra: np.ndarray, scale: int = SCALE) -> np.ndarray:
    lo = np.nanmin(spectra, axis=0, keepdims=True)
    hi = np.nanmax(spectra, axis=0, keepdims=True)
    denom = np.where(hi > lo, hi - lo, 1.0)
    norm = np.clip((spectra - lo) / denom, 0.0, 1.0)
    return np.round(norm * scale).astype(np.int32)


def cosine_distance_matrix(phi: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(phi, axis=1, keepdims=True)
    safe = np.where(norms > 0, norms, 1.0)
    normed = phi / safe
    cos = normed @ normed.T
    return np.clip(1.0 - cos, 0.0, 2.0)


def top_words(phi: np.ndarray, vocab: list[str], n: int = 15) -> list[list[str]]:
    out = []
    for k in range(phi.shape[0]):
        order = np.argsort(phi[k])[::-1][:n]
        out.append([vocab[int(i)] for i in order])
    return out


def collect_documents(
    subset: dict, modality: str = PRIMARY_MODALITY
) -> tuple[np.ndarray, list[str], list[str], list[str]]:
    rows = []
    doc_names = []
    covariates = []
    sample_names = []
    for sample in subset.get("samples", []) or []:
        sample_id = sample.get("sample_name") or sample.get("datarecord")
        if sample_id is None:
            continue
        measurements = sample.get("measurements", []) or []
        for meas_idx, meas in enumerate(measurements):
            for cube in meas.get("cubes", []) or []:
                if cube.get("modality") != modality:
                    continue
                mean_spec = cube.get("mean_spectrum")
                if not mean_spec:
                    continue
                spec = np.asarray(mean_spec, dtype=np.float32)
                if not np.all(np.isfinite(spec)) or spec.size == 0:
                    continue
                rows.append(spec)
                doc_names.append(
                    f"{sample_id}__m{meas_idx}__{cube.get('crop_id', '?')}"
                )
                tags = meas.get("tags", []) or []
                cov = tags[0] if tags else "unknown"
                covariates.append(str(cov))
                sample_names.append(str(sample_id))
    if not rows:
        return np.zeros((0, 0), dtype=np.float32), [], [], []
    band_counts = [r.size for r in rows]
    target_b = int(min(band_counts))
    aligned = np.stack([r[:target_b] for r in rows], axis=0)
    return aligned, doc_names, covariates, sample_names


def covariate_distribution(
    covariates: list[str], dominant: np.ndarray, k_target: int
) -> list[dict]:
    """P(covariate | dominant == k_target). Returns list of {cov, count, p}."""
    mask = dominant == k_target
    sel = [covariates[i] for i in range(len(covariates)) if mask[i]]
    total = len(sel)
    out = []
    if total == 0:
        return out
    unique_covs = sorted(set(covariates))
    for cov in unique_covs:
        count = sum(1 for c in sel if c == cov)
        out.append(
            {
                "covariate": cov,
                "count": count,
                "p": float(count / total),
            }
        )
    out.sort(key=lambda x: -x["p"])
    return out


def build_for(curated: dict, subset_code: str, mask_id: str) -> dict | None:
    subset = next(
        (s for s in curated.get("subsets", []) if s.get("subset_code") == subset_code),
        None,
    )
    if subset is None:
        return None

    spectra, doc_names, covariates, sample_names = collect_documents(
        subset, PRIMARY_MODALITY
    )
    if spectra.shape[0] == 0:
        return None
    D, b_full = spectra.shape

    modality_wls = (subset.get("modality_wavelengths_nm") or {}).get(
        PRIMARY_MODALITY
    ) or []
    if len(modality_wls) >= b_full:
        wavelengths = np.asarray(modality_wls[:b_full], dtype=np.float64)
    else:
        wavelengths = np.linspace(1000.0, 2500.0, b_full)

    if mask_id == "vnir":
        keep = mask_vnir(wavelengths)
    elif mask_id == "swir":
        keep = mask_swir(wavelengths)
    elif mask_id == "no_water":
        keep = mask_no_water(wavelengths)
    elif mask_id == "top_50_fisher":
        keep = mask_top_between_cov_variance(spectra, covariates, top_n=50)
    else:
        raise ValueError(f"unknown mask: {mask_id}")

    n_bands_kept = int(keep.sum())
    if n_bands_kept < 8:
        return {
            "skipped": True,
            "reason": f"only {n_bands_kept} bands kept after mask; need >= 8",
            "n_bands_full": int(b_full),
            "n_bands_kept": n_bands_kept,
        }

    band_keep_idx = np.flatnonzero(keep)
    wavelengths_kept = wavelengths[keep]
    spectra_kept = spectra[:, keep]

    counts = band_frequency_counts(spectra_kept, scale=SCALE)
    doc_term = counts.astype(np.float32)

    vocab = [
        f"swir_{int(round(float(wavelengths_kept[i]))):04d}nm"
        for i in range(spectra_kept.shape[1])
    ]
    K = HIDSAG_SUBSET_TOPIC_COUNTS.get(subset_code, 6)

    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=LDA_MAX_ITER,
        batch_size=128,
        evaluate_every=-1,
        random_state=RANDOM_STATE,
        doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
        topic_word_prior=LDA_TOPIC_WORD_PRIOR,
    )
    theta = lda.fit_transform(doc_term)
    phi_unn = lda.components_
    phi = phi_unn / phi_unn.sum(axis=1, keepdims=True)
    perplexity = float(lda.perplexity(doc_term))

    dominant = np.argmax(theta, axis=1)
    confidence = np.max(theta, axis=1)
    topic_prevalence = theta.mean(axis=0)
    topic_distance_cosine = cosine_distance_matrix(phi)
    top_words_lambda_05 = top_words(phi, vocab, n=15)

    p_cov_given_topic_dominant = [
        covariate_distribution(covariates, dominant, k) for k in range(K)
    ]
    docs_per_topic_dominant = [int((dominant == k).sum()) for k in range(K)]

    out_dir = DERIVED_OUT_DIR / subset_code / mask_id
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "subset_code": subset_code,
        "mask_id": mask_id,
        "mask_label": MASK_LABELS[mask_id],
        "mask_description": MASK_DESCRIPTIONS[mask_id],
        "modality": PRIMARY_MODALITY,
        "topic_count": int(K),
        "document_count": int(D),
        "vocabulary_size": int(spectra_kept.shape[1]),
        "n_bands_full": int(b_full),
        "n_bands_kept": n_bands_kept,
        "kept_band_indices": [int(i) for i in band_keep_idx.tolist()],
        "wavelengths_nm_kept_first_last": [
            float(wavelengths_kept[0]),
            float(wavelengths_kept[-1]),
        ],
        "wavelengths_nm_kept": [
            round(float(x), 2) for x in wavelengths_kept.tolist()
        ],
        "topic_prevalence": [round(float(v), 6) for v in topic_prevalence.tolist()],
        "topic_distance_cosine": [
            [round(float(v), 6) for v in row.tolist()] for row in topic_distance_cosine
        ],
        "top_words_per_topic_lambda_05": top_words_lambda_05,
        "p_covariate_given_topic_dominant": p_cov_given_topic_dominant,
        "docs_per_topic_dominant": docs_per_topic_dominant,
        "perplexity_train": perplexity,
        "mean_confidence": float(np.mean(confidence)),
        "doc_names": doc_names,
        "sample_names": sample_names,
        "covariates": covariates,
        "theta_per_doc": [
            [round(float(v), 4) for v in row.tolist()] for row in theta
        ],
        "lda_config": {
            "method": "sklearn.LatentDirichletAllocation online",
            "max_iter": LDA_MAX_ITER,
            "doc_topic_prior": LDA_DOC_TOPIC_PRIOR,
            "topic_word_prior": LDA_TOPIC_WORD_PRIOR,
            "random_state": RANDOM_STATE,
            "wordification": "band-frequency",
            "quantization_scale": SCALE,
        },
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_band_masked_topic_models_hidsag v0.1",
    }

    (out_dir / "summary.json").write_text(
        json.dumps(summary, separators=(",", ":")), encoding="utf-8"
    )
    return summary


def main() -> int:
    if not HIDSAG_CURATED_PATH.exists():
        print(
            f"[band_masks_hidsag] no curated HIDSAG subset at {HIDSAG_CURATED_PATH}",
            flush=True,
        )
        return 1
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    curated = json.load(HIDSAG_CURATED_PATH.open("r", encoding="utf-8"))

    index_entries: list[dict] = []
    for code in HIDSAG_SUBSETS:
        for mask_id in MASKS:
            print(f"[band_masks_hidsag] {code}/{mask_id} ...", flush=True)
            try:
                result = build_for(curated, code, mask_id)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                import traceback
                traceback.print_exc()
                continue
            if result is None:
                print("  skipped (no docs)", flush=True)
                continue
            if result.get("skipped"):
                print(f"  skipped: {result.get('reason')}", flush=True)
                index_entries.append(
                    {
                        "subset_code": code,
                        "mask_id": mask_id,
                        "skipped": True,
                        "reason": result.get("reason"),
                        "n_bands_full": result.get("n_bands_full"),
                        "n_bands_kept": result.get("n_bands_kept"),
                    }
                )
                continue
            print(
                f"  K={result['topic_count']} D={result['document_count']} "
                f"V={result['vocabulary_size']} bands={result['n_bands_kept']}/{result['n_bands_full']} "
                f"ppl={result['perplexity_train']:.3f}",
                flush=True,
            )
            index_entries.append(
                {
                    "subset_code": code,
                    "mask_id": mask_id,
                    "mask_label": result["mask_label"],
                    "topic_count": result["topic_count"],
                    "n_bands_full": result["n_bands_full"],
                    "n_bands_kept": result["n_bands_kept"],
                    "perplexity_train": result["perplexity_train"],
                    "mean_confidence": result["mean_confidence"],
                    "summary_path": f"data/derived/band_masks_hidsag/{code}/{mask_id}/summary.json",
                }
            )

    index_payload = {
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_band_masked_topic_models_hidsag v0.1",
        "modality": PRIMARY_MODALITY,
        "mask_definitions": {
            k: {"label": MASK_LABELS[k], "description": MASK_DESCRIPTIONS[k]}
            for k in MASKS
        },
        "entries": index_entries,
    }
    (DERIVED_OUT_DIR / "index.json").write_text(
        json.dumps(index_payload, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"[band_masks_hidsag] wrote {len(index_entries)} entries -> "
        f"{DERIVED_OUT_DIR / 'index.json'}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
