"""Determinism guard for the seeded wordification builders (#589).

nanopq.PQ (V11) does not expose a random_state, so the builder seeds
numpy globally before fitting the codebook. Lock that seed line so a
refactor cannot silently make V11 non-deterministic across runs.
"""
from __future__ import annotations

from pathlib import Path

PIPE = Path(__file__).resolve().parents[1] / "data-pipeline"


def test_v11_pins_numpy_seed_before_pq() -> None:
    src = (PIPE / "build_wordifications_v7v11.py").read_text(encoding="utf-8")
    assert "np.random.seed(RANDOM_STATE)" in src, (
        "V11 must seed numpy before nanopq.PQ — codebook fit is otherwise "
        "non-deterministic (issue #589 / #606)"
    )
    # the seed line must appear before the PQ *construction* (not the
    # docstring mentions of nanopq.PQ earlier in the file)
    seed_at = src.index("np.random.seed(RANDOM_STATE)")
    pq_at = src.index("pq = nanopq.PQ(")
    assert seed_at < pq_at, "seed must be set before nanopq.PQ is constructed"


def test_random_state_is_canonical_42() -> None:
    src = (PIPE / "build_wordifications_v7v11.py").read_text(encoding="utf-8")
    assert "RANDOM_STATE = 42" in src, "canonical seed (42) drifted"
