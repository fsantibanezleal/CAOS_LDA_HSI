/**
 * Single source of truth for Workspace ExploreTab ids, ordering,
 * keyboard nav order, and the 6-phase grouping rendered by
 * `ExploreNav` (cycle 132). Imported by `Workspace.tsx` (the route
 * component) and by all per-tab modules in `pages/workspace/tabs/*`.
 */

export type ExploreTab =
  | "raw"
  | "browser"
  | "topics"
  | "topiclabel"
  | "routed"
  | "raster"
  | "embed3d"
  | "repfit"
  | "compare3d"
  | "spatial"
  | "unmixing"
  | "interpret"
  | "recipes"
  | "supertopics"
  | "anomaly"
  | "neural"
  | "gating"
  | "llm"
  | "probe"
  | "robust"
  | "agreement"
  | "applydoc"
  | "qkexplore"
  | "bandmask"
  | "stability"
  | "deep"
  | "usgs"
  | "metrics";

/**
 * Order used by the `[` / `]` keyboard shortcuts to walk the entire
 * tab list. This is intentionally the *full* flat list — phase-aware
 * navigation lives in `EXPLORE_PHASES` below.
 */
export const EXPLORE_TAB_ORDER: ExploreTab[] = [
  "raw",
  "browser",
  "topics",
  "topiclabel",
  "routed",
  "interpret",
  "supertopics",
  "raster",
  "embed3d",
  "repfit",
  "compare3d",
  "spatial",
  "stability",
  "deep",
  "anomaly",
  "neural",
  "gating",
  "unmixing",
  "llm",
  "probe",
  "robust",
  "qkexplore",
  "bandmask",
  "agreement",
  "applydoc",
  "usgs",
  "metrics",
];

export type ExplorePhase = {
  id: "data" | "topics" | "geometry" | "drilldown" | "manipulate" | "stability";
  label: string;
  description: string;
  color: string;
  tabs: { id: ExploreTab; labelKey: string }[];
};

/**
 * Phase grouping rendered by `ExploreNav`. Replaces the cycle-14
 * 4-row × 28-button wall with a 6-phase narrative flow. Order matches
 * a normal HSI/LDA workflow: see the data → fit topics → place them
 * in space → drill into specifics → tweak the model → assess
 * stability. Total: 2 + 5 + 6 + 4 + 3 + 8 = 28 tabs.
 */
export const EXPLORE_PHASES: ExplorePhase[] = [
  {
    id: "data",
    label: "Data",
    description: "What does the spectra look like?",
    color: "rgba(56, 189, 248, 1)",
    tabs: [
      { id: "raw", labelKey: "raw" },
      { id: "browser", labelKey: "browser" },
    ],
  },
  {
    id: "topics",
    label: "Topics",
    description: "What does the topic model say?",
    color: "rgba(40, 160, 80, 1)",
    tabs: [
      { id: "topics", labelKey: "topics" },
      { id: "topiclabel", labelKey: "topiclabel" },
      { id: "routed", labelKey: "routed" },
      { id: "interpret", labelKey: "interpret" },
      { id: "supertopics", labelKey: "supertopics" },
    ],
  },
  {
    id: "geometry",
    label: "Geometry",
    description: "Where do topics live? 3D + spatial views.",
    color: "rgba(170, 60, 200, 1)",
    tabs: [
      { id: "raster", labelKey: "raster" },
      { id: "embed3d", labelKey: "embed3d" },
      { id: "repfit", labelKey: "repfit" },
      { id: "compare3d", labelKey: "compare3d" },
      { id: "spatial", labelKey: "spatial" },
      { id: "agreement", labelKey: "agreement" },
    ],
  },
  {
    id: "drilldown",
    label: "Drilldown",
    description: "Inspect specific docs, pixels, regions.",
    color: "rgba(214, 100, 60, 1)",
    tabs: [
      { id: "applydoc", labelKey: "applydoc" },
      { id: "unmixing", labelKey: "unmixing" },
      { id: "usgs", labelKey: "usgs" },
      { id: "anomaly", labelKey: "anomaly" },
    ],
  },
  {
    id: "manipulate",
    label: "Manipulate",
    description: "Step 8: tweak Q, K, band-mask.",
    color: "rgba(234, 179, 8, 1)",
    tabs: [
      { id: "recipes", labelKey: "recipes" },
      { id: "qkexplore", labelKey: "qkexplore" },
      { id: "bandmask", labelKey: "bandmask" },
    ],
  },
  {
    id: "stability",
    label: "Stability",
    description: "How trustworthy is the fit?",
    color: "rgba(244, 63, 94, 1)",
    tabs: [
      { id: "stability", labelKey: "stability" },
      { id: "deep", labelKey: "deep" },
      { id: "neural", labelKey: "neural" },
      { id: "gating", labelKey: "gating" },
      { id: "robust", labelKey: "robust" },
      { id: "probe", labelKey: "probe" },
      { id: "llm", labelKey: "llm" },
      { id: "metrics", labelKey: "metrics" },
    ],
  },
];

export function findPhaseFor(tab: ExploreTab): ExplorePhase {
  for (const ph of EXPLORE_PHASES) {
    if (ph.tabs.some((t) => t.id === tab)) return ph;
  }
  return EXPLORE_PHASES[0]!;
}

/**
 * Map each tab to the wiki page where its formal documentation lives.
 * Consumed by `TabFooter` to render the per-tab "read the math" link.
 */
export const TAB_WIKI_PAGE: Record<ExploreTab, string> = {
  raw: "Web-App-Workflow",
  browser: "Web-App-Workflow",
  topics: "Mathematical-Background",
  topiclabel: "Mathematical-Background",
  routed: "Multi-Axis-Addendum-B",
  raster: "Backend-Architecture",
  embed3d: "Backend-Architecture",
  repfit: "Multi-Axis-Addendum-B",
  compare3d: "Multi-Axis-Addendum-B",
  interpret: "Mathematical-Background",
  supertopics: "Corpus-Construction",
  unmixing: "Multi-Axis-Addendum-B",
  spatial: "Multi-Axis-Addendum-B",
  agreement: "Multi-Axis-Addendum-B",
  applydoc: "Multi-Axis-Addendum-B",
  recipes: "Corpus-Construction",
  qkexplore: "Mathematical-Background",
  bandmask: "Mathematical-Background",
  neural: "Mathematical-Background",
  gating: "Multi-Axis-Addendum-B",
  llm: "Multi-Axis-Addendum-B",
  probe: "Multi-Axis-Addendum-B",
  robust: "Multi-Axis-Addendum-B",
  stability: "Multi-Axis-Addendum-B",
  deep: "Mathematical-Background",
  anomaly: "Multi-Axis-Addendum-B",
  usgs: "Corpus-Construction",
  metrics: "Bayesian-Method-Comparison",
};

export const WIKI_BASE = "https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki";
export const REPO_BASE = "https://github.com/fsantibanezleal/CAOS_LDA_HSI";
