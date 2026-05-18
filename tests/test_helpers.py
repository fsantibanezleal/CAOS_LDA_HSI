"""Unit tests for the `_serve_or_404` + `_typed_or_404` helpers (c239)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.routers.content import _serve_or_404, _typed_or_404


class _SampleResponse(BaseModel):
    name: str
    value: int


def test_serve_or_404_passes_args() -> None:
    def loader(a: str, b: int) -> dict:
        return {"a": a, "b": b}

    assert _serve_or_404(loader, "x", 42, hint="not generated") == {"a": "x", "b": 42}


def test_serve_or_404_no_args() -> None:
    def loader() -> dict:
        return {"empty": True}

    assert _serve_or_404(loader, hint="not generated") == {"empty": True}


def test_serve_or_404_translates_file_not_found() -> None:
    def loader() -> dict:
        raise FileNotFoundError("missing")

    with pytest.raises(HTTPException) as ei:
        _serve_or_404(loader, hint="custom hint here")
    assert ei.value.status_code == 404
    assert "custom hint here" in str(ei.value.detail)


def test_serve_or_404_passes_other_exceptions() -> None:
    def loader() -> dict:
        raise ValueError("not a FileNotFoundError")

    # Should NOT be translated to 404 — propagates as-is.
    with pytest.raises(ValueError):
        _serve_or_404(loader, hint="ignored")


def test_typed_or_404_validates_into_model() -> None:
    def loader() -> dict:
        return {"name": "hello", "value": 7}

    result = _typed_or_404(_SampleResponse, loader, hint="not generated")
    assert isinstance(result, _SampleResponse)
    assert result.name == "hello"
    assert result.value == 7


def test_typed_or_404_translates_file_not_found() -> None:
    def loader() -> dict:
        raise FileNotFoundError()

    with pytest.raises(HTTPException) as ei:
        _typed_or_404(_SampleResponse, loader, hint="typed not generated")
    assert ei.value.status_code == 404
