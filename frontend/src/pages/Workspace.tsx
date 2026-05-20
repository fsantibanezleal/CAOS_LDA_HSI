import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useMachine } from "@xstate/react";
import { useQuery } from "@tanstack/react-query";

import { api, type DatasetEntry } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import {
  DominantTopicRaster,
  type PickInfo,
} from "@/components/plots/DominantTopicRaster";
import { IntertopicMap, TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { TopicGraph } from "@/components/plots/TopicGraph";
import { SpectralBrowser } from "@/components/plots/SpectralBrowser";
import { TopicSpectrum } from "@/components/plots/TopicSpectrum";
import { TopicSpectrumComparison } from "@/components/plots/TopicSpectrumComparison";
import { workspaceMachine } from "@/state/workspaceMachine";
import type { DatasetFamily, RepresentationKind } from "@/state/useSelectionStore";
import { cn } from "@/lib/cn";

// Workspace tab registry + per-phase grouping + per-tab wiki map
// (cycle 133 modularisation of what used to be inlined in this file).
import {
  type ExploreTab,
  EXPLORE_TAB_ORDER,
  TAB_WIKI_PAGE,
  WIKI_BASE,
} from "./workspace/state/tabs";
import { ExploreNav } from "./workspace/components/ExploreNav";
import { TabEmpty, TabLoading } from "./workspace/components/TabStates";
import {
  RecentlyViewed,
  useTrackRecentScene,
} from "./workspace/components/RecentlyViewed";
import {
  type RoutedPrediction,
  computeRoutedPrediction,
} from "./workspace/helpers/routedPrediction";
// Tabs are lazy-loaded so the Workspace entry chunk does not ship
// their heavy dependencies (e.g. interactive plots in BandMaskTab,
// HIDSAG covariate machinery, recipe pickers) until the user
// actually navigates to that tab. Closes #441 P1 2.7 partial.
const BandMaskTab = lazy(() =>
  import("./workspace/tabs/BandMaskTab").then((m) => ({ default: m.BandMaskTab })),
);
const HidsagBandMaskTab = lazy(() =>
  import("./workspace/tabs/HidsagBandMaskTab").then((m) => ({
    default: m.HidsagBandMaskTab,
  })),
);
const ApplyToDocumentTab = lazy(() =>
  import("./workspace/tabs/ApplyToDocumentTab").then((m) => ({
    default: m.ApplyToDocumentTab,
  })),
);
const RecipesTab = lazy(() =>
  import("./workspace/tabs/RecipesTab").then((m) => ({ default: m.RecipesTab })),
);
const QKExploreTab = lazy(() =>
  import("./workspace/tabs/QKExploreTab").then((m) => ({ default: m.QKExploreTab })),
);
const LlmTeaLeavesTab = lazy(() =>
  import("./workspace/tabs/LlmTeaLeavesTab").then((m) => ({
    default: m.LlmTeaLeavesTab,
  })),
);
const LinearProbeTab = lazy(() =>
  import("./workspace/tabs/LinearProbeTab").then((m) => ({
    default: m.LinearProbeTab,
  })),
);
const AnomalyTab = lazy(() =>
  import("./workspace/tabs/AnomalyTab").then((m) => ({
    default: m.AnomalyTab,
  })),
);
const RobustnessTab = lazy(() =>
  import("./workspace/tabs/RobustnessTab").then((m) => ({
    default: m.RobustnessTab,
  })),
);
const SuperTopicsTab = lazy(() =>
  import("./workspace/tabs/SuperTopicsTab").then((m) => ({
    default: m.SuperTopicsTab,
  })),
);
const GatingTab = lazy(() =>
  import("./workspace/tabs/GatingTab").then((m) => ({
    default: m.GatingTab,
  })),
);
const SpatialStructureTab = lazy(() =>
  import("./workspace/tabs/SpatialStructureTab").then((m) => ({
    default: m.SpatialStructureTab,
  })),
);
const CrossMethodAgreementTab = lazy(() =>
  import("./workspace/tabs/CrossMethodAgreementTab").then((m) => ({
    default: m.CrossMethodAgreementTab,
  })),
);
const NeuralTopicComparisonTab = lazy(() =>
  import("./workspace/tabs/NeuralTopicComparisonTab").then((m) => ({
    default: m.NeuralTopicComparisonTab,
  })),
);
const InterpretabilityTab = lazy(() =>
  import("./workspace/tabs/InterpretabilityTab").then((m) => ({
    default: m.InterpretabilityTab,
  })),
);
const Compare3DTab = lazy(() =>
  import("./workspace/tabs/Compare3DTab").then((m) => ({
    default: m.Compare3DTab,
  })),
);
const DeepLatentsTab = lazy(() =>
  import("./workspace/tabs/DeepLatentsTab").then((m) => ({
    default: m.DeepLatentsTab,
  })),
);
const MetricsTab = lazy(() =>
  import("./workspace/tabs/MetricsTab").then((m) => ({
    default: m.MetricsTab,
  })),
);
const Embed3DTab = lazy(() =>
  import("./workspace/tabs/Embed3DTab").then((m) => ({
    default: m.Embed3DTab,
  })),
);
const StabilityTab = lazy(() =>
  import("./workspace/tabs/StabilityTab").then((m) => ({
    default: m.StabilityTab,
  })),
);
const UsgsTab = lazy(() =>
  import("./workspace/tabs/UsgsTab").then((m) => ({
    default: m.UsgsTab,
  })),
);
const RoutedTab = lazy(() =>
  import("./workspace/tabs/RoutedTab").then((m) => ({
    default: m.RoutedTab,
  })),
);
const RepresentationFitTab = lazy(() =>
  import("./workspace/tabs/RepresentationFitTab").then((m) => ({
    default: m.RepresentationFitTab,
  })),
);
const RawTab = lazy(() =>
  import("./workspace/tabs/RawTab").then((m) => ({
    default: m.RawTab,
  })),
);
const TopicLabelTab = lazy(() =>
  import("./workspace/tabs/TopicLabelTab").then((m) => ({
    default: m.TopicLabelTab,
  })),
);
import { UnmixingStat } from "./workspace/components/StatCard";
import { TOPIC_FAMILY_REPS } from "./workspace/topicFamilyReps";

const LABELLED_SCENES = new Set([
  "indian-pines-corrected",
  "salinas-corrected",
  "salinas-a-corrected",
  "pavia-university",
  "kennedy-space-center",
  "botswana",
]);

const HIDSAG_SUBSETS = new Set([
  "GEOMET",
  "MINERAL1",
  "MINERAL2",
  "GEOCHEM",
  "PORPHYRY",
  "hidsag-geomet",
  "hidsag-mineral1",
  "hidsag-mineral2",
  "hidsag-geochem",
  "hidsag-porphyry",
]);

function toHidsagSubsetCode(id: string): string {
  if (id.startsWith("hidsag-")) {
    return id.replace("hidsag-", "").toUpperCase();
  }
  return id.toUpperCase();
}

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  "labeled-spectral-image":
    "Hyperspectral cubes with per-pixel labels — the canonical UPV/EHU benchmarks. Natural starting point for classification.",
  "individual-spectra":
    "Individual spectra with material identity or reference (USGS splib07, MicaSense). No spatial geometry.",
  "hidsag-mineral":
    "HIDSAG subsets with per-sample geochemical and mineralogical measurements. Continuous targets, not classes.",
  "unmixing-roi":
    "Borsoi Samson / Jasper Ridge / Urban — scenes with endmembers and reference abundances for unmixing.",
  default:
    "Dataset family available for the lab workflow.",
};

const STEPS: { id: string; key: keyof Steps; label: string }[] = [
  { id: "family", key: "family", label: "Familia" },
  { id: "subset", key: "subset", label: "Conjunto" },
  { id: "representation", key: "representation", label: "Representation" },
  { id: "explore", key: "explore", label: "Explore"},
];

type Steps = {
  family: string;
  subset: string;
  representation: string;
  explore: string;
};

export default function Workspace() {
  const { t } = useTranslation(["pages", "common"]);
  const [state, send] = useMachine(workspaceMachine);
  const [searchParams, setSearchParams] = useSearchParams();
  const restoredRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory"],
    queryFn: api.inventory,
  });

  // Restore state from URL on first inventory load.
  // Supports two URL shapes:
  //   ?family=X&subset=Y&rep=Z   (canonical)
  //   ?scene=<subset>            (shortcut from Overview SceneCard links —
  //                               infers family from the inventory)
  // If `rep` is missing on a labelled scene, defaults to "lda" so the user
  // lands on Explore with the canonical topic basis pre-selected.
  useEffect(() => {
    if (restoredRef.current) return;
    if (!data) return;
    let fam = searchParams.get("family");
    let sub = searchParams.get("subset");
    const rp = searchParams.get("rep");
    const sceneShortcut = searchParams.get("scene");
    // ?scene= shortcut: look up the dataset entry and use its family_id
    if (!sub && sceneShortcut) {
      const ds = data.datasets.find((d) => d.id === sceneShortcut);
      if (ds) {
        sub = ds.id;
        fam = ds.family_id as DatasetFamily;
      }
    }
    if (fam) {
      send({ type: "PICK_FAMILY", family: fam as DatasetFamily });
      if (sub) {
        send({ type: "PICK_SUBSET", subset: sub });
        // Default rep to canonical LDA when none is supplied, so Explore
        // is reachable in one click from the scene shortcut.
        const resolvedRep = (rp ?? "lda") as RepresentationKind;
        send({ type: "PICK_REP", rep: resolvedRep });
      }
    }
    restoredRef.current = true;
  }, [data, searchParams, send]);

  // Mirror machine state to URL
  useEffect(() => {
    if (!restoredRef.current) return;
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string | null | undefined) => {
      if (v) next.set(k, v);
      else next.delete(k);
    };
    setOrDel("family", state.context.family);
    setOrDel("subset", state.context.subset);
    setOrDel("rep", state.context.rep);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.context.family, state.context.subset, state.context.rep]);

  const familyGroups = useMemo(() => {
    if (!data) return [] as { family_id: string; family_title: string; entries: DatasetEntry[] }[];
    const titleByFamily = new Map(
      data.family_views.map((f) => [f.family_id, f.family_title]),
    );
    const grouped = new Map<string, DatasetEntry[]>();
    for (const ds of data.datasets) {
      if (!grouped.has(ds.family_id)) grouped.set(ds.family_id, []);
      grouped.get(ds.family_id)!.push(ds);
    }
    return Array.from(grouped.entries()).map(([fid, entries]) => ({
      family_id: fid,
      family_title: titleByFamily.get(fid) ?? fid,
      entries,
    }));
  }, [data]);

  const currentStepIndex = (() => {
    if (state.matches("pickFamily")) return 0;
    if (state.matches("pickSubset")) return 1;
    if (state.matches("pickRep")) return 2;
    return 3;
  })();

  return (
    <PageShell
      title={t("pages:workspace.title")}
      lead={t("pages:workspace.lead")}
    >
      <Stepper currentIndex={currentStepIndex} state={state.value} ctx={state.context} />

      <div className="mt-8">
        {state.matches("pickFamily") && (
          <FamilyPickerStep
            isLoading={isLoading}
            error={error as Error | null}
            groups={familyGroups}
            onPick={(family) =>
              send({ type: "PICK_FAMILY", family: family as DatasetFamily })
            }
          />
        )}

        {state.matches("pickSubset") && (
          <SubsetPickerStep
            family={state.context.family}
            entries={
              familyGroups.find((g) => g.family_id === state.context.family)
                ?.entries ?? []
            }
            onBack={() => send({ type: "BACK" })}
            onPick={(subset) => send({ type: "PICK_SUBSET", subset })}
          />
        )}

        {state.matches("pickRep") && (
          <RepresentationPickerStep
            subsetId={state.context.subset}
            onBack={() => send({ type: "BACK" })}
            onPick={(rep) => send({ type: "PICK_REP", rep: rep as never })}
          />
        )}

        {state.matches("explore") && (
          <ExploreStep
            subsetId={state.context.subset}
            rep={state.context.rep}
            onBack={() => send({ type: "BACK" })}
            onSwitchScene={(s) => send({ type: "SWITCH_SUBSET", subset: s })}
          />
        )}
      </div>
    </PageShell>
  );
}


function SubsetPickerStep({
  family,
  entries,
  onBack,
  onPick,
}: {
  family: string | null;
  entries: DatasetEntry[];
  onBack: () => void;
  onPick: (subsetId: string) => void;
}) {
  if (!family) return null;

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 gap-3">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Subset in {family}
          </h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {entries.length} datasets in this family ·{" "}
            {entries.filter((e) => e.local_raw_available).length} with local raw
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          ← Change family
        </button>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {entries.map((d) => (
          <SubsetCard key={d.id} dataset={d} onPick={() => onPick(d.id)} />
        ))}
      </div>
    </section>
  );
}

type Representation = {
  id: string;
  family: "topic" | "compression" | "unmixing";
  label: string;
  short: string;
  description: string;
  status: "shipped" | "partial" | "preview";
};

const REPRESENTATIONS: Representation[] = [
  {
    id: "lda",
    family: "topic",
    label: "LDA — sklearn online",
    short: "Latent Dirichlet Allocation",
    description:
      "Online variational Bayes (sklearn). Canonical V1 band-frequency recipe, K=12 (or n_classes), priors α=0.45 / η=0.2. Default base for the Workspace.",
    status: "shipped",
  },
  {
    id: "lda_sparse",
    family: "topic",
    label: "LDA — sklearn sparse",
    short: "Sparse VB",
    description:
      "VB variant with sparse priors (α=0.05). Sparser topics but worse perplexity.",
    status: "shipped",
  },
  {
    id: "lda_tomo",
    family: "topic",
    label: "LDA — tomotopy (collapsed Gibbs)",
    short: "tomotopy_lda",
    description:
      "Canonical LDA via collapsed Gibbs in C++. Wins c_v on 4/6 scenes.",
    status: "shipped",
  },
  {
    id: "hdp",
    family: "topic",
    label: "HDP — tomotopy",
    short: "Hierarchical Dirichlet Process",
    description:
      "K is learned — the model decides how many active topics exist. Useful when K should not be fixed.",
    status: "shipped",
  },
  {
    id: "ctm",
    family: "topic",
    label: "CTM — tomotopy",
    short: "Correlated Topic Model",
    description:
      "Allows topic correlations via logistic-normal over θ. Slower but captures co-occurrences.",
    status: "shipped",
  },
  {
    id: "prodlda",
    family: "topic",
    label: "ProdLDA — Pyro",
    short: "Neural topic model",
    description:
      "Amortised encoder + multinomial decoder. Neural implementation, comparable to LDA Gibbs in NPMI.",
    status: "shipped",
  },
  {
    id: "nmf",
    family: "compression",
    label: "NMF",
    short: "Non-negative matrix factorisation",
    description:
      "Non-negative decomposition with β-divergence=KL. Canonical K-dim baseline against LDA.",
    status: "shipped",
  },
  {
    id: "pca",
    family: "compression",
    label: "PCA",
    short: "Principal components",
    description:
      "Linear L2-optimal compression. Wins reconstruction RMSE at every K (its only guaranteed title).",
    status: "shipped",
  },
  {
    id: "ae",
    family: "compression",
    label: "Dense autoencoder",
    short: "MLP AE",
    description:
      "Encoder → bottleneck K → decoder. Neural baseline at the same K.",
    status: "shipped",
  },
  {
    id: "endmember",
    family: "unmixing",
    label: "Endmembers (NFINDR + NNLS)",
    short: "Linear unmixing",
    description:
      "K endmembers via NFINDR (Winter 1999) + NNLS abundance with sum-to-one. Physical baseline against LDA.",
    status: "shipped",
  },
  {
    id: "ica",
    family: "compression",
    label: "ICA — FastICA",
    short: "Independent components",
    description:
      "Statistically independent components (FastICA). K=8. Complementary baseline to PCA in linear compression.",
    status: "shipped",
  },
  {
    id: "cae_1d",
    family: "compression",
    label: "CAE-1D · K=8",
    short: "Conv autoencoder 1D",
    description:
      "1D convolutional autoencoder over the spectrum. Conv1D encoder → bottleneck K=8 → decoder. GPU-trained.",
    status: "shipped",
  },
  {
    id: "cae_2d",
    family: "compression",
    label: "CAE-2D · K=8",
    short: "Conv autoencoder 2D anchor",
    description:
      "2D CAE over spatial-spectral patches. K=8 anchor. Captures spatial texture + spectral profile.",
    status: "shipped",
  },
  {
    id: "cae_3d",
    family: "compression",
    label: "CAE-3D anchor · K=8",
    short: "Conv autoencoder 3D anchor",
    description:
      "3D CAE over cubes (spatial × spectral). Anchor version (patch centre). K=8 GPU-trained.",
    status: "shipped",
  },
  {
    id: "cae_3d_full",
    family: "compression",
    label: "CAE-3D full · K=8",
    short: "Conv autoencoder 3D full-patch",
    description:
      "Full-patch variant of CAE-3D — every patch pixel contributes to the loss. K=8 GPU-trained.",
    status: "shipped",
  },
  {
    id: "beta_vae",
    family: "compression",
    label: "β-VAE · K=8",
    short: "Variational autoencoder",
    description:
      "VAE with β=2 regularising the KL divergence. Disentangled probabilistic latent. K=8 GPU-trained.",
    status: "shipped",
  },
];

