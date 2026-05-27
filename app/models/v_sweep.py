"""Pydantic models for the V-sweep (issue #606) responses."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class VSweepTopicViewSummary(BaseModel):
    scene_id: str
    recipe: str
    scheme: str
    Q: int
    status: str
    K: Optional[int] = None
    D: Optional[int] = None
    V: Optional[int] = None
    mean_doc_length: Optional[float] = None
    perplexity: Optional[float] = None
    fit_seconds: Optional[float] = None


class VSweepF1Record(BaseModel):
    scene_id: str
    recipe: str
    scheme: str
    Q: int
    K: int
    D: int
    V: int
    mean_doc_length: float
    raw_logistic_per_fold: list[float]
    topic_routed_soft_per_fold: list[float]
    raw_logistic_mean: float
    topic_routed_soft_mean: float
    gain_routed_over_raw: float


class VSweepF2Record(BaseModel):
    scene_id: str
    recipe: str
    scheme: str
    Q: int
    K: int
    V: int
    top_n: int
    u_mass: Optional[float] = None
    c_npmi: Optional[float] = None
    c_v: Optional[float] = None


class VSweepF7Record(BaseModel):
    scene_id: str
    recipe: str
    scheme: str
    Q: int
    K: int
    n_classes: int
    H_label_marginal_bits: float
    H_label_given_topic_bits: float
    mutual_information_bits: float
    normalised_mi: float


class VSweepRecipeScene(BaseModel):
    scene_id: str
    topic_view: Optional[VSweepTopicViewSummary] = None
    f1: Optional[VSweepF1Record] = None
    f2: Optional[VSweepF2Record] = None
    f7: Optional[VSweepF7Record] = None


class VSweepRecipeReport(BaseModel):
    recipe: str
    scheme: str
    Q: int
    scenes: list[VSweepRecipeScene]


class VSweepStatus(BaseModel):
    recipes: list[str]
    scenes: list[str]
    topic_view_count: int
    f1_count: int
    f2_count: int
    total_expected: int


class VSweepWinMatrix(BaseModel):
    recipes: list[str]
    scenes: list[str]
    by_method_recipe_scene: dict
    per_scene_winner_topic_routed_soft: dict
    per_recipe_mean: dict
