"""CAOS LDA HSI FastAPI application entrypoint."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, ORJSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.config import get_settings
from app.routers import content


settings = get_settings()

app = FastAPI(
    title="CAOS LDA HSI",
    description="Interactive demo for topic modelling over multispectral and hyperspectral data.",
    version=__version__,
    default_response_class=ORJSONResponse,
    docs_url="/api/docs",
    redoc_url=None,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health", response_class=PlainTextResponse)
def health() -> str:
    return "ok"


@app.get("/healthz", response_class=PlainTextResponse, include_in_schema=False)
def healthz() -> str:
    return "ok"


app.include_router(content.router)


_dist = settings.frontend_dist_path
_derived = settings.derived_path

if _derived.is_dir():
    app.mount("/generated", StaticFiles(directory=str(_derived)), name="generated")

if _dist.is_dir():
    assets_dir = _dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/", include_in_schema=False)
    def root() -> FileResponse:
        return FileResponse(_dist / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str) -> FileResponse:
        target = _dist / path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(_dist / "index.html")
