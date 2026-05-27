"""V-sweep F-15 — LLM-judge topic-document alignment.

From Yang et al. 2025 (arxiv:2502.07352). For each document the
question is: does the LLM believe this document belongs to its
argmax-topic given the topic's top-N tokens?

Protocol per (V, scene):
- sample N_DOCS=20 documents
- for each doc d, the LLM is given:
    (a) the top-10 tokens of the doc d (doc's own profile)
    (b) the top-10 tokens of d's argmax topic z*
  The LLM answers Yes/No: is the doc semantically aligned to the topic?
- F-15 = fraction of "Yes" answers

For recipes where tokens are opaque IDs (e.g. V1 `b042`, V11 `pq_m2_c05`),
we project tokens to their semantic meaning where possible:
- V1: `b042` -> "wavelength bin 42 of B"
- V2: `q03` -> "intensity bin 3 of 8"
- V7: `abs_c4_d2_a3` -> "absorption centred ~ bucket 4, depth bin 2, area 3"
- V12: `b042_g05` -> "wavelength bin 42, GMM component 5"
- others: pass token verbatim

Gated by ANTHROPIC_API_KEY env var. If not set, prints a skip and exits 0.

Output: data/derived/v_sweep/f15_llm_alignment/{scene}_{V}_uniform_Q8.json
"""
from __future__ import annotations

import argparse
import json
import os
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

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F15_DERIVED = DERIVED_DIR / "v_sweep" / "f15_llm_alignment"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 13)]
N_DOCS = 20
N_TOKENS = 10
RANDOM_STATE = 42
MODEL = "claude-haiku-4-5-20251001"  # cheap + fast; F-15 is yes/no


def humanise_token(token: str, recipe: str) -> str:
    """Project recipe-specific opaque tokens to human-readable form."""
    if recipe == "V1" and token.startswith("b"):
        try:
            b = int(token[1:])
            return f"wavelength-band #{b}"
        except ValueError:
            return token
    if recipe == "V2" and token.startswith("q"):
        return f"intensity-bin {token[1:]}"
    if recipe == "V7" and token.startswith("abs_"):
        parts = token.split("_")
        if len(parts) == 4:
            return f"absorption (centre={parts[1][1:]}, depth={parts[2][1:]}, area={parts[3][1:]})"
        return token
    if recipe == "V12" and "_g" in token:
        return f"GMM-token {token}"
    return token


def load_artefacts(scene_id: str, recipe: str):
    fit_dir = SWEEP_LOCAL / f"{scene_id}_{recipe}_uniform_Q8"
    phi_path = fit_dir / "phi.npy"
    theta_path = fit_dir / "theta.npy"
    vocab_path = fit_dir / "vocab.json"
    corpus_dir = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id
    dt_path = corpus_dir / "doc_term.npz"
    if not all(p.exists() for p in (phi_path, theta_path, vocab_path, dt_path)):
        return None
    phi = np.load(phi_path)
    theta = np.load(theta_path)
    with vocab_path.open("r", encoding="utf-8") as h:
        meta = json.load(h)
    vocab = meta.get("vocab", [])
    doc_term = sp.load_npz(dt_path).tocsr()
    return phi, theta, vocab, doc_term


def top_tokens_for_topic(phi_row: np.ndarray, vocab: list[str], n: int) -> list[str]:
    n = min(n, len(vocab))
    idx = np.argsort(phi_row)[::-1][:n]
    return [vocab[int(i)] for i in idx]


def top_tokens_for_doc(doc_row: sp.csr_matrix, vocab: list[str], n: int) -> list[str]:
    dense = np.asarray(doc_row.toarray()).reshape(-1)
    n = min(n, len(vocab))
    idx = np.argsort(dense)[::-1][:n]
    return [vocab[int(i)] for i in idx if dense[int(i)] > 0]


def call_anthropic(prompt: str, api_key: str) -> str:
    import anthropic  # type: ignore
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=MODEL,
        max_tokens=20,
        messages=[{"role": "user", "content": prompt}],
    )
    out = []
    for block in response.content:
        if hasattr(block, "text"):
            out.append(block.text)
    return "\n".join(out).strip()


def judge_alignment(doc_tokens: list[str], topic_tokens: list[str],
                    recipe: str, api_key: str) -> bool | None:
    doc_h = [humanise_token(t, recipe) for t in doc_tokens]
    topic_h = [humanise_token(t, recipe) for t in topic_tokens]
    prompt = (
        "You are evaluating a topic model on hyperspectral imagery. "
        "Each topic is described by its most prominent tokens. "
        f"A pixel-document was tokenised using the {recipe} wordification recipe.\n\n"
        f"Topic top tokens: {', '.join(topic_h)}\n\n"
        f"Document top tokens: {', '.join(doc_h)}\n\n"
        "Question: does this document semantically belong to this topic? "
        "Answer with a single word: YES or NO."
    )
    try:
        resp = call_anthropic(prompt, api_key).upper().strip()
    except Exception as exc:
        print(f"  LLM call failed: {exc}", flush=True)
        return None
    if "YES" in resp[:10]:
        return True
    if "NO" in resp[:10]:
        return False
    return None


def for_cell(recipe: str, scene_id: str, api_key: str) -> dict | None:
    pl = load_artefacts(scene_id, recipe)
    if pl is None:
        return None
    phi, theta, vocab, doc_term = pl
    K, V = phi.shape
    D = theta.shape[0]
    if D == 0 or V == 0:
        return None

    rng = np.random.default_rng(RANDOM_STATE)
    sample_idx = rng.choice(D, size=min(N_DOCS, D), replace=False)
    z_stars = np.argmax(theta[sample_idx], axis=1)

    topic_top_tokens = [
        top_tokens_for_topic(phi[k], vocab, N_TOKENS) for k in range(K)
    ]

    decisions = []
    n_yes = n_no = n_ambiguous = 0
    for i, d_idx in enumerate(sample_idx):
        z = int(z_stars[i])
        doc_top = top_tokens_for_doc(doc_term[d_idx], vocab, N_TOKENS)
        if not doc_top:
            n_ambiguous += 1
            continue
        verdict = judge_alignment(doc_top, topic_top_tokens[z], recipe, api_key)
        if verdict is True:
            n_yes += 1
        elif verdict is False:
            n_no += 1
        else:
            n_ambiguous += 1
        decisions.append({
            "doc_idx": int(d_idx),
            "topic": z,
            "verdict": "YES" if verdict is True else ("NO" if verdict is False else "?"),
        })
        # Rate-limit politely
        time.sleep(0.2)

    total_decisive = n_yes + n_no
    f15 = n_yes / max(total_decisive, 1) if total_decisive > 0 else 0.0
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "V": int(V),
        "n_docs": int(len(sample_idx)),
        "n_yes": n_yes, "n_no": n_no, "n_ambiguous": n_ambiguous,
        "f15_alignment": round(f15, 6),
        "decisions": decisions,
        "model": MODEL,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_f15_llm_alignment v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-15 LLM topic-doc alignment.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[f15] ANTHROPIC_API_KEY not set — skipping F-15 LLM-judge. "
              "Set the env var and re-run to populate.", flush=True)
        return 0

    F15_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    summary = []
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            print(f"[f15] {tag} ...", flush=True)
            try:
                res = for_cell(recipe, scene, api_key)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
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
                f"  yes={res['n_yes']}/{res['n_yes'] + res['n_no']} "
                f"f15={res['f15_alignment']:.3f} ambig={res['n_ambiguous']}",
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
            print(f"    {r:5s} mean={np.mean(v):.4f}", flush=True)

    print(f"\n[f15] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
