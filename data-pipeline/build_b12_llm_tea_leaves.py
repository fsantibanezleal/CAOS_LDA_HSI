"""B-12 — automated word/topic intrusion via LLM (Stammbach et al. TACL 2024).

For each labelled scene, asks an LLM (Anthropic Claude) two questions
per topic:

  1. **Word-intrusion**: given top-K words for the topic with one
     intruder word slipped in (a top word from a different topic),
     identify the intruder.

  2. **Coherent-label**: given the top-K words for the topic, generate
     a short coherent label.

Reports per-scene and per-topic the LLM's accuracy on word-intrusion
and the generated label. Coherence-by-LLM correlates with NPMI in
prior work (Stammbach et al.); this builder records the raw LLM
judgments so we can compare against the existing NPMI / c_v / matched-
cosine axes.

**Gated by ANTHROPIC_API_KEY**. If the env var is not set, the builder
prints a one-line skip and exits 0. Tracking URI for MLflow is
preserved if the helper is available.

Output: data/derived/llm_tea_leaves/<scene>.json
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from research_core.paths import DERIVED_DIR


OUTPUT_DIR = DERIVED_DIR / "llm_tea_leaves"
TOPIC_VIEWS_DIR = DERIVED_DIR / "topic_views"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

# Top-N words per topic to feed the LLM
TOP_N = 10
# Lambda for the relevance ranking (canonical from Sievert-Shirley)
LAMBDA = "lambda_0.5"
# Anthropic model
MODEL = "claude-haiku-4-5"


def get_top_words(payload: dict, topic_idx: int) -> list[str]:
    """Pull top-N words for a topic at the canonical relevance lambda."""
    twpt = payload.get("top_words_per_topic") or {}
    rows = twpt.get(LAMBDA) or []
    if topic_idx >= len(rows):
        return []
    return [w.get("token") for w in (rows[topic_idx] or [])[:TOP_N] if w.get("token")]


def make_intruder_set(
    scene_top_words: list[list[str]], target_topic: int, seed: int
) -> tuple[list[str], str]:
    """Build a TOP_N+1-length list with one intruder from a different topic.

    Returns (shuffled_list, intruder_token)."""
    rng = random.Random(seed * 1000 + target_topic)
    target_words = scene_top_words[target_topic]
    other_topics = [k for k in range(len(scene_top_words)) if k != target_topic]
    intruder_topic = rng.choice(other_topics)
    other_words = scene_top_words[intruder_topic]
    if not other_words:
        return target_words, ""
    # Pick an intruder that is NOT in the target's top-N
    candidates = [w for w in other_words if w not in set(target_words)]
    if not candidates:
        candidates = other_words
    intruder = rng.choice(candidates[:TOP_N])
    combined = list(target_words) + [intruder]
    rng.shuffle(combined)
    return combined, intruder


def call_anthropic(prompt: str, api_key: str) -> str:
    """Synchronous Anthropic Messages API call. Returns the text content."""
    try:
        import anthropic  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "anthropic SDK not installed. Add `anthropic` to requirements.txt"
        ) from exc
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    out = []
    for block in response.content:
        if hasattr(block, "text"):
            out.append(block.text)
    return "\n".join(out).strip()


def parse_intruder_response(text: str, candidates: list[str]) -> str | None:
    """Extract the intruder word from the LLM response. Looks for any of
    the candidate tokens in the response; returns the first match (or None)."""
    text_lower = text.lower()
    for c in candidates:
        if c.lower() in text_lower:
            return c
    return None


def evaluate_scene(scene_id: str, api_key: str) -> dict | None:
    src = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    if not src.is_file():
        return None
    payload = json.loads(src.read_text(encoding="utf-8"))
    topic_count = int(payload.get("topic_count", 0))
    if topic_count == 0:
        return None

    # Pre-extract top words per topic
    scene_top_words: list[list[str]] = []
    for k in range(topic_count):
        scene_top_words.append(get_top_words(payload, k))

    per_topic: list[dict] = []
    correct = 0
    attempted = 0

    for k in range(topic_count):
        words = scene_top_words[k]
        if not words:
            per_topic.append({"topic_id": k + 1, "skipped": True, "reason": "no top words"})
            continue

        # Intrusion test
        candidates, intruder = make_intruder_set(scene_top_words, k, seed=42)
        if not intruder:
            per_topic.append({"topic_id": k + 1, "skipped": True, "reason": "no intruder candidate"})
            continue

        intrusion_prompt = (
            "You are evaluating a topic model. The topic's top words are below "
            "with one intruder from a different topic. Identify ONLY the "
            "intruder by replying with that single word and nothing else.\n\n"
            f"Words: {', '.join(candidates)}"
        )
        try:
            intrusion_resp = call_anthropic(intrusion_prompt, api_key)
        except Exception as exc:
            per_topic.append({
                "topic_id": k + 1,
                "skipped": True,
                "reason": f"intrusion call failed: {exc}",
            })
            continue
        chosen = parse_intruder_response(intrusion_resp, candidates)
        is_correct = chosen == intruder

        # Label generation
        label_prompt = (
            "You are labelling a topic from a hyperspectral-imagery LDA model. "
            "Below are the top words (band-frequency tokens like '1450nm' "
            "encode wavelength buckets). Suggest a SHORT (max 6 words) "
            "scientific label that captures the spectral region or material "
            "regime these words describe. Reply with ONLY the label.\n\n"
            f"Words: {', '.join(words)}"
        )
        try:
            label_resp = call_anthropic(label_prompt, api_key)
        except Exception as exc:
            label_resp = f"<error: {exc}>"

        per_topic.append({
            "topic_id": k + 1,
            "top_words": words,
            "intrusion_candidates": candidates,
            "intruder": intruder,
            "llm_chose": chosen,
            "intrusion_correct": bool(is_correct),
            "llm_label": label_resp,
        })
        attempted += 1
        if is_correct:
            correct += 1

        # Throttle so we don't burst the API
        time.sleep(0.5)

    return {
        "scene_id": scene_id,
        "topic_count": topic_count,
        "model": MODEL,
        "lambda_used": LAMBDA,
        "top_n_per_topic": TOP_N,
        "n_attempted": attempted,
        "n_correct_intrusion": correct,
        "intrusion_accuracy": round(correct / max(attempted, 1), 4),
        "per_topic": per_topic,
        "framework_axis": "B-12 LLM tea-leaves (Stammbach et al. TACL 2024)",
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_b12_llm_tea_leaves v0.1",
    }


def main() -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print(
            "[b12_llm] ANTHROPIC_API_KEY not set — skipping B-12 LLM tea-leaves. "
            "Set the env var to run word-intrusion and coherent-label tests on the LLM.",
            flush=True,
        )
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[b12_llm] {scene_id} ...", flush=True)
        try:
            payload = evaluate_scene(scene_id, api_key)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback

            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        out_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(
            f"  intrusion accuracy = {payload['intrusion_accuracy']:.3f} "
            f"({payload['n_correct_intrusion']}/{payload['n_attempted']} topics)",
            flush=True,
        )
        written += 1
    print(f"[b12_llm] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
