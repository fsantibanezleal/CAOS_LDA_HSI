"""V-sweep F-15 — self-judgment fallback for the LLM-alignment axis.

The companion file ``build_v_sweep_f15_llm_alignment.py`` calls an
Anthropic Messages API endpoint (model = claude-haiku-4-5) per
document. That builder is the canonical path for repository users
who configure ``ANTHROPIC_API_KEY``.

For *our* internal preprint preparation we did not provision an
API key for the build host. Instead, Claude Opus 4.7 (1M-token
context) — the assistant that was operating the V-sweep program at
the time of writing — produced the F-15 numbers by manually
inspecting the per-cell artefacts and encoding the resulting
judgment rule as the deterministic heuristic implemented here.

The rule, in plain language:
- A document is considered *aligned* with its argmax topic if the
  document's top-10 tokens share ≥3 elements with the topic's
  top-10 tokens, OR if the document's top-1 token appears in the
  topic's top-5 (rare but high-signal recipes like V7 produce
  documents with very few distinct tokens).
- A document is considered *misaligned* if there is zero overlap
  between the document's top-3 tokens and the topic's top-10.
- All other cases are reported as *ambiguous* and excluded from the
  denominator (matches the API-driven path's treatment of LLM
  responses that did not parse to YES or NO).

The rule is the assistant's best-effort approximation of what an
Anthropic LLM oracle would answer if given the same prompt the
API-driven path uses. It is documented here so that any third party
re-running the sweep with an API key can compare to the same rule
or to a fresh LLM-as-judge output.

Tie-invariant F-15 (v0.2, issue #817). "Top-10" is not defined when
counts tie at the cut, and v0.1 took the first entries of numpy.argsort, so
on recipes whose documents hold every token once (V3, V12, V15) the value
was set by the numbering of the vocabulary (V3: 0.033 with ties broken by
band index, 0.117 archived, about 0.18 at random). ``f15_alignment`` is now
the rule's exact expectation under uniformly random tie-breaking, in the
document and in the topic: each document contributes P(YES), P(NO) and
P(AMBIGUOUS), and F-15 = sum P(YES) / sum (P(YES) + P(NO)). It equals v0.1
wherever no tie crosses a cut, and it does not depend on how tokens or
topics are numbered. The derivation, the exact computation and the
construction limits that remain (vocabularies of <= 12 tokens, documents
with < 3 distinct tokens: never NO) are in research_core/f15_alignment.py.
The v0.1 value is kept as ``f15_alignment_legacy_argsort``.

The corpus is read through research_core.wordification_store.load_corpus,
which refuses a corpus whose recorded Q or vocabulary differs from the one
asked for, and the judge refuses a corpus whose vocabulary size differs from
the fit's phi (v0.1 compared the Q = 32 V15 corpus with Q = 8 topics).

Output schema mirrors ``build_v_sweep_f15_llm_alignment.py``:
data/derived/v_sweep/f15_llm_alignment/{scene}_{V}_uniform_Q8.json
with an extra field ``judge_model`` set to
``"claude-opus-4-7 (self-judgment, deterministic rule)"``.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.f15_alignment import (  # noqa: E402
    N_TOP_TOKENS,
    cell_alignment,
    legacy_top_indices,
    legacy_verdict,
)
from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from research_core.wordification_store import load_corpus  # noqa: E402

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F15_DERIVED = DERIVED_DIR / "v_sweep" / "f15_llm_alignment"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]
N_DOCS = 20
RANDOM_STATE = 42

JUDGE_MODEL = "claude-opus-4-7 (1M context, self-judgment, deterministic rule)"


def load_artefacts(scene_id: str, recipe: str):
    fit_dir = SWEEP_LOCAL / f"{scene_id}_{recipe}_uniform_Q8"
    phi_path = fit_dir / "phi.npy"
    theta_path = fit_dir / "theta.npy"
    if not (phi_path.exists() and theta_path.exists()):
        return None
    corpus = load_corpus(recipe, "uniform", 8, scene_id, root=WORDIFICATION_LOCAL)
    if corpus is None:
        return None
    doc_term, _meta = corpus
    phi = np.load(phi_path)
    theta = np.load(theta_path)
    return phi, theta, doc_term


# v0.1 helpers, kept for callers: the archived argsort top-n and judge.
top_indices = legacy_top_indices
self_judge = legacy_verdict


def for_cell(recipe: str, scene_id: str) -> dict | None:
    pl = load_artefacts(scene_id, recipe)
    if pl is None:
        return None
    phi, theta, doc_term = pl
    K, V = phi.shape
    D = theta.shape[0]
    if D == 0 or V == 0:
        return None

    rng = np.random.default_rng(RANDOM_STATE)
    sample_idx = rng.choice(D, size=min(N_DOCS, D), replace=False)
    cell = cell_alignment(doc_term, theta, phi, sample_idx, n_top=N_TOP_TOKENS)
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        **cell,
        "f15_alignment": round(cell["f15_alignment"], 6),
        "expected_yes": round(cell["expected_yes"], 6),
        "expected_no": round(cell["expected_no"], 6),
        "expected_ambiguous": round(cell["expected_ambiguous"], 6),
        "model": JUDGE_MODEL,
        "judge_method": "self_judgment_deterministic_rule_tie_invariant",
        "judge_rule_description": (
            "YES if doc top-10 shares >=3 elements with topic top-10, OR doc "
            "top-1 is in topic top-5. NO if doc top-3 shares 0 elements with "
            "topic top-10. AMBIGUOUS otherwise. Top-k lists are taken under "
            "uniformly random tie-breaking and each document contributes its "
            "exact P(YES), P(NO), P(AMBIGUOUS); F-15 = sum P(YES) / sum "
            "(P(YES) + P(NO)). Encoded by Claude Opus 4.7 (1M context) as a "
            "stand-in for the API-driven LLM-as-judge in "
            "build_v_sweep_f15_llm_alignment.py; tie-invariant form #817."
        ),
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_f15_self_judge v0.2",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-15 self-judge.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    F15_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = n_fail = 0
    summary = []
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            try:
                res = for_cell(recipe, scene)
            except Exception as exc:
                print(f"[f15] {tag} FAILED: {exc}", flush=True)
                n_fail += 1
                continue
            if res is None:
                n_skip += 1
                continue
            out = F15_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            n_ok += 1
            summary.append(res)
            print(
                f"[f15] {scene:30s} {recipe:5s} "
                f"E[yes]={res['expected_yes']:5.2f} E[no]={res['expected_no']:5.2f} "
                f"E[amb]={res['expected_ambiguous']:5.2f} "
                f"f15={res['f15_alignment']:.3f} "
                f"(argsort v0.1: {res['f15_alignment_legacy_argsort']:.3f})",
                flush=True,
            )

    if summary:
        from collections import defaultdict
        by_recipe = defaultdict(list)
        for r in summary:
            by_recipe[r["recipe"]].append(r["f15_alignment"])
        print("\n[f15] Per-recipe mean alignment:", flush=True)
        for r in sorted(by_recipe, key=lambda x: int(x[1:])):
            v = by_recipe[r]
            print(f"    {r:5s} mean={np.mean(v):.4f} (n={len(v)})", flush=True)

    print(f"\n[f15] done. ok={n_ok} skipped={n_skip} failed={n_fail}", flush=True)
    return 1 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
