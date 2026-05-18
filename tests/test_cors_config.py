"""Regression tests for the CORS dev/prod origin split (c241 / #440 P2 1.6)."""
from __future__ import annotations

import importlib
import os

from app.config import Settings


def _fresh_settings(**env: str) -> Settings:
    """Construct Settings with the given env vars, isolated from the
    process environment."""
    saved = {}
    for k in ("APP_ENV", "DEV_ORIGINS", "PROD_ORIGINS", "ALLOWED_ORIGINS"):
        saved[k] = os.environ.get(k)
        if k in env:
            os.environ[k] = env[k]
        elif k in os.environ:
            del os.environ[k]
    try:
        return Settings()
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def test_dev_default_excludes_prod_url() -> None:
    s = _fresh_settings(APP_ENV="development")
    assert "https://lda-hsi.fasl-work.com" not in s.origins


def test_prod_locks_down_to_single_origin() -> None:
    s = _fresh_settings(APP_ENV="production")
    assert s.origins == ["https://lda-hsi.fasl-work.com"]


def test_allowed_origins_override_wins() -> None:
    s = _fresh_settings(
        APP_ENV="production",
        ALLOWED_ORIGINS="https://override.example.com",
    )
    assert s.origins == ["https://override.example.com"]


def test_origins_strips_whitespace_in_csv() -> None:
    s = _fresh_settings(
        APP_ENV="production",
        ALLOWED_ORIGINS=" https://a.example.com , https://b.example.com ",
    )
    assert s.origins == [
        "https://a.example.com",
        "https://b.example.com",
    ]
