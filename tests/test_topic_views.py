"""Happy-path tests for the typed topic-views / topic-to-data /
spatial / validation-blocks routes (c238)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]


@pytest.mark.parametrize("scene", LABELLED_SCENES)
def test_topic_views_per_scene(client: TestClient, scene: str) -> None:
    res = client.get(f"/api/topic-views/{scene}")
    assert res.status_code == 200
    body = res.json()
    assert body["scene_id"] == scene
    assert body["topic_count"] >= 4
    assert isinstance(body["wavelengths_nm"], list)
    assert "top_words_per_topic" in body
    assert "lambda_0.5" in body["top_words_per_topic"]


@pytest.mark.parametrize("scene", LABELLED_SCENES)
def test_topic_to_data_per_scene(client: TestClient, scene: str) -> None:
    res = client.get(f"/api/topic-to-data/{scene}")
    assert res.status_code == 200
    body = res.json()
    assert body["scene_id"] == scene
    assert "p_label_given_topic_dominant" in body
    assert "spatial_shape" in body


def test_spatial_indian_pines(client: TestClient) -> None:
    res = client.get("/api/spatial/indian-pines-corrected")
    assert res.status_code == 200
    body = res.json()
    assert "morans_I_weighted_by_topic_support" in body
    assert 0.0 <= body["morans_I_weighted_by_topic_support"] <= 1.0


def test_validation_blocks_indian_pines(client: TestClient) -> None:
    res = client.get("/api/validation-blocks/indian-pines-corrected")
    assert res.status_code == 200
    body = res.json()
    assert "blocks" in body
    block_ids = {b["block_id"] for b in body["blocks"]}
    assert "corpus-integrity" in block_ids
