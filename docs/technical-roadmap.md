# Technical Roadmap

Repo-local phase map. The canonical detailed reset plan and pending
backlog live in `_CAOS_MANAGE/wip/caos-lda-hsi/`:

- [`product-reset-plan.md`](../../_CAOS_MANAGE/wip/caos-lda-hsi/product-reset-plan.md)
- [`offline-validation-plan.md`](../../_CAOS_MANAGE/wip/caos-lda-hsi/offline-validation-plan.md)
- [`web-app-projection-plan.md`](../../_CAOS_MANAGE/wip/caos-lda-hsi/web-app-projection-plan.md)
- [`local-environments-plan.md`](../../_CAOS_MANAGE/wip/caos-lda-hsi/local-environments-plan.md)
- [`pending.md`](../../_CAOS_MANAGE/wip/caos-lda-hsi/pending.md)

This file is a short repo-local snapshot for contributors who already
cloned the repo and need to know where to start.

## Where the project stands today

- **Methodology and documentation** — published. The wiki has been
  rebuilt with full mathematical depth, four-family taxonomy, recipe
  catalogue, validation framework, dataset inventory, and web app
  design baseline.
- **Legacy material** — anchored. The A39 paper, the proof-of-concept
  notebook, and the full citation trail are now informative reference
  material under `legacy/`.
- **Local pipeline** — solid. UPV/EHU scenes, Borsoi unmixing ROIs,
  USGS spectral library, MicaSense field samples, HIDSAG curated and
  region documents, preprocessing-sensitivity benchmark, SLIC baselines
  are all reproducible from `scripts/local.* fetch-all` +
  `scripts/local.* build-local-core`.
- **Backend** — typed and stable. All payloads served through Pydantic
  schemas. New endpoints `/api/subset-cards` and
  `/api/subset-cards/{subset_id}` decouple the frontend from the deep
  benchmarks file.
- **Frontend** — checkpoint. The shipped SPA is the rejected workbench
  layout from the previous cycle. The work branch has a
  `Context + Workspace` first attempt but the file is still a
  2096-line `App.tsx` monolith; it must be split into the six-tab
  architecture before the rebuild is mergeable to `main`.
- **Deployment** — frozen on the checkpoint until the frontend rebuild
  passes the acceptance criteria.

## Phase map

The phases below are aligned with `product-reset-plan.md`. Statuses
reflect repo state as of 2026-05-02.

| Phase | Topic | Status |
|---|---|---|
| 0 | Freeze and reset | done |
| 1 | Deep research and method review | done — see `docs/research-memo-2026-05.md` |
| 2 | Verified real data acquisition | done for Family A / B / C / D anchors |
| 3 | Representation and corpus experiments | partial — V1, V2, V3 active; V4–V8 planned |
| 4 | SLIC, clustering and baseline experiments | partial — SLIC, KMeans, GMM, SAM, NMF active |
| 5 | Model training on real data | partial — Family D HIDSAG benchmarks active |
| 6 | Publishable sample and model selection | partial — first 4 interactive subsets registered |
| 7 | Data taxonomy payload | done — `/api/data-families` + `/api/datasets` |
| 8 | Corpus recipe engine | partial — V1 / V2 / V3 implemented in static previews |
| 9 | Workflow UI rebuild | **next priority** — six-tab architecture decomposition |
| 10 | PTM/LDA and clustering comparison | partial — comparison metrics in benchmarks |
| 11 | Inference module | partial — Family D supervised metrics |
| 12 | Scientific validation layer | partial — eight of nine validation blocks have first-pass coverage |

## Next concrete steps

1. **Frontend rebuild step 1** — Header + Landing + theme/language
   scaffolding. Visible commit, smoke verification, no loss of
   functionality.
2. **Frontend rebuild step 2** — Overview tab (Concept, Theory,
   Representations, Methodology, References). Mostly content, easy
   acceptance test.
3. **Frontend rebuild step 3** — Datasets tab consuming
   `/api/data-families` and `/api/datasets`.
4. **Frontend rebuild step 4-6** — Workspace tab consuming
   `/api/subset-cards/{id}` (DataStep + CorpusStep, then TopicsStep +
   ComparisonStep, then InferenceStep + ValidationStep).
5. **Frontend rebuild step 7** — Benchmarks tab.
6. **Frontend rebuild step 8** — Usage tab.
7. **Source-aware HIDSAG bad-band masks** to replace the heuristic
   policy used today.
8. **Cross-scene transfer benchmark** (validation block 9).
9. **Absorption / shape token recipes** (V5 / V6) for serious
   mineral / clay analysis.
10. **ECOSTRESS reproducible compact export** to unblock a public
    Family A library beyond USGS.

## What is explicitly not on the roadmap

- Reusing the rejected chart system or previous theme.
- Production redeploy without the rebuilt frontend acceptance criteria.
- Mineral / class identification claims from topic alone without
  external evidence.
- New documentation surfaces beyond `docs/`, the wiki, and
  `_CAOS_MANAGE/wip/caos-lda-hsi/`.
