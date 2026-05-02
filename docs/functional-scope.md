# Functional Scope

Repo-local statement of what the public web app must answer and what
it deliberately does not. The canonical extended description lives on
the wiki page
[Web App Workflow and GUI](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Web-App-Workflow-and-GUI).

## Product contract

The public web app is a **navigable scientific workspace**, not a
research dashboard, blog, or hero-first marketing site. It must
answer, in this order:

1. what is the project — Landing
2. what is the methodology — Overview
3. what data is available — Datasets
4. what can I actually do with it — Workspace
5. what is the comparison evidence — Benchmarks
6. how do I reproduce locally — Usage

It must **not** load 20 datasets and 12 charts at once on a single
flat surface.

## Six-tab top-level architecture

| Tab | Role | Static images allowed |
|---|---|---|
| 1. Landing | hypothesis, KPIs, CTAs, citation | hero illustration only |
| 2. Overview | methodology, theory, recipes, references | yes — only place |
| 3. Datasets | family selector + dataset cards + provenance | no |
| 4. Workspace | guided per-subset flow Data → Corpus → Topics → Comparison → Inference → Validation | no |
| 5. Benchmarks | cross-method / recipe / dataset comparison tables | no |
| 6. Usage | clone, fetch, build, smoke, link to wiki | no |

The persistent header carries: project title, theme toggle, language
toggle (EN / ES), GitHub link, paper link (A39 / HIDSAG), ORCID link.

## Workspace step contract

Workspace operates on one selected interactive subset at a time.
Sub-tabs:

| Step | Visible content | Only when |
|---|---|---|
| Data | preview / spectra / labels / measurements | always |
| Corpus | recipe builder + vocabulary + document length | always |
| Topics | φ_k, θ_d, stability metrics, topic map | corpus is set |
| Comparison | SLIC, KMeans, GMM, SAM, NMF, raw / PCA baselines | image / labelled |
| Inference | target selector, splits, baselines, routed metrics | labels or measurements exist |
| Validation | block status, caveats, sensitivity panels | always |

Each chart carries a method tag: feature space, spatial use,
supervision use, validation status.

## What the public app deliberately does not do

- Render a topic chart before alphabet, word and document are visible.
- Show inference for unlabelled / unmeasured datasets.
- Treat a coherent topic visualisation on a single seed as evidence.
- Mix datasets from different families on the same chart.
- Read `local_core_benchmarks.json` directly. Workspace consumes
  `/api/subset-cards/{id}` instead.

## What backs the rebuild

- `app/models/schemas.py` — typed payload contracts.
- `app/services/content.py` — LRU-cached loaders.
- `app/routers/content.py` — endpoint declarations.
- `data-pipeline/build_subset_cards.py` — extractor that turns the
  deep benchmark file into compact per-subset cards (the decoupling
  layer for the public Workspace).
- `data/manifests/interactive_subsets.json` — registry of public
  subsets with status, claims, validation block status, artifact
  pointers.

## Component split target

```
frontend/src/
├── App.tsx                        router + frame
├── routes/
│   ├── Landing.tsx
│   ├── Overview/                  subtab pages
│   ├── Datasets.tsx
│   ├── Workspace/                 subset-driven step views
│   ├── Benchmarks.tsx
│   └── Usage.tsx
├── components/
│   ├── chrome/                    Header, ThemeToggle, LanguageToggle
│   ├── plots/                     interactive SVG primitives
│   ├── cards/                     SectionCard, MethodTag, StatusBadge
│   └── primitives/                buttons, inputs, tabs
└── styles/
    ├── theme.css
    └── workspace.css
```

The current `App.tsx` is a 2096-line monolith from the previous
checkpoint. The rebuild moves it into the routes tree one tab at a
time, with each landing change behind its own pull request.

## Acceptance criteria

The rebuilt app is acceptable only if:

1. the first interactive view begins with family and evidence, not a
   mixed list
2. the user can inspect alphabet, word and document before any topic
   chart appears
3. inference appears only where supervision exists
4. validation is visible as a first-class step
5. compact publishable subsets are clearly distinguished from local-only
   scientific depth
6. every chart names the validation block(s) and method tags it
   depends on
7. dark / light and EN / ES survive the rebuild
8. the smoke tests pass on every endpoint that the visible UI consumes
