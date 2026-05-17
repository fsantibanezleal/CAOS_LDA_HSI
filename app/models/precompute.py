"""Pydantic response models for the second slice of precompute routes.

Mirrors the frontend types in `frontend/src/api/client.ts` for 6 routes
(continues issue #440 P1 item 1.2 after the band-masks family in c236):

- /wordifications                         WordificationsIndexResponse
- /wordifications/{scene}/{recipe}/...    WordificationResponse
- /topic-views/{scene}                    TopicViewsResponse
- /topic-to-data/{scene}                  TopicToDataResponse
- /spatial/{scene}                        SpatialValidationResponse
- /validation-blocks/{scene}              ValidationBlocksResponse

Conventions inherited from app/models/band_masks.py:
- ConfigDict(extra='allow') so backend JSON drift does not silently
  drop fields under FastAPI's response_model filtering.
- Deeply-nested or variable-shape areas (top_words_per_topic by
  λ-variant; topic_pair_log_odds keyed by 'i->j'; etc) stay as
  dict[str, Any] / list[Any] to keep the OpenAPI surface readable
  without locking down every interior shape.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


_PassThroughConfig = ConfigDict(extra="allow")


# ---------------- shared atoms ----------------


class LdaConfig(BaseModel):
    model_config = _PassThroughConfig
    method: str
    max_iter: int
    doc_topic_prior: float
    topic_word_prior: float
    random_state: int
    wordification: str
    quantization_scale: int | None = None
    samples_per_class: int | None = None


class DocLengthDistribution(BaseModel):
    model_config = _PassThroughConfig
    mean: float
    std: float
    min: int
    p25: float
    p50: float
    p75: float
    max: int


class DominantTopicMapMeta(BaseModel):
    model_config = _PassThroughConfig
    format: str
    shape: list[int]
    sentinel_unlabelled: int
    path: str | None = None
    served_path: str | None = None


class ThetaGridMeta(BaseModel):
    model_config = _PassThroughConfig
    format: str
    shape: list[int]
    dtype: str
    sentinel: str
    byte_order: str | None = None
    path: str | None = None
    served_path: str | None = None


# ---------------- wordifications ----------------


class WordificationsIndexItem(BaseModel):
    model_config = _PassThroughConfig
    id: str
    path: str
    bytes: int


class WordificationsIndexResponse(BaseModel):
    model_config = _PassThroughConfig
    count: int
    items: list[WordificationsIndexItem] = Field(default_factory=list)


class WordificationTopToken(BaseModel):
    model_config = _PassThroughConfig
    token: str
    count: int
    p_global: float


class WordificationResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    recipe: str
    scheme: str
    Q: int
    B: int
    D: int
    V_full: int
    V_actual: int
    doc_length_distribution: DocLengthDistribution
    zero_token_doc_rate: float
    corpus_marginal_entropy_bits: float
    top_tokens_by_count: list[WordificationTopToken]
    wavelengths_nm_first_last: list[float]
    local_doc_term_path: str | None = None
    generated_at: str
    builder_version: str


# ---------------- topic-views ----------------


class TopicViewsResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    topic_count: int
    vocabulary_size: int
    document_count: int
    wavelengths_nm: list[float]
    vocabulary: list[str]
    corpus_marginal: list[float] | None = None
    topic_prevalence: list[float]
    topic_band_profiles: list[list[float]]
    topic_distance_cosine: list[list[float]]
    topic_distance_js: list[list[float]] | None = None
    topic_distance_hellinger: list[list[float]] | None = None
    topic_word_jaccard_top15: list[list[float]] | None = None
    topic_intertopic_2d_js: list[list[float]]
    topic_intertopic_3d_js: list[list[float]]
    # keyed by λ-variant ("lambda_0.0", "lambda_0.3", ...) -> [topic][rank] -> word obj
    top_words_per_topic: dict[str, list[list[dict[str, Any]]]]
    topic_pair_log_odds: dict[str, list[dict[str, Any]]] | None = None
    lda_config: LdaConfig | None = None
    perplexity: float | None = None
    generated_at: str
    builder_version: str


# ---------------- topic-to-data ----------------


class TopicLabelCell(BaseModel):
    model_config = _PassThroughConfig
    label_id: int
    name: str
    count: int
    p: float


class TopDocumentForTopic(BaseModel):
    model_config = _PassThroughConfig
    doc_id: str
    theta_k: float
    label_id: int | None = None
    label_name: str | None = None
    xy: list[int]
    theta_full: list[float]


class ThetaEmbeddingPoint2D(BaseModel):
    model_config = _PassThroughConfig
    doc_id: int
    x: float
    y: float
    label_id: int | None = None
    dominant_topic_k: int | None = None
    confidence: float | None = None


class ThetaEmbeddingPoint3D(ThetaEmbeddingPoint2D):
    z: float


class TopicToDataResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    topic_count: int
    document_count: int
    spatial_shape: list[int]
    p_label_given_topic_dominant: list[list[TopicLabelCell]]
    p_label_given_topic_strict_theta_gt_0_5: list[list[TopicLabelCell]] | None = None
    docs_per_topic_dominant: list[int]
    docs_per_topic_strict: list[int] | None = None
    kl_to_label_prior_per_topic: list[float] | None = None
    top_documents_per_topic: list[list[TopDocumentForTopic]] | None = None
    dominant_topic_map: DominantTopicMapMeta | None = None
    theta_grid: ThetaGridMeta | None = None
    theta_embedding_pca_2d: list[ThetaEmbeddingPoint2D] | None = None
    theta_embedding_pca_3d: list[ThetaEmbeddingPoint3D] | None = None
    theta_embedding_explained_variance: list[float] | None = None
    generated_at: str
    builder_version: str


# ---------------- spatial ----------------


class SpatialConnectedComponents(BaseModel):
    model_config = _PassThroughConfig
    n_components: int
    support: int
    size_p50: float
    size_p95: float
    size_max: int


class SpatialTopicLabelIoU(BaseModel):
    model_config = _PassThroughConfig
    topic_k: int
    best_label_id: int | None = None
    best_label_name: str | None = None
    best_iou: float
    iou_per_label: dict[str, float] = Field(default_factory=dict)


class SpatialBestIouSummary(BaseModel):
    model_config = _PassThroughConfig
    max_iou_overall: float
    mean_best_iou: float


class SpatialValidationResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    spatial_shape: list[int]
    topic_count: int
    n_assigned_pixels: int
    morans_I_weighted_by_topic_support: float
    connected_components_per_topic: dict[str, SpatialConnectedComponents]
    topic_label_iou: list[SpatialTopicLabelIoU]
    best_iou_summary: SpatialBestIouSummary
    generated_at: str
    builder_version: str


# ---------------- validation-blocks ----------------


class ValidationBlock(BaseModel):
    """A single validation block (e.g. corpus-integrity, topic-distinctness).

    Schema varies across blocks — metrics shape depends on block_id.
    Keeping metrics as dict[str, Any] preserves that flexibility while
    making the OpenAPI envelope explicit.
    """
    model_config = _PassThroughConfig
    block_id: str
    status: str
    metrics: dict[str, Any] = Field(default_factory=dict)


class ValidationBlocksResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    blocks: list[ValidationBlock] = Field(default_factory=list)
    generated_at: str
    builder_version: str
