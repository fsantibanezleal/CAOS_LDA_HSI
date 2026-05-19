"""Build per-(sample, dominant-topic, measurement) joined records
for the HIDSAG topic_measurements derived layer.

Closes issue CAOS_LDA_HSI_Paper#2: the continuous mineralogical /
geometallurgical assays live in `metadata.json` per sample inside the
five HIDSAG zips (one per subset). The band-mask summary already
ships a per-document θ matrix (`theta_per_doc`) keyed by
`doc_names` of the form `<sample>__m<measurement_idx>__<crop_id>`.
This builder reads the zipped metadata.json files, joins on
sample name, and produces a flat per-document records file with
the continuous variables alongside the dominant-topic id and
max-θ confidence.

Output: `data/derived/hidsag_topic_measurements/<subset>.json` with
schema:

  {
    "subset_code": "GEOMET",
    "topic_count": 6,
    "variable_names": ["Cu rec", "Mo rec", "PH", "Lime cons", "WI"],
    "records": [
      {"doc_name": "GMET-0001__m0__01",
       "sample_name": "GMET-0001",
       "dominant_topic": 3,
       "max_theta": 0.78,
       "vars": {"Cu rec": 85.5, "Mo rec": 63.5, ...}},
      ...
    ],
    "per_topic_var_stats": {
      "0": {"Cu rec": {"n": 12, "mean": 80.1, "std": 5.2,
                       "min": 72.0, "median": 81.5, "max": 88.0}, ...},
      ...
    },
    "framework_axis": "Issue #2: HIDSAG continuous-measurement
                      extraction for topic-conditional ridge / corner
                      figures.",
    "source": {
      "paper": "Ehrenfeld et al. 2023, Scientific Data 10:164,
                doi:10.1038/s41597-023-02061-x",
      "data": "Ehrenfeld 2023, figshare DOI
               10.6084/m9.figshare.c.5983921.v1"
    },
    ...
  }

Run from the project root:

  python data-pipeline/build_hidsag_topic_measurements.py
"""
from __future__ import annotations

import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median, pstdev
from typing import Any

# c288: route through research_core.paths (closes #444 P1 3.2).
from research_core.paths import DERIVED_DIR
from research_core.paths import RAW_DIR as _RC_RAW_DIR

RAW = _RC_RAW_DIR / "hidsag"
BAND_MASK = DERIVED_DIR / "band_masks_hidsag"
OUT = DERIVED_DIR / "hidsag_topic_measurements"

SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"]


def load_sample_vars(zip_path: Path) -> dict[str, dict[str, float]]:
    """Return {sample_name: {var: value, ...}} by scanning the zip's
    metadata.json files."""
    out: dict[str, dict[str, float]] = {}
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if not name.endswith("metadata.json"):
                continue
            with z.open(name) as fh:
                d = json.load(fh)
            sample = d.get("sample_name")
            if not sample:
                continue
            v = d.get("vars") or {}
            if not isinstance(v, dict):
                continue
            out[sample] = {k: float(val) for k, val in v.items()
                           if isinstance(val, (int, float))}
    return out


def topic_var_stats(records: list[dict[str, Any]], K: int,
                    variable_names: list[str]
                    ) -> dict[str, dict[str, dict[str, float]]]:
    """Per (topic, var) mean / std / min / median / max."""
    by_topic: dict[int, dict[str, list[float]]] = {
        k: {v: [] for v in variable_names} for k in range(K)
    }
    for r in records:
        k = r["dominant_topic"]
        for v_name, value in r["vars"].items():
            if v_name in by_topic[k]:
                by_topic[k][v_name].append(value)
    out: dict[str, dict[str, dict[str, float]]] = {}
    for k in range(K):
        out[str(k)] = {}
        for v_name in variable_names:
            xs = by_topic[k][v_name]
            if not xs:
                out[str(k)][v_name] = {"n": 0}
                continue
            xs_sorted = sorted(xs)
            out[str(k)][v_name] = {
                "n": len(xs),
                "mean": round(mean(xs), 6),
                "std": round(pstdev(xs), 6) if len(xs) > 1 else 0.0,
                "min": min(xs),
                "median": round(median(xs), 6),
                "max": max(xs),
            }
    return out


def build_subset(subset: str) -> dict[str, Any]:
    summary_path = BAND_MASK / subset / "swir" / "summary.json"
    if not summary_path.exists():
        raise FileNotFoundError(summary_path)
    with summary_path.open("r", encoding="utf-8") as fh:
        bm = json.load(fh)
    K = bm["topic_count"]
    doc_names = bm["doc_names"]
    sample_names = bm["sample_names"]
    theta_per_doc = bm["theta_per_doc"]

    zip_path = RAW / f"{subset}.zip"
    sample_vars = load_sample_vars(zip_path)
    variable_names = sorted({k for v in sample_vars.values() for k in v.keys()})

    records: list[dict[str, Any]] = []
    missing = 0
    for doc_name, sample, theta in zip(doc_names, sample_names,
                                        theta_per_doc):
        if sample not in sample_vars:
            missing += 1
            continue
        argmax = max(range(K), key=lambda i: theta[i])
        records.append({
            "doc_name": doc_name,
            "sample_name": sample,
            "dominant_topic": argmax,
            "max_theta": round(theta[argmax], 6),
            "vars": sample_vars[sample],
        })

    payload = {
        "subset_code": subset,
        "topic_count": K,
        "variable_names": variable_names,
        "record_count": len(records),
        "missing_sample_count": missing,
        "records": records,
        "per_topic_var_stats": topic_var_stats(records, K,
                                                variable_names),
        "framework_axis": ("Issue CAOS_LDA_HSI_Paper#2: HIDSAG "
                           "continuous-measurement extraction for "
                           "topic-conditional ridge / corner figures."),
        "source": {
            "paper": ("Ehrenfeld et al. 2023, Scientific Data 10:164, "
                      "doi:10.1038/s41597-023-02061-x"),
            "data": ("Ehrenfeld 2023, figshare collection "
                     "doi:10.6084/m9.figshare.c.5983921.v1"),
        },
        "generated_at": datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"),
        "builder_version": "build_hidsag_topic_measurements v0.1",
    }
    return payload


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for subset in SUBSETS:
        try:
            payload = build_subset(subset)
        except FileNotFoundError as exc:
            print(f"skip {subset}: {exc}", file=sys.stderr)
            continue
        out_path = OUT / f"{subset}.json"
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, separators=(",", ":"))
        print(f"{subset}: {payload['record_count']} records, "
              f"{len(payload['variable_names'])} variables, "
              f"{payload['missing_sample_count']} missing — "
              f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
