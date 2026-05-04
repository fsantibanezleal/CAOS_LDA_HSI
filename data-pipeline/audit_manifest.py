"""Manifest auditor — verifies that every artifact declared in
`data/derived/manifests/index.json` exists on disk with the declared
size, that builder file counts and total bytes are internally
consistent, that every claim in `claims_allowed` resolves to at least
one artifact, and that no `data/derived/*` file is silently orphaned
from the manifest.

Run: `python data-pipeline/audit_manifest.py` (or
`scripts/local audit-manifest`). Exits 0 when clean, 1 on any issue.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "derived" / "manifests" / "index.json"
DERIVED_ROOT = ROOT / "data" / "derived"

# Artifact paths in the manifest are stored as POSIX relative paths
# anchored at the repo root (e.g. "data/derived/eda/per_scene/x.json").
# We do not audit non-derived files; the only derived path that is not
# an artifact in the manifest is the manifest itself.
SELF_PATH = MANIFEST_PATH.relative_to(ROOT).as_posix()

# Files we knowingly exclude from orphan detection.
ORPHAN_EXEMPT_SUFFIXES = (".gitkeep",)

# File extensions considered candidate artifacts on disk.
DERIVED_EXTENSIONS = {".json", ".png", ".bin", ".npy"}


def load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(
            f"FAIL manifest not found at {MANIFEST_PATH} — run "
            "`scripts/local curate-for-web` first."
        )
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def audit_artifacts(artifacts: list[dict]) -> tuple[list[str], list[str]]:
    """Each artifact `path` must exist with size matching `bytes`."""
    missing: list[str] = []
    drift: list[str] = []
    for art in artifacts:
        rel = art["path"].replace("\\", "/")
        full = ROOT / rel
        if not full.is_file():
            missing.append(f"  {rel}  (declared by {art.get('builder', '?')})")
            continue
        actual = full.stat().st_size
        declared = int(art["bytes"])
        if actual != declared:
            drift.append(
                f"  {rel}  declared={declared} actual={actual} delta={actual - declared:+d}"
            )
    return missing, drift


def audit_builders(builders: dict, artifacts: list[dict]) -> list[str]:
    """`builders[name].files_count` and `total_bytes` must match the
    sum of artifacts attributed to that builder."""
    issues: list[str] = []
    by_builder: dict[str, list[dict]] = {}
    for art in artifacts:
        by_builder.setdefault(art.get("builder", "?"), []).append(art)
    for name, declared in builders.items():
        attributed = by_builder.get(name, [])
        actual_count = len(attributed)
        actual_bytes = sum(int(a["bytes"]) for a in attributed)
        if int(declared.get("files_count", 0)) != actual_count:
            issues.append(
                f"  {name}.files_count declared={declared.get('files_count')} "
                f"actual={actual_count}"
            )
        if int(declared.get("total_bytes", 0)) != actual_bytes:
            issues.append(
                f"  {name}.total_bytes declared={declared.get('total_bytes')} "
                f"actual={actual_bytes} "
                f"delta={actual_bytes - int(declared.get('total_bytes', 0)):+d}"
            )
    extra = sorted(set(by_builder) - set(builders))
    for name in extra:
        issues.append(
            f"  builder '{name}' appears in artifacts but not in builders index"
        )
    return issues


def audit_orphans(artifacts: list[dict]) -> list[str]:
    """Files under `data/derived/*` whose path is not in `artifacts`
    (and is not the manifest itself) are reported as orphans — i.e.
    the manifest builder did not see them."""
    declared_paths = {art["path"].replace("\\", "/") for art in artifacts}
    declared_paths.add(SELF_PATH)
    orphans: list[str] = []
    if not DERIVED_ROOT.is_dir():
        return orphans
    for path in DERIVED_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in DERIVED_EXTENSIONS:
            continue
        if path.name in ORPHAN_EXEMPT_SUFFIXES:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel not in declared_paths:
            orphans.append(f"  {rel}  ({path.stat().st_size} bytes)")
    return sorted(orphans)


def _claim_path_prefix(source_pattern: str) -> list[str]:
    """Extract the artifact-path prefix(es) from a claim's
    `source_pattern`. Patterns can carry alternation via ` | ` and
    placeholders like `<scene>`. We anchor each branch at the segment
    before the first placeholder, alternation, brace expansion, or
    field-path delimiter."""
    branches = [b.strip() for b in source_pattern.split("|") if b.strip()]
    prefixes: list[str] = []
    for branch in branches:
        head = re.split(r"[<{*]", branch, maxsplit=1)[0]
        head = head.rstrip(".")
        head = head.rstrip("/")
        if head:
            prefixes.append(head)
    return prefixes


def audit_claims(claims: list[dict], artifacts: list[dict]) -> list[str]:
    """Every claim's `source_pattern` must resolve to >= 1 artifact
    whose path starts with one of the claim's prefixes (after the
    `data/derived/` anchor)."""
    issues: list[str] = []
    artifact_paths = [art["path"].replace("\\", "/") for art in artifacts]
    for claim in claims:
        sp = claim.get("source_pattern", "")
        prefixes = _claim_path_prefix(sp)
        if not prefixes:
            issues.append(f"  {claim['id']}  unparseable source_pattern: {sp!r}")
            continue
        hit = False
        for prefix in prefixes:
            anchor = f"data/derived/{prefix}"
            if any(p.startswith(anchor) for p in artifact_paths):
                hit = True
                break
        if not hit:
            issues.append(
                f"  {claim['id']}  source_pattern={sp!r}  "
                f"no artifact path starts with any of "
                f"{[f'data/derived/{p}' for p in prefixes]}"
            )
    return issues


def main() -> int:
    manifest = load_manifest()
    artifacts = manifest.get("artifacts", [])
    builders = manifest.get("builders", {})
    claims = manifest.get("claims_allowed", [])

    print(
        f"[audit] manifest: {len(artifacts)} artifacts, "
        f"{len(builders)} builders, {len(claims)} claims_allowed",
        flush=True,
    )

    missing, drift = audit_artifacts(artifacts)
    builder_issues = audit_builders(builders, artifacts)
    orphans = audit_orphans(artifacts)
    claim_issues = audit_claims(claims, artifacts)

    sections = [
        ("Missing artifacts (declared in manifest, absent on disk)", missing),
        ("Size drift (declared vs actual bytes)", drift),
        ("Builder index inconsistencies", builder_issues),
        ("Orphan derived files (on disk, absent from manifest)", orphans),
        ("Unresolved claims (source_pattern matches no artifact)", claim_issues),
    ]
    total = sum(len(items) for _, items in sections)

    for title, items in sections:
        if items:
            print(f"\n[audit] {title} ({len(items)}):", flush=True)
            for line in items:
                print(line, flush=True)

    if total == 0:
        print("\n[audit] OK — no issues found.", flush=True)
        return 0

    print(f"\n[audit] FAIL — {total} issue(s) across {sum(1 for _, i in sections if i)} sections.", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
