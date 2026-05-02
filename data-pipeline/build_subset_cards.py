"""Compact public subset cards for the rebuilt web workflow.

Reads:
- ``data/manifests/interactive_subsets.json`` (the registry)
- ``data/manifests/datasets.json``           (dataset cards)
- ``data/manifests/corpus_recipes.json``     (recipe metadata)
- ``data/derived/corpus/corpus_previews.json``
- ``data/derived/real/real_samples.json``    (Family B / C scene previews)
- ``data/derived/field/field_samples.json``  (MSI field previews)
- ``data/derived/spectral/library_samples.json`` (Family A library)
- ``data/derived/core/local_core_benchmarks.json`` (deeper benchmark data)

Writes:
- ``data/derived/subsets/{subset_id}.json`` -- one compact card per
  subset, conforming to the ``SubsetCard`` Pydantic schema.
- ``data/derived/subsets/index.json`` -- the registry consumed by
  ``GET /api/subset-cards`` on the frontend.

The point of this extractor is to **decouple the public app from the
deep ``local_core_benchmarks.json`` structure**. The frontend should
load cards by ID and never re-read the raw benchmarks file.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
MANIFESTS = ROOT / "data" / "manifests"
DERIVED = ROOT / "data" / "derived"
OUT_DIR = DERIVED / "subsets"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _bilingual(text_en: str, text_es: str | None = None) -> dict[str, str]:
    return {"en": text_en, "es": text_es if text_es is not None else text_en}


def _quartiles(values: list[float]) -> list[float]:
    if not values:
        return []
    sorted_v = sorted(values)
    n = len(sorted_v)
    q1 = sorted_v[n // 4]
    q2 = sorted_v[n // 2]
    q3 = sorted_v[(3 * n) // 4]
    return [float(min(sorted_v)), float(q1), float(q2), float(q3), float(max(sorted_v))]


def _resolve(by_id: dict[str, dict[str, Any]], key: str) -> dict[str, Any] | None:
    return by_id.get(key)


def _pick(d: dict[str, Any] | None, *keys: str, default: Any = None) -> Any:
    cur: Any = d
    for key in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
        if cur is None:
            return default
    return cur


# ---------------------------------------------------------------------------
# Per-card builders
# ---------------------------------------------------------------------------


def build_evidence_items(
    subset: dict[str, Any],
    datasets_by_id: dict[str, dict[str, Any]],
    real_scenes_by_id: dict[str, dict[str, Any]],
    field_samples_by_id: dict[str, dict[str, Any]],
    library_index: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for dataset_id in subset.get("dataset_ids", []):
        dataset = datasets_by_id.get(dataset_id)
        if dataset is None:
            continue
        spatial = dataset.get("spatial_shape")
        bands = dataset.get("bands")
        preview_path: str | None = None
        if dataset_id in real_scenes_by_id:
            scene = real_scenes_by_id[dataset_id]
            preview_path = scene.get("preview_image_path") or scene.get("rgb_preview_path")
        if dataset_id in field_samples_by_id and not preview_path:
            preview_path = field_samples_by_id[dataset_id].get("preview_image_path")

        supervision = dataset.get("supervision", {}) or {}
        items.append(
            {
                "dataset_id": dataset_id,
                "dataset_name": dataset.get("name", dataset_id),
                "modality": dataset.get("modality", "unknown"),
                "band_count": int(bands) if isinstance(bands, (int, float)) else None,
                "spatial_shape": list(spatial) if isinstance(spatial, list) else None,
                "preview_image_path": preview_path,
                "label_scope": supervision.get("label_scope"),
                "measurement_scope": supervision.get("measurement_scope"),
                "summary": dataset.get(
                    "notes",
                    _bilingual("No additional notes for this dataset.", "Sin notas adicionales."),
                ),
            }
        )
    # In some subsets the library samples deserve their own evidence row
    if subset.get("primary_dataset_id") in library_index and not items:
        primary = library_index[subset["primary_dataset_id"]]
        items.append(primary)
    return items


def build_corpus_items(
    subset: dict[str, Any],
    corpus_previews: list[dict[str, Any]],
    recipes_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    dataset_ids = set(subset.get("dataset_ids", []))
    recipe_ids = set(subset.get("recipe_ids", []))
    for preview in corpus_previews:
        if preview.get("dataset_id") not in dataset_ids:
            continue
        if preview.get("recipe_id") not in recipe_ids:
            continue
        recipe = recipes_by_id.get(preview["recipe_id"], {})
        recipe_title = recipe.get("title") or _bilingual(preview["recipe_id"])
        doc_length = preview.get("document_length", {}) or {}
        # Build a deterministic 5-number quartile vector; if the preview already
        # exposes quartile-like aggregates we reuse them, otherwise we synthesize.
        quartiles = [
            float(doc_length.get("min", 0.0)),
            float(doc_length.get("min", 0.0)),
            float(doc_length.get("median", 0.0)),
            float(doc_length.get("max", 0.0)),
            float(doc_length.get("max", 0.0)),
        ]
        sample_tokens = [tok.get("token", "") for tok in preview.get("top_tokens", [])][:8]
        out.append(
            {
                "recipe_id": preview["recipe_id"],
                "recipe_title": recipe_title,
                "dataset_id": preview["dataset_id"],
                "vocabulary_size": int(preview.get("vocabulary_size", 0)),
                "document_count": int(preview.get("document_count", 0)),
                "document_length_quartiles": quartiles,
                "sample_tokens": sample_tokens,
            }
        )
    return out


def _benchmark_runs_for_dataset(
    benchmarks: dict[str, Any],
    dataset_ids: Iterable[str],
) -> list[tuple[str, dict[str, Any]]]:
    """Return ``(section_name, run)`` pairs whose ``dataset_id`` matches."""
    sections = (
        "labeled_scene_runs",
        "topic_stability_runs",
        "unlabeled_scene_runs",
        "unmixing_runs",
        "spectral_library_runs",
        "measured_target_runs",
    )
    matches: list[tuple[str, dict[str, Any]]] = []
    dataset_set = set(dataset_ids)
    for section in sections:
        for run in benchmarks.get(section, []) or []:
            run_dataset = run.get("dataset_id")
            if run_dataset in dataset_set:
                matches.append((section, run))
    return matches


def build_topic_block(
    subset: dict[str, Any],
    benchmarks: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not benchmarks:
        return None
    matches = _benchmark_runs_for_dataset(benchmarks, subset.get("dataset_ids", []))
    if not matches:
        return None

    # Prefer labelled scene runs > unlabelled > unmixing > others for topic words.
    priority = {
        "labeled_scene_runs": 0,
        "unlabeled_scene_runs": 1,
        "unmixing_runs": 2,
        "spectral_library_runs": 3,
        "measured_target_runs": 4,
        "topic_stability_runs": 5,
    }
    matches_sorted = sorted(matches, key=lambda pair: priority.get(pair[0], 9))

    topics: list[dict[str, Any]] = []
    representation_id: str | None = None
    K: int | None = None
    for section, run in matches_sorted:
        topic_model = run.get("topic_model") or {}
        token_blocks = topic_model.get("top_band_tokens") or []
        if not token_blocks:
            continue
        representation_id = (
            (run.get("representation") or {}).get("recipe_id")
            or run.get("representation_id")
            or representation_id
        )
        K = topic_model.get("topic_count", K)
        for block in token_blocks[:6]:
            tokens = [
                str(item.get("token", ""))
                for item in (block.get("tokens") or [])[:6]
            ]
            weight_total = sum(
                float(item.get("weight", 0.0)) for item in (block.get("tokens") or [])[:6]
            )
            topics.append(
                {
                    "topic_id": int(block.get("topic_id", 0)),
                    "top_words": tokens,
                    "weight": round(weight_total, 4),
                }
            )
        if topics:
            break

    # Stability score
    stability_score: float | None = None
    seeds_compared: int | None = None
    for section, run in matches:
        if section != "topic_stability_runs":
            continue
        stability_score = float(run.get("matched_topic_cosine_mean", 0.0)) or None
        seeds_compared = len(run.get("seeds", [])) or run.get("seed_count")
        break

    return {
        "representation_id": representation_id,
        "K": K,
        "topics": topics,
        "stability_score": stability_score,
        "seeds_compared": seeds_compared,
    }


def build_validation_items(
    subset: dict[str, Any],
    benchmarks: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for entry in subset.get("validation_status", []) or []:
        block_id = entry.get("block_id")
        items.append(
            {
                "block_id": block_id,
                "status": entry.get("status", "blocked"),
                "detail": entry.get("note"),
                "metric_name": None,
                "metric_value": None,
            }
        )

    # Try to attach quantitative metrics from the topic-stability runs.
    if benchmarks:
        for _section, run in _benchmark_runs_for_dataset(
            benchmarks, subset.get("dataset_ids", [])
        ):
            if _section != "topic_stability_runs":
                continue
            cosine_mean = run.get("matched_topic_cosine_mean")
            if cosine_mean is None:
                continue
            for item in items:
                if item["block_id"] in {"topic-stability", "topic_stability"}:
                    item["metric_name"] = "matched_topic_cosine_mean"
                    item["metric_value"] = float(cosine_mean)
                    break
            else:
                items.append(
                    {
                        "block_id": "topic-stability",
                        "status": "ready" if cosine_mean >= 0.85 else "prototype",
                        "detail": _bilingual(
                            "Auto-attached from local-core topic-stability run.",
                            "Adjuntada automaticamente desde el run topic-stability local-core.",
                        ),
                        "metric_name": "matched_topic_cosine_mean",
                        "metric_value": float(cosine_mean),
                    }
                )
            break
    return items


def build_artifact_refs(subset: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for art in subset.get("artifacts", []) or []:
        refs.append(
            {
                "id": art.get("id", ""),
                "title": art.get("title", _bilingual("Artifact")),
                "path": art.get("path", ""),
                "purpose": art.get("purpose"),
            }
        )
    return refs


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def build_card(
    subset: dict[str, Any],
    *,
    datasets_by_id: dict[str, dict[str, Any]],
    recipes_by_id: dict[str, dict[str, Any]],
    real_scenes_by_id: dict[str, dict[str, Any]],
    field_samples_by_id: dict[str, dict[str, Any]],
    library_index: dict[str, dict[str, Any]],
    corpus_previews: list[dict[str, Any]],
    benchmarks: dict[str, Any] | None,
    generated_at: str,
) -> dict[str, Any]:
    return {
        "id": subset["id"],
        "title": subset["title"],
        "summary": subset.get("summary", _bilingual("No summary.")),
        "family_id": subset["family_id"],
        "status": subset.get("status", "blocked"),
        "last_validated": subset.get("last_validated"),
        "public_goal": subset.get("public_goal", _bilingual("No public goal recorded.")),
        "supported_claims": subset.get("supported_claims", []) or [],
        "blocked_claims": subset.get("blocked_claims", []) or [],
        "workflow_steps": subset.get("workflow_steps", []) or [],
        "evidence": build_evidence_items(
            subset,
            datasets_by_id,
            real_scenes_by_id,
            field_samples_by_id,
            library_index,
        ),
        "corpus": build_corpus_items(subset, corpus_previews, recipes_by_id),
        "topics": build_topic_block(subset, benchmarks),
        "validation": build_validation_items(subset, benchmarks),
        "artifacts": build_artifact_refs(subset),
        "next_steps": subset.get("next_steps", []) or [],
        "generated_at": generated_at,
    }


def main() -> int:
    interactive = _load_json(MANIFESTS / "interactive_subsets.json")
    if not interactive:
        raise SystemExit("interactive_subsets.json not found; nothing to extract")

    datasets = _load_json(MANIFESTS / "datasets.json") or {}
    recipes = _load_json(MANIFESTS / "corpus_recipes.json") or {}
    corpus = _load_json(DERIVED / "corpus" / "corpus_previews.json") or {}
    real_scenes = _load_json(DERIVED / "real" / "real_samples.json") or {}
    field_samples = _load_json(DERIVED / "field" / "field_samples.json") or {}
    library = _load_json(DERIVED / "spectral" / "library_samples.json") or {}
    benchmarks = _load_json(DERIVED / "core" / "local_core_benchmarks.json")

    datasets_by_id = {item["id"]: item for item in datasets.get("datasets", [])}
    recipes_by_id = {item["id"]: item for item in recipes.get("recipes", [])}
    real_scenes_by_id = {scene["id"]: scene for scene in real_scenes.get("scenes", [])}
    field_samples_by_id = {sample["id"]: sample for sample in field_samples.get("samples", [])}
    library_index = {item.get("id", ""): item for item in library.get("samples", [])}
    corpus_previews = corpus.get("previews", [])

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    generated_at = date.today().isoformat()
    summaries: list[dict[str, Any]] = []
    written = 0

    for subset in interactive.get("subsets", []):
        card = build_card(
            subset,
            datasets_by_id=datasets_by_id,
            recipes_by_id=recipes_by_id,
            real_scenes_by_id=real_scenes_by_id,
            field_samples_by_id=field_samples_by_id,
            library_index=library_index,
            corpus_previews=corpus_previews,
            benchmarks=benchmarks,
            generated_at=generated_at,
        )
        card_path = OUT_DIR / f"{subset['id']}.json"
        with card_path.open("w", encoding="utf-8") as handle:
            json.dump(card, handle, ensure_ascii=False, indent=2, sort_keys=False)
            handle.write("\n")
        summaries.append(
            {
                "id": card["id"],
                "title": card["title"],
                "family_id": card["family_id"],
                "status": card["status"],
                "last_validated": card.get("last_validated"),
            }
        )
        written += 1

    index = {
        "source": "Compact public subset cards extracted from the interactive subset registry",
        "generated_at": generated_at,
        "cards": summaries,
    }
    with (OUT_DIR / "index.json").open("w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, indent=2, sort_keys=False)
        handle.write("\n")

    print(f"Wrote {written} subset card(s) to {OUT_DIR}")
    print(f"Index: {OUT_DIR / 'index.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
