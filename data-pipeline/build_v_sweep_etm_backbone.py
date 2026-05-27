"""V-sweep ETM backbone — factorial backbone row (#617 third row).

Embedded Topic Model (Dieng-Ruiz-Blei 2020). Reuses the ETM impl from
build_neural_topic_models.py and runs it on each (V, scene).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

_PIPE = ROOT / "data-pipeline"
_spec = importlib.util.spec_from_file_location("neural_models", _PIPE / "build_neural_topic_models.py")
_neural = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_neural)

# Reuse the helper from the ProdLDA builder via import
_pl_spec = importlib.util.spec_from_file_location("prodlda_v", _PIPE / "build_v_sweep_prodlda_backbone.py")
_pl = importlib.util.module_from_spec(_pl_spec)
_pl_spec.loader.exec_module(_pl)

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
ETM_DERIVED = DERIVED_DIR / "v_sweep" / "etm_backbone"

LABELLED_SCENES = _pl.LABELLED_SCENES
RECIPES = _pl.RECIPES


def for_cell(recipe: str, scene_id: str) -> dict | None:
    doc_term = _pl.load_doc_term(recipe, scene_id)
    if doc_term is None:
        return None
    D, V = doc_term.shape
    mean_doc = float(np.asarray(doc_term.sum(axis=1)).reshape(-1).mean())
    K = _pl.k_for(scene_id, mean_doc)
    dense = doc_term.toarray().astype(np.float32)
    t0 = time.perf_counter()
    try:
        fit = _neural.fit_etm(dense, K, seed=42)
    except Exception as exc:
        return {
            "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
            "status": "failed", "error": str(exc),
        }
    fit_secs = time.perf_counter() - t0
    phi = fit["phi"]
    metrics = _pl.compute_f2_f14(phi, doc_term)
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "backbone": "ETM", "K": int(K), "D": int(D), "V": int(V),
        "mean_doc_length": round(mean_doc, 4),
        **metrics, "fit_seconds": round(fit_secs, 3), "status": "ok",
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_etm_backbone v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep ETM backbone.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    ETM_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_fail = 0
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            print(f"[etm] {tag} ...", flush=True)
            res = for_cell(recipe, scene)
            if res is None:
                n_fail += 1
                continue
            out = ETM_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            if res.get("status") == "ok":
                n_ok += 1
                print(
                    f"  K={res['K']} c_v={res['f2_c_v']:.3f} "
                    f"jacc={res['f14_mean_pairwise_jaccard']:.3f} "
                    f"t={res['fit_seconds']}s",
                    flush=True,
                )
            else:
                n_fail += 1
                print(f"  FAILED: {res.get('error', 'unknown')}", flush=True)
    print(f"[etm] done. ok={n_ok} failed={n_fail}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
