"""Route-inventory guard (#590).

Locks the live API surface so an accidental deletion (e.g. a future
dead-code pass like #588) cannot silently drop routes. Also confirms
the FastAPI app imports cleanly and the Q-extension endpoints are wired.
"""
from __future__ import annotations


def test_app_imports() -> None:
    import app.main  # noqa: F401


def test_router_has_enough_routes() -> None:
    from app.routers.content import router

    n = len(router.routes)
    assert n >= 50, f"route count regressed to {n} (expected >= 50)"


def test_key_routes_present() -> None:
    from app.routers.content import router

    paths = {getattr(r, "path", "") for r in router.routes}
    # a representative spine of the public API + the Q-extension endpoints
    for expected in (
        "/api/v-sweep/coverage",
        "/api/v-sweep/backbones-f7",
        "/api/v-sweep/q-trajectory",
        "/api/v-sweep/methods/{recipe}",
    ):
        assert expected in paths, f"missing route {expected}"
