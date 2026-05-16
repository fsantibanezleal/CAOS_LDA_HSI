"""Pydantic response models for the band-masks route family.

Closes one P1 item from issue #440 ("47 untyped dict response handlers"):
the five `/band-masks*` endpoints in `app/routers/content.py` now declare
response models that mirror the frontend types in `frontend/src/api/client.ts`
(BandMaskIndex, BandMaskCanonicalComparison, BandMaskSummary,
BandMaskHidsagIndex, BandMaskHidsagSummary).

extra='allow' is set on every payload so backend JSON drift does not silently
drop fields under FastAPI's response_model filtering.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


_PassThroughConfig = ConfigDict(extra="allow")


class BandMaskDefinition(BaseModel):
    model_config = _PassThroughConfig
    label: str
    description: str


class BandMaskLdaConfig(BaseModel):
    model_config = _PassThroughConfig
    method: str
    max_iter: int
    doc_topic_prior: float
    topic_word_prior: float
    random_state: int
    wordification: str
    quantization_scale: int | None = None
    samples_per_class: int | None = None


class BandMaskLabelCell(BaseModel):
    model_config = _PassThroughConfig
    label_id: int
    name: str
    count: int
    p: float


class BandMaskCovariateProbability(BaseModel):
    model_config = _PassThroughConfig
    covariate: str
    count: int
    p: float


class BandMaskDominantTopicMapMeta(BaseModel):
    model_config = _PassThroughConfig
    format: str
    shape: list[int]
    sentinel_unlabelled: int
    served_path: str


class BandMaskThetaGridMeta(BaseModel):
    model_config = _PassThroughConfig
    format: str
    shape: list[int]
    dtype: str
    sentinel: str
    byte_order: str | None = None
    served_path: str


class BandMaskIndexEntry(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    mask_id: str
    mask_label: str | None = None
    topic_count: int | None = None
    n_bands_full: int | None = None
    n_bands_kept: int | None = None
    perplexity_train: float | None = None
    ari_dominant_vs_label: float | None = None
    mean_confidence: float | None = None
    summary_path: str | None = None
    skipped: bool | None = None
    reason: str | None = None


class BandMasksIndexResponse(BaseModel):
    model_config = _PassThroughConfig
    generated_at: str
    builder_version: str
    mask_definitions: dict[str, BandMaskDefinition]
    entries: list[BandMaskIndexEntry] = Field(default_factory=list)


class BandMaskCanonicalComparisonEntry(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    mask_id: str
    skipped: bool | None = None
    reason: str | None = None
    n_paired_pixels: int | None = None
    paired_ari_dominant_topics: float | None = None
    swap_rate_under_hungarian_alignment: float | None = None
    n_topic_swaps: int | None = None
    kl_p_label_given_topic_mean: float | None = None
    kl_p_label_given_topic_max: float | None = None
    hungarian_assignment: dict[str, int] | None = None
    topic_count_canonical: int | None = None
    topic_count_masked: int | None = None
    n_bands_full: int | None = None
    n_bands_kept: int | None = None
    ari_dominant_vs_label_masked: float | None = None
    perplexity_train_masked: float | None = None


class BandMaskCanonicalComparisonResponse(BaseModel):
    model_config = _PassThroughConfig
    generated_at: str
    builder_version: str
    description: str
    entries: list[BandMaskCanonicalComparisonEntry] = Field(default_factory=list)


class BandMaskSummaryResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    mask_id: str
    mask_label: str
    mask_description: str
    spatial_shape: list[int]
    topic_count: int
    document_count: int
    vocabulary_size: int
    n_bands_full: int
    n_bands_kept: int
    kept_band_indices: list[int]
    wavelengths_nm_kept_first_last: list[float]
    wavelengths_nm_kept: list[float]
    topic_prevalence: list[float]
    topic_distance_cosine: list[list[float]]
    top_words_per_topic_lambda_05: list[list[str]]
    p_label_given_topic_dominant: list[list[BandMaskLabelCell]]
    docs_per_topic_dominant: list[int]
    perplexity_train: float
    ari_dominant_vs_label: float
    mean_confidence: float
    lda_config: BandMaskLdaConfig
    dominant_topic_map: BandMaskDominantTopicMapMeta
    theta_grid: BandMaskThetaGridMeta
    generated_at: str
    builder_version: str


class BandMaskHidsagIndexEntry(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str
    mask_id: str
    mask_label: str | None = None
    topic_count: int | None = None
    n_bands_full: int | None = None
    n_bands_kept: int | None = None
    perplexity_train: float | None = None
    mean_confidence: float | None = None
    summary_path: str | None = None
    skipped: bool | None = None
    reason: str | None = None


class BandMasksHidsagIndexResponse(BaseModel):
    model_config = _PassThroughConfig
    generated_at: str
    builder_version: str
    modality: str
    mask_definitions: dict[str, BandMaskDefinition]
    entries: list[BandMaskHidsagIndexEntry] = Field(default_factory=list)


class BandMaskHidsagSummaryResponse(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str
    mask_id: str
    mask_label: str
    mask_description: str
    modality: str
    topic_count: int
    document_count: int
    vocabulary_size: int
    n_bands_full: int
    n_bands_kept: int
    kept_band_indices: list[int]
    wavelengths_nm_kept_first_last: list[float]
    wavelengths_nm_kept: list[float]
    topic_prevalence: list[float]
    topic_distance_cosine: list[list[float]]
    top_words_per_topic_lambda_05: list[list[str]]
    p_covariate_given_topic_dominant: list[list[BandMaskCovariateProbability]]
    docs_per_topic_dominant: list[int]
    perplexity_train: float
    mean_confidence: float
    doc_names: list[str]
    sample_names: list[str]
    covariates: list[str]
    theta_per_doc: list[list[float]]
    lda_config: BandMaskLdaConfig
    generated_at: str
    builder_version: str
