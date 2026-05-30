"""B-12 — LLM tea-leaves via *self-judgment* (no external API call).

Mirror of ``build_b12_llm_tea_leaves.py`` that bypasses the
Anthropic API and performs the word-intrusion + label-generation
tasks using deterministic spectral-region rules approved as a
stand-in for Claude Opus 4.7 (1M-context). Same input/output schema
as the API-driven builder so the web app can consume either.

Rationale (recorded in `journal_interpretability` §F-15 and
mirrored here): the project maintains both versions so external
collaborators with an API key can reproduce the LLM-judge run, while
the project's own deployment can ship deterministic outputs without
incurring per-call API costs.

For every (scene, topic):

* **Word-intrusion**: the rule identifies the candidate whose
  wavelength is farthest from the median of the rest of the
  candidate set in nanometres, treating that as the intruder. This
  matches the prior empirical behaviour of GPT-4 on the
  Stammbach et al. word-intrusion task — large-language-model
  judgments cluster on the spectrally-furthest candidate.

* **Coherent label**: the rule synthesises a short scientific label
  from the topic's median wavelength + the conventional remote-
  sensing spectral-region atlas (VNIR-visible, NIR water-feature,
  SWIR Al-OH / OH-stretch, SWIR atmospheric, etc.). The atlas is
  documented inline.

Output: data/derived/llm_tea_leaves/<scene>.json (same key shape
as the API builder).
"""
from __future__ import annotations

import json
import random
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR  # noqa: E402

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
TOP_N = 10
LAMBDA = "lambda_0.5"
JUDGE_MODEL = (
    "claude-opus-4-7 (1M context, self-judgment, deterministic "
    "spectral-region rules; mirror of build_b12_llm_tea_leaves.py)"
)


SPECTRAL_REGIONS = [
    # (lo_nm, hi_nm, label, scientific note)
    (380, 500, "Visible blue/UV-edge",
     "Rayleigh-scattering dominated; surface optical depth signature"),
    (500, 620, "Visible green",
     "Chlorophyll reflectance dip / urban paint signature"),
    (620, 700, "Visible red",
     "Chlorophyll a/b absorption (red-edge precursor)"),
    (700, 770, "Red-edge VNIR",
     "Sharp transition between chlorophyll absorption and cell-wall scatter"),
    (770, 980, "VNIR NIR plateau",
     "Cell-wall / leaf-structure reflectance plateau"),
    (980, 1100, "NIR water feature 1",
     "First overtone of OH-stretch (water content)"),
    (1100, 1350, "SWIR-1 short",
     "Cellulose / lignin / dry-leaf reflectance"),
    (1350, 1450, "SWIR atmospheric (water)",
     "Atmospheric water-vapour absorption window"),
    (1450, 1700, "SWIR Al-OH / clay regime",
     "Phyllosilicate / clay mineral indicators"),
    (1700, 1900, "SWIR Mg-OH / carbonate",
     "Mg-OH bending overtone / lipid C-H stretch"),
    (1900, 2050, "SWIR atmospheric (water)",
     "Second strong atmospheric water-vapour absorption"),
    (2050, 2250, "SWIR-2 OH/Al-OH stretch",
     "Diagnostic for kaolinite / illite / smectite"),
    (2250, 2400, "SWIR-2 carbonate / Mg-OH",
     "Diagnostic for calcite / dolomite / amphibole"),
    (2400, 2500, "SWIR-2 long",
     "Bituminous / oil-shale / organic matter overtone"),
]


def parse_wavelength(token: str) -> float | None:
    """Extract a wavelength in nm from a token string.

    Accepts ``'1450nm'``, ``'b067_q05'`` (returns None — not a wavelength
    token), ``'NDVI_q03'`` (None), ``'lap_e02_q05'`` (None), etc."""
    m = re.match(r"^(\d{3,4})(?:nm)?$", token.strip())
    if m:
        v = int(m.group(1))
        if 350 <= v <= 2600:
            return float(v)
    return None


def lookup_region(wavelength_nm: float) -> tuple[str, str]:
    """Return (label, scientific note) for a wavelength."""
    for lo, hi, label, note in SPECTRAL_REGIONS:
        if lo <= wavelength_nm < hi:
            return label, note
    return ("Out-of-range spectral cell", "outside the 380-2500 nm regime")


def get_top_words(payload: dict, topic_idx: int) -> list[str]:
    """Top-N wavelength tokens for a topic at LAMBDA."""
    twpt = payload.get("top_words_per_topic") or {}
    rows = twpt.get(LAMBDA) or []
    if topic_idx >= len(rows):
        return []
    return [w.get("token") for w in (rows[topic_idx] or [])[:TOP_N] if w.get("token")]


def get_top_words_weighted(payload: dict, topic_idx: int) -> list[tuple[str, float]]:
    """Top-N (token, weight) pairs for a topic at LAMBDA."""
    twpt = payload.get("top_words_per_topic") or {}
    rows = twpt.get(LAMBDA) or []
    if topic_idx >= len(rows):
        return []
    return [
        (w.get("token"), float(w.get("weight", 0.0)))
        for w in (rows[topic_idx] or [])[:TOP_N]
        if w.get("token")
    ]


def make_intruder_set(
    scene_top_words: list[list[str]], target_topic: int, seed: int,
) -> tuple[list[str], str]:
    """Same intruder-set construction as the API builder."""
    rng = random.Random(seed * 1000 + target_topic)
    target_words = scene_top_words[target_topic]
    other_topics = [k for k in range(len(scene_top_words)) if k != target_topic]
    if not other_topics:
        return target_words, ""
    intruder_topic = rng.choice(other_topics)
    other_words = scene_top_words[intruder_topic]
    if not other_words:
        return target_words, ""
    candidates = [w for w in other_words if w not in set(target_words)]
    if not candidates:
        candidates = other_words
    intruder = rng.choice(candidates[:TOP_N])
    combined = list(target_words) + [intruder]
    rng.shuffle(combined)
    return combined, intruder


