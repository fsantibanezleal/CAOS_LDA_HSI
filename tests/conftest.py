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

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client() -> TestClient:
    """FastAPI TestClient bound to the live ASGI app.

    Session-scoped so we pay the app-import cost once across the suite.
    """
    from app.main import app
    return TestClient(app)
