"""Shared fixtures for the backend test suite.

Tests reuse the real `data/derived/*.json` artefacts produced by the
pipeline — the smoke harness already proves they exist on a working
deploy, and the test suite asserts router behaviour (status codes,
response shapes) without recreating those payloads.

This keeps the scaffold zero-config: `pytest` against a clean checkout
of a developer machine that has run `bash scripts/local.sh build-*`
once will pass.
"""
from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """FastAPI TestClient bound to the live ASGI app.

    The repository does not commit ``frontend/dist``. Point the app at a
    committed minimal SPA shell so a clean checkout exercises the fallback and
    path-traversal routes instead of silently omitting them.
    """
    previous_dist = os.environ.get("FRONTEND_DIST")
    os.environ["FRONTEND_DIST"] = "tests/fixtures/frontend"

    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        if previous_dist is None:
            os.environ.pop("FRONTEND_DIST", None)
        else:
            os.environ["FRONTEND_DIST"] = previous_dist
        get_settings.cache_clear()
