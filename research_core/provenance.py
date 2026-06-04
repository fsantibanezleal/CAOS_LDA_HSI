"""Shared provenance helpers for data-pipeline builders (#589 Tier 1).

Two small, dependency-free helpers so every per-builder artefact can carry
the same traceable stamp the web manifest does:

- ``git_sha()``   — the HEAD commit the artefact was generated at, or ``None``
                    when git is unavailable (e.g. an exported tarball).
- ``iso_z_now()`` — an ISO-8601 UTC timestamp with a trailing ``Z`` (the
                    project's canonical ``generated_at`` format).

Before this module, ``git_sha`` lived only in ``manifests/index.json``
(written by ``curate_for_web.py``); individual core artefacts shipped no
sha, so an old artefact could not be tied back to a commit. The audit
(#589) flagged the gap. Builders import these helpers and add the fields
to their output payloads; the on-disk artefacts pick the sha up on their
next regeneration.
"""
from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Repo root = two levels up from this file (research_core/ lives at the root).
_ROOT = Path(__file__).resolve().parents[1]


def git_sha() -> str | None:
    """Return the current HEAD sha, or ``None`` if git is unavailable.

    Mirrors ``curate_for_web.get_git_sha`` so the per-builder stamp and the
    manifest stamp are produced the same way.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=_ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip()
    except Exception:  # noqa: BLE001 — any git/OS failure means "no sha"
        return None


def iso_z_now() -> str:
    """ISO-8601 UTC timestamp with a trailing ``Z`` (e.g. ``2026-06-04T12:00:00Z``)."""
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )
