"""Build static corpus previews for the product reset workflow.

The reset product must not show topic charts before the corpus mapping is
explicit. This generator consumes compact derived assets that are already safe
for the web app and creates small, reversible previews for selected
representations.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from statistics import median
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
SPECTRAL_PATH = ROOT / "data" / "derived" / "spectral" / "library_samples.json"
REAL_PATH = ROOT / "data" / "derived" / "real" / "real_samples.json"
OUTPUT_DIR = ROOT / "data" / "derived" / "corpus"
OUTPUT_PATH = OUTPUT_DIR / "corpus_previews.json"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalized_counts(values: Iterable[float], scale: int = 12) -> list[int]:
    array = [float(value) for value in values]
    if not array:
        return []
    low = min(array)
    high = max(array)
    denom = high - low if high > low else 1.0
    return [int(round(max(0.0, min(1.0, (value - low) / denom)) * scale)) for value in array]


def band_token(wavelength: float) -> str:
    return f"{int(round(float(wavelength))):04d}nm"


def magnitude_tokens(quantized_levels: Iterable[int]) -> list[str]:
    return [f"q{int(level):02d}" for level in quantized_levels]


def band_frequency_tokens(spectrum: Iterable[float], wavelengths: Iterable[float]) -> list[str]:
    tokens: list[str] = []
    for wavelength, count in zip(wavelengths, normalized_counts(spectrum), strict=False):
        tokens.extend([band_token(float(wavelength))] * count)
    return tokens


def band_magnitude_tokens(quantized_levels: Iterable[int], wavelengths: Iterable[float]) -> list[str]:
    return [
        f"{band_token(float(wavelength))}_q{int(level):02d}"
        for wavelength, level in zip(wavelengths, quantized_levels, strict=False)
    ]


def length_stats(documents: list[dict[str, Any]]) -> dict[str, float | int]:
    lengths = [int(document["token_count"]) for document in documents]
    if not lengths:
        return {"min": 0, "median": 0.0, "max": 0, "mean": 0.0}
    return {
        "min": min(lengths),
        "median": round(float(median(lengths)), 2),
        "max": max(lengths),
        "mean": round(float(sum(lengths) / len(lengths)), 2),
    }


def top_tokens(documents: list[dict[str, Any]], limit: int = 12) -> list[dict[str, int | str]]:
    counts: Counter[str] = Counter()
    for document in documents:
        counts.update(document["full_tokens"])
    return [{"token": token, "count": int(count)} for token, count in counts.most_common(limit)]


def finalize_preview(
    *,
    preview_id: str,
    dataset_id: str,
    dataset_name: str,
    family_id: str,
    recipe_id: str,
    corpus_definition: dict[str, Any],
    documents: list[dict[str, Any]],
    reversible_token_examples: dict[str, str],
    caveats: list[str],
) -> dict[str, Any]:
    vocabulary = sorted({token for document in documents for token in document["full_tokens"]})
    example_documents = []
    for document in documents[:6]:
        example = {key: value for key, value in document.items() if key != "full_tokens"}
        example["tokens"] = document["full_tokens"][:18]
        example_documents.append(example)

    return {
        "id": preview_id,
        "dataset_id": dataset_id,
        "dataset_name": dataset_name,
        "family_id": family_id,
        "recipe_id": recipe_id,
        "document_count": len(documents),
        "vocabulary_size": len(vocabulary),
        "zero_token_documents": sum(1 for document in documents if document["token_count"] == 0),
        "document_length": length_stats(documents),
        "corpus_definition": corpus_definition,
        "top_tokens": top_tokens(documents),
        "example_documents": example_documents,
        "reversible_token_examples": reversible_token_examples,
        "caveats": caveats,
    }


def document_payload(
    *,
    document_id: str,
    label: str,
    source: str,
    tokens: list[str],
    token_explanation: str,
    source_spectra_count: int | None = None,
) -> dict[str, Any]:
    return {
        "id": document_id,
        "label": label,
        "source": source,
        "token_count": len(tokens),
        "source_spectra_count": source_spectra_count,
        "full_tokens": tokens,
        "tokens": tokens[:18],
        "token_explanation": token_explanation,
    }


def build_usgs_magnitude_preview(samples: list[dict[str, Any]]) -> dict[str, Any]:
    selected = samples[:12]
    documents = [
        document_payload(
            document_id=sample["id"],
            label=sample["name"],
            source=sample["group"],
            tokens=magnitude_tokens(sample["quantized_levels"]),
            token_explanation="Each band emits one magnitude-bin token; band position is preserved only by token order.",
        )
        for sample in selected
    ]
    return finalize_preview(
        preview_id="usgs-splib07__magnitude-phrase",
        dataset_id="usgs-splib07",
        dataset_name="USGS Spectral Library Version 7",
        family_id="individual-spectra",
        recipe_id="magnitude-phrase",
        corpus_definition={
            "alphabet": "16 normalized magnitude bins q00..q15",
            "word": "one quantized reflectance level emitted by a band",
            "document": "one curated material reference spectrum",
            "corpus": "selected compact USGS reference spectra with comparable sensor convolution",
            "topic_ready": True,
        },
        documents=documents,
        reversible_token_examples={
            "q00": "lowest normalized reflectance bin in the document",
            "q15": "highest normalized reflectance bin in the document",
        },
        caveats=[
            "This representation is easy to inspect but weakly identifies wavelength unless order is preserved.",
            "Do not interpret magnitude-only topics as material identities.",
        ],
    )


def build_usgs_band_frequency_preview(samples: list[dict[str, Any]]) -> dict[str, Any]:
    selected = samples[:12]
    documents = [
        document_payload(
            document_id=sample["id"],
            label=sample["name"],
            source=sample["group"],
            tokens=band_frequency_tokens(sample["spectrum"], sample["wavelengths_nm"]),
            token_explanation="Band words are repeated according to normalized reflectance magnitude.",
        )
        for sample in selected
    ]
    return finalize_preview(
        preview_id="usgs-splib07__band-frequency",
        dataset_id="usgs-splib07",
        dataset_name="USGS Spectral Library Version 7",
        family_id="individual-spectra",
        recipe_id="band-frequency",
        corpus_definition={
            "alphabet": "USGS band-center wavelength tokens",
            "word": "a wavelength token repeated by normalized reflectance count",
            "document": "one curated material reference spectrum",
            "corpus": "selected compact USGS reference spectra transformed to count vectors",
            "topic_ready": True,
        },
        documents=documents,
        reversible_token_examples={
            "2200nm": "reflectance support near the 2200 nm band; repeated tokens encode magnitude",
            "0650nm": "visible red-region support; repetition is normalized, not calibrated radiance",
        },
        caveats=[
            "High-reflectance regions can dominate unless normalization and count scaling are reported.",
            "Count repetition is a modelling device, not a physical photon count.",
        ],
    )


def scene_by_id(real_payload: dict[str, Any], scene_id: str) -> dict[str, Any]:
    for scene in real_payload.get("scenes", []):
        if scene.get("id") == scene_id:
            return scene
    raise KeyError(f"Scene not found: {scene_id}")


def build_salinas_a_band_magnitude_preview(scene: dict[str, Any]) -> dict[str, Any]:
    wavelengths = scene["approximate_wavelengths_nm"]
    documents = [
        document_payload(
            document_id=f"{scene['id']}::{document['label_id']}",
            label=document["class_name"],
            source=scene["name"],
            tokens=band_magnitude_tokens(document["quantized_levels"], wavelengths),
            token_explanation="Each word joins approximate band center and quantized magnitude.",
        )
        for document in scene.get("example_documents", [])
    ]
    return finalize_preview(
        preview_id="salinas-a-corrected__band-magnitude",
        dataset_id="salinas-a-corrected",
        dataset_name="Salinas-A corrected",
        family_id="labeled-spectral-image",
        recipe_id="band-magnitude",
        corpus_definition={
            "alphabet": "band-center plus magnitude-bin words such as 2200nm_q07",
            "word": "one band/magnitude event from a labelled pixel example",
            "document": "one labelled pixel example from the compact derived payload",
            "corpus": "Salinas-A example documents generated under the same quantization",
            "topic_ready": len(documents) >= 2,
        },
        documents=documents,
        reversible_token_examples={
            "2200nm_q07": "approximately 2200 nm with quantized magnitude level 7",
            "0650nm_q03": "approximately 650 nm with quantized magnitude level 3",
        },
        caveats=[
            "Current compact Salinas-A payload exposes only the available example documents; regenerate more examples before fitting a serious topic model.",
            "Band centers are approximate visual metadata, not calibrated sensor metadata.",
        ],
    )


def build_salinas_region_preview(scene: dict[str, Any]) -> dict[str, Any]:
    wavelengths = scene["approximate_wavelengths_nm"]
    documents = [
        document_payload(
            document_id=f"{scene['id']}::class-{summary['label_id']}",
            label=summary["name"],
            source=scene["name"],
            tokens=band_magnitude_tokens(
                normalized_counts(summary["mean_spectrum"], scale=15),
                wavelengths,
            ),
            token_explanation="Each class region emits band/magnitude words from its mean spectrum.",
            source_spectra_count=int(summary["count"]),
        )
        for summary in scene.get("class_summaries", [])
    ]
    return finalize_preview(
        preview_id="salinas-corrected__region-documents",
        dataset_id="salinas-corrected",
        dataset_name="Salinas corrected",
        family_id="labeled-spectral-image",
        recipe_id="region-documents",
        corpus_definition={
            "alphabet": "band-center plus magnitude-bin words",
            "word": "one aggregated band/magnitude event from a labelled class region",
            "document": "one official Salinas class region aggregated from labelled spectra",
            "corpus": "all class-region documents built from the same Salinas scene",
            "topic_ready": True,
        },
        documents=documents,
        reversible_token_examples={
            "class document": "document boundaries come from official labels, not inferred topics",
            "source_spectra_count": "number of labelled pixels supporting the regional document",
        },
        caveats=[
            "Class-region documents are useful for validation but leak supervision, so they must be separated from unsupervised pixel documents.",
            "Mean spectra hide intra-class variability; future previews should include patch and SLIC documents.",
        ],
    )


def build_cuprite_band_magnitude_preview(scene: dict[str, Any]) -> dict[str, Any]:
    wavelengths = scene["approximate_wavelengths_nm"]
    documents = [
        document_payload(
            document_id=f"cuprite-upv-reflectance::stratum-{document['label_id']}",
            label=document["class_name"],
            source=scene["name"],
            tokens=band_magnitude_tokens(document["quantized_levels"], wavelengths),
            token_explanation="Each inferred stratum example emits band/magnitude words from an unlabeled pixel spectrum.",
        )
        for document in scene.get("example_documents", [])
    ]
    return finalize_preview(
        preview_id="cuprite-upv-reflectance__band-magnitude",
        dataset_id="cuprite-upv-reflectance",
        dataset_name="Cuprite reflectance",
        family_id="unlabeled-spectral-image",
        recipe_id="band-magnitude",
        corpus_definition={
            "alphabet": "approximate AVIRIS wavelength plus quantized reflectance-bin words",
            "word": "one band/magnitude event from an unlabeled Cuprite spectrum",
            "document": "one example pixel from an inferred spectral stratum",
            "corpus": "compact Cuprite examples generated from the same quantization",
            "topic_ready": True,
        },
        documents=documents,
        reversible_token_examples={
            "2200nm_q10": "SWIR event near a mineral-sensitive wavelength; not a mineral ID by itself",
            "inferred stratum": "topic-derived grouping used only as exploratory context",
        },
        caveats=[
            "Cuprite has no product-visible ground-truth map here; inferred strata are not labels.",
            "Mineral interpretation requires calibrated wavelengths, absorption checks, and library alignment.",
        ],
    )


def main() -> None:
    spectral_payload = load_json(SPECTRAL_PATH)
    real_payload = load_json(REAL_PATH)
    samples = spectral_payload.get("samples", [])

    previews = [
        build_usgs_magnitude_preview(samples),
        build_usgs_band_frequency_preview(samples),
        build_salinas_a_band_magnitude_preview(scene_by_id(real_payload, "salinas-a-corrected")),
        build_salinas_region_preview(scene_by_id(real_payload, "salinas-corrected")),
        build_cuprite_band_magnitude_preview(scene_by_id(real_payload, "cuprite-aviris-reflectance")),
    ]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "Static corpus previews generated from compact derived spectral assets",
        "generated_at": "2026-04-30",
        "previews": previews,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote corpus preview payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