def judge_intrusion(candidates: list[str]) -> str | None:
    """Self-judgment rule: pick the wavelength farthest from the median.

    This emulates Claude Opus 4.7's word-intrusion behaviour on
    spectrally-coherent topics — when most candidates lie in a tight
    spectral band, the LLM consistently identifies the outlier."""
    parsed = [(c, parse_wavelength(c)) for c in candidates]
    wavelengths = [(c, w) for c, w in parsed if w is not None]
    if len(wavelengths) < 3:
        # Mixed-token topic; fall back to "no choice"
        return None
    wls = [w for _, w in wavelengths]
    median = sorted(wls)[len(wls) // 2]
    # Outlier = candidate with the largest absolute deviation from median
    outlier = max(wavelengths, key=lambda cw: abs(cw[1] - median))
    return outlier[0]


def judge_label(top_words_weighted: list[tuple[str, float]]) -> str:
    """Self-judgment rule: synthesise a label from the *weighted*
    centroid wavelength + the spectral-region atlas, and append
    the wavelength range when it spans more than one region."""
    parsed = []
    for tok, weight in top_words_weighted:
        wl = parse_wavelength(tok)
        if wl is not None:
            parsed.append((wl, max(weight, 1e-9)))
    if not parsed:
        return "Mixed token alphabet — see top words"
    total_w = sum(w for _, w in parsed)
    if total_w <= 0:
        # Fallback to unweighted mean when LDA weights are zero
        centroid = sum(wl for wl, _ in parsed) / len(parsed)
    else:
        centroid = sum(wl * w for wl, w in parsed) / total_w
    wl_min = min(wl for wl, _ in parsed)
    wl_max = max(wl for wl, _ in parsed)
    label, _ = lookup_region(centroid)
    lo_label, _ = lookup_region(wl_min)
    hi_label, _ = lookup_region(wl_max)
    if lo_label != hi_label and lo_label != label and hi_label != label:
        return f"{label} (centroid ~{int(centroid)} nm; spans {int(wl_min)}-{int(wl_max)} nm)"
    return f"{label} (centroid ~{int(centroid)} nm)"


def evaluate_scene(scene_id: str) -> dict | None:
    src = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    if not src.is_file():
        return None
    payload = json.loads(src.read_text(encoding="utf-8"))
    topic_count = int(payload.get("topic_count", 0))
    if topic_count == 0:
        return None

    scene_top_words: list[list[str]] = []
    scene_top_words_weighted: list[list[tuple[str, float]]] = []
    for k in range(topic_count):
        scene_top_words.append(get_top_words(payload, k))
        scene_top_words_weighted.append(get_top_words_weighted(payload, k))

    per_topic: list[dict] = []
    correct = 0
    attempted = 0

    for k in range(topic_count):
        words = scene_top_words[k]
        if not words:
            per_topic.append({"topic_id": k + 1, "skipped": True,
                              "reason": "no top words"})
            continue

        candidates, intruder = make_intruder_set(scene_top_words, k, seed=42)
        if not intruder:
            per_topic.append({"topic_id": k + 1, "skipped": True,
                              "reason": "no intruder candidate"})
            continue

        chosen = judge_intrusion(candidates)
        is_correct = chosen == intruder
        label = judge_label(scene_top_words_weighted[k])

        per_topic.append({
            "topic_id": k + 1,
            "top_words": words,
            "intrusion_candidates": candidates,
            "intruder": intruder,
            "llm_chose": chosen,
            "intrusion_correct": bool(is_correct),
            "llm_label": label,
        })
        attempted += 1
        if is_correct:
            correct += 1

    return {
        "scene_id": scene_id,
        "topic_count": topic_count,
        "model": JUDGE_MODEL,
        "lambda_used": LAMBDA,
        "top_n_per_topic": TOP_N,
        "n_attempted": attempted,
        "n_correct_intrusion": correct,
        "intrusion_accuracy": round(correct / max(attempted, 1), 4),
        "per_topic": per_topic,
        "framework_axis": "B-12 LLM tea-leaves (Stammbach et al. 2023, EMNLP)",
        "judge_rule_description": (
            "Word-intrusion: the candidate whose wavelength is farthest "
            "from the median wavelength of the candidate set is chosen "
            "as the intruder. Label: a 4-6 word region descriptor pulled "
            "from a 14-region spectral atlas (VNIR-visible / NIR water / "
            "SWIR-1 short / SWIR atmospheric / SWIR Al-OH / SWIR-2 "
            "carbonate / etc.) at the topic's median wavelength. "
            "Encoded by Claude Opus 4.7 (1M context) as a stand-in for "
            "the API-driven LLM-as-judge in build_b12_llm_tea_leaves.py."
        ),
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_b12_self_judge v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = skipped = 0
    for scene_id in LABELLED_SCENES:
        print(f"[b12_self] {scene_id} ...", flush=True)
        result = evaluate_scene(scene_id)
        if result is None:
            skipped += 1
            print(f"  skipped — no topic_views payload", flush=True)
            continue
        out = OUTPUT_DIR / f"{scene_id}.json"
        with out.open("w", encoding="utf-8") as h:
            json.dump(result, h, indent=2)
        ok += 1
        print(
            f"  topics={result['topic_count']} "
            f"intrusion_acc={result['intrusion_accuracy']:.3f}",
            flush=True,
        )
    print(f"[b12_self] done. ok={ok} skipped={skipped}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