function RepresentationPickerStep({
  subsetId,
  onBack,
  onPick,
}: {
  subsetId: string | null;
  onBack: () => void;
  onPick: (rep: string) => void;
}) {
  const families: { id: Representation["family"]; label: string; color: string; supports: string }[] = [
    { id: "topic", label: "Topic models", color: "rgba(40, 160, 80, 1)", supports: "Topics · TopicLabel · Routed · USGS · Embed3D · Stability · Interpret · SuperTopics · Spatial · Unmixing · Gating · Neural · LLM · Probe · Robust · Anomaly · Agreement" },
    { id: "compression", label: "K-dim compression baselines", color: "rgba(56, 189, 248, 1)", supports: "Representation fit (3D scatter + ARI/NMI/silhouette + fit metadata) · Compare 3D (multi-method)" },
    { id: "unmixing", label: "Physical baselines (unmixing)", color: "rgba(214, 140, 40, 1)", supports: "Unmixing tab (NFINDR + ATGP endmembers + topic×endmember cosine)" },
  ];

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 gap-3">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Representation for{" "}
            <span style={{ color: "var(--color-accent)" }}>{subsetId}</span>
          </h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Three families: topics (LDA and variants), K-dim compression
            baselines (PCA / NMF / AE / ICA / CAE-1D/2D/3D / β-VAE) and physical
            unmixing. They operate on the same doc-term matrix from the canonical
            V1 band-frequency recipe.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          ← Change subset
        </button>
      </header>

      <div className="space-y-8">
        {families.map((fam) => (
          <div key={fam.id}>
            <div className="flex items-baseline gap-3 mb-1">
              <h4
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: fam.color }}
              >
                {fam.label}
              </h4>
              <span className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
                {REPRESENTATIONS.filter((r) => r.family === fam.id).length} options
              </span>
            </div>
            <p className="text-[11.5px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
              Picking unlocks: {fam.supports}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {REPRESENTATIONS.filter((r) => r.family === fam.id).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r.id)}
                  className="text-left rounded-lg border p-4 transition-all hover:shadow-md"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-panel)",
                    boxShadow: "var(--color-shadow)",
                    color: "var(--color-fg)",
                  }}
                >
                  <header className="flex items-baseline justify-between gap-2 mb-1">
                    <h5 className="text-base font-semibold">{r.label}</h5>
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-mono"
                      style={{
                        backgroundColor: "var(--color-accent-soft)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {r.short}
                    </span>
                  </header>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    {r.description}
                  </p>
                  <div
                    className="mt-3 text-sm font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Precomputed fit available →
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ExploreTab + EXPLORE_TAB_ORDER + EXPLORE_PHASES + TAB_WIKI_PAGE +
// WIKI_BASE moved to ./workspace/state/tabs.ts (cycle 133). Imported
// at the top of this file.

const REPRESENTATION_ENDPOINT_METHOD: Record<string, string> = {
  pca: "pca_8",
  nmf: "nmf_8",
  ae: "dense_ae_8",
  ica: "ica_8",
  cae_1d: "cae_1d_8",
  cae_2d: "cae_2d_8",
  cae_3d: "cae_3d_8",
  cae_3d_full: "cae_3d_full_8",
  beta_vae: "beta_vae_8",
};
function repToApiMethod(rep: string | null): string | null {
  if (!rep) return null;
  return REPRESENTATION_ENDPOINT_METHOD[rep] ?? null;
}

function ExploreStep({
  subsetId,
  rep,
  onBack,
  onSwitchScene,
}: {
  subsetId: string | null;
  rep: string | null;
  onBack: () => void;
  onSwitchScene: (subset: string) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const isLabelled = subsetId !== null && LABELLED_SCENES.has(subsetId);
  const isHidsag = subsetId !== null && HIDSAG_SUBSETS.has(subsetId);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as ExploreTab | null;
  const urlTopic = searchParams.get("topic");
  // When the chosen representation is a topic model the user almost
  // always wants to see the topics first; only fall back to the EDA
  // tab when the representation is something else (PCA, NMF, deep
  // encoders) where there are no topic-side panels to land on.
  const defaultTab: ExploreTab = rep && TOPIC_FAMILY_REPS.has(rep)
    ? "topics"
    : "raw";
  const [tab, setTab] = useState<ExploreTab>(urlTab ?? defaultTab);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(
    urlTopic != null && /^\d+$/.test(urlTopic) ? Number(urlTopic) : null,
  );
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Track (scene, rep) in localStorage so RecentlyViewed can render
  // jump-back chips on subsequent visits.
  const recentHistory = useTrackRecentScene(subsetId, rep);

  // Reset selectedTopic + tab when the user switches scene or rep.
  // Topic IDs are not portable across scenes (topic 3 on Pavia U is
  // a different cluster than topic 3 on Indian Pines); a stale topic
  // selection produces confusing highlighting after a SWITCH_SUBSET.
  // Likewise, tab=interpret on a topic-model rep is meaningless after
  // the user switches to a PCA rep.
  const scopeKey = `${subsetId ?? ""}|${rep ?? ""}`;
  const prevScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeRef.current === scopeKey) return;
    prevScopeRef.current = scopeKey;
    setSelectedTopic(null);
    setTab(defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  // Mirror tab + selectedTopic to URL.
  // Don't write the default tab to the URL — keeps it short for the
  // common case ("?family=...&subset=...&rep=..." is enough; tab is
  // implicit until the user navigates away from the default).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (tab && tab !== defaultTab) next.set("tab", tab);
    else next.delete("tab");
    if (selectedTopic !== null) next.set("topic", String(selectedTopic));
    else next.delete("topic");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedTopic]);

  // Keyboard shortcuts: Esc=clear topic, [ ]=prev/next tab
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore if user is typing in an input/textarea/select or an element with contentEditable
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      if (e.key === "Escape") {
        if (showHelp) {
          e.preventDefault();
          setShowHelp(false);
        } else if (selectedTopic !== null) {
          e.preventDefault();
          setSelectedTopic(null);
        }
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "[" || e.key === "]") {
        const order = EXPLORE_TAB_ORDER;
        const idx = order.indexOf(tab);
        if (idx === -1) return;
        const next = e.key === "]" ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length;
        e.preventDefault();
        setTab(order[next] ?? "raw");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, selectedTopic, showHelp]);

  const eda = useQuery({
    queryKey: ["eda", subsetId],
    queryFn: () => api.edaPerScene(subsetId!),
    enabled: isLabelled && tab === "raw",
  });

  const topicViews = useQuery({
    queryKey: ["topic-views", subsetId],
    queryFn: () => api.topicViews(subsetId!),
    enabled: isLabelled && tab === "topics",
  });

  const topicToData = useQuery({
    queryKey: ["topic-to-data", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "topiclabel",
  });

  const routed = useQuery({
    queryKey: ["topic-routed", subsetId],
    queryFn: () => api.topicRoutedClassifier(subsetId!),
    enabled: isLabelled && tab === "routed",
  });

  const rasterMeta = useQuery({
    queryKey: ["raster-meta", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "raster",
  });

  const embed3d = useQuery({
    queryKey: ["embed3d", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "embed3d",
  });

  const browserMeta = useQuery({
    queryKey: ["browser-meta", subsetId],
    queryFn: () => api.spectralBrowserMeta(subsetId!),
    enabled: isLabelled && tab === "browser",
  });

  const stability = useQuery({
    queryKey: ["topic-stability", subsetId],
    queryFn: () => api.topicStability(subsetId!),
    enabled: isLabelled && tab === "stability",
  });

  const usgs = useQuery({
    queryKey: ["topic-to-usgs", subsetId],
    queryFn: () => api.topicToUsgsV7(subsetId!),
    enabled: isLabelled && tab === "usgs",
  });

  const rateDistortion = useQuery({
    queryKey: ["rate-distortion", subsetId],
    queryFn: () => api.rateDistortionCurve(subsetId!),
    enabled: isLabelled && tab === "metrics",
  });

  const mutualInfo = useQuery({
    queryKey: ["mutual-info", subsetId],
    queryFn: () => api.mutualInformation(subsetId!),
    enabled: isLabelled && tab === "metrics",
  });

  const apiMethod = repToApiMethod(rep);
  const repFit = useQuery({
    queryKey: ["rep-fit", subsetId, apiMethod],
    queryFn: () => api.representation(apiMethod!, subsetId!),
    enabled: isLabelled && tab === "repfit" && !!apiMethod,
  });

  const endmember = useQuery({
    queryKey: ["endmember", subsetId],
    queryFn: () => api.endmemberBaseline(subsetId!),
    enabled: isLabelled && tab === "unmixing",
  });
  const endmemberEda = useQuery({
    queryKey: ["eda", subsetId, "for-endmember"],
    queryFn: () => api.edaPerScene(subsetId!),
    enabled: isLabelled && tab === "unmixing",
  });

  const interpretTopics = useQuery({
    queryKey: ["interpret-topics", subsetId],
    queryFn: () => api.interpretabilityTopicCards(subsetId!),
    enabled: isLabelled && tab === "interpret",
  });
  const interpretBands = useQuery({
    queryKey: ["interpret-bands", subsetId],
    queryFn: () => api.interpretabilityBandCards(subsetId!),
    enabled: isLabelled && tab === "interpret",
  });
  const interpretDocs = useQuery({
    queryKey: ["interpret-docs", subsetId],
    queryFn: () => api.interpretabilityDocumentCards(subsetId!),
    enabled: isLabelled && tab === "interpret",
  });
  const superTopicsQ = useQuery({
    queryKey: ["super-topics"],
    queryFn: () => api.superTopics(),
    enabled: isLabelled && tab === "supertopics",
    staleTime: 60 * 60_000,
  });
  const wordifIndex = useQuery({
    queryKey: ["wordifications-index"],
    queryFn: () => api.wordificationsIndex(),
    enabled: isLabelled && tab === "recipes",
    staleTime: 30 * 60_000,
  });
  const ldaSweepQ = useQuery({
    queryKey: ["lda-sweep", subsetId],
    queryFn: () => api.ldaSweep(subsetId!),
    enabled: isLabelled && tab === "qkexplore",
    staleTime: 30 * 60_000,
  });
  const bandMaskIndexQ = useQuery({
    queryKey: ["band-masks-index"],
    queryFn: () => api.bandMasksIndex(),
    enabled: isLabelled && tab === "bandmask",
    staleTime: 30 * 60_000,
  });
  const bandMaskHidsagIndexQ = useQuery({
    queryKey: ["band-masks-hidsag-index"],
    queryFn: () => api.bandMasksHidsagIndex(),
    enabled: isHidsag && tab === "bandmask",
    staleTime: 30 * 60_000,
  });

  const topicAnomaly = useQuery({
    queryKey: ["topic-anomaly", subsetId],
    queryFn: () => api.topicAnomaly(subsetId!),
    enabled: isLabelled && tab === "anomaly",
  });
  const deepAnomaly = useQuery({
    queryKey: ["deep-anomaly", subsetId],
    queryFn: () => api.deepAnomaly(subsetId!),
    enabled: isLabelled && tab === "anomaly",
  });

  const llmTeaLeaves = useQuery({
    queryKey: ["llm-tea-leaves", subsetId],
    queryFn: () => api.llmTeaLeaves(subsetId!),
    enabled: isLabelled && tab === "llm",
  });
  const linearProbe = useQuery({
    queryKey: ["linear-probe", subsetId],
    queryFn: () => api.linearProbePanel(subsetId!),
    enabled: isLabelled && tab === "probe",
  });
  const neuralComp = useQuery({
    queryKey: ["neural-topic-comparison", subsetId],
    queryFn: () => api.neuralTopicComparison(subsetId!),
    enabled: isLabelled && tab === "neural",
  });
  const neuralSeed = useQuery({
    queryKey: ["neural-topic-seed-stability", subsetId],
    queryFn: () => api.neuralTopicSeedStability(subsetId!),
    enabled: isLabelled && tab === "neural",
  });
  const embedded = useQuery({
    queryKey: ["embedded-baseline", subsetId],
    queryFn: () => api.embeddedBaseline(subsetId!),
    enabled: isLabelled && tab === "gating",
  });
  const deepGate = useQuery({
    queryKey: ["topic-routed-deep-gate", subsetId],
    queryFn: () => api.topicRoutedDeepGate(subsetId!),
    enabled: isLabelled && tab === "gating",
  });

  const quantSens = useQuery({
    queryKey: ["quant-sens", subsetId],
    queryFn: () => api.quantizationSensitivity(subsetId!),
    enabled: isLabelled && tab === "robust",
  });
  const xsTransfer = useQuery({
    queryKey: ["xs-transfer"],
    queryFn: () => api.crossSceneTransfer(),
    enabled: isLabelled && tab === "robust",
    staleTime: 30 * 60_000,
  });

  const topicSpatial = useQuery({
    queryKey: ["topic-spatial-cont", subsetId],
    queryFn: () => api.topicSpatialContinuous(subsetId!),
    enabled: isLabelled && tab === "spatial",
  });
  const groupings = useQuery({
    queryKey: ["felzenszwalb", subsetId],
    queryFn: () => api.felzenszwalbGroupings(subsetId!),
    enabled: isLabelled && tab === "spatial",
  });
  const groupingsEda = useQuery({
    queryKey: ["eda", subsetId, "for-groupings"],
    queryFn: () => api.edaPerScene(subsetId!),
    enabled: isLabelled && tab === "spatial",
  });
  const topicSpatialFullQ = useQuery({
    queryKey: ["topic-spatial-full", subsetId],
    queryFn: () => api.topicSpatialFull(subsetId!),
    enabled: isLabelled && tab === "spatial",
  });

  const crossMethod = useQuery({
    queryKey: ["cross-method-agreement", subsetId],
    queryFn: () => api.crossMethodAgreement(subsetId!),
    enabled: isLabelled && tab === "agreement",
  });
  const narratives = useQuery({
    queryKey: ["narratives", subsetId],
    queryFn: () => api.methodNarratives(subsetId!),
    enabled: isLabelled && tab === "agreement",
  });

  const applyDocs = useQuery({
    queryKey: ["apply-doc-cards", subsetId],
    queryFn: () => api.interpretabilityDocumentCards(subsetId!),
    enabled: isLabelled && tab === "applydoc",
  });
  const applyTopicViews = useQuery({
    queryKey: ["apply-doc-views", subsetId],
    queryFn: () => api.topicViews(subsetId!),
    enabled: isLabelled && tab === "applydoc",
  });
  const applyTopicToData = useQuery({
    queryKey: ["apply-doc-tt", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "applydoc",
  });

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 gap-3">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Explore{" "}
            <span style={{ color: "var(--color-accent)" }}>{subsetId}</span>
            {rep && (
              <span
                className="ml-2 text-sm font-normal"
                style={{ color: "var(--color-fg-faint)" }}
              >
                · representation: {rep}
              </span>
            )}
          </h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            28 panels across raw data, topic model output, spatial geometry, and diagnostics.
            Loaded on demand — pick a tab below to fetch its dedicated backend artefact.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          ← Change representation
        </button>
      </header>

      {!isLabelled && !isHidsag && subsetId && (
        <DatasetOverviewExplorer subsetId={subsetId} />
      )}

      {isHidsag && !isLabelled && subsetId && (
        <HidsagExploreStep subsetCode={toHidsagSubsetCode(subsetId)} />
      )}

      {isLabelled && (
        <>
          <SceneQuickSwitch
            currentScene={subsetId!}
            onSwitch={(s) => onSwitchScene(s)}
          />
          <RecentlyViewed
            currentScene={subsetId}
            currentRep={rep}
            history={recentHistory}
          />
          <SceneBriefingHero subsetId={subsetId!} rep={rep} />

          <nav
            role="tablist"
            aria-label="Exploration panels"
            className="sticky top-14 z-30 -mx-6 px-6 py-3 mb-4 space-y-2 border-b"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "color-mix(in srgb, var(--color-bg) 94%, transparent)",
              backdropFilter: "blur(8px)",
            }}
          >
            <ExploreNav tab={tab} setTab={setTab} t={t} />
          </nav>

          {selectedTopic !== null && (
            <TopicContextStrip
              selectedTopic={selectedTopic}
              onClear={() => setSelectedTopic(null)}
              onJump={setTab}
              activeTab={tab}
            />
          )}

          {tab === "raw" && (
            <Suspense fallback={<TabLoading />}>
              <RawTab
                isLoading={eda.isLoading}
                error={eda.error as Error | null}
                data={eda.data ?? null}
                sceneId={subsetId}
              />
            </Suspense>
          )}
          {tab === "topics" && (
            <TopicsTab
              isLoading={topicViews.isLoading}
              error={topicViews.error as Error | null}
              data={topicViews.data ?? null}
              selectedTopic={selectedTopic}
              setSelectedTopic={setSelectedTopic}
            />
          )}
          {tab === "topiclabel" && (
            <Suspense fallback={<TabLoading />}>
              <TopicLabelTab
                isLoading={topicToData.isLoading}
                error={topicToData.error as Error | null}
                data={topicToData.data ?? null}
                selectedTopic={selectedTopic}
                setSelectedTopic={setSelectedTopic}
              />
            </Suspense>
          )}
          {tab === "routed" && (
            <Suspense fallback={<TabLoading />}>
              <RoutedTab
                isLoading={routed.isLoading}
                error={routed.error as Error | null}
                data={routed.data ?? null}
              />
            </Suspense>
          )}
          {tab === "raster" && (
            <RasterTab
              isLoading={rasterMeta.isLoading}
              error={rasterMeta.error as Error | null}
              meta={rasterMeta.data ?? null}
              selectedTopic={selectedTopic}
              setSelectedTopic={setSelectedTopic}
            />
          )}
          {tab === "embed3d" && (
            <Suspense fallback={<TabLoading />}>
              <Embed3DTab
                isLoading={embed3d.isLoading}
                error={embed3d.error as Error | null}
                data={embed3d.data ?? null}
                selectedTopic={selectedTopic}
                setSelectedTopic={setSelectedTopic}
              />
            </Suspense>
          )}
          {tab === "repfit" && (
            <Suspense fallback={<TabLoading />}>
              <RepresentationFitTab
                rep={rep}
                apiMethod={apiMethod}
                isLoading={repFit.isLoading}
                error={repFit.error as Error | null}
                data={repFit.data ?? null}
              />
            </Suspense>
          )}
          {tab === "compare3d" && isLabelled && (
            <Suspense fallback={<TabLoading />}>
              <Compare3DTab sceneId={subsetId!} />
            </Suspense>
          )}
          {tab === "unmixing" && (
            <UnmixingTab
              isLoading={endmember.isLoading || endmemberEda.isLoading}
              error={(endmember.error as Error | null) ?? (endmemberEda.error as Error | null)}
              data={endmember.data ?? null}
              eda={endmemberEda.data ?? null}
            />
          )}
          {tab === "interpret" && (
            <Suspense fallback={<TabLoading />}>
              <InterpretabilityTab
                isLoading={interpretTopics.isLoading || interpretBands.isLoading || interpretDocs.isLoading}
                error={(interpretTopics.error as Error | null) ?? (interpretBands.error as Error | null) ?? (interpretDocs.error as Error | null)}
                topics={interpretTopics.data ?? null}
                bands={interpretBands.data ?? null}
                docs={interpretDocs.data ?? null}
              />
            </Suspense>
          )}
          {tab === "recipes" && (
            <Suspense fallback={<TabLoading />}>
              <RecipesTab
                sceneId={subsetId!}
                isLoading={wordifIndex.isLoading}
                error={wordifIndex.error as Error | null}
                index={wordifIndex.data ?? null}
              />
            </Suspense>
          )}
          {tab === "supertopics" && (
            <Suspense fallback={<TabLoading />}>
              <SuperTopicsTab
                sceneId={subsetId!}
                isLoading={superTopicsQ.isLoading}
                error={superTopicsQ.error as Error | null}
                data={superTopicsQ.data ?? null}
              />
            </Suspense>
          )}
          {tab === "anomaly" && (
            <Suspense fallback={<TabLoading />}>
              <AnomalyTab
                isLoading={topicAnomaly.isLoading || deepAnomaly.isLoading}
                error={(topicAnomaly.error as Error | null) ?? (deepAnomaly.error as Error | null)}
                topic={topicAnomaly.data ?? null}
                deep={deepAnomaly.data ?? null}
              />
            </Suspense>
          )}
          {tab === "llm" && (
            <Suspense fallback={<TabLoading />}>
              <LlmTeaLeavesTab
                isLoading={llmTeaLeaves.isLoading}
                error={llmTeaLeaves.error as Error | null}
                data={llmTeaLeaves.data ?? null}
              />
            </Suspense>
          )}
          {tab === "probe" && (
            <Suspense fallback={<TabLoading />}>
              <LinearProbeTab
                isLoading={linearProbe.isLoading}
                error={linearProbe.error as Error | null}
                data={linearProbe.data ?? null}
              />
            </Suspense>
          )}
          {tab === "neural" && (
            <Suspense fallback={<TabLoading />}>
              <NeuralTopicComparisonTab
                isLoading={neuralComp.isLoading || neuralSeed.isLoading}
                error={(neuralComp.error as Error | null) ?? (neuralSeed.error as Error | null)}
                comparison={neuralComp.data ?? null}
                seedStability={neuralSeed.data ?? null}
              />
            </Suspense>
          )}
          {tab === "gating" && (
            <Suspense fallback={<TabLoading />}>
              <GatingTab
                isLoading={embedded.isLoading || deepGate.isLoading}
                error={(embedded.error as Error | null) ?? (deepGate.error as Error | null)}
                embedded={embedded.data ?? null}
                deepGate={deepGate.data ?? null}
              />
            </Suspense>
          )}
          {tab === "robust" && (
            <Suspense fallback={<TabLoading />}>
              <RobustnessTab
                sceneId={subsetId!}
                isLoading={quantSens.isLoading || xsTransfer.isLoading}
                error={(quantSens.error as Error | null) ?? (xsTransfer.error as Error | null)}
                quant={quantSens.data ?? null}
                transfer={xsTransfer.data ?? null}
              />
            </Suspense>
          )}
          {tab === "qkexplore" && (
            <Suspense fallback={<TabLoading />}>
              <QKExploreTab
                isLoading={ldaSweepQ.isLoading}
                error={ldaSweepQ.error as Error | null}
                sweep={ldaSweepQ.data ?? null}
              />
            </Suspense>
          )}
          {tab === "bandmask" && subsetId && isLabelled && (
            <Suspense fallback={<TabLoading />}>
              <BandMaskTab
                sceneId={subsetId}
                isLoading={bandMaskIndexQ.isLoading}
                error={bandMaskIndexQ.error as Error | null}
                index={bandMaskIndexQ.data ?? null}
              />
            </Suspense>
          )}
          {tab === "bandmask" && subsetId && isHidsag && (
            <Suspense fallback={<TabLoading />}>
              <HidsagBandMaskTab
                subsetCode={toHidsagSubsetCode(subsetId)}
                isLoading={bandMaskHidsagIndexQ.isLoading}
                error={bandMaskHidsagIndexQ.error as Error | null}
                index={bandMaskHidsagIndexQ.data ?? null}
              />
            </Suspense>
          )}
          {tab === "spatial" && (
            <Suspense fallback={<TabLoading />}>
              <SpatialStructureTab
                isLoading={topicSpatial.isLoading || groupings.isLoading || groupingsEda.isLoading || topicSpatialFullQ.isLoading}
                error={(topicSpatial.error as Error | null) ?? (groupings.error as Error | null)}
                spatial={topicSpatial.data ?? null}
                spatialFull={topicSpatialFullQ.data ?? null}
                groupings={groupings.data ?? null}
                eda={groupingsEda.data ?? null}
              />
            </Suspense>
          )}
          {tab === "agreement" && (
            <Suspense fallback={<TabLoading />}>
              <CrossMethodAgreementTab
                isLoading={crossMethod.isLoading || narratives.isLoading}
                error={(crossMethod.error as Error | null) ?? (narratives.error as Error | null)}
                agreement={crossMethod.data ?? null}
                narratives={narratives.data ?? null}
              />
            </Suspense>
          )}
          {tab === "applydoc" && (
            <Suspense fallback={<TabLoading />}>
              <ApplyToDocumentTab
                isLoading={applyDocs.isLoading || applyTopicViews.isLoading || applyTopicToData.isLoading}
                error={(applyDocs.error as Error | null) ?? (applyTopicViews.error as Error | null) ?? (applyTopicToData.error as Error | null)}
                docs={applyDocs.data ?? null}
                topicViews={applyTopicViews.data ?? null}
                topicToData={applyTopicToData.data ?? null}
                selectedTopic={selectedTopic}
                setSelectedTopic={setSelectedTopic}
              />
            </Suspense>
          )}
          {tab === "browser" && (
            <SpectralBrowserTab
              isLoading={browserMeta.isLoading}
              error={browserMeta.error as Error | null}
              meta={browserMeta.data ?? null}
            />
          )}
          {tab === "stability" && (
            <Suspense fallback={<TabLoading />}>
              <StabilityTab
                isLoading={stability.isLoading}
                error={stability.error as Error | null}
                data={stability.data ?? null}
                sceneId={subsetId!}
              />
            </Suspense>
          )}
          {tab === "deep" && (
            <Suspense fallback={<TabLoading />}>
              <DeepLatentsTab sceneId={subsetId!} />
            </Suspense>
          )}
          {tab === "usgs" && (
            <Suspense fallback={<TabLoading />}>
              <UsgsTab
                isLoading={usgs.isLoading}
                error={usgs.error as Error | null}
                data={usgs.data ?? null}
                selectedTopic={selectedTopic}
                setSelectedTopic={setSelectedTopic}
              />
            </Suspense>
          )}
          {tab === "metrics" && (
            <Suspense fallback={<TabLoading />}>
              <MetricsTab
                rateDist={rateDistortion.data ?? null}
                rateDistError={rateDistortion.error as Error | null}
                rateDistLoading={rateDistortion.isLoading}
                mi={mutualInfo.data ?? null}
                miError={mutualInfo.error as Error | null}
                miLoading={mutualInfo.isLoading}
              />
            </Suspense>
          )}

          <TabFooter tab={tab} />
        </>
      )}

      {isLabelled && (
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full w-10 h-10 border font-mono font-semibold text-[14px]"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            color: "var(--color-fg-faint)",
            boxShadow: "var(--color-shadow)",
          }}
          aria-label="Keyboard shortcuts help"
          title="Keyboard shortcuts (press ? to toggle)"
        >
          ?
        </button>
      )}

      {showHelp && (
        <KeyboardShortcutsOverlay onClose={() => setShowHelp(false)} />
      )}
    </section>
  );
}


