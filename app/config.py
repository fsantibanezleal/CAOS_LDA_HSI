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
    def derived_path(self) -> Path:
        return self.data_path / "derived"


@lru_cache
def get_settings() -> Settings:
    return Settings()
