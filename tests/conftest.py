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


# Test modules import ``app.main`` during collection, before fixtures run. Set
# the clean-checkout SPA shell as soon as conftest is imported so those module
# imports register the same fallback routes exercised in production.
os.environ.setdefault("FRONTEND_DIST", "tests/fixtures/frontend")


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """FastAPI TestClient bound to the live ASGI app.

    The repository does not commit ``frontend/dist``. Point the app at a
    committed minimal SPA shell so a clean checkout exercises the fallback and
    path-traversal routes instead of silently omitting them.
    """
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
