"""Citation audit via OpenAlex — issue #619.

Pulls 2024-2026 citations of the three foundational references:
- Egaña et al. 2020, *Minerals* 10:1139 (DOI 10.3390/min10121139)
- Ehrenfeld, Egaña, Santibáñez-Leal et al. 2023, *Scientific Data*
  10:164 (DOI 10.1038/s41597-023-02061-x)
- Santibáñez-Leal, Procemin 2022 (best-effort title search)

OpenAlex is a free index — no API key needed; rate limit is generous
but we cache results to disk.

Output: data/derived/v_sweep/citation_audit.json
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR  # noqa: E402

OUT_PATH = DERIVED_DIR / "v_sweep" / "citation_audit.json"

USER_AGENT = "CAOS-LDA-HSI/1.0 (mailto:fsantibanezleal@ug.uchile.cl)"

TARGETS = [
    {
        "label": "Egaña et al. 2020 Minerals",
        "doi": "10.3390/min10121139",
    },
    {
        "label": "Ehrenfeld et al. 2023 Sci Data (HIDSAG)",
        "doi": "10.1038/s41597-023-02061-x",
    },
    {
        "label": "Santibáñez-Leal Procemin 2022",
        "doi": None,
        "title_search": "Procemin LDA hyperspectral mineralogical 2022",
    },
]


def http_json(url: str) -> dict | None:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(req, timeout=20) as h:
            return json.loads(h.read().decode("utf-8"))
    except Exception as exc:
        print(f"  HTTP error for {url}: {exc}", flush=True)
        return None


def openalex_by_doi(doi: str) -> dict | None:
    url = f"https://api.openalex.org/works/doi:{doi}"
    return http_json(url)


def openalex_search(q: str) -> list[dict]:
    url = f"https://api.openalex.org/works?search={quote(q)}&per_page=5"
    data = http_json(url)
    return data.get("results", []) if data else []


def openalex_citations(work_id: str, year_min: int = 2024, year_max: int = 2026) -> list[dict]:
    """Use OpenAlex 'cited_by_api_url' but constrain by year."""
    cites = []
    cursor = "*"
    while cursor:
        url = (
            f"https://api.openalex.org/works"
            f"?filter=cites:{work_id},from_publication_date:{year_min}-01-01,"
            f"to_publication_date:{year_max}-12-31"
            f"&per_page=50&cursor={cursor}"
        )
        data = http_json(url)
        if not data:
            break
        results = data.get("results", [])
        for r in results:
            primary = r.get("primary_location") or {}
            source = primary.get("source") or {}
            cites.append({
                "id": r.get("id"),
                "doi": r.get("doi"),
                "title": r.get("title"),
                "year": r.get("publication_year"),
                "venue": source.get("display_name"),
                "type": r.get("type"),
                "cited_by_count": r.get("cited_by_count"),
            })
        cursor = data.get("meta", {}).get("next_cursor")
        if not cursor:
            break
        time.sleep(0.1)
    return cites


def main() -> int:
    report = {
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "audit_citation_openalex v0.1",
        "year_window": [2024, 2026],
        "targets": [],
    }

    for t in TARGETS:
        print(f"\n[citaudit] {t['label']}", flush=True)
        work = None
        if t.get("doi"):
            work = openalex_by_doi(t["doi"])
        if not work and t.get("title_search"):
            results = openalex_search(t["title_search"])
            work = results[0] if results else None
        if not work:
            print(f"  could not find work", flush=True)
            report["targets"].append({"label": t["label"], "found": False})
            continue
        work_id = work.get("id", "").rsplit("/", 1)[-1]
        print(
            f"  found {work.get('display_name', work.get('title', '?'))} "
            f"({work.get('publication_year')}) — work_id={work_id}",
            flush=True,
        )
        cites = openalex_citations(work_id)
        by_year: dict[int, int] = {}
        for c in cites:
            y = c.get("year")
            if y:
                by_year[y] = by_year.get(y, 0) + 1
        print(f"  {len(cites)} 2024-2026 citations:", flush=True)
        for y in sorted(by_year):
            print(f"    {y}: {by_year[y]}", flush=True)
        report["targets"].append({
            "label": t["label"],
            "found": True,
            "openalex_id": work_id,
            "doi": work.get("doi"),
            "openalex_cited_by_count_total": work.get("cited_by_count"),
            "publication_year": work.get("publication_year"),
            "venue": ((work.get("primary_location") or {}).get("source") or {}).get("display_name"),
            "citations_2024_2026_count": len(cites),
            "citations_per_year": by_year,
            "citations": cites,
        })
        time.sleep(0.2)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as h:
        json.dump(report, h, indent=2, ensure_ascii=False)
    print(f"\n[citaudit] wrote {OUT_PATH.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
