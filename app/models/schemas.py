"""Typed API payloads for the CAOS LDA HSI demo application."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LocalDatasetInventoryPayload(BaseModel):
    """Unified local inventory that merges manifests with raw-download evidence."""

    source: str
    generated_at: str
    summary: dict[str, Any]
    family_views: list[dict[str, Any]]
    theme_groups: list[dict[str, Any]]
    datasets: list[dict[str, Any]]


class HidsagPreprocessingSensitivityPayload(BaseModel):
    """Sensitivity benchmark over heuristic bad-band and preprocessing policies."""

    source: str
    generated_at: str
    methods: dict[str, Any]
    subsets: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Exploration views — precomputed payload for the interactive Workspace.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Method statistics — k-fold + multi-seed paired statistics.
# ---------------------------------------------------------------------------


class MethodMetricSummary(BaseModel):
    mean: float
    std: float
    median: float | None = None
    ci95_lo: float | None = None
    ci95_hi: float | None = None
    min: float | None = None
    max: float | None = None
    values: list[float] = Field(default_factory=list)


class MethodMetricsBlock(BaseModel):
    n_evaluations: int
    accuracy: MethodMetricSummary
    balanced_accuracy: MethodMetricSummary
    macro_f1: MethodMetricSummary


class PairedComparison(BaseModel):
    a: str
    b: str
    metric: str | None = None
    delta_mean: float
    delta_std: float
    delta_min: float
    delta_max: float
    delta_values: list[float] = Field(default_factory=list)
    wilcoxon_p: float | None = None
    cohens_d: float | None = None
    win_rate: float | None = None
    significance: str
    direction: str
    verdict: str


class MethodStatisticsScene(BaseModel):
    dataset_id: str
    dataset_name: str | None = None
    family_id: str | None = None
    split_protocol: dict[str, Any] = Field(default_factory=dict)
    scene_summary: dict[str, Any] = Field(default_factory=dict)
    fold_summaries: list[dict[str, Any]] = Field(default_factory=list)
    methods: dict[str, MethodMetricsBlock] = Field(default_factory=dict)
    paired_comparisons: dict[str, list[PairedComparison]] = Field(default_factory=dict)
    ranking: dict[str, Any] = Field(default_factory=dict)


class MethodStatisticsPayload(BaseModel):
    source: str
    generated_at: str
    method_definitions: dict[str, str] = Field(default_factory=dict)
    alpha_significance: float
    labeled_scenes: list[MethodStatisticsScene] = Field(default_factory=list)
    cross_dataset: dict[str, Any] | None = None


JSONDict = dict[str, Any]
