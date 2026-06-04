"""Service-helper guards (#590 + #588 regression lock).

Confirms the LIVE content-service loaders are callable, and that the 23
dead get_* helpers removed in the #588 dead-code pass stay removed.
"""
from __future__ import annotations

import app.services.content as c

# Loaders still imported/used by live routes (must exist + be callable).
LIVE = [
    "get_local_dataset_inventory",
    "get_method_statistics",
    "get_hidsag_preprocessing_sensitivity",
    "get_topic_views",
    "get_eda_per_scene",
    "get_wordification",
    "get_wordifications_index",
    "get_derived_manifest",
]

# Removed by #588 — must NOT come back (regression lock).
DEAD = [
    "get_app_payload",
    "get_overview",
    "get_datasets",
    "get_demo",
    "get_analysis",
    "get_subset_card",
    "get_methodology",
]


def test_live_helpers_callable() -> None:
    for name in LIVE:
        fn = getattr(c, name, None)
        assert callable(fn), f"live loader {name} missing or not callable"


def test_dead_helpers_stay_removed() -> None:
    present = [name for name in DEAD if hasattr(c, name)]
    assert not present, f"dead helpers reintroduced (#588 regression): {present}"