const LAMBDA_VALUES = [0.0, 0.3, 0.5, 0.7, 1.0];

function TopicsTab({
  isLoading,
  error,
  data,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicViews | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const [lambda, setLambda] = useState<number>(0.5);
  const [simThreshold, setSimThreshold] = useState<number>(0.7);
  const [pairTopic, setPairTopic] = useState<number | null>(null);

  const topPairs = useMemo(() => {
    if (!data) return [];
    const dist = data.topic_distance_cosine;
    const K = dist.length;
    const out: { i: number; j: number; sim: number }[] = [];
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const sim = Math.max(0, Math.min(1, 1 - (dist[i]?.[j] ?? 1)));
        out.push({ i, j, sim });
      }
    }
    out.sort((a, b) => b.sim - a.sim);
    return out;
  }, [data]);

  if (isLoading)
    return <p style={{ color: "var(--color-fg-faint)" }}>Loading topics…</p>;
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load topic_views.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return <TabEmpty />;

  const lambdaKey = `lambda_${lambda.toFixed(1)}`;
  const topWords = data.top_words_per_topic[lambdaKey];
  const focused =
    selectedTopic !== null && topWords ? topWords[selectedTopic] : null;

  return (
    <div className="space-y-6">
      <LdaConfigBadge data={data} />
      <div className="grid lg:grid-cols-[480px_1fr] gap-5 items-start">
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <h4
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-fg)" }}
          >
            Mapa intertopic (LDAvis · JS-MDS 2D)
          </h4>
          <p
            className="text-sm mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            The bubble area is proportional to topic prevalence
            (mean θ sobre el corpus). Click en un bubble para enfocar.
          </p>
          <IntertopicMap
            coords={data.topic_intertopic_2d_js}
            prevalence={data.topic_prevalence}
            selectedTopic={selectedTopic}
            onSelect={(k) => setSelectedTopic(k === selectedTopic ? null : k)}
          />
        </div>

        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <header className="flex items-baseline justify-between mb-2 gap-3">
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Top-30 palabras —{" "}
              {selectedTopic !== null
                ? `topic ${selectedTopic + 1}`
                : "select a topic"}
            </h4>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ color: "var(--color-fg-faint)" }}
              >
                relevance λ
              </span>
              <select
                value={lambda}
                onChange={(e) => setLambda(parseFloat(e.target.value))}
                className="rounded-md border px-2 py-1 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-fg)",
                }}
              >
                {LAMBDA_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>
          </header>
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            relevance(w | k) = λ · log P(w | k) + (1 − λ) · log [ P(w | k) /
            P(w) ]. λ=1 ordena por probabilidad sin penalizar palabras
            comunes; λ=0 ordena por lift puro.
          </p>
          {focused ? (
            <ol
              className="grid grid-cols-2 gap-x-4 gap-y-1 list-decimal pl-5 text-[13px]"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {focused.slice(0, 24).map((w, i) => (
                <li key={i} className="font-mono">
                  {w.token}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: "var(--color-fg-faint)" }}>
              Select a topic in the left map.
            </p>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          Perfiles espectrales por topic (φ_k)
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          One curve per topic, same colour as the map bubble. When a topic is
          selected it is highlighted and the rest fade out.
        </p>
        <TopicSpectrum
          wavelengths={data.wavelengths_nm}
          bandProfiles={data.topic_band_profiles}
          selectedTopic={selectedTopic}
        />
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Selector de topics"
        >
          {data.topic_band_profiles.map((_, k) => {
            const isSel = selectedTopic === k;
            const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setSelectedTopic(isSel ? null : k)
                }
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel ? "var(--color-fg)" : "var(--color-fg-subtle)",
                }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                topic {k + 1}
                <span
                  className="text-[10.5px] ml-1 opacity-70"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ({(data.topic_prevalence[k] ?? 0).toFixed(2)})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          Comparación multi-topic con features físicas
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Pick up to four topics and compare their basis spectra side
          by side. Absorption / reflectance features (chlorophyll,
          red-edge, leaf-water, atmospheric water, cellulose, Al-OH /
          kaolinite, calcite) are annotated as dotted verticals so the
          physical interpretation can be read off the figure. A
          pairwise cosine-distance mini-table summarises how visually
          distinct the selected topics are.
        </p>
        {selectedTopic !== null ? (
          <TopicSpectrumComparison
            wavelengths={data.wavelengths_nm}
            bandProfiles={data.topic_band_profiles}
            topicPrevalence={data.topic_prevalence}
            topicDistanceCosine={data.topic_distance_cosine}
            initialSelection={[selectedTopic]}
          />
        ) : (
          <TopicSpectrumComparison
            wavelengths={data.wavelengths_nm}
            bandProfiles={data.topic_band_profiles}
            topicPrevalence={data.topic_prevalence}
            topicDistanceCosine={data.topic_distance_cosine}
          />
        )}
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="flex items-baseline justify-between gap-3 mb-2">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Topic↔topic similarity graph
          </h4>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--color-fg-faint)" }}
            >
              edge threshold
            </span>
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={simThreshold}
              onChange={(e) => setSimThreshold(parseFloat(e.target.value))}
              style={{ width: 120 }}
            />
            <span
              className="font-mono text-[12px]"
              style={{ color: "var(--color-fg)" }}
            >
              {simThreshold.toFixed(2)}
            </span>
          </div>
        </header>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Nodes at JS-MDS coordinates; an edge appears between every topic
          pair whose cosine similarity (1 − topic_distance_cosine) exceeds
          the threshold. Edge thickness encodes similarity, node area
          encodes prevalence. Click any node to select it.
        </p>
        <div className="grid lg:grid-cols-[1fr_220px] gap-5 items-start">
          <TopicGraph
            coords={data.topic_intertopic_2d_js}
            prevalence={data.topic_prevalence}
            distanceCosine={data.topic_distance_cosine}
            threshold={simThreshold}
            selectedTopic={selectedTopic}
            onSelect={(k) =>
              setSelectedTopic(k === selectedTopic ? null : k)
            }
          />
          <div
            className="rounded-md border p-3 text-[13px]"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <div
              className="text-[11px] uppercase tracking-wider mb-2"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Top similar pairs
            </div>
            <ul className="space-y-1.5">
              {topPairs.slice(0, 6).map((p) => {
                const ciA =
                  TOPIC_COLORS[p.i % TOPIC_COLORS.length] ?? "#0ea5e9";
                const ciB =
                  TOPIC_COLORS[p.j % TOPIC_COLORS.length] ?? "#0ea5e9";
                return (
                  <li
                    key={`${p.i}-${p.j}`}
                    className="flex items-center gap-2"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: ciA }}
                    />
                    <span className="font-mono">t{p.i + 1}</span>
                    <span style={{ color: "var(--color-fg-faint)" }}>
                      ↔
                    </span>
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: ciB }}
                    />
                    <span className="font-mono">t{p.j + 1}</span>
                    <span
                      className="ml-auto font-mono"
                      style={{
                        color:
                          p.sim >= simThreshold
                            ? "var(--color-fg)"
                            : "var(--color-fg-faint)",
                      }}
                    >
                      {p.sim.toFixed(3)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p
              className="text-[11px] mt-2"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Pairs above the threshold render an edge in the graph.
            </p>
          </div>
        </div>
      </div>

      {data.topic_pair_log_odds && selectedTopic !== null && (
        <div
          className="rounded-lg border p-5"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <header className="flex items-baseline justify-between gap-3 mb-2">
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Distinguishing words — topic {selectedTopic + 1} vs ___
            </h4>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ color: "var(--color-fg-faint)" }}
              >
                pair with
              </span>
              <select
                value={pairTopic ?? ""}
                onChange={(e) =>
                  setPairTopic(e.target.value === "" ? null : Number(e.target.value))
                }
                className="rounded-md border px-2 py-1 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-fg)",
                }}
              >
                <option value="">— pick a 2nd topic —</option>
                {Array.from({ length: data.topic_count }, (_, k) => k)
                  .filter((k) => k !== selectedTopic)
                  .map((k) => (
                    <option key={k} value={k}>
                      topic {k + 1}
                    </option>
                  ))}
              </select>
            </div>
          </header>
          <p
            className="text-sm mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Tokens ranked by log-odds = log(P(w | k<sub>A</sub>) / P(w | k<sub>B</sub>)).
            Left column = words more characteristic of topic {selectedTopic + 1}; right
            column = words more characteristic of the paired topic. Pre-computed by
            <span className="font-mono"> build_topic_views.py</span>; no API call.
          </p>
          {pairTopic === null ? (
            <p
              className="text-[12px]"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Pick a second topic above to populate this panel.
            </p>
          ) : (
            <DistinguishingWordsGrid
              data={data.topic_pair_log_odds}
              a={selectedTopic}
              b={pairTopic}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LdaConfigBadge({
  data,
}: {
  data: import("@/api/client").TopicViews;
}) {
  const [open, setOpen] = useState(false);
  const cfg = data.lda_config;
  const pp = data.perplexity;
  if (!cfg && pp === undefined) return null;
  const items: { label: string; value: string }[] = [];
  if (cfg) {
    items.push(
      { label: "fit", value: cfg.method },
      { label: "K", value: String(data.topic_count) },
      { label: "α", value: cfg.doc_topic_prior.toFixed(2) },
      { label: "η", value: cfg.topic_word_prior.toFixed(2) },
      { label: "max_iter", value: String(cfg.max_iter) },
      { label: "seed", value: String(cfg.random_state) },
      { label: "samples/class", value: String(cfg.samples_per_class) },
    );
  }
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-fg-subtle)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {items.map((it, i) => (
          <span key={i} className="font-mono">
            <span style={{ color: "var(--color-fg-faint)" }}>
              {it.label}=
            </span>
            <span style={{ color: "var(--color-fg)" }}>{it.value}</span>
          </span>
        ))}
        {pp !== undefined && (
          <span className="font-mono ml-auto">
            <span style={{ color: "var(--color-fg-faint)" }}>
              held-out perplexity{" "}
            </span>
            <span style={{ color: "var(--color-accent)" }}>
              {pp.toFixed(3)}
            </span>
          </span>
        )}
        {cfg && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] underline"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {open ? "fewer" : "more"}
          </button>
        )}
      </div>
      {open && cfg && (
        <div
          className="mt-1.5 pt-1.5 font-mono text-[11.5px]"
          style={{
            borderTop: "1px dashed var(--color-border)",
            color: "var(--color-fg-faint)",
          }}
        >
          wordification ={" "}
          <span style={{ color: "var(--color-fg)" }}>
            {cfg.wordification}
          </span>
          {"  ·  "}
          quantization_scale ={" "}
          <span style={{ color: "var(--color-fg)" }}>
            {cfg.quantization_scale}
          </span>
        </div>
      )}
    </div>
  );
}

function DistinguishingWordsGrid({
  data,
  a,
  b,
}: {
  data: Record<string, import("@/api/client").TopicPairLogOddsToken[]>;
  a: number;
  b: number;
}) {
  const aOverB = data[`${a}->${b}`] ?? [];
  const bOverA = data[`${b}->${a}`] ?? [];
  if (aOverB.length === 0 && bOverA.length === 0) {
    return (
      <p
        className="text-[12px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        No log-odds shipped for this scene (older topic_views artefact).
      </p>
    );
  }
  const maxAbs = Math.max(
    ...aOverB.map((t) => Math.abs(t.log_odds)),
    ...bOverA.map((t) => Math.abs(t.log_odds)),
    1e-6,
  );
  return (
    <div className="grid sm:grid-cols-2 gap-5">
      <DistinguishingWordsColumn
        title={`top ↑ in topic ${a + 1}`}
        tokens={aOverB.slice(0, 12)}
        maxAbs={maxAbs}
        ratioLabel={(t) =>
          `P(${a + 1})=${(t.p_in_i * 100).toFixed(3)}% · P(${b + 1})=${(t.p_in_j * 100).toFixed(3)}%`
        }
      />
      <DistinguishingWordsColumn
        title={`top ↑ in topic ${b + 1}`}
        tokens={bOverA.slice(0, 12)}
        maxAbs={maxAbs}
        ratioLabel={(t) =>
          `P(${b + 1})=${(t.p_in_i * 100).toFixed(3)}% · P(${a + 1})=${(t.p_in_j * 100).toFixed(3)}%`
        }
      />
    </div>
  );
}

function DistinguishingWordsColumn({
  title,
  tokens,
  maxAbs,
  ratioLabel,
}: {
  title: string;
  tokens: import("@/api/client").TopicPairLogOddsToken[];
  maxAbs: number;
  ratioLabel: (t: import("@/api/client").TopicPairLogOddsToken) => string;
}) {
  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {title}
      </div>
      {tokens.length === 0 ? (
        <p
          className="text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          No tokens above significance threshold.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tokens.map((t) => {
            const w = Math.min(100, (Math.abs(t.log_odds) / maxAbs) * 100);
            return (
              <li
                key={t.token}
                className="grid grid-cols-[80px_1fr_auto] gap-2 items-center text-[12px]"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                <span
                  className="font-mono truncate"
                  title={t.token}
                  style={{ color: "var(--color-fg)" }}
                >
                  {t.token}
                </span>
                <div
                  className="h-2 rounded-sm relative"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                  }}
                  title={ratioLabel(t)}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${w}%`,
                      backgroundColor: "var(--color-accent)",
                      opacity: 0.85,
                    }}
                  />
                </div>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  {t.log_odds.toFixed(2)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}




function RasterTab({
  isLoading,
  error,
  meta,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  meta: import("@/api/client").TopicToData | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const [pick, setPick] = useState<PickInfo | null>(null);
  const [compareTopic, setCompareTopic] = useState<number | null>(null);

  // Derive served path from the JSON metadata. The pipeline writes a
  // companion .bin in data/derived/topic_to_data/ so the frontend can
  // request it via /generated/topic_to_data/<scene>_dominant_topic_map.bin.
  const buf = useQuery({
    queryKey: ["raster-bin", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/topic_to_data/${meta!.scene_id}_dominant_topic_map.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null,
    retry: false,
  });

  // Cycle 121 per-pixel theta sidecar. Loaded **only when the user
  // first clicks a pixel** so users who never click pay zero bandwidth.
  // Sizes range from 168 KB (Salinas-A) to 18 MB (Botswana); the fetch
  // is a single round-trip per scene per session, cached for 30 min.
  // (Cycle 131: gate on pick !== null instead of mount-time so the
  // bandwidth bill is opt-in.)
  const thetaGrid = useQuery({
    queryKey: ["theta-grid", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/topic_to_data/${meta!.scene_id}_theta_grid.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null && !!meta?.theta_grid && pick !== null,
    retry: false,
    staleTime: 30 * 60_000,
  });

  const overlapStats = useMemo(() => {
    if (!buf.data || !meta) return null;
    if (selectedTopic === null || compareTopic === null) return null;
    if (selectedTopic === compareTopic) return null;
    const grid = new Uint8Array(buf.data);
    const [h, w] = meta.spatial_shape;
    const SENT = 255;
    let countA = 0;
    let countB = 0;
    let labelled = 0;
    let adjacent = 0;
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i]!;
      if (t === SENT || t >= meta.topic_count) continue;
      labelled++;
      if (t === selectedTopic) countA++;
      else if (t === compareTopic) countB++;
    }
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const t = grid[r * w + c]!;
        if (t !== selectedTopic) continue;
        if (c + 1 < w) {
          const tr = grid[r * w + c + 1]!;
          if (tr === compareTopic) adjacent++;
        }
        if (r + 1 < h) {
          const td = grid[(r + 1) * w + c]!;
          if (td === compareTopic) adjacent++;
        }
        if (c > 0) {
          const tl = grid[r * w + c - 1]!;
          if (tl === compareTopic) adjacent++;
        }
        if (r > 0) {
          const tu = grid[(r - 1) * w + c]!;
          if (tu === compareTopic) adjacent++;
        }
      }
    }
    return { countA, countB, labelled, adjacent };
  }, [buf.data, meta, selectedTopic, compareTopic]);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Loading raster metadata…</p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load topic_to_data.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!meta) return null;

  const labels =
    selectedTopic !== null
      ? meta.p_label_given_topic_dominant[selectedTopic]
      : null;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Mapa espacial — topic dominante por pixel
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cada pixel labelled se coloured por su topic dominante
            (arg-max θ_d). Mueve el cursor sobre el raster para inspeccionar
            row/col + topic; click para fijar la lectura. Select un
            topic abajo para aislar su huella espacial.
          </p>
        </header>

        <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
          {buf.isLoading && (
            <p style={{ color: "var(--color-fg-faint)" }}>
              Descargando raster ({meta.spatial_shape[0]}×
              {meta.spatial_shape[1]} pixels)…
            </p>
          )}
          {buf.error && (
            <p style={{ color: "var(--color-warn)" }}>
              Could not load the raster: {String(buf.error)}
            </p>
          )}
          {buf.data && (
            <DominantTopicRaster
              buffer={buf.data}
              shape={meta.spatial_shape}
              sentinelUnlabelled={255}
              topicCount={meta.topic_count}
              selectedTopic={selectedTopic}
              compareTopic={compareTopic}
              onPick={(p) => setPick(p)}
            />
          )}

          <div className="space-y-3">
            <div
              className="rounded-md border p-3 text-[13px] leading-relaxed"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg-subtle)",
              }}
            >
              <div
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Pinned pixel
              </div>
              {pick ? (
                <div className="font-mono">
                  ({pick.row}, {pick.col}) → topic{" "}
                  {pick.topic === null ? "—" : pick.topic + 1}
                </div>
              ) : (
                <span style={{ color: "var(--color-fg-faint)" }}>
                  Click any pixel on the raster.
                </span>
              )}
            </div>

            {pick && meta.theta_grid && (
              <PixelDetailCard
                pick={pick}
                meta={meta}
                thetaGridBuffer={thetaGrid.data ?? null}
                isLoading={thetaGrid.isLoading}
                onSelectTopic={(k) =>
                  setSelectedTopic(k === selectedTopic ? null : k)
                }
              />
            )}

            <div>
              <div
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {t("pages:workspace.raster_isolate_topic")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedTopic(null)}
                  className="rounded-md border px-2.5 py-1 text-[12px]"
                  style={{
                    borderColor:
                      selectedTopic === null
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                    backgroundColor:
                      selectedTopic === null
                        ? "var(--color-accent-soft)"
                        : "var(--color-panel)",
                    color:
                      selectedTopic === null
                        ? "var(--color-accent)"
                        : "var(--color-fg-subtle)",
                  }}
                >
                  Todos
                </button>
                {Array.from({ length: meta.topic_count }, (_, k) => {
                  const isSel = selectedTopic === k;
                  const color =
                    TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setSelectedTopic(isSel ? null : k)
                      }
                      className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                      style={{
                        borderColor: isSel
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                        backgroundColor: isSel
                          ? "var(--color-accent-soft)"
                          : "var(--color-panel)",
                        color: isSel
                          ? "var(--color-fg)"
                          : "var(--color-fg-subtle)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      topic {k + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedTopic !== null && (
              <div>
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Compare with
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCompareTopic(null)}
                    className="rounded-md border px-2.5 py-1 text-[12px]"
                    style={{
                      borderColor:
                        compareTopic === null
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                      backgroundColor:
                        compareTopic === null
                          ? "var(--color-accent-soft)"
                          : "var(--color-panel)",
                      color:
                        compareTopic === null
                          ? "var(--color-accent)"
                          : "var(--color-fg-subtle)",
                    }}
                  >
                    none
                  </button>
                  {Array.from({ length: meta.topic_count }, (_, k) => {
                    const isCmp = compareTopic === k;
                    const isPrimary = selectedTopic === k;
                    const color =
                      TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={isPrimary}
                        onClick={() =>
                          setCompareTopic(isCmp ? null : k)
                        }
                        className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                        style={{
                          borderColor: isCmp
                            ? "var(--color-accent)"
                            : "var(--color-border)",
                          backgroundColor: isCmp
                            ? "var(--color-accent-soft)"
                            : "var(--color-panel)",
                          color: isPrimary
                            ? "var(--color-fg-faint)"
                            : isCmp
                              ? "var(--color-fg)"
                              : "var(--color-fg-subtle)",
                          opacity: isPrimary ? 0.4 : 1,
                          cursor: isPrimary ? "not-allowed" : "pointer",
                        }}
                      >
                        <span
                          aria-hidden
                          className="inline-block w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        topic {k + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {overlapStats && selectedTopic !== null && compareTopic !== null && (
              <div
                className="rounded-md border p-3 text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Pairwise overlap — topic {selectedTopic + 1} vs topic{" "}
                  {compareTopic + 1}
                </div>
                <ul className="space-y-1.5">
                  <li
                    className="flex items-center gap-2"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{
                        backgroundColor:
                          TOPIC_COLORS[
                            selectedTopic % TOPIC_COLORS.length
                          ] ?? "#0ea5e9",
                      }}
                    />
                    <span className="flex-1">
                      topic {selectedTopic + 1} dominant
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {overlapStats.countA}{" "}
                      <span
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        (
                        {overlapStats.labelled > 0
                          ? (
                              (overlapStats.countA /
                                overlapStats.labelled) *
                              100
                            ).toFixed(1)
                          : "0.0"}
                        %)
                      </span>
                    </span>
                  </li>
                  <li
                    className="flex items-center gap-2"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{
                        backgroundColor:
                          TOPIC_COLORS[
                            compareTopic % TOPIC_COLORS.length
                          ] ?? "#0ea5e9",
                      }}
                    />
                    <span className="flex-1">
                      topic {compareTopic + 1} dominant
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {overlapStats.countB}{" "}
                      <span
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        (
                        {overlapStats.labelled > 0
                          ? (
                              (overlapStats.countB /
                                overlapStats.labelled) *
                              100
                            ).toFixed(1)
                          : "0.0"}
                        %)
                      </span>
                    </span>
                  </li>
                  <li
                    className="flex items-center gap-2 pt-1.5"
                    style={{
                      color: "var(--color-fg-subtle)",
                      borderTop: "1px dashed var(--color-border)",
                    }}
                  >
                    <span className="flex-1">
                      4-neighbor adjacency
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {overlapStats.adjacent}
                    </span>
                  </li>
                </ul>
                <p
                  className="text-[11px] mt-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Adjacency proxies spatial confusability. Higher = topics
                  share long borders.
                </p>
              </div>
            )}

            {labels && (
              <div
                className="rounded-md border p-3 text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Label mixture — topic {selectedTopic! + 1}
                </div>
                <ul className="space-y-1">
                  {[...labels]
                    .sort((a, b) => b.p - a.p)
                    .slice(0, 5)
                    .map((l) => (
                      <li
                        key={l.label_id}
                        className="flex items-center gap-2"
                        style={{ color: "var(--color-fg-subtle)" }}
                      >
                        <span
                          aria-hidden
                          className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="flex-1 truncate">{l.name}</span>
                        <span
                          className="font-mono"
                          style={{ color: "var(--color-fg)" }}
                        >
                          {(l.p * 100).toFixed(1)}%
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {selectedTopic !== null &&
          meta.top_documents_per_topic &&
          meta.top_documents_per_topic[selectedTopic] && (
            <TopDocumentsPreview
              topic={selectedTopic}
              docs={meta.top_documents_per_topic[selectedTopic]!}
              labels={
                meta.p_label_given_topic_dominant[selectedTopic] ?? []
              }
              perTopicLabel={meta.p_label_given_topic_dominant}
            />
          )}
      </div>
    </div>
  );
}

// RoutedPrediction + computeRoutedPrediction moved to
// ./workspace/helpers/routedPrediction.ts (cycle 133). Re-export the
// type name as an alias so the existing usages here compile unchanged.

function TopDocumentsPreview({
  topic,
  docs,
  labels,
  perTopicLabel,
}: {
  topic: number;
  docs: import("@/api/client").TopDocumentForTopic[];
  labels: import("@/api/client").LabelCell[];
  perTopicLabel: import("@/api/client").LabelCell[][];
}) {
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  if (docs.length === 0) return null;
  const labelColor = (id: number) =>
    labels.find((l) => l.label_id === id)?.color ?? "var(--color-fg-faint)";
  const top = docs.slice(0, 8);
  const openDoc = openDocId ? top.find((d) => d.doc_id === openDocId) : null;
  return (
    <div
      className="mt-5 rounded-md border p-3 text-[12.5px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Top documents — topic {topic + 1}
      </div>
      <p
        className="text-[11.5px] mb-2 leading-snug"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Documents (labelled pixels) ranked by θ at this topic.
        Click a row to see the per-doc topic-routed-soft prediction
        (computed as <span className="font-mono">Σ θ_d[k]·P(L|k)</span>
        with no extra fetch). Δ badge = top-1 prediction disagrees with
        ground truth.
      </p>
      <ul className="space-y-1.5">
        {top.map((d) => {
          const w = Math.min(100, d.theta_k * 100);
          const pred = computeRoutedPrediction(d.theta_full, perTopicLabel);
          const sortedPred = [...pred].sort((a, b) => b.p - a.p);
          const top1 = sortedPred[0];
          const disagree =
            top1 !== undefined && top1.label_id !== d.label_id && top1.p > 0;
          const isOpen = openDocId === d.doc_id;
          return (
            <li key={d.doc_id} className="space-y-1">
              <button
                type="button"
                onClick={() => setOpenDocId(isOpen ? null : d.doc_id)}
                className="w-full grid grid-cols-[110px_1fr_auto_18px] gap-2 items-center text-left"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                <span
                  className="font-mono text-[11.5px]"
                  style={{ color: "var(--color-fg)" }}
                  title={d.doc_id}
                >
                  ({d.xy[0]}, {d.xy[1]})
                </span>
                <div
                  className="h-2 rounded-sm relative"
                  style={{
                    backgroundColor: "var(--color-panel)",
                    border: "1px solid var(--color-border)",
                  }}
                  title={`θ at topic ${topic + 1} = ${d.theta_k.toFixed(3)}`}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${w}%`,
                      backgroundColor: "var(--color-accent)",
                      opacity: 0.85,
                    }}
                  />
                </div>
                <span
                  className="inline-flex items-center gap-1.5 font-mono text-[11px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ backgroundColor: labelColor(d.label_id) }}
                  />
                  <span className="truncate max-w-[120px]" title={d.label_name}>
                    {d.label_name}
                  </span>
                  <span style={{ color: "var(--color-fg-faint)" }}>
                    {d.theta_k.toFixed(2)}
                  </span>
                </span>
                <span
                  className="inline-flex items-center justify-center font-mono text-[11px] font-semibold"
                  style={{
                    color: disagree
                      ? "var(--color-warn)"
                      : "var(--color-fg-faint)",
                  }}
                  title={
                    disagree
                      ? `top-1 prediction (${top1!.name}) ≠ ground truth (${d.label_name})`
                      : `top-1 prediction agrees with ground truth`
                  }
                >
                  {disagree ? "Δ" : "✓"}
                </span>
              </button>
              {isOpen && openDoc?.doc_id === d.doc_id && (
                <DocPredictionPanel doc={d} pred={sortedPred} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DocPredictionPanel({
  doc,
  pred,
}: {
  doc: import("@/api/client").TopDocumentForTopic;
  pred: RoutedPrediction[];
}) {
  const top5 = pred.slice(0, 5);
  return (
    <div
      className="ml-[120px] mt-1 mb-2 rounded-md border p-2.5 text-[11.5px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
      }}
    >
      <div
        className="text-[10.5px] uppercase tracking-wider mb-1.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Topic-routed-soft prediction · doc {doc.doc_id}
      </div>
      <p
        className="text-[11px] mb-1.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        <span className="font-mono">P(L|d) = Σ_k θ_d[k] · P(L|k)</span>
        {" — "}computed from doc&apos;s θ and per-topic label distribution
        (already in the topic_to_data payload).
      </p>
      <ul className="space-y-1">
        {top5.map((p, idx) => {
          const w = Math.min(100, p.p * 100);
          const isGround = p.label_id === doc.label_id;
          const isPred1 = idx === 0;
          return (
            <li
              key={p.label_id}
              className="grid grid-cols-[140px_1fr_56px] gap-2 items-center"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="inline-flex items-center gap-1.5 truncate"
                style={{ color: "var(--color-fg)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                {isPred1 && (
                  <span
                    className="text-[9.5px] font-mono ml-0.5"
                    style={{ color: "var(--color-accent)" }}
                    title="top-1 routed prediction"
                  >
                    ★
                  </span>
                )}
                {isGround && (
                  <span
                    className="text-[9.5px] font-mono ml-0.5"
                    style={{ color: "var(--color-warn)" }}
                    title="ground-truth label"
                  >
                    ●
                  </span>
                )}
              </span>
              <div
                className="h-1.5 rounded-sm relative"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
                title={`${(p.p * 100).toFixed(2)}%`}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${w}%`,
                    backgroundColor: isPred1
                      ? "var(--color-accent)"
                      : "var(--color-fg-faint)",
                    opacity: isPred1 ? 0.9 : 0.55,
                  }}
                />
              </div>
              <span
                className="font-mono text-[11px] text-right"
                style={{ color: "var(--color-fg)" }}
              >
                {(p.p * 100).toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p
        className="text-[10.5px] mt-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        ★ = top-1 routed prediction · ● = ground-truth label · disagreement
        between the two is the "Δ" badge in the row above.
      </p>
    </div>
  );
}

function PixelDetailCard({
  pick,
  meta,
  thetaGridBuffer,
  isLoading,
  onSelectTopic,
}: {
  pick: PickInfo;
  meta: import("@/api/client").TopicToData;
  thetaGridBuffer: ArrayBuffer | null;
  isLoading: boolean;
  onSelectTopic: (k: number) => void;
}) {
  const K = meta.topic_count;
  const [, w] = meta.spatial_shape;
  const theta = useMemo(() => {
    if (!thetaGridBuffer) return null;
    const view = new Float32Array(thetaGridBuffer);
    const offset = (pick.row * w + pick.col) * K;
    if (offset + K > view.length) return null;
    return Array.from(view.slice(offset, offset + K));
  }, [thetaGridBuffer, pick.row, pick.col, w, K]);

  const sum = theta ? theta.reduce((s, v) => s + v, 0) : 0;
  const hasFit = theta !== null && sum > 1e-6;

  const pred = useMemo(() => {
    if (!hasFit || !theta) return [];
    const p = computeRoutedPrediction(theta, meta.p_label_given_topic_dominant);
    return [...p].sort((a, b) => b.p - a.p).slice(0, 3);
  }, [hasFit, theta, meta.p_label_given_topic_dominant]);

  const orderedThetas = useMemo(() => {
    if (!hasFit || !theta) return [];
    return theta
      .map((v, k) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
  }, [hasFit, theta]);

  if (isLoading) {
    return (
      <div
        className="rounded-md border p-3 text-[12px]"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
          color: "var(--color-fg-faint)",
        }}
      >
        Loading per-pixel θ sidecar…
      </div>
    );
  }
  if (!hasFit) {
    return (
      <div
        className="rounded-md border p-3 text-[12px]"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
          color: "var(--color-fg-faint)",
        }}
      >
        No LDA fit at pixel ({pick.row}, {pick.col}). This pixel was not
        in the labelled sample used to fit LDA (sentinel all-zero θ).
      </div>
    );
  }
  const topK = orderedThetas[0]?.k ?? 0;
  return (
    <div
      className="rounded-md border p-3 text-[12.5px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div
          className="text-[11px] uppercase tracking-wider"
          style={{ color: "var(--color-fg-faint)" }}
        >
          θ at ({pick.row}, {pick.col}) · dominant t{topK + 1}
        </div>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Σ = {sum.toFixed(3)}
        </span>
      </div>
      <ul className="space-y-1 mb-3">
        {orderedThetas.slice(0, 6).map(({ k, v }) => {
          const wPct = Math.min(100, v * 100);
          const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
          return (
            <li
              key={k}
              className="grid grid-cols-[58px_1fr_44px] gap-2 items-center"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <button
                type="button"
                onClick={() => onSelectTopic(k)}
                className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-left"
                style={{ color: "var(--color-fg)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                t{k + 1}
              </button>
              <div
                className="h-1.5 rounded-sm relative"
                style={{
                  backgroundColor: "var(--color-panel)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${wPct}%`,
                    backgroundColor: color,
                    opacity: 0.85,
                  }}
                />
              </div>
              <span
                className="font-mono text-[11px] text-right"
                style={{ color: "var(--color-fg)" }}
              >
                {v.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
      <div
        className="text-[11px] uppercase tracking-wider mb-1.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Routed-soft prediction (top-3)
      </div>
      {pred.length === 0 ? (
        <span
          className="text-[11.5px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          No per-label distribution at this pixel.
        </span>
      ) : (
        <ul className="space-y-0.5">
          {pred.slice(0, 3).map((p, i) => (
            <li
              key={p.label_id}
              className="grid grid-cols-[150px_1fr_44px] gap-2 items-center text-[11.5px]"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="inline-flex items-center gap-1.5 truncate"
                style={{ color: "var(--color-fg)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                {i === 0 && (
                  <span
                    className="text-[9.5px] font-mono"
                    style={{ color: "var(--color-accent)" }}
                  >
                    ★
                  </span>
                )}
              </span>
              <div
                className="h-1.5 rounded-sm relative"
                style={{
                  backgroundColor: "var(--color-panel)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.min(100, p.p * 100)}%`,
                    backgroundColor:
                      i === 0 ? "var(--color-accent)" : "var(--color-fg-faint)",
                    opacity: i === 0 ? 0.9 : 0.5,
                  }}
                />
              </div>
              <span
                className="font-mono text-[11px] text-right"
                style={{ color: "var(--color-fg)" }}
              >
                {(p.p * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      <p
        className="text-[10.5px] mt-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Per-pixel θ from <span className="font-mono">theta_grid.bin</span>
        {" "}(cycle 121). Click a topic bar to isolate it on the raster.
      </p>
    </div>
  );
}


function SpectralBrowserTab({
  isLoading,
  error,
  meta,
}: {
  isLoading: boolean;
  error: Error | null;
  meta: import("@/api/client").SpectralBrowserMeta | null;
}) {
  const [isolatedLabel, setIsolatedLabel] = useState<number | null>(null);
  const [maxLines, setMaxLines] = useState<number>(2000);

  const buf = useQuery({
    queryKey: ["browser-bin", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/spectral_browser/${meta!.scene_id}/spectra.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const spectra = useMemo(() => {
    if (!buf.data) return null;
    return new Float32Array(buf.data);
  }, [buf.data]);

  const labels = useMemo(() => {
    if (!meta) return [];
    const seen = new Map<number, { label_id: number; name: string; color: string; count: number }>();
    for (const r of meta.rows) {
      const e = seen.get(r.label_id);
      if (e) {
        e.count += 1;
      } else {
        seen.set(r.label_id, {
          label_id: r.label_id,
          name: r.label_name,
          color: r.color,
          count: 1,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count);
  }, [meta]);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading browser metadata…
      </p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load /api/spectral-browser.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!meta) return null;

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div>
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Browser espectral · {meta.N.toLocaleString()} espectros muestreados
            </h4>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Each line is a real pixel (not an average); subsample{" "}
              {meta.sampling_strategy}. {meta.B} bandas (
              {Math.round(meta.wavelengths_nm[0]!)}–
              {Math.round(meta.wavelengths_nm[meta.wavelengths_nm.length - 1]!)}{" "}
              nm). Click a class to isolate it; reduce the rendered line count
              if your machine struggles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--color-fg-faint)" }}
            >
              lines
            </span>
            <select
              value={maxLines}
              onChange={(e) => setMaxLines(parseInt(e.target.value, 10))}
              className="rounded-md border px-2 py-1 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg)",
              }}
            >
              {[500, 1000, 2000, 4000, 8000].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        </header>

        {buf.isLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            Descargando {(meta.N * meta.B * 4).toLocaleString()} bytes binarios…
          </p>
        )}
        {buf.error && (
          <p style={{ color: "var(--color-warn)" }}>
            Could not load spectra.bin: {String(buf.error)}
          </p>
        )}
        {spectra && (
          <SpectralBrowser
            meta={meta}
            spectra={spectra}
            isolatedLabel={isolatedLabel}
            maxLines={maxLines}
          />
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIsolatedLabel(null)}
            className="rounded-md border px-2.5 py-1 text-[12px]"
            style={{
              borderColor:
                isolatedLabel === null
                  ? "var(--color-accent)"
                  : "var(--color-border)",
              backgroundColor:
                isolatedLabel === null
                  ? "var(--color-accent-soft)"
                  : "var(--color-panel)",
              color:
                isolatedLabel === null
                  ? "var(--color-accent)"
                  : "var(--color-fg-subtle)",
            }}
          >
            Todas
          </button>
          {labels.map((l) => {
            const isSel = isolatedLabel === l.label_id;
            return (
              <button
                key={l.label_id}
                type="button"
                onClick={() =>
                  setIsolatedLabel(isSel ? null : l.label_id)
                }
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel
                    ? "var(--color-fg)"
                    : "var(--color-fg-subtle)",
                }}
                title={`${l.count} espectros`}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: l.color }}
                />
                {l.name}
                <span
                  className="text-[10.5px] ml-1 opacity-70"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ({l.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {meta && spectra ? (
        <FalseColorBandPicker meta={meta} spectra={spectra} />
      ) : null}
    </div>
  );
}

function FalseColorBandPicker({
  meta,
  spectra,
}: {
  meta: import("@/api/client").SpectralBrowserMeta;
  spectra: Float32Array;
}) {
  const B = meta.B;
  const N = meta.N;
  const wavelengths = meta.wavelengths_nm;
  const [rBand, setRBand] = useState<number>(() => {
    const target = 660;
    let best = 0,
      bestDelta = Infinity;
    for (let i = 0; i < wavelengths.length; i++) {
      const d = Math.abs((wavelengths[i] ?? 0) - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    return best;
  });
  const [gBand, setGBand] = useState<number>(() => {
    const target = 550;
    let best = 0,
      bestDelta = Infinity;
    for (let i = 0; i < wavelengths.length; i++) {
      const d = Math.abs((wavelengths[i] ?? 0) - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    return best;
  });
  const [bBand, setBBand] = useState<number>(() => {
    const target = 450;
    let best = 0,
      bestDelta = Infinity;
    for (let i = 0; i < wavelengths.length; i++) {
      const d = Math.abs((wavelengths[i] ?? 0) - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    return best;
  });

  const [H, W] = meta.spatial_shape;
  const cellSize = Math.max(1, Math.floor(480 / Math.max(H, W)));

  const channelStats = useMemo(() => {
    const stats = { r: { min: Infinity, max: -Infinity }, g: { min: Infinity, max: -Infinity }, b: { min: Infinity, max: -Infinity } };
    for (let i = 0; i < N; i++) {
      const r = spectra[i * B + rBand]!;
      const g = spectra[i * B + gBand]!;
      const b = spectra[i * B + bBand]!;
      if (r < stats.r.min) stats.r.min = r;
      if (r > stats.r.max) stats.r.max = r;
      if (g < stats.g.min) stats.g.min = g;
      if (g > stats.g.max) stats.g.max = g;
      if (b < stats.b.min) stats.b.min = b;
      if (b > stats.b.max) stats.b.max = b;
    }
    return stats;
  }, [spectra, rBand, gBand, bBand, N, B]);

  const samples = useMemo(() => {
    const arr: { x: number; y: number; r: number; g: number; b: number }[] = [];
    const norm = (v: number, min: number, max: number) => {
      const span = max - min;
      return span > 0 ? Math.max(0, Math.min(255, Math.round(((v - min) / span) * 255))) : 0;
    };
    for (let i = 0; i < N; i++) {
      const row = meta.rows[i];
      if (!row) continue;
      const [x, y] = row.xy;
      const r = norm(spectra[i * B + rBand]!, channelStats.r.min, channelStats.r.max);
      const g = norm(spectra[i * B + gBand]!, channelStats.g.min, channelStats.g.max);
      const b = norm(spectra[i * B + bBand]!, channelStats.b.min, channelStats.b.max);
      arr.push({ x, y, r, g, b });
    }
    return arr;
  }, [meta.rows, spectra, rBand, gBand, bBand, channelStats, N, B]);

  const presetButtons = useMemo(() => {
    const findBand = (nm: number) => {
      let best = 0,
        bestDelta = Infinity;
      for (let i = 0; i < wavelengths.length; i++) {
        const d = Math.abs((wavelengths[i] ?? 0) - nm);
        if (d < bestDelta) {
          bestDelta = d;
          best = i;
        }
      }
      return best;
    };
    return [
      { label: "True colour · 660/550/450 nm", r: findBand(660), g: findBand(550), b: findBand(450) },
      { label: "Vegetation NIR · 800/660/550 nm", r: findBand(800), g: findBand(660), b: findBand(550) },
      { label: "SWIR mineral · 2200/1650/660 nm", r: findBand(2200), g: findBand(1650), b: findBand(660) },
      { label: "Water absorption · 1400/1900/2200 nm", r: findBand(1400), g: findBand(1900), b: findBand(2200) },
    ];
  }, [wavelengths]);

  return (
    <div
      className="rounded-lg border p-5 relative overflow-hidden mt-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgba(214,39,40,1) 0%, rgba(40,160,80,1) 50%, rgba(56,189,248,1) 100%)" }}
      />
      <header className="mt-1 mb-3">
        <h4 className="text-base font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
          False-colour band picker · choose 3 of {B} bands
        </h4>
        <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
          Dynamic compute on the client: each of the {N.toLocaleString()} stratified samples is
          painted at its spatial position {`(${H}×${W})`} with R/G/B taken from the picked bands and
          normalised per channel. Pick presets for canonical band-combos or drag the sliders for
          arbitrary {wavelengths[0]?.toFixed(0)}–{wavelengths[wavelengths.length - 1]?.toFixed(0)} nm
          combinations. Sample-sparse: only stratified pixels are coloured (uncovered area in dark
          background).
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr,420px] gap-5">
        <div>
          <div className="flex flex-wrap items-baseline gap-2 mb-2">
            <span className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-fg-faint)" }}>
              Presets
            </span>
            {presetButtons.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setRBand(p.r);
                  setGBand(p.g);
                  setBBand(p.b);
                }}
                className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
                style={{ borderColor: "var(--color-border)", color: "var(--color-fg-subtle)", backgroundColor: "transparent" }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {([
            { name: "R", value: rBand, set: setRBand, accent: "rgba(214,39,40,0.85)" },
            { name: "G", value: gBand, set: setGBand, accent: "rgba(40,160,80,0.85)" },
            { name: "B", value: bBand, set: setBBand, accent: "rgba(56,189,248,0.85)" },
          ] as const).map((ch) => (
            <div key={ch.name} className="flex items-baseline gap-3 my-2">
              <span className="text-[12px] font-mono font-semibold w-3" style={{ color: ch.accent }}>{ch.name}</span>
              <input
                type="range"
                min={0}
                max={B - 1}
                value={ch.value}
                onChange={(e) => ch.set(parseInt(e.target.value, 10))}
                className="flex-1"
                style={{ accentColor: ch.accent as string }}
                aria-label={`${ch.name} band`}
              />
              <span className="text-[12px] font-mono w-32 text-right" style={{ color: "var(--color-fg-subtle)" }}>
                band {ch.value} · {wavelengths[ch.value]?.toFixed(0)} nm
              </span>
            </div>
          ))}
        </div>

        <div className="overflow-auto" style={{ maxWidth: 420, maxHeight: 480 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block"
            style={{ width: Math.min(420, W * cellSize), height: Math.min(480, H * cellSize), backgroundColor: "var(--color-bg)" }}
            shapeRendering="crispEdges"
          >
            {samples.map((s, i) => (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={1}
                height={1}
                fill={`rgb(${s.r},${s.g},${s.b})`}
              />
            ))}
          </svg>
          <p className="text-[10.5px] mt-1" style={{ color: "var(--color-fg-faint)" }}>
            {samples.length.toLocaleString()} stratified pixels painted on a {W}×{H} grid.
          </p>
        </div>
      </div>
    </div>
  );
}

function SubsetCard({
  dataset,
  onPick,
}: {
  dataset: DatasetEntry;
  onPick: () => void;
}) {
  const isReady = dataset.local_raw_available;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!isReady}
      className={cn(
        "text-left rounded-lg border p-5 transition-all",
        isReady ? "hover:shadow-md cursor-pointer" : "opacity-55 cursor-not-allowed",
      )}
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
        color: "var(--color-fg)",
      }}
      title={
        isReady
          ? `Pick ${dataset.name}`
          : `${dataset.name} has no local raw root downloaded — the pipeline cannot operate on it`
      }
    >
      <header className="flex items-baseline gap-2 justify-between mb-2">
        <h4 className="text-base font-semibold">{dataset.name}</h4>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-mono whitespace-nowrap"
          style={{
            backgroundColor: isReady
              ? "var(--color-accent-soft)"
              : "var(--color-bg)",
            color: isReady ? "var(--color-success)" : "var(--color-fg-faint)",
          }}
        >
          {isReady ? "local" : "sin descargar"}
        </span>
      </header>
      <dl
        className="text-[13px] leading-relaxed space-y-1"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <div className="flex gap-2">
          <dt
            className="shrink-0 w-24 text-[11px] uppercase tracking-wider pt-0.5"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Modalidad
          </dt>
          <dd className="flex-1">{dataset.modality}</dd>
        </div>
        <div className="flex gap-2">
          <dt
            className="shrink-0 w-24 text-[11px] uppercase tracking-wider pt-0.5"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Supervision
          </dt>
          <dd className="flex-1">
            {dataset.supervision_states.join(" · ") || "ninguna"}
          </dd>
        </div>
      </dl>
      {isReady && (
        <div
          className="mt-3 text-sm font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          Elegir este conjunto →
        </div>
      )}
    </button>
  );
}

function Stepper({
  currentIndex,
  state,
  ctx,
}: {
  currentIndex: number;
  state: unknown;
  ctx: { family: string | null; subset: string | null; rep: string | null };
}) {
  void state;
  const { t } = useTranslation(["pages"]);
  const labels = STEPS;
  return (
    <ol
      className="flex flex-wrap gap-2 mt-4"
      style={{ color: "var(--color-fg-subtle)" }}
    >
      {labels.map((s, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
              isActive ? "font-medium" : "",
            )}
            style={{
              borderColor: isActive
                ? "var(--color-accent)"
                : "var(--color-border)",
              color: isActive
                ? "var(--color-accent)"
                : isDone
                  ? "var(--color-fg)"
                  : "var(--color-fg-faint)",
              backgroundColor: isActive
                ? "var(--color-accent-soft)"
                : "var(--color-panel)",
            }}
          >
            <span
              className="inline-flex w-5 h-5 items-center justify-center rounded-full text-[11px] font-mono"
              style={{
                backgroundColor: isActive
                  ? "var(--color-accent)"
                  : isDone
                    ? "var(--color-fg-subtle)"
                    : "var(--color-border)",
                color: isActive
                  ? "var(--color-accent-fg)"
                  : "var(--color-bg)",
              }}
            >
              {i + 1}
            </span>
            <span>{t(`workspace.step.${s.key}` as never, s.label) as string}</span>
            {isDone && i === 0 && ctx.family && (
              <span
                className="text-xs font-mono opacity-70"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {ctx.family}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FamilyPickerStep({
  isLoading,
  error,
  groups,
  onPick,
}: {
  isLoading: boolean;
  error: Error | null;
  groups: { family_id: string; family_title: string; entries: DatasetEntry[] }[];
  onPick: (familyId: string) => void;
}) {
  if (isLoading) {
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading inventory…
      </p>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load the inventory.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          <code>/api/local-dataset-inventory</code> — {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {groups.map((g) => (
        <button
          key={g.family_id}
          type="button"
          onClick={() => onPick(g.family_id)}
          className="text-left rounded-lg border p-5 transition-all hover:shadow-md"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
            color: "var(--color-fg)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h3 className="text-base font-semibold">{g.family_title}</h3>
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-mono"
              style={{
                backgroundColor: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              {g.entries.length} datasets
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {FAMILY_DESCRIPTIONS[g.family_id] ?? FAMILY_DESCRIPTIONS["default"]}
          </p>
          <ul
            className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-mono"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {g.entries.slice(0, 6).map((e) => (
              <li
                key={e.id}
                className="inline-block rounded-md px-2 py-0.5"
                style={{
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                {e.name}
              </li>
            ))}
            {g.entries.length > 6 && (
              <li
                className="inline-block px-2 py-0.5"
                style={{ color: "var(--color-fg-faint)" }}
              >
                + {g.entries.length - 6} more
              </li>
            )}
          </ul>
          <div
            className="mt-4 text-sm font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            Elegir esta familia →
          </div>
        </button>
      ))}
    </div>
  );
}

/* =========================================================================
   Scene briefing hero — appears at top of Workspace when a labelled scene
   is loaded. Shows quick stats + class palette + topic count + spectral
   envelope mini-viz for at-a-glance scene context across all 28 tabs.
   =======================================================================*/

function SceneBriefingHero({ subsetId, rep }: { subsetId: string; rep: string | null }) {
  const { t } = useTranslation(["pages"]);
  const eda = useQuery({
    queryKey: ["briefing-eda", subsetId],
    queryFn: () => api.edaPerScene(subsetId),
    staleTime: 5 * 60_000,
  });
  const tv = useQuery({
    queryKey: ["briefing-topic-views", subsetId],
    queryFn: () => api.topicViews(subsetId),
    staleTime: 5 * 60_000,
  });

  const data = eda.data;
  if (!data) {
    return (
      <div
        className="rounded-xl border p-4 mb-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-fg-faint)" }} className="text-sm">
          {t("pages:workspace.briefing.loading_scene_context")}
        </p>
      </div>
    );
  }

  const classDist = data.class_distribution ?? [];
  const sensor = data.sensor ?? "—";
  const shape = data.spatial_shape ?? [0, 0];
  const wlLo = (data.wavelengths_nm ?? [400])[0] ?? 400;
  const wlHi = (data.wavelengths_nm ?? [2500])[data.wavelengths_nm?.length ? data.wavelengths_nm.length - 1 : 0] ?? 2500;
  const meanSpectra = data.class_mean_spectra ?? {};

  // mini envelope: aggregate min/max across classes
  let lo = Infinity;
  let hi = -Infinity;
  const wl = data.wavelengths_nm ?? [];
  if (wl.length) {
    for (const v of Object.values(meanSpectra)) {
      const ms = (v as { mean?: number[] }).mean;
      if (!ms || ms.length !== wl.length) continue;
      for (const y of ms) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
  }

  const W = 280;
  const H = 60;
  const enveloperPaths = Object.entries(meanSpectra).slice(0, 12).map(([key, v]) => {
    const ms = (v as { mean?: number[] }).mean;
    if (!ms || ms.length !== wl.length) return null;
    const path = ms.map((y, i) => {
      const x = (i / (wl.length - 1)) * W;
      const yy = H - ((y - lo) / (hi - lo || 1)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`;
    }).join(" ");
    const cls = classDist.find((c) => String(c.label_id) === key);
    return { path, color: cls?.color ?? "#94a3b8", key };
  }).filter((p): p is { path: string; color: string; key: string } => p !== null);

  return (
    <div
      className="rounded-xl border p-4 mb-5 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(40,160,80,1) 33%, rgba(170,60,200,1) 66%, rgba(214,140,40,1) 100%)" }}
      />
      <div className="grid lg:grid-cols-[1fr_280px_auto] gap-5 items-center mt-1">
        {/* LEFT: stats */}
        <div>
          <div className="flex items-baseline gap-3 flex-wrap mb-2">
            <h3
              className="text-lg font-semibold tracking-tight"
              style={{ color: "var(--color-fg)" }}
            >
              {data.scene_name ?? subsetId}
            </h3>
            <span
              className="text-[10.5px] uppercase tracking-widest font-medium"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {sensor}
            </span>
            {rep ? (
              <span
                className="text-[11px] font-mono rounded px-1.5 py-0.5"
                style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                rep · {rep}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--color-fg-subtle)" }}>
            <BriefingStat label={t("pages:workspace.briefing.stat_dim")} value={`${shape[0]}×${shape[1]}`} />
            <BriefingStat label={t("pages:workspace.briefing.stat_bands")} value={String(wl.length)} />
            <BriefingStat label={t("pages:workspace.briefing.stat_wavelength")} value={`${wlLo.toFixed(0)}–${wlHi.toFixed(0)} nm`} />
            <BriefingStat label={t("pages:workspace.briefing.stat_classes")} value={String(data.n_classes ?? classDist.length)} />
            <BriefingStat label={t("pages:workspace.briefing.stat_labelled")} value={(data.n_labelled_pixels ?? 0).toLocaleString("en-US")} />
            {tv.data ? <BriefingStat label={t("pages:workspace.briefing.stat_k_topics")} value={String(tv.data.topic_count)} /> : null}
          </div>
          {classDist.length ? (
            <div className="mt-2.5">
              <div className="w-full h-2.5 flex rounded overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                {classDist.map((c) => (
                  <div
                    key={c.label_id}
                    title={`${c.name} · ${c.count.toLocaleString("en-US")} px (${(c.rel_freq * 100).toFixed(1)}%)`}
                    style={{ width: `${c.rel_freq * 100}%`, backgroundColor: c.color }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
                {classDist.slice(0, 5).map((c) => (
                  <span key={c.label_id} className="inline-flex items-center gap-1">
                    <span aria-hidden className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                ))}
                {classDist.length > 5 ? <span>{t("pages:workspace.briefing.more_classes", { count: classDist.length - 5 })}</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* MIDDLE: tiny spectral envelope */}
        <div>
          {enveloperPaths.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[60px]" aria-hidden>
              {enveloperPaths.map((p) => (
                <path key={p.key} d={p.path} fill="none" stroke={p.color} strokeWidth="0.9" strokeOpacity="0.85" />
              ))}
            </svg>
          ) : (
            <div className="text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.briefing.envelope_unavailable")}
            </div>
          )}
          <div className="text-[9.5px] uppercase tracking-widest font-medium text-center mt-0.5" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.briefing.envelope_caption")}
          </div>
        </div>

        {/* RIGHT: links */}
        <div className="flex flex-col gap-1.5 text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          <a
            href={`/api/eda/per-scene/${encodeURIComponent(subsetId)}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono"
            style={{ color: "var(--color-accent)" }}
          >
            /api/eda/per-scene
          </a>
          <a
            href={`/api/topic-views/${encodeURIComponent(subsetId)}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono"
            style={{ color: "var(--color-accent)" }}
          >
            /api/topic-views
          </a>
        </div>
      </div>
    </div>
  );
}

function BriefingStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
        {label}
      </span>
      <span className="font-mono font-semibold" style={{ color: "var(--color-fg)" }}>
        {value}
      </span>
    </span>
  );
}

/* =========================================================================
   HIDSAG Explorer — for Etapa 4 when subset is GEOMET/MINERAL{1,2}/
   GEOCHEM/PORPHYRY. Replaces the previous empty-state placeholder with
   a multi-card panel showing:
     - subset briefing (samples, measurements, modalities, top targets)
     - geochemistry targets table (mean ± std per variable)
     - mean spectra per measurement type (overlaid lines per modality)
     - regression-method ranking on macro R² (raw_ridge vs theta_*)
     - correlation heatmap between targets
   =======================================================================*/

function HidsagExploreStep({ subsetCode }: { subsetCode: string }) {
  const eda = useQuery({
    queryKey: ["hidsag-eda", subsetCode],
    queryFn: () => api.edaHidsag(subsetCode),
    staleTime: 5 * 60_000,
  });
  const methods = useQuery({
    queryKey: ["hidsag-methods", subsetCode],
    queryFn: () => api.hidsagMethodStatistics(subsetCode),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <HidsagBriefingCard eda={eda.data ?? null} methods={methods.data ?? null} subsetCode={subsetCode} />
      <div className="grid lg:grid-cols-2 gap-5">
        <HidsagTargetsCard eda={eda.data ?? null} />
        <HidsagModalitySpectraCard eda={eda.data ?? null} />
      </div>
      <HidsagMethodRankingCard methods={methods.data ?? null} />
      <HidsagCorrelationCard eda={eda.data ?? null} />
    </div>
  );
}

function HidsagBriefingCard({
  eda,
  methods,
  subsetCode,
}: {
  eda: import("@/api/client").HidsagEda | null;
  methods: import("@/api/client").HidsagMethodStatistics | null;
  subsetCode: string;
}) {
  return (
    <div
      className="rounded-xl border p-4 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgba(214,140,40,1) 0%, rgba(214,39,40,1) 100%)" }}
      />
      <div className="flex items-baseline gap-3 flex-wrap mt-1 mb-2">
        <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
          HIDSAG · {subsetCode}
        </h3>
        <span className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
          Family D · geochemistry regression
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--color-fg-subtle)" }}>
        <BriefingStat label="samples" value={eda ? String(eda.sample_count) : "…"} />
        <BriefingStat label="measurements" value={eda ? String(eda.measurement_count_total) : "…"} />
        <BriefingStat label="targets" value={eda ? String(eda.numeric_variable_names.length) : "…"} />
        <BriefingStat label="methods" value={methods?.regression ? String(Object.keys(methods.regression.method_aggregates).length) : "…"} />
        {eda?.modality_band_counts ? (
          <BriefingStat
            label="bands"
            value={Object.entries(eda.modality_band_counts)
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ")}
          />
        ) : null}
      </div>
      {eda?.dominant_targets_by_mean?.length ? (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "var(--color-fg-faint)" }}>
            Top geochemistry targets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {eda.dominant_targets_by_mean.slice(0, 8).map((tt) => (
              <span
                key={tt.name}
                className="inline-flex items-baseline gap-1 rounded px-2 py-0.5 text-[11px] font-mono"
                style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                {tt.name}
                <span className="opacity-70 text-[10px]">μ={tt.mean.toFixed(2)} ± {tt.std.toFixed(2)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HidsagTargetsCard({ eda }: { eda: import("@/api/client").HidsagEda | null }) {
  if (!eda) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p className="text-sm" style={{ color: "var(--color-fg-faint)" }}>Loading targets…</p>
      </div>
    );
  }
  const rows = eda.numeric_variable_names.map((name) => ({
    name,
    stats: eda.numeric_variables[name],
  }));
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Geochemistry targets — mean ± std
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Continuous geochemistry variables measured per HIDSAG sample. {eda.numeric_variable_names.length} targets shown with their range and sample coverage.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">target</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">mean</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">std</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">min</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">max</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">n</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((row) => {
              const s = row.stats;
              return (
                <tr key={row.name} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 pr-3 font-mono">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.mean.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.std.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.min.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.max.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.n_finite : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 15 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
            +{rows.length - 15} more targets
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HidsagModalitySpectraCard({ eda }: { eda: import("@/api/client").HidsagEda | null }) {
  if (!eda) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p className="text-sm" style={{ color: "var(--color-fg-faint)" }}>Loading mean spectra…</p>
      </div>
    );
  }
  const wl = eda.spectrum_axis?.wavelength_nm ?? [];
  const meanByMeas = eda.mean_spectrum_by_measurement ?? {};
  const entries = Object.entries(meanByMeas).slice(0, 6);

  const W = 520;
  const H = 200;
  const padL = 48;
  const padR = 12;
  const padT = 10;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let lo = Infinity;
  let hi = -Infinity;
  for (const [, v] of entries) {
    for (const y of v.mean ?? []) {
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  const wlLo = wl[0] ?? 400;
  const wlHi = wl[wl.length - 1] ?? 2500;

  const palette = ["#0ea5e9", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4"];

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Mean spectra per measurement type
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Average spectral signature per HIDSAG measurement modality (typical VNIR low/high, SWIR low). Used to validate stratification + bad-band heuristics.
      </p>
      {entries.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={padL} y1={padT + g * innerH} x2={padL + innerW} y2={padT + g * innerH} stroke="currentColor" strokeOpacity={g === 0 || g === 1 ? 0.25 : 0.07} strokeWidth="0.6" />
          ))}
          {[wlLo, (wlLo + wlHi) / 2, wlHi].map((wlv) => {
            const x = padL + ((wlv - wlLo) / (wlHi - wlLo)) * innerW;
            return (
              <text key={wlv} x={x} y={H - 8} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.55} fontFamily="ui-monospace, monospace">
                {wlv.toFixed(0)} nm
              </text>
            );
          })}
          {entries.map(([name, v], i) => {
            if (!v.mean?.length || v.mean.length !== wl.length) return null;
            const path = v.mean
              .map((y, j) => {
                const x = padL + ((wl[j]! - wlLo) / (wlHi - wlLo)) * innerW;
                const yy = padT + innerH - ((y - lo) / (hi - lo || 1)) * innerH;
                return `${j === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`;
              })
              .join(" ");
            return <path key={name} d={path} fill="none" stroke={palette[i % palette.length]} strokeWidth="1.4" strokeOpacity="0.95" />;
          })}
        </svg>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>No mean-spectra available.</p>
      )}
      {entries.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {entries.map(([name, v], i) => (
            <span key={name} className="inline-flex items-center gap-1.5" style={{ color: "var(--color-fg-faint)" }}>
              <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: palette[i % palette.length] }} />
              {name}
              <span className="opacity-65">(n={v.n})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HidsagMethodRankingCard({
  methods,
}: {
  methods: import("@/api/client").HidsagMethodStatistics | null;
}) {
  if (!methods?.regression) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p className="text-sm" style={{ color: "var(--color-fg-faint)" }}>Loading regression methods…</p>
      </div>
    );
  }
  const reg = methods.regression;
  const ranking = reg.ranking ?? Object.entries(reg.method_aggregates).map(([method, agg], i) => ({ method, mean: agg.r2_distribution?.mean ?? 0, rank: i + 1 }));
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Regression methods — macro R² ranking
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Five methods compared on 5-fold per-target R²: raw_ridge_regression, pca_ridge_regression, pls_regression, region_topic_mixture_linear_regression, topic_routed_linear_regression. Higher is better.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">rank</th>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">method</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">mean R²</th>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">bar</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((row) => {
              const agg = reg.method_aggregates[row.method];
              const norm = Math.max(0, Math.min(1, (row.mean + 0.5) / 1.5));
              return (
                <tr key={row.method} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 pr-3 font-mono">{row.rank}</td>
                  <td className="py-1.5 pr-3 font-mono">{row.method}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {row.mean.toFixed(3)}
                    {agg ? <span className="opacity-70 ml-1 text-[10.5px]">±{(agg.r2_distribution?.std ?? 0).toFixed(3)}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 w-[180px]">
                    <div className="w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                      <div className="h-2 rounded" style={{ width: `${norm * 100}%`, backgroundColor: "var(--color-accent)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HidsagCorrelationCard({ eda }: { eda: import("@/api/client").HidsagEda | null }) {
  if (!eda || !eda.correlation_pearson) {
    return null;
  }
  const names = eda.numeric_variable_names.slice(0, 12);
  const mat = eda.correlation_pearson;
  const N = Math.min(names.length, 12);
  const cell = 26;
  const labelW = 100;
  const W = labelW + N * cell + 16;
  const H = labelW + N * cell + 16;

  const colour = (v: number) => {
    const x = Math.max(-1, Math.min(1, v));
    if (x >= 0) {
      const t = x;
      return `rgba(31, 119, 180, ${0.15 + 0.75 * t})`;
    }
    const t = -x;
    return `rgba(214, 39, 40, ${0.15 + 0.75 * t})`;
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Pearson correlation between geochemistry targets
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Blue = positive correlation, red = negative. First {N} targets shown. Strong off-diagonal pairs (|ρ| ≥ 0.5) indicate redundancy / co-located mineralisation.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 720 }}>
          {names.map((n, j) => (
            <text key={`col-${n}`} x={labelW + j * cell + cell / 2} y={labelW - 4} fontSize="9.5" textAnchor="end" transform={`rotate(-50 ${labelW + j * cell + cell / 2} ${labelW - 4})`} fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
              {n}
            </text>
          ))}
          {names.map((n, i) => (
            <text key={`row-${n}`} x={labelW - 4} y={labelW + i * cell + cell / 2 + 4} fontSize="9.5" textAnchor="end" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
              {n}
            </text>
          ))}
          {names.map((_, i) =>
            names.map((__, j) => {
              const v = mat[i]?.[j] ?? 0;
              return (
                <g key={`${i}-${j}`}>
                  <rect x={labelW + j * cell} y={labelW + i * cell} width={cell - 1} height={cell - 1} fill={colour(v)} />
                  <text x={labelW + j * cell + cell / 2} y={labelW + i * cell + cell / 2 + 3} fontSize="8.5" textAnchor="middle" fill={Math.abs(v) > 0.45 ? "white" : "currentColor"} opacity={Math.abs(v) > 0.45 ? 1 : 0.65}>
                    {v.toFixed(1)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}


function asNum(x: number | Record<string, number> | undefined): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const vals = Object.values(x).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function UnmixingTab({
  isLoading,
  error,
  data,
  eda,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").EndmemberBaseline | null;
  eda: import("@/api/client").ScenePerScene | null;
}) {
  if (isLoading) {
    return <p style={{ color: "var(--color-fg-faint)" }}>Loading unmixing baseline…</p>;
  }
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-warn)" }}>Could not load endmember baseline.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }
  if (!data) return <TabEmpty />;

  const rmseRaw = asNum(data.reconstruction_rmse_full_set);
  const rmseNorm = asNum(data.reconstruction_rmse_normalised);
  const wavelengths = eda?.wavelengths_nm ?? [];

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(170,60,200,1) 100%)" }}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-3 mt-1 mb-2">
          <div>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
              Linear unmixing baseline · K={data.K}
            </h3>
            <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
              {data.endmember_extractors.join(" + ")} · {data.unmixing_method}
            </p>
          </div>
          <div className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
            {data.framework_axis ?? "Axis B-11"}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <UnmixingStat label="endmembers (K)" value={String(data.K)} />
          <UnmixingStat label="pixels used" value={data.n_pixels_used.toLocaleString()} />
          <UnmixingStat label="bands" value={String(data.n_bands)} />
          <UnmixingStat label="rmse · normalised" value={rmseNorm != null ? rmseNorm.toFixed(4) : "—"} />
        </div>
        {rmseRaw != null ? (
          <p className="mt-2 text-[11.5px] font-mono" style={{ color: "var(--color-fg-faint)" }}>
            raw reconstruction RMSE = {rmseRaw.toFixed(3)} · normalised by full-set L2 = {rmseNorm?.toFixed(4) ?? "—"}
          </p>
        ) : null}
      </div>

      <UnmixingSpectraCard
        title="NFINDR endmember spectra"
        subtitle="K vertices of the data simplex (Winter 1999). Each curve is one pure-pixel candidate."
        spectra={data.nfindr_endmembers ?? []}
        wavelengths={wavelengths}
        accent="rgba(56,189,248,1)"
      />

      {data.atgp_endmembers && data.atgp_endmembers.length > 0 ? (
        <UnmixingSpectraCard
          title="ATGP endmember spectra"
          subtitle="Automatic Target Generation Process (Ren & Chang 2003). Alternative extractor — pixel-wise orthogonal subspace projection."
          spectra={data.atgp_endmembers}
          wavelengths={wavelengths}
          accent="rgba(170,60,200,1)"
        />
      ) : null}

      {data.topic_endmember_match.topic_x_endmember_cosine ? (
        <UnmixingTopicHeatmap
          matrix={data.topic_endmember_match.topic_x_endmember_cosine}
          bestByTopic={data.topic_endmember_match.best_endmember_per_topic ?? []}
        />
      ) : null}

      {data.topic_endmember_match.best_endmember_per_topic && data.topic_endmember_match.best_endmember_per_topic.length > 0 ? (
        <UnmixingBestMatchTable rows={data.topic_endmember_match.best_endmember_per_topic} />
      ) : null}
    </div>
  );
}


function UnmixingSpectraCard({
  title,
  subtitle,
  spectra,
  wavelengths,
  accent,
}: {
  title: string;
  subtitle: string;
  spectra: number[][];
  wavelengths: number[];
  accent: string;
}) {
  const W = 720;
  const H = 280;
  const pad = { l: 44, r: 16, t: 12, b: 32 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const row of spectra) {
      for (const v of row) {
        if (!Number.isFinite(v)) continue;
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
    if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
      yLo = 0;
      yHi = 1;
    }
    const span = yHi - yLo || 1;
    const xWv = wavelengths.length > 0 ? wavelengths : spectra[0]?.map((_, i) => i) ?? [0, 1];
    return {
      xMin: xWv[0] ?? 0,
      xMax: xWv[xWv.length - 1] ?? 1,
      yMin: yLo - span * 0.05,
      yMax: yHi + span * 0.05,
    };
  }, [spectra, wavelengths]);

  const xAxis = wavelengths.length > 0 ? wavelengths : spectra[0]?.map((_, i) => i) ?? [];

  const xScale = (x: number) => pad.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const yScale = (y: number) => pad.t + innerH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;

  const palette = [
    "#0072B2", "#D55E00", "#009E73", "#CC79A7", "#F0E442",
    "#56B4E9", "#E69F00", "#999999", "#332288", "#117733",
    "#88CCEE", "#882255", "#44AA99", "#DDCC77", "#AA4499",
    "#661100",
  ];

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {title}
        </h4>
        <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: accent }}>
          K = {spectra.length}
        </span>
      </div>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>{subtitle}</p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 900 }}>
          {/* axes */}
          <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="currentColor" opacity={0.3} />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="currentColor" opacity={0.3} />
          {/* x ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const wv = xMin + f * (xMax - xMin);
            const x = pad.l + f * innerW;
            return (
              <g key={`xt-${f}`}>
                <line x1={x} y1={pad.t + innerH} x2={x} y2={pad.t + innerH + 4} stroke="currentColor" opacity={0.4} />
                <text x={x} y={pad.t + innerH + 16} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
                  {wavelengths.length > 0 ? `${Math.round(wv)} nm` : Math.round(wv)}
                </text>
              </g>
            );
          })}
          {/* y ticks */}
          {[0, 0.5, 1].map((f) => {
            const v = yMin + f * (yMax - yMin);
            const y = pad.t + innerH - f * innerH;
            return (
              <g key={`yt-${f}`}>
                <line x1={pad.l - 4} y1={y} x2={pad.l} y2={y} stroke="currentColor" opacity={0.4} />
                <text x={pad.l - 6} y={y + 3} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
                  {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2)}
                </text>
              </g>
            );
          })}
          {/* curves */}
          {spectra.map((row, k) => {
            const points = row
              .map((v, i) => {
                if (!Number.isFinite(v)) return null;
                const xv = xAxis[i] ?? i;
                return `${xScale(xv).toFixed(2)},${yScale(v).toFixed(2)}`;
              })
              .filter((p): p is string => p !== null)
              .join(" ");
            return (
              <polyline
                key={`em-${k}`}
                points={points}
                fill="none"
                stroke={palette[k % palette.length]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                opacity={0.85}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {spectra.map((_, k) => (
          <span
            key={`leg-${k}`}
            className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-mono"
            style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-fg)" }}
          >
            <span className="inline-block rounded-full w-2 h-2" style={{ backgroundColor: palette[k % palette.length] }} />
            em{k}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnmixingTopicHeatmap({
  matrix,
  bestByTopic,
}: {
  matrix: number[][];
  bestByTopic: { topic_id: number; endmember_id: number; cosine: number }[];
}) {
  const N = matrix.length;
  const labelW = 36;
  const cell = 28;
  const W = labelW + N * cell + 8;
  const H = labelW + N * cell + 8;
  const colour = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 2));
    const b = Math.round(255 * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Topic × endmember cosine similarity
      </h4>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
        Rows = LDA topic profiles φ<sub>k</sub>; columns = NFINDR endmember spectra. Cell ≈ cosine. Best matches are starred.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 720 }}>
          {Array.from({ length: N }).map((_, j) => (
            <text key={`c-${j}`} x={labelW + j * cell + cell / 2} y={labelW - 6} fontSize="9.5" textAnchor="middle" fill="currentColor" opacity={0.65} fontFamily="ui-monospace, monospace">
              em{j}
            </text>
          ))}
          {Array.from({ length: N }).map((_, i) => (
            <text key={`r-${i}`} x={labelW - 4} y={labelW + i * cell + cell / 2 + 4} fontSize="9.5" textAnchor="end" fill="currentColor" opacity={0.65} fontFamily="ui-monospace, monospace">
              t{i}
            </text>
          ))}
          {matrix.map((row, i) =>
            row.map((v, j) => {
              const isBest = bestByTopic.some((r) => r.topic_id === i && r.endmember_id === j);
              return (
                <g key={`${i}-${j}`}>
                  <rect x={labelW + j * cell} y={labelW + i * cell} width={cell - 1} height={cell - 1} fill={colour(v)} />
                  <text x={labelW + j * cell + cell / 2} y={labelW + i * cell + cell / 2 + 3} fontSize="9" textAnchor="middle" fill={v > 0.5 ? "white" : "currentColor"} opacity={v > 0.5 ? 1 : 0.7}>
                    {v.toFixed(2)}
                  </text>
                  {isBest ? (
                    <text x={labelW + j * cell + cell - 4} y={labelW + i * cell + 9} fontSize="9.5" textAnchor="end" fill={v > 0.5 ? "white" : "var(--color-accent)"}>★</text>
                  ) : null}
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}

function UnmixingBestMatchTable({ rows }: { rows: { topic_id: number; endmember_id: number; cosine: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.cosine - a.cosine);
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Best endmember per topic (sorted by cosine)
      </h4>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
        For each LDA topic, the closest NFINDR endmember by cosine of its band-profile φ<sub>k</sub>. High cosine ⇒ topic captures a pure-pixel signature.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">topic</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">endmember</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">cosine</th>
              <th className="text-left font-mono text-[11px] pb-1">bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const norm = Math.max(0, Math.min(1, r.cosine));
              return (
                <tr key={`bm-${r.topic_id}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1 pr-3 font-mono">t{r.topic_id}</td>
                  <td className="py-1 pr-3 font-mono">em{r.endmember_id}</td>
                  <td className="py-1 pr-3 text-right font-mono">{r.cosine.toFixed(3)}</td>
                  <td className="py-1 w-[200px]">
                    <div className="w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                      <div className="h-2 rounded" style={{ width: `${norm * 100}%`, backgroundColor: "var(--color-accent)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}







function DatasetOverviewExplorer({ subsetId }: { subsetId: string }) {
  const { t } = useTranslation(["pages"]);
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => api.inventory(),
    staleTime: 30 * 60_000,
  });

  if (inventory.isLoading) {
    return <p style={{ color: "var(--color-fg-faint)" }}>{t("pages:workspace.dataset_overview.loading")}</p>;
  }
  if (inventory.error) {
    return (
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p style={{ color: "var(--color-warn)" }}>{t("pages:workspace.dataset_overview.error")}</p>
      </div>
    );
  }

  const entry = inventory.data?.datasets.find((d) => d.id === subsetId);
  if (!entry) {
    return (
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p style={{ color: "var(--color-fg-subtle)" }}>
          {t("pages:workspace.dataset_overview.not_found", { id: subsetId })}
        </p>
      </div>
    );
  }

  const totalSize = entry.raw_total_size_gb;
  const fileCount = entry.raw_file_count;

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, rgba(170,60,200,1) 0%, rgba(56,189,248,1) 100%)" }}
        />
        <div className="mt-1 mb-2">
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
            {entry.name}
          </h3>
          <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
            <span className="font-mono">{entry.id}</span> · {entry.family_title} · {entry.modality}
          </p>
        </div>
        <p className="text-[13px] leading-relaxed mt-3" style={{ color: "var(--color-fg-subtle)" }}>
          {t("pages:workspace.dataset_overview.lead")}
        </p>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <UnmixingStat label={t("pages:workspace.dataset_overview.stat_local")} value={entry.local_raw_available ? t("pages:workspace.dataset_overview.yes") : t("pages:workspace.dataset_overview.no")} />
          <UnmixingStat label={t("pages:workspace.dataset_overview.stat_files")} value={fileCount.toLocaleString()} />
          <UnmixingStat label={t("pages:workspace.dataset_overview.stat_size_gb")} value={totalSize.toFixed(2)} />
          <UnmixingStat label={t("pages:workspace.dataset_overview.stat_access")} value={entry.access} />
        </div>
      </div>

      <div
        className="rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
          {t("pages:workspace.dataset_overview.facts_title")}
        </h4>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]" style={{ color: "var(--color-fg)" }}>
          <OverviewFact label={t("pages:workspace.dataset_overview.fact_supervision")} value={entry.supervision_states.join(", ")} />
          {entry.label_scope ? (
            <OverviewFact label={t("pages:workspace.dataset_overview.fact_label_scope")} value={entry.label_scope} />
          ) : null}
          {entry.measurement_scope ? (
            <OverviewFact label={t("pages:workspace.dataset_overview.fact_measurement_scope")} value={entry.measurement_scope} />
          ) : null}
          <OverviewFact label={t("pages:workspace.dataset_overview.fact_acquisition")} value={entry.acquisition_status} />
          <OverviewFact label={t("pages:workspace.dataset_overview.fact_fit_for_demo")} value={entry.fit_for_demo} />
          {entry.last_verified ? (
            <OverviewFact label={t("pages:workspace.dataset_overview.fact_last_verified")} value={entry.last_verified} />
          ) : null}
          {entry.license_note ? (
            <OverviewFact label={t("pages:workspace.dataset_overview.fact_license")} value={entry.license_note} />
          ) : null}
          {entry.supervision_caveat ? (
            <OverviewFact label={t("pages:workspace.dataset_overview.fact_caveat")} value={entry.supervision_caveat} />
          ) : null}
          {entry.domains.length > 0 ? (
            <OverviewFact label={t("pages:workspace.dataset_overview.fact_domains")} value={entry.domains.join(", ")} />
          ) : null}
        </div>
      </div>

      {entry.raw_files.length > 0 ? (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
            {t("pages:workspace.dataset_overview.files_title", { count: entry.raw_files.length })}
          </h4>
          <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.dataset_overview.files_lead")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
              <thead>
                <tr style={{ color: "var(--color-fg-faint)" }}>
                  <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.dataset_overview.col_name")}</th>
                  <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.dataset_overview.col_kind")}</th>
                  <th className="text-right font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.dataset_overview.col_size_bytes")}</th>
                  <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.dataset_overview.col_source")}</th>
                </tr>
              </thead>
              <tbody>
                {entry.raw_files.slice(0, 24).map((f, i) => (
                  <tr key={`${f.raw_dataset_id}-${i}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td className="py-1 pr-3 font-mono text-[11.5px] truncate" style={{ maxWidth: 280 }} title={f.name}>
                      {f.name}
                    </td>
                    <td className="py-1 pr-3 font-mono text-[11.5px]">{f.kind}</td>
                    <td className="py-1 pr-3 text-right font-mono text-[11.5px]">{(f.size_bytes / 1e6).toFixed(2)} MB</td>
                    <td className="py-1 font-mono text-[11px] truncate" style={{ maxWidth: 200, color: "var(--color-fg-faint)" }} title={f.source}>
                      {f.source}
                    </td>
                  </tr>
                ))}
                {entry.raw_files.length > 24 ? (
                  <tr>
                    <td colSpan={4} className="py-2 text-center text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
                      + {entry.raw_files.length - 24} {t("pages:workspace.dataset_overview.more_files")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1" style={{ borderColor: "var(--color-border)" }}>
      <span className="text-[11px] uppercase tracking-widest font-semibold shrink-0" style={{ color: "var(--color-fg-faint)" }}>
        {label}
      </span>
      <span className="font-mono text-[12px] truncate" title={value}>{value}</span>
    </div>
  );
}




const TOPIC_AWARE_TABS: { id: ExploreTab; label: string }[] = [
  { id: "topics", label: "Topics" },
  { id: "topiclabel", label: "Topic vs label" },
  { id: "routed", label: "Routed" },
  { id: "raster", label: "Raster" },
  { id: "embed3d", label: "3D embedding" },
  { id: "interpret", label: "Interpretability" },
  { id: "supertopics", label: "Super-topics" },
  { id: "usgs", label: "USGS library" },
  { id: "unmixing", label: "Unmixing" },
  { id: "spatial", label: "Spatial" },
];


function TopicContextStrip({
  selectedTopic,
  onClear,
  onJump,
  activeTab,
}: {
  selectedTopic: number;
  onClear: () => void;
  onJump: (tab: ExploreTab) => void;
  activeTab: ExploreTab;
}) {
  const swatch = TOPIC_COLORS[selectedTopic % TOPIC_COLORS.length];
  const jumpTargets = TOPIC_AWARE_TABS.filter((t) => t.id !== activeTab);
  return (
    <div
      className="-mx-6 px-6 py-2 mb-4 border-y flex items-center gap-3 flex-wrap"
      style={{
        backgroundColor: "var(--color-accent-soft)",
        borderColor: "var(--color-border)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-baseline gap-2 shrink-0">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
        <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--color-fg)" }}>
          topic {selectedTopic + 1}
        </span>
        <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--color-fg-faint)" }}>
          shared across topic-aware tabs
        </span>
      </div>
      <div className="flex items-baseline gap-1 ml-auto flex-wrap">
        <span className="text-[10.5px] uppercase tracking-widest font-semibold mr-1" style={{ color: "var(--color-fg-faint)" }}>
          jump to
        </span>
        {jumpTargets.map((t) => (
          <button
            key={`jump-${t.id}`}
            type="button"
            onClick={() => onJump(t.id)}
            className="rounded border px-1.5 py-0.5 text-[11px] font-mono"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-fg-subtle)",
              backgroundColor: "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          className="ml-2 rounded border px-2 py-0.5 text-[11px] font-mono"
          style={{
            borderColor: "var(--color-warn)",
            color: "var(--color-warn)",
            backgroundColor: "transparent",
          }}
          title="Clear selected topic"
        >
          × clear
        </button>
      </div>
    </div>
  );
}

function TabFooter({ tab }: { tab: ExploreTab }) {
  const wikiPage = TAB_WIKI_PAGE[tab];
  const repoBase = "https://github.com/fsantibanezleal/CAOS_LDA_HSI";
  return (
    <footer
      className="mt-8 pt-4 border-t flex flex-wrap items-baseline gap-x-4 gap-y-2 text-[12px]"
      style={{ borderColor: "var(--color-border)", color: "var(--color-fg-faint)" }}
    >
      <span className="uppercase tracking-widest text-[10.5px] font-semibold">
        Read more
      </span>
      <a
        href={`${WIKI_BASE}/${wikiPage}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono"
        style={{ color: "var(--color-accent)" }}
      >
        wiki · {wikiPage.replaceAll("-", " ")}
      </a>
      <span style={{ opacity: 0.4 }}>·</span>
      <a
        href={`${repoBase}/blob/main/data-pipeline`}
        target="_blank"
        rel="noreferrer"
        className="font-mono"
        style={{ color: "var(--color-accent)" }}
      >
        data-pipeline source
      </a>
      <span style={{ opacity: 0.4 }}>·</span>
      <a
        href={`${repoBase}/issues`}
        target="_blank"
        rel="noreferrer"
        className="font-mono"
        style={{ color: "var(--color-accent)" }}
      >
        report an issue
      </a>
    </footer>
  );
}

const LABELLED_SCENE_ORDER: { id: string; short: string }[] = [
  { id: "indian-pines-corrected", short: "Indian Pines" },
  { id: "salinas-corrected", short: "Salinas" },
  { id: "salinas-a-corrected", short: "Salinas-A" },
  { id: "pavia-university", short: "Pavia U" },
  { id: "kennedy-space-center", short: "KSC" },
  { id: "botswana", short: "Botswana" },
];

function SceneQuickSwitch({
  currentScene,
  onSwitch,
}: {
  currentScene: string;
  onSwitch: (s: string) => void;
}) {
  return (
    <div
      className="rounded-lg border p-2 mb-4 flex items-baseline gap-2 flex-wrap"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
    >
      <span className="text-[10.5px] uppercase tracking-widest font-semibold pr-2" style={{ color: "var(--color-fg-faint)" }}>
        Quick-switch scene
      </span>
      {LABELLED_SCENE_ORDER.map((s) => {
        const isActive = s.id === currentScene;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => !isActive && onSwitch(s.id)}
            aria-pressed={isActive}
            disabled={isActive}
            className="rounded border px-2.5 py-1 text-[12px] font-mono"
            style={{
              borderColor: isActive ? "var(--color-accent)" : "var(--color-border)",
              color: isActive ? "var(--color-accent)" : "var(--color-fg-subtle)",
              backgroundColor: isActive ? "var(--color-accent-soft)" : "transparent",
              cursor: isActive ? "default" : "pointer",
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {s.short}
          </button>
        );
      })}
    </div>
  );
}

function KeyboardShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl border max-w-lg w-full p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "0 24px 48px -16px rgba(0, 0, 0, 0.35)",
          color: "var(--color-fg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-2 py-0.5 text-[11px] font-mono"
            style={{ borderColor: "var(--color-border)", color: "var(--color-fg-faint)" }}
            aria-label="Close"
          >
            Esc · ×
          </button>
        </header>
        <p className="text-[12.5px] mb-4" style={{ color: "var(--color-fg-faint)" }}>
          Power-user navigation inside Workspace › Explore. Disabled while typing in any text field.
        </p>
        <dl className="space-y-3 text-[13px]">
          {[
            { keys: ["?"], desc: "Toggle this help overlay" },
            { keys: ["Esc"], desc: "Clear the selected topic (or close this overlay)" },
            { keys: ["["], desc: "Previous tab (wraps around)" },
            { keys: ["]"], desc: "Next tab (wraps around)" },
          ].map((row) => (
            <div key={row.desc} className="flex items-baseline gap-3">
              <div className="flex items-baseline gap-1 shrink-0 w-24">
                {row.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border px-1.5 py-0.5 text-[11px] font-mono"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-bg)",
                      color: "var(--color-fg)",
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <span style={{ color: "var(--color-fg-subtle)" }}>{row.desc}</span>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
          The URL also reflects the current selection so any view is shareable: family, subset,
          representation, tab, and selected topic are all in <code>?…</code> search params.
        </p>
      </div>
    </div>
  );
}


