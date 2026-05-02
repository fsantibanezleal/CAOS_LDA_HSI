# `docs/` — repository-local technical documentation

This folder holds the **repo-local technical companion** to the public
wiki. It is shorter and more operational than the wiki: it is intended
to be read by contributors who already cloned the repo and need a
code-anchored reference, not by external readers approaching the
project for the first time.

The wiki is the canonical documentation surface. When in doubt, read
the wiki. When the repo state contradicts the wiki, fix the wiki.

## Reading order

| You want to | Read here | Read on the wiki |
|---|---|---|
| Understand the science | `theory.md` | [Scientific Thesis and Method](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Scientific-Thesis-and-Method), [Mathematical Background](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Mathematical-Background) |
| Understand the recipes | `spectral-tokenization.md` | [Corpus Construction and Spectral Wordification](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Corpus-Construction-and-Spectral-Wordification) |
| Understand the data layer | `datasets.md` | [Dataset Families and Sources](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Dataset-Families-and-Sources), [HIDSAG Family D Workflows](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/HIDSAG-Family-D-Workflows) |
| Understand the backend | `architecture.md` | [Backend Architecture and Payloads](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Backend-Architecture-and-Payloads) |
| Understand the validation | (no repo-local copy) | [Offline Validation and Benchmarks](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Offline-Validation-and-Benchmarks) |
| Understand the public app | `functional-scope.md` | [Web App Workflow and GUI](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Web-App-Workflow-and-GUI), [Public Interactive Subset Layer](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Public-Interactive-Subset-Layer) |
| Reproduce locally | `technical-roadmap.md`, root `README.md` | [Local Reproduction Guide](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Local-Reproduction-Guide) |
| Cite the project | `sources.md` | [References](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/References) |

## Files

| File | Purpose | Status |
|---|---|---|
| `theory.md` | Repo-local theoretical framework. Hypothesis, LDA mapping, spectral-to-text translation, recipe families, inference modes, current implementation gaps. | maintained |
| `spectral-tokenization.md` | Repo-local design notes for the tokeniser layer. Normalisation, quantisation, vocabulary families, document granularity, comparison experiments. | maintained |
| `datasets.md` | Repo-local snapshot of the dataset catalog. Family definitions, license discipline, public app constraints. | maintained |
| `architecture.md` | Repo-local map of FastAPI + React + data-pipeline. Endpoint inventory, deployment shape. | refreshed against the wiki |
| `functional-scope.md` | Repo-local statement of what the public app must answer and what it deliberately does not. | refreshed against the wiki |
| `technical-roadmap.md` | Repo-local phase map. Where the offline validation core stands today, what is next, and what the rebuild expects from each phase. | refreshed |
| `sources.md` | Repo-local bibliography. The wiki References page is the canonical extended version. | maintained |
| `product-reset-research.md` | Historical research memo from the early reset cycle. Kept for traceability — the active research memo is `research-memo-2026-05.md`. | frozen |
| `research-memo-2026-05.md` | Deep external research review (state of the art, planned representations, dataset inventory, decision tables). | new and active |

## Editing rules

- All technical artifacts are written in English.
- The web UI is the only bilingual surface.
- Strong claims require explicit caveats and validation.
- Compact public assets must remain traceable to a reproducible local
  workflow.
- When the wiki and a docs file disagree, fix both at once. The wiki
  is the canonical surface; the docs file is the repo-local companion.

## Where the legacy material lives

The original A39 paper, the proof-of-concept notebook, and the full
publication trail live under [`../legacy/`](../legacy/). Those files
are reference-only and not expected to evolve further.
