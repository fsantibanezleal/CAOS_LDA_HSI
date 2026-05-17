"""Happy-path tests for the wordifications routes (c238)."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_wordifications_index(client: TestClient) -> None:
    res = client.get("/api/wordifications")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] > 0
    assert len(body["items"]) == body["count"]


def test_wordification_botswana_v10(client: TestClient) -> None:
    res = client.get("/api/wordifications/botswana/V10/lloyd_max/16")
    assert res.status_code == 200
    body = res.json()
    assert body["scene_id"] == "botswana"
    assert body["recipe"] == "V10"
    assert body["scheme"] == "lloyd_max"
    assert body["Q"] == 16
    assert "doc_length_distribution" in body


def test_wordification_unknown_returns_404(client: TestClient) -> None:
    res = client.get("/api/wordifications/no-such-scene/V10/lloyd_max/16")
    assert res.status_code == 404
