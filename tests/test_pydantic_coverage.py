"""End-to-end Pydantic-coverage tests.

After c254 every `/api/*` route declares a response_model. This file
pins that invariant: any future PR that adds a route without a
response model will trip the `test_all_get_routes_have_response_model`
check.

Also samples one happy-path call per of the new c245 + c249 + c254
route families so OpenAPI drift is caught.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routers.content import router as content_router


def test_all_get_routes_have_response_model() -> None:
    """Every GET route under /api/* must declare a response_model.

    Closes #440 P1 1.2 as a permanent invariant.
    """
    missing: list[str] = []
    for route in content_router.routes:
        if not hasattr(route, "response_model"):
            continue
        if route.response_model is None and "GET" in route.methods:
            missing.append(route.path)
    assert not missing, (
        f"{len(missing)} GET routes lack a response_model: {missing}"
    )


def test_openapi_schema_count_monotonic(client: TestClient) -> None:
    """The OpenAPI schema component count should be ≥ 100 after c254
    (we shipped 172 live on 2026-05-18 and 100% Pydantic adds more)."""
    res = client.get("/openapi.json")
    assert res.status_code == 200
    schemas = res.json().get("components", {}).get("schemas", {})
    assert len(schemas) >= 100, f"Only {len(schemas)} schemas in OpenAPI"


PER_SCENE_ENDPOINTS_TO_SAMPLE = [
    "/api/eda/per-scene/indian-pines-corrected",
    "/api/spectral-browser/indian-pines-corrected",
    "/api/spectral-density/indian-pines-corrected",
    "/api/topic-to-library/indian-pines-corrected",
    "/api/quantization-sensitivity/indian-pines-corrected",
    "/api/lda-sweep/indian-pines-corrected",
    "/api/linear-probe-panel/indian-pines-corrected",
    "/api/mutual-information/indian-pines-corrected",
    "/api/cross-method-agreement/indian-pines-corrected",
    "/api/topic-routed-classifier/indian-pines-corrected",
    "/api/neural-topic-comparison/indian-pines-corrected",
    "/api/rate-distortion-curve/indian-pines-corrected",
    "/api/topic-anomaly/indian-pines-corrected",
    "/api/endmember-baseline/indian-pines-corrected",
    "/api/topic-to-usgs-v7/indian-pines-corrected",
]


@pytest.mark.parametrize("path", PER_SCENE_ENDPOINTS_TO_SAMPLE)
def test_typed_route_happy_path(client: TestClient, path: str) -> None:
    res = client.get(path)
    assert res.status_code == 200, f"{path} returned {res.status_code}"
    body = res.json()
    assert isinstance(body, dict), f"{path} did not return a JSON object"


def test_super_topics_envelope(client: TestClient) -> None:
    res = client.get("/api/super-topics")
    assert res.status_code == 200
    body = res.json()
    assert body["n_topics_total"] == 63
    assert body["n_scenes"] == 6


def test_cross_scene_transfer_envelope(client: TestClient) -> None:
    res = client.get("/api/cross-scene-transfer")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["transfer_matrix_macro_f1"], list)


def test_bayesian_comparison_polymorphic(client: TestClient) -> None:
    """The /bayesian-comparison/{task_type} route returns the same
    envelope for all 4 task types — verify each works."""
    for task in [
        "regression",
        "classification",
        "classification-labelled",
        "classification-labelled-deep",
    ]:
        res = client.get(f"/api/bayesian-comparison/{task}")
        assert res.status_code == 200, (
            f"/api/bayesian-comparison/{task} returned {res.status_code}"
        )
        body = res.json()
        assert "method_names" in body or "method_posteriors" in body


def test_bayesian_comparison_invalid_400(client: TestClient) -> None:
    res = client.get("/api/bayesian-comparison/garbage")
    assert res.status_code == 400


def test_groupings_index_envelope(client: TestClient) -> None:
    res = client.get("/api/groupings")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == len(body["items"])
    assert body["count"] > 0


def test_manifest_envelope(client: TestClient) -> None:
    res = client.get("/api/manifest")
    assert res.status_code == 200
    body = res.json()
    assert "generated_at" in body
    assert isinstance(body.get("artifacts", []), list)
