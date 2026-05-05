"""Application configuration loaded from environment variables and .env."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime settings for local development and VPS deployment."""

    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8105

    allowed_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8105,https://lda-hsi.fasl-work.com"
    )

    frontend_dist: str = "frontend/dist"
    data_dir: str = "data"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def frontend_dist_path(self) -> Path:
        return (PROJECT_ROOT / self.frontend_dist).resolve()

    @property
    def data_path(self) -> Path:
        return (PROJECT_ROOT / self.data_dir).resolve()

    @property
    def manifests_path(self) -> Path:
        return self.data_path / "manifests"

    @property
    def demo_path(self) -> Path:
        return self.data_path / "demo" / "demo.json"

    @property
    def real_samples_path(self) -> Path:
        return self.data_path / "derived" / "real" / "real_samples.json"

    @property
    def field_samples_path(self) -> Path:
        return self.data_path / "derived" / "field" / "field_samples.json"

    @property
    def spectral_library_path(self) -> Path:
        return self.data_path / "derived" / "spectral" / "library_samples.json"

    @property
    def analysis_path(self) -> Path:
        return self.data_path / "derived" / "analysis" / "analysis.json"

    @property
    def corpus_previews_path(self) -> Path:
        return self.data_path / "derived" / "corpus" / "corpus_previews.json"

    @property
    def segmentation_baselines_path(self) -> Path:
        return self.data_path / "derived" / "baselines" / "segmentation_baselines.json"

    @property
    def local_validation_matrix_path(self) -> Path:
        return self.manifests_path / "local_validation_matrix.json"

    @property
    def local_dataset_inventory_path(self) -> Path:
        return self.data_path / "derived" / "core" / "local_dataset_inventory.json"

    @property
    def local_core_benchmarks_path(self) -> Path:
        return self.data_path / "derived" / "core" / "local_core_benchmarks.json"

    @property
    def hidsag_subset_inventory_path(self) -> Path:
        return self.data_path / "derived" / "core" / "hidsag_subset_inventory.json"

    @property
    def hidsag_curated_subset_path(self) -> Path:
        return self.data_path / "derived" / "core" / "hidsag_curated_subset.json"

    @property
    def hidsag_region_documents_path(self) -> Path:
        return self.data_path / "derived" / "core" / "hidsag_region_documents.json"

    @property
    def hidsag_band_quality_path(self) -> Path:
        return self.data_path / "derived" / "core" / "hidsag_band_quality.json"

    @property
    def hidsag_preprocessing_sensitivity_path(self) -> Path:
        return self.data_path / "derived" / "core" / "hidsag_preprocessing_sensitivity.json"

    @property
    def derived_path(self) -> Path:
        return self.data_path / "derived"

    @property
    def exploration_views_path(self) -> Path:
        return self.data_path / "derived" / "core" / "exploration_views.json"

    @property
    def method_statistics_path(self) -> Path:
        return self.data_path / "derived" / "core" / "method_statistics.json"

    @property
    def subset_cards_dir(self) -> Path:
        return self.data_path / "derived" / "subsets"

    @property
    def subset_cards_index_path(self) -> Path:
        return self.subset_cards_dir / "index.json"

    def subset_card_path(self, subset_id: str) -> Path:
        return self.subset_cards_dir / f"{subset_id}.json"

    # ------- new precompute layer (master-plan §18) -------
    @property
    def derived_manifest_path(self) -> Path:
        return self.data_path / "derived" / "manifests" / "index.json"

    def eda_per_scene_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "eda" / "per_scene" / f"{scene_id}.json"

    def topic_views_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_views" / f"{scene_id}.json"

    def topic_to_data_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_to_data" / f"{scene_id}.json"

    def spectral_browser_metadata_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "spectral_browser" / scene_id / "metadata.json"

    def spectral_density_manifest_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "spectral_density" / scene_id / "manifest.json"

    def validation_blocks_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "validation_blocks" / f"{scene_id}.json"

    def eda_hidsag_path(self, subset_code: str) -> Path:
        return self.data_path / "derived" / "eda" / "hidsag" / f"{subset_code}.json"

    def topic_to_library_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_to_library" / f"{scene_id}.json"

    def spatial_validation_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "spatial" / f"{scene_id}.json"

    def wordification_path(self, scene_id: str, recipe: str, scheme: str, q: int) -> Path:
        return (
            self.data_path
            / "derived"
            / "wordifications"
            / f"{scene_id}_{recipe}_{scheme}_Q{q}.json"
        )

    @property
    def wordifications_dir(self) -> Path:
        return self.data_path / "derived" / "wordifications"

    def grouping_path(self, method: str, scene_id: str) -> Path:
        return self.data_path / "derived" / "groupings" / method / f"{scene_id}.json"

    @property
    def groupings_dir(self) -> Path:
        return self.data_path / "derived" / "groupings"

    def cross_method_agreement_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "cross_method_agreement" / f"{scene_id}.json"

    def method_statistics_hidsag_path(self, subset_code: str) -> Path:
        return self.data_path / "derived" / "method_statistics_hidsag" / f"{subset_code}.json"

    def external_validation_literature_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "external_validation" / f"{scene_id}_literature.json"

    def external_validation_hidsag_methods_path(self, subset_code: str) -> Path:
        return self.data_path / "derived" / "external_validation" / f"{subset_code}_methods.json"

    def narratives_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "narratives" / f"{scene_id}.json"

    def interpretability_path(self, scene_id: str, card_type: str) -> Path:
        return (
            self.data_path / "derived" / "interpretability" / scene_id / f"{card_type}.json"
        )

    def quantization_sensitivity_path(self, scene_id: str) -> Path:
        return (
            self.data_path / "derived" / "quantization_sensitivity" / f"{scene_id}.json"
        )

    def topic_variant_path(self, variant: str, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_variants" / variant / f"{scene_id}.json"

    @property
    def topic_variants_dir(self) -> Path:
        return self.data_path / "derived" / "topic_variants"

    def lda_sweep_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "lda_sweep" / f"{scene_id}.json"

    def representations_path(self, method: str, scene_id: str) -> Path:
        return self.data_path / "derived" / "representations" / method / f"{scene_id}.json"

    @property
    def representations_dir(self) -> Path:
        return self.data_path / "derived" / "representations"

    def dmr_lda_hidsag_path(self, subset_code: str) -> Path:
        return self.data_path / "derived" / "topic_variants" / "dmr_lda_hidsag" / f"{subset_code}.json"

    def bayesian_comparison_path(self, task_type: str) -> Path:
        return self.data_path / "derived" / "method_statistics_hidsag" / f"cross_{task_type}_bayesian.json"

    def optuna_search_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "lda_hyperparam_search" / f"{scene_id}.json"

    def linear_probe_panel_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "linear_probe_panel" / f"{scene_id}.json"

    def mutual_information_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "mutual_information" / f"{scene_id}.json"

    def mutual_information_hidsag_path(self, subset_code: str) -> Path:
        return self.data_path / "derived" / "mutual_information" / "hidsag" / f"{subset_code}.json"

    def rate_distortion_curve_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "rate_distortion_curve" / f"{scene_id}.json"

    def topic_routed_classifier_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_routed_classifier" / f"{scene_id}.json"

    def embedded_baseline_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "embedded_baseline" / f"{scene_id}.json"

    def topic_stability_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_stability" / f"{scene_id}.json"

    def topic_to_usgs_v7_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_to_usgs_v7" / f"{scene_id}.json"

    def hidsag_cross_preprocessing_stability_path(self, subset_code: str) -> Path:
        return (
            self.data_path
            / "derived"
            / "hidsag_cross_preprocessing_stability"
            / f"{subset_code}.json"
        )

    def topic_anomaly_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_anomaly" / f"{scene_id}.json"

    def topic_spatial_continuous_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_spatial_continuous" / f"{scene_id}.json"

    def topic_spatial_full_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "topic_spatial_full" / f"{scene_id}.json"

    def endmember_baseline_path(self, scene_id: str) -> Path:
        return self.data_path / "derived" / "endmember_baseline" / f"{scene_id}.json"

    @property
    def cross_scene_transfer_path(self) -> Path:
        return self.data_path / "derived" / "cross_scene_transfer" / "transfer_matrix.json"

    @property
    def bayesian_classification_labelled_path(self) -> Path:
        return self.data_path / "derived" / "method_statistics_labelled" / "cross_classification_bayesian.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
