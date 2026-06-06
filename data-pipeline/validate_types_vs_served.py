"""Structural validator: TS payload types vs the live served JSON.

Motivation: the HidsagEda type was fictional — every field mis-shaped — and
tsc could not catch it because the *type* was wrong, not the consumer. A card
then did `dominant_targets_by_mean[].std.toFixed()` on a field that does not
exist -> runtime crash. This script catches that class systemically: for each
`request<T>(url)` endpoint, it parses T's REQUIRED top-level fields and checks
they are present in the actual served JSON.

Best-effort: only validates object types with a literal `{ ... }` body and
URLs whose params we can fill with known-good values. Reports:
  - MISSING: a required (non-optional) top-level field absent in the data
    (the crash vector).
  - extra data keys are NOT flagged (forward-compatible).

Run against prod by default; pass a base URL to override.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
import glob

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://lda-hsi.fasl-work.com"

# Known-good substitutions for URL params.
SUBST = {
    "sceneId": "indian-pines-corrected",
    "subsetCode": "GEOMET",
    "method": "beta_vae_16",
    "recipe": "V3",
    "scheme": "uniform",
    "q": "16",
}
# Endpoints needing params we can't reliably fill (maskId, query-string builders).
SKIP_TYPES = {
    "BandMaskSummary", "BandMaskHidsagSummary",  # need a valid maskId
    "VSweepBackbonesF7", "VSweepQTrajectory", "VSweepRecipeReport", "VSweepStatus",
    "SeedStability", "TopicStability",  # query-string built inline
    "unknown",
}


def _kind_of_annotation(ann: str) -> str:
    """Coarse kind of a TS annotation: 'array' | 'object' | 'scalar' | 'any'.
    'any' = a named type / union we cannot resolve -> skip the kind check."""
    a = ann.strip().rstrip(";").strip()
    # strip a trailing `| null` / `| undefined`
    a = re.sub(r"\s*\|\s*(null|undefined)\s*$", "", a).strip()
    if a.endswith("[]") or a.startswith("Array<") or a.startswith("readonly "):
        return "array"
    if a.startswith("{") or a.startswith("Record<") or a.startswith("Map<"):
        return "object"
    if a in ("string", "number", "boolean") or re.match(r'^["\d]', a):
        return "scalar"
    if "|" in a:  # union of literals/types — too ambiguous
        return "any"
    return "any"  # named type (HidsagBlock, etc.) — unresolved


def parse_required_fields(
    ts_src: str, type_name: str
) -> list[tuple[str, str]] | None:
    """Return [(field, kind)] for required (non-optional) top-level fields of
    `type X = {...}`. None if the type is not an object literal."""
    m = re.search(rf"export type {re.escape(type_name)}\s*=\s*", ts_src)
    if not m:
        return None
    i = ts_src.find("{", m.end())
    if i == -1 or ts_src[m.end():i].strip() not in ("", "{"):
        # e.g. `= number[]` or `= A | B`
        if "{" not in ts_src[m.end():m.end() + 3]:
            return None
    # walk braces to find the matching close
    depth = 0
    body_start = i
    j = i
    while j < len(ts_src):
        c = ts_src[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    body = ts_src[body_start + 1:j]
    # Char-walk the body so multi-line annotations (e.g. `f: {\n...\n}[]`) are
    # captured whole and their true kind (array vs object) is determined from
    # the full annotation, not just its first line.
    required: list[tuple[str, str]] = []
    k = 0
    n = len(body)
    while k < n:
        # match a field declaration at depth 0: `ident?:`
        fm = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)(\??)\s*:", body[k:])
        if not fm:
            k += 1
            continue
        field = fm.group(1)
        optional = fm.group(2) == "?"
        # capture the annotation until the matching `;` at depth 0
        ann_start = k + fm.end()
        depth = 0
        m = ann_start
        while m < n:
            c = body[m]
            if c in "{[<(":
                depth += 1
            elif c in "}])>":
                depth -= 1
            elif c == ";" and depth == 0:
                break
            m += 1
        ann = body[ann_start:m].strip()
        if not optional:
            required.append((field, _kind_of_annotation(ann)))
        k = m + 1
    return required


def resolve_url(template: str) -> str | None:
    # strip ${encodeURIComponent(x)} and ${x} -> SUBST[x]
    def repl(mo):
        inner = mo.group(1)
        km = re.search(r"([A-Za-z_]+)", inner)
        key = km.group(1) if km else ""
        if key in ("encodeURIComponent",):
            km2 = re.search(r"encodeURIComponent\(([A-Za-z_]+)\)", inner)
            key = km2.group(1) if km2 else ""
        return SUBST.get(key, "\x00")
    url = re.sub(r"\$\{([^}]*)\}", repl, template)
    if "\x00" in url or "${" in url:
        return None
    return url


def main() -> int:
    # 1) type -> url
    url_by_type: dict[str, str] = {}
    all_src = ""
    for fp in glob.glob("frontend/src/api/*.ts"):
        src = open(fp, encoding="utf-8").read()
        all_src += "\n" + src
        for mm in re.finditer(
            r"request<([A-Za-z0-9_]+)>\(\s*[`'\"]([^`'\"]+)[`'\"]", src
        ):
            url_by_type.setdefault(mm.group(1), mm.group(2))

    ok, skipped, problems = [], [], []
    for tname, template in sorted(url_by_type.items()):
        if tname in SKIP_TYPES:
            skipped.append((tname, "param-skip"))
            continue
        url = resolve_url(template)
        if url is None:
            skipped.append((tname, f"unresolved url: {template}"))
            continue
        required = parse_required_fields(all_src, tname)
        if required is None:
            skipped.append((tname, "non-object type (array/alias)"))
            continue
        try:
            with urllib.request.urlopen(BASE + url, timeout=30) as r:
                data = json.load(r)
        except Exception as e:
            problems.append((tname, url, f"FETCH FAILED: {e}"))
            continue
        if not isinstance(data, dict):
            skipped.append((tname, f"served {type(data).__name__}, not object"))
            continue
        missing = [f for (f, _k) in required if f not in data]
        # shape-kind mismatches (the HIDSAG class: present key, wrong shape)
        kind_mismatch = []
        for f, k in required:
            if f not in data or k == "any":
                continue
            v = data[f]
            actual = (
                "array" if isinstance(v, list)
                else "object" if isinstance(v, dict)
                else "null" if v is None
                else "scalar"
            )
            if actual == "null":
                continue  # nullable in practice
            if k != actual:
                kind_mismatch.append(f"{f}: type says {k}, data is {actual}")
        if missing:
            problems.append((tname, url, f"MISSING required fields: {missing}"))
        elif kind_mismatch:
            problems.append((tname, url, f"SHAPE mismatch: {kind_mismatch}"))
        else:
            ok.append(tname)

    print(f"=== validated {len(ok)} endpoints OK ===")
    for t in ok:
        print(f"  OK  {t}")
    print(f"\n=== {len(problems)} PROBLEMS ===")
    for t, u, m in problems:
        print(f"  !!  {t}\n      {u}\n      {m}")
    print(f"\n=== {len(skipped)} skipped (not validated) ===")
    for t, why in skipped:
        print(f"  --  {t}: {why}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
