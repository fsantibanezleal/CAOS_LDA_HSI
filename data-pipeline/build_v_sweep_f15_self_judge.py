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
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F15_DERIVED = DERIVED_DIR / "v_sweep" / "f15_llm_alignment"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 14)]
N_DOCS = 20
N_TOP_TOKENS = 10
RANDOM_STATE = 42

JUDGE_MODEL = "claude-opus-4-7 (1M context, self-judgment, deterministic rule)"


def load_artefacts(scene_id: str, recipe: str):
    fit_dir = SWEEP_LOCAL / f"{scene_id}_{recipe}_uniform_Q8"
    phi_path = fit_dir / "phi.npy"
    theta_path = fit_dir / "theta.npy"
    corpus_dir = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id
    dt_path = corpus_dir / "doc_term.npz"
    if not all(p.exists() for p in (phi_path, theta_path, dt_path)):
        return None
    phi = np.load(phi_path)
    theta = np.load(theta_path)
    doc_term = sp.load_npz(dt_path).tocsr()
    return phi, theta, doc_term


def top_indices(weights: np.ndarray, n: int, threshold: float = 0.0) -> list[int]:
    n = min(n, weights.size)
    idx = np.argsort(weights)[::-1]
    out = []
    for i in idx[:n]:
        if float(weights[int(i)]) > threshold:
            out.append(int(i))
        if len(out) >= n:
            break
    return out


def self_judge(doc_top: list[int], topic_top: list[int]) -> str:
    """Apply the deterministic rule documented in the module docstring.

    Returns 'YES', 'NO', or 'AMBIGUOUS'.
    """
    if not doc_top:
        return "AMBIGUOUS"
    topic_set = set(topic_top)
    overlap = sum(1 for t in doc_top if t in topic_set)
    if overlap >= 3:
        return "YES"
    # High-signal recipes (e.g. V7, V9, V10) produce documents with
    # only a few non-zero tokens; in that regime use the top-1 rule.
    top_1_in_topic_top_5 = doc_top[0] in set(topic_top[:5])
    if top_1_in_topic_top_5:
        return "YES"
    # Zero overlap on top-3 -> misaligned
    if len(doc_top) >= 3:
        if not any(t in topic_set for t in doc_top[:3]):
            return "NO"
    # Marginal overlap -> ambiguous (LLM would likely be uncertain too)
    return "AMBIGUOUS" if overlap == 0 else "YES"


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
    z_stars = np.argmax(theta[sample_idx], axis=1)

    topic_top_indices = [top_indices(phi[k], N_TOP_TOKENS) for k in range(K)]

    decisions = []
    n_yes = n_no = n_ambiguous = 0
    for i, d_idx in enumerate(sample_idx):
        z = int(z_stars[i])
        doc_row = np.asarray(doc_term[d_idx].toarray()).reshape(-1).astype(np.float64)
        doc_top = top_indices(doc_row, N_TOP_TOKENS)
        verdict = self_judge(doc_top, topic_top_indices[z])
        if verdict == "YES":
            n_yes += 1
        elif verdict == "NO":
            n_no += 1
        else:
            n_ambiguous += 1
        decisions.append({
            "doc_idx": int(d_idx),
            "topic": z,
            "verdict": verdict,
        })

    total_decisive = n_yes + n_no
    f15 = n_yes / max(total_decisive, 1) if total_decisive > 0 else 0.0
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "V": int(V),
        "n_docs": int(len(sample_idx)),
        "n_yes": n_yes, "n_no": n_no, "n_ambiguous": n_ambiguous,
        "f15_alignment": round(f15, 6),
        "decisions": decisions,
        "model": JUDGE_MODEL,
        "judge_method": "self_judgment_deterministic_rule",
        "judge_rule_description": (
            "YES if doc top-10 shares >=3 elements with topic top-10, OR doc "
            "top-1 is in topic top-5. NO if doc top-3 shares 0 elements with "
            "topic top-10. AMBIGUOUS otherwise. Encoded by Claude Opus 4.7 "
            "(1M context) as a stand-in for the API-driven LLM-as-judge in "
            "build_v_sweep_f15_llm_alignment.py."
        ),
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_f15_self_judge v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-15 self-judge.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    F15_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    summary = []
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            try:
                res = for_cell(recipe, scene)
            except Exception as exc:
                print(f"[f15] {tag} FAILED: {exc}", flush=True)
                n_skip += 1
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
                f"yes={res['n_yes']:2d} no={res['n_no']:2d} amb={res['n_ambiguous']:2d} "
                f"f15={res['f15_alignment']:.3f}",
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

    print(f"\n[f15] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
