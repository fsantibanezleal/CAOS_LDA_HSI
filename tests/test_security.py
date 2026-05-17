"""Regression tests for security-sensitive behaviour (#440 P0)."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_spa_fallback_blocks_path_traversal(client: TestClient) -> None:
    """c224 (PR #449) added a path-traversal guard to the SPA fallback.

    A request whose path resolves outside the frontend dist must fall
    through to index.html rather than serve the targeted file.
    """
    # The bypass attempt: ask for a file in the app/ package via traversal.
    res = client.get("/../app/config.py")
    assert res.status_code == 200
    # Body must be the SPA shell, not the Python source.
    body = res.text
    assert "<!doctype html" in body.lower() or "<!DOCTYPE html" in body
    assert "Settings(BaseSettings)" not in body, "path traversal must NOT leak app/config.py"


def test_unknown_spa_path_serves_index(client: TestClient) -> None:
    res = client.get("/some/non-existing/path")
    assert res.status_code == 200
    assert "<!doctype html" in res.text.lower() or "<!DOCTYPE html" in res.text
