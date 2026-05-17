"""Happy-path tests for the band-masks route family (c236 + c239)."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_band_masks_index_returns_24_entries(client: TestClient) -> None:
    res = client.get("/api/band-masks")
    assert res.status_code == 200
    body = res.json()
    assert "entries" in body
    assert len(body["entries"]) == 24
    assert "mask_definitions" in body
    assert {"vnir", "swir", "no_water", "top_50_fisher"}.issubset(body["mask_definitions"].keys())


def test_band_masks_canonical_comparison_has_24_entries(client: TestClient) -> None:
    res = client.get("/api/band-masks/canonical-comparison")
    assert res.status_code == 200
    body = res.json()
    assert len(body["entries"]) == 24
    sample = body["entries"][0]
    assert "paired_ari_dominant_topics" in sample or "skipped" in sample


def test_band_mask_summary_indian_pines_vnir(client: TestClient) -> None:
    res = client.get("/api/band-masks/indian-pines-corrected/vnir")
    assert res.status_code == 200
    body = res.json()
    assert body["scene_id"] == "indian-pines-corrected"
    assert body["mask_id"] == "vnir"
    assert body["topic_count"] == 12
    assert body["n_bands_kept"] == 67


def test_band_masks_hidsag_index(client: TestClient) -> None:
    res = client.get("/api/band-masks-hidsag")
    assert res.status_code == 200
    body = res.json()
    assert body["modality"] == "swir_low"
    assert len(body["entries"]) == 20


def test_band_mask_unknown_returns_404(client: TestClient) -> None:
    res = client.get("/api/band-masks/nonexistent-scene/vnir")
    assert res.status_code == 404
