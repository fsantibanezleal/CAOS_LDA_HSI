"""DMR-LDA on HIDSAG subsets with measurement-tag covariates.

DMR-LDA (Dirichlet-Multinomial Regression LDA, Mimno-McCallum 2008)
extends standard LDA by conditioning the topic prior on observed
document-level covariates. For HIDSAG, the most natural covariates
are the measurement tags (process-tag prefix P1 / P2 / P3 / ...,
modality, mineralogy class) which capture *how* a sample was
prepared and acquired. Standard LDA mixes topics from documents with
heterogeneous acquisition conditions; DMR-LDA can disentangle
acquisition signal from compositional signal.

This builder:

1. Loads each HIDSAG subset's curated samples
2. For each sample, takes the precomputed mean_spectrum of its
   swir_low cube as the per-document spectrum (no need to extract the
   raw cube from the zip)
3. Wordifies via band-frequency at Q=12 (matches the rest of the
   pipeline)
4. Fits tomotopy.DMRModel with the measurement tags as covariates
5. Reports topic-mixture conditional on each covariate plus
   per-topic top-words

Output: data/derived/topic_variants/dmr_lda_hidsag/<subset>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR

warnings.filterwarnings("ignore")


HIDSAG_CURATED_PATH = DERIVED_DIR / "core" / "hidsag_curated_subset.json"
LOCAL_OUT_ROOT = DATA_DIR / "local" / "topic_variants" / "dmr_lda_hidsag"
DERIVED_OUT_DIR = DERIVED_DIR / "topic_variants" / "dmr_lda_hidsag"

SCALE = 12
RANDOM_STATE = 42
HIDSAG_SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"]
HIDSAG_SUBSET_TOPIC_COUNTS = {
    "GEOMET": 6, "MINERAL1": 6, "MINERAL2": 4, "GEOCHEM": 5, "PORPHYRY": 6,
}
PRIMARY_MODALITY = "swir_low"  # 1000-2500 nm — best for mineralogy


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def collect_documents(subset: dict, modality: str = PRIMARY_MODALITY) -> tuple[
    np.ndarray, list[str], list[str], list[str]
]:
    """Returns (spectra [N, B], doc_names, covariates, sample_names) for samples
    that have at least one cube of the requested modality with a precomputed
    mean_spectrum."""
    rows = []
    doc_names = []
    covariates = []
    sample_names = []
    for sample in subset.get("samples", []) or []:
        sample_id = sample.get("sample_name") or sample.get("datarecord")
        if sample_id is None:
            continue
        # Walk measurements -> cubes
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
                doc_names.append(f"{sample_id}__m{meas_idx}__{cube.get('crop_id', '?')}")
                # Covariate: first non-empty measurement tag
                tags = meas.get("tags", []) or []
                cov = tags[0] if tags else "unknown"
                covariates.append(str(cov))
                sample_names.append(str(sample_id))
    if not rows:
        return np.zeros((0, 0), dtype=np.float32), [], [], []
    # Pad / trim to same band count
    band_counts = [r.size for r in rows]
    target_b = int(min(band_counts))
    aligned = np.stack([r[:target_b] for r in rows], axis=0)
    return aligned, doc_names, covariates, sample_names


def fit_dmr_lda(doc_term: np.ndarray, vocab: list[str], covariates: list[str], K: int) -> dict:
    import tomotopy as tp

    mdl = tp.DMRModel(k=K, alpha=0.1, eta=0.01, sigma=1.0, seed=RANDOM_STATE)
    for d in range(doc_term.shape[0]):
        nz = np.flatnonzero(doc_term[d])
        words = []
        for i in nz:
            words.extend([vocab[int(i)]] * int(doc_term[d, int(i)]))
        if words:
            mdl.add_doc(words, metadata=str(covariates[d]))
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

    # Per-covariate topic prior (lambda parameter of DMR)
    metadata_set = sorted(set(covariates))
    per_cov_prior: dict[str, list[float]] = {}
    for cov in metadata_set:
        try:
            prior = mdl.get_topic_prior(metadata=cov)
            per_cov_prior[cov] = [round(float(p), 6) for p in prior]
        except Exception:
            per_cov_prior[cov] = None
    return {
        "phi": phi,
        "theta": theta,
        "perplexity": perp,
        "covariates": metadata_set,
        "per_covariate_topic_prior": per_cov_prior,
    }


def topk_words(phi_row: np.ndarray, vocab: list[str], top_n: int = 30) -> list[dict]:
    order = np.argsort(phi_row)[::-1][:top_n]
    return [
        {"token": vocab[int(i)], "p_w_given_topic": round(float(phi_row[int(i)]), 6)}
        for i in order
    ]


def build_for_subset(curated: dict, subset_code: str) -> dict | None:
    subset = next(
        (s for s in curated.get("subsets", []) if s.get("subset_code") == subset_code),
        None,
    )
    if subset is None:
        return None
    spectra, doc_names, covariates, sample_names = collect_documents(subset)
    if spectra.shape[0] == 0:
        return None

    # Modality wavelengths
    modality_wls = (subset.get("modality_wavelengths_nm") or {}).get(PRIMARY_MODALITY) or []
    if len(modality_wls) >= spectra.shape[1]:
        wavelengths = np.asarray(modality_wls[:spectra.shape[1]], dtype=np.float64)
    else:
        wavelengths = np.linspace(1000.0, 2500.0, spectra.shape[1])

    vocab = [f"swir_{int(round(float(wavelengths[i]))):04d}nm" for i in range(spectra.shape[1])]
    doc_term = band_frequency_counts(spectra).astype(np.float32)
    K = HIDSAG_SUBSET_TOPIC_COUNTS.get(subset_code, 6)

    fit = fit_dmr_lda(doc_term, vocab, covariates, K)
    phi = fit["phi"]

    # Save artifacts
    local_dir = LOCAL_OUT_ROOT / subset_code
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", fit["theta"].astype(np.float32))
    with (local_dir / "vocab.json").open("w", encoding="utf-8") as h:
        json.dump({
            "vocab": vocab, "K": int(K), "D": int(spectra.shape[0]),
            "doc_names": doc_names, "covariates": covariates,
            "sample_names": sample_names,
        }, h)

    return {
        "subset_code": subset_code,
        "variant": "dmr_lda_hidsag",
        "topic_count": int(K),
        "vocabulary_size": int(len(vocab)),
        "document_count": int(spectra.shape[0]),
        "modality": PRIMARY_MODALITY,
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "topic_prevalence": [round(float(v), 6) for v in fit["theta"].mean(axis=0).tolist()],
        "top_words_per_topic": [topk_words(phi[k], vocab) for k in range(K)],
        "perplexity": round(float(fit["perplexity"]), 4),
        "covariates_observed": fit["covariates"],
        "per_covariate_topic_prior": fit["per_covariate_topic_prior"],
        "covariate_count_per_value": {
            cov: int(sum(1 for c in covariates if c == cov))
            for cov in fit["covariates"]
        },
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_dmr_lda_hidsag v0.1",
    }


def main() -> int:
    if not HIDSAG_CURATED_PATH.exists():
        print(f"  no curated HIDSAG subset at {HIDSAG_CURATED_PATH}", flush=True)
        return 0
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    curated = json.load(HIDSAG_CURATED_PATH.open("r", encoding="utf-8"))
    written = 0
    for code in HIDSAG_SUBSETS:
        print(f"[dmr_lda_hidsag] {code} ...", flush=True)
        try:
            payload = build_for_subset(curated, code)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped", flush=True)
            continue
        out_path = DERIVED_OUT_DIR / f"{code}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        n_cov = len(payload["covariates_observed"])
        print(
            f"  K={payload['topic_count']} D={payload['document_count']} "
            f"V={payload['vocabulary_size']} covs={n_cov} perp={payload['perplexity']}",
            flush=True,
        )
        written += 1
    print(f"[dmr_lda_hidsag] done — {written} subsets written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
