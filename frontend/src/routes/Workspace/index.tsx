/* ============================================================
 * Workspace — "Digital Laboratory" view.
 *
 * Direct, API-driven surface over the precompute layer. Replaces
 * the previous Workspace which was rejected as "magazine-style".
 * Every panel here reads a real precompute artifact via the
 * existing FastAPI endpoints; every number ships with a link to
 * the underlying JSON so the user can audit it.
 *
 * Organised by master plan Addendum B's eight evaluation axes.
 * Scene picker on top; cards underneath. No interpretation chrome
 * beyond axis names and metric labels.
 * ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const LABELLED_SCENES: { id: string; label: string }[] = [
  { id: "indian-pines-corrected", label: "Indian Pines" },
  { id: "salinas-corrected", label: "Salinas" },
  { id: "salinas-a-corrected", label: "Salinas-A" },
  { id: "pavia-university", label: "Pavia U" },
  { id: "kennedy-space-center", label: "KSC" },
  { id: "botswana", label: "Botswana" },
];

const HIDSAG_SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"];

interface AxisCard {
  id: string;
  axis: string;
  title: string;
  description: string;
  endpoint: (sceneId: string) => string;
  /** Pulls headline numbers from the JSON payload (best effort, no schema lock) */
  headline: (payload: Record<string, unknown>) => Array<{ k: string; v: string }>;
  /** True if this card uses HIDSAG subsets instead of labelled scenes */
  hidsag?: boolean;
  /** Optional override: fixed endpoint independent of scene */
  fixed?: boolean;
  fixedEndpoint?: string;
}

const AXIS_CARDS: AxisCard[] = [
  {
    id: "topic_views",
    axis: "A — Internal coherence",
    title: "Topic views (LDAvis-faithful)",
    description:
      "Topic prevalence, top-words by relevance(λ), JS-based intertopic 2D / 3D MDS coordinates, topic-distance matrices.",
    endpoint: (s) => `/api/topic-views/${encodeURIComponent(s)}`,
    headline: (p) => [
      { k: "K", v: String((p as { topic_count?: number }).topic_count ?? "?") },
      {
        k: "topics ranked by λ-relevance",
        v: Array.isArray((p as { top_words_per_topic?: unknown[] }).top_words_per_topic)
          ? `${((p as { top_words_per_topic: unknown[] }).top_words_per_topic).length}`
          : "n/a",
      },
    ],
  },
  {
    id: "topic_stability",
    axis: "A — Internal coherence",
    title: "Topic stability (Hungarian-matched cosine, 7 seeds)",
    description:
      "B-6: per-topic median / min / std vs seed 0; full N×N seed-pair agreement matrix; off-diagonal scene summary.",
    endpoint: (s) => `/api/topic-stability/${encodeURIComponent(s)}`,
    headline: (p) => {
      const sum = (p as { scene_stability_summary?: { off_diagonal_mean?: number; off_diagonal_min?: number } }).scene_stability_summary ?? {};
      return [
        { k: "off-diag mean", v: numFmt(sum.off_diagonal_mean) },
        { k: "off-diag min", v: numFmt(sum.off_diagonal_min) },
      ];
    },
  },
  {
    id: "topic_to_usgs_v7",
    axis: "B — External alignment",
    title: "Topic ↔ USGS splib07 v7 (full)",
    description:
      "B-7: 2450 USGS spectra across 7 chapters (artificial / coatings / liquids / minerals / organics / soils / vegetation). Per-topic top-20 nearest, best-match-per-chapter, top-50 chapter histogram.",
    endpoint: (s) => `/api/topic-to-usgs-v7/${encodeURIComponent(s)}`,
    headline: (p) => [
      { k: "K", v: String((p as { topic_count?: number }).topic_count ?? "?") },
      { k: "library samples", v: String((p as { library_sample_count?: number }).library_sample_count ?? "?") },
    ],
  },
  {
    id: "topic_anomaly",
    axis: "B — External alignment",
    title: "Topic anomaly indicators",
    description:
      "B-9: 1 - max(theta) (softmax confidence) and reconstruction NLL = -Σ_w doc_w · log((θφ)_w) per document. Per-class summary; Spearman ρ vs theta_logistic misclassification.",
    endpoint: (s) => `/api/topic-anomaly/${encodeURIComponent(s)}`,
    headline: (p) => {
      const cor = (p as { anomaly_to_misclassification_correlation?: { spearman_rho_softmax?: number; spearman_rho_nll?: number } })
        .anomaly_to_misclassification_correlation ?? {};
      return [
        { k: "ρ(softmax, miscls)", v: numFmt(cor.spearman_rho_softmax) },
        { k: "ρ(NLL, miscls)", v: numFmt(cor.spearman_rho_nll) },
      ];
    },
  },
  {
    id: "topic_spatial_full",
    axis: "B — External alignment",
    title: "Spatial coherence (full-pixel)",
    description:
      "B-10 follow-up: full-pixel LDA refit + Moran's I, Geary's C on continuous θ_k abundance maps + symmetric BDE vs GT class boundaries.",
    endpoint: (s) => `/api/topic-spatial-full/${encodeURIComponent(s)}`,
    headline: (p) => [
      { k: "mean Moran's I", v: numFmt((p as { aggregated_morans_I_mean_over_topics?: number }).aggregated_morans_I_mean_over_topics) },
      { k: "mean Geary's C", v: numFmt((p as { aggregated_gearys_C_mean_over_topics?: number }).aggregated_gearys_C_mean_over_topics) },
    ],
  },
  {
    id: "linear_probe_panel",
    axis: "C — Downstream task battery",
    title: "Linear probe panel (theta vs PCA-K, NMF-K, ICA-K, AE-K)",
    description:
      "B-1: 5-fold StratifiedKFold logistic regression on every K-dim compression of the same labelled scene. Bootstrap CI95; Wilcoxon-Holm + Cliff's δ vs theta on macro F1.",
    endpoint: (s) => `/api/linear-probe-panel/${encodeURIComponent(s)}`,
    headline: (p) => {
      const r = (p as { ranking_by_macro_f1_mean?: Array<{ method: string; macro_f1_mean: number }> }).ranking_by_macro_f1_mean ?? [];
      return r.slice(0, 3).map((row) => ({ k: row.method, v: numFmt(row.macro_f1_mean) }));
    },
  },
  {
    id: "topic_routed_classifier",
    axis: "C — Downstream task battery",
    title: "Topic-routed classifier (soft theta gating)",
    description:
      "B-3: per-topic specialists trained on the raw spectrum with sample_weight = θ_d(k); test-time mixture Σ_k θ_test · P_k(y|x). Compared against raw_logistic, theta_logistic, pca_K_logistic, topic_routed_hard.",
    endpoint: (s) => `/api/topic-routed-classifier/${encodeURIComponent(s)}`,
    headline: (p) => {
      const r = (p as { ranking_by_macro_f1_mean?: Array<{ method: string; macro_f1_mean: number }> }).ranking_by_macro_f1_mean ?? [];
      return r.slice(0, 3).map((row) => ({ k: row.method, v: numFmt(row.macro_f1_mean) }));
    },
  },
  {
    id: "embedded_baseline",
    axis: "C — Downstream task battery",
    title: "Embedded concat baseline ([theta | PCA-K])",
    description:
      "B-5: does theta add signal beyond PCA at the same K when concatenated as a flat feature? 5-fold macro F1 of raw / theta / pca_K / [theta | pca_K] + Wilcoxon-Holm on (concat - pca).",
    endpoint: (s) => `/api/embedded-baseline/${encodeURIComponent(s)}`,
    headline: (p) => {
      const cv = (p as { concat_vs_pca?: { macro_f1_diff_mean_concat_minus_pca?: number; cliff_delta_concat_minus_pca?: number } }).concat_vs_pca ?? {};
      return [
        { k: "Δ macro F1 (concat − PCA-K)", v: numFmt(cv.macro_f1_diff_mean_concat_minus_pca) },
        { k: "Cliff δ", v: numFmt(cv.cliff_delta_concat_minus_pca) },
      ];
    },
  },
  {
    id: "bayesian_labelled",
    axis: "C — Downstream task battery",
    title: "Bayesian classification posterior (labelled scenes)",
    description:
      "PyMC NUTS hierarchical normal on labelled-scene per-fold macro F1 across raw / theta / pca_K / topic_routed_hard / topic_routed_soft (5 methods × 6 scenes × 5 folds = 150 obs). Per-method posterior mean + HDI94.",
    endpoint: () => "/api/bayesian-comparison/classification-labelled",
    headline: (p) => {
      const ms = (p as { method_posteriors?: Array<{ method: string; posterior_mean: number }> }).method_posteriors ?? [];
      const sorted = [...ms].sort((a, b) => b.posterior_mean - a.posterior_mean).slice(0, 3);
      return sorted.map((m) => ({ k: m.method, v: numFmt(m.posterior_mean, 3) }));
    },
    fixed: true,
    fixedEndpoint: "/api/bayesian-comparison/classification-labelled",
  },
  {
    id: "mutual_information",
    axis: "D — Information-theoretic",
    title: "MI(theta; label) vs MI(other K-dim; label)",
    description:
      "B-4: per-feature MI vector + sum + max + label entropy + joint clip via mutual_info_classif. For HIDSAG subsets with DMR-LDA fits, MI(theta; numeric_target) per measurement via mutual_info_regression.",
    endpoint: (s) => `/api/mutual-information/${encodeURIComponent(s)}`,
    headline: (p) => {
      const r = (p as { ranking_by_joint_mi?: Array<{ method: string; joint_mi_clipped: number }> }).ranking_by_joint_mi ?? [];
      return r.slice(0, 3).map((row) => ({ k: row.method, v: numFmt(row.joint_mi_clipped) }));
    },
  },
  {
    id: "cross_scene_transfer",
    axis: "E — Transfer",
    title: "Cross-scene topic transfer (common AVIRIS-1997 grid)",
    description:
      "B-8: fit-on-A-infer-on-B across 5 AVIRIS-class scenes resampled to a common 224-band 400-2500 nm grid. Per-source LDA at canonical K; per-target 5-fold theta-logistic macro F1.",
    endpoint: () => "/api/cross-scene-transfer",
    headline: (p) => {
      const order = (p as { scene_order?: string[] }).scene_order ?? [];
      const matrix = (p as { transfer_matrix_macro_f1?: number[][] }).transfer_matrix_macro_f1 ?? [];
      const out: { k: string; v: string }[] = [];
      for (let i = 0; i < Math.min(3, order.length, matrix.length); i++) {
        const diag = matrix[i]?.[i];
        if (diag != null) {
          out.push({ k: `${order[i]} → ${order[i]} (diag)`, v: numFmt(diag) });
        }
      }
      return out;
    },
    fixed: true,
    fixedEndpoint: "/api/cross-scene-transfer",
  },
  {
    id: "interpretability",
    axis: "F — Interpretability",
    title: "Topic / band / document cards",
    description:
      "Per-scene topic narratives, per-band Fisher / ANOVA cards, per-document panels. Three card families per scene; click through via the raw JSON link.",
    endpoint: (s) => `/api/interpretability/${encodeURIComponent(s)}/topic_cards`,
    headline: (p) => {
      const cards = (p as { cards?: unknown[] }).cards;
      return [
        { k: "topic cards", v: Array.isArray(cards) ? `${cards.length}` : "n/a" },
      ];
    },
  },
  {
    id: "rate_distortion_curve",
    axis: "G — Reconstruction",
    title: "Rate-distortion: LDA vs NMF vs PCA",
    description:
      "B-2: K → RMSE on a held-out 20% test split for LDA / NMF / PCA at K ∈ {4,6,8,10,12,16}. The fair-baseline reading on the reconstruction axis.",
    endpoint: (s) => `/api/rate-distortion-curve/${encodeURIComponent(s)}`,
    headline: (p) => {
      const tbl = (p as { rmse_test_table_by_K?: Array<{ K: number; winner?: string }> }).rmse_test_table_by_K ?? [];
      const k8 = tbl.find((r) => r.K === 8);
      return [
        { k: "K=8 winner", v: k8?.winner ?? "?" },
        { k: "K range", v: tbl.length ? `${tbl[0]?.K}-${tbl[tbl.length - 1]?.K}` : "?" },
      ];
    },
  },
  {
    id: "endmember_baseline",
    axis: "G — Reconstruction",
    title: "NFINDR + ATGP + NNLS endmember baseline",
    description:
      "B-11: K endmembers via custom NFINDR (Winter 1999) and ATGP (Ren-Chang 2003) + NNLS-with-sum-to-one unmixing. Per-endmember best-matched LDA topic by cosine; reconstruction RMSE.",
    endpoint: (s) => `/api/endmember-baseline/${encodeURIComponent(s)}`,
    headline: (p) => [
      { k: "K", v: String((p as { K?: number }).K ?? "?") },
      { k: "RMSE (norm)", v: numFmt((p as { reconstruction_rmse_normalised?: number }).reconstruction_rmse_normalised) },
    ],
  },
  {
    id: "lda_sweep",
    axis: "H — Robustness",
    title: "K × seed LDA sweep",
    description:
      "K × seed grid (K in {4, 6, 8, 10, 12, 16}, 5 seeds) on the canonical band-frequency recipe. Per-K perplexity test mean / std, NPMI coherence, topic diversity, matched-cosine stability.",
    endpoint: (s) => `/api/lda-sweep/${encodeURIComponent(s)}`,
    headline: (p) => [
      { k: "recommended K", v: String((p as { recommended_K?: number }).recommended_K ?? "?") },
    ],
  },
  {
    id: "quantization_sensitivity",
    axis: "H — Robustness",
    title: "Quantization sensitivity",
    description:
      "9 quantisation probes per scene (3 schemes × 3 Q values) against the canonical fit. Reports matched-cosine stability and ARI of dominant-topic assignment vs the canonical.",
    endpoint: (s) => `/api/quantization-sensitivity/${encodeURIComponent(s)}`,
    headline: (p) => [
      { k: "verdict", v: String((p as { verdict?: string }).verdict ?? "?") },
    ],
  },
];

function numFmt(x: unknown, digits = 4): string {
  if (typeof x !== "number" || !Number.isFinite(x)) return "n/a";
  return x.toFixed(digits);
}

export function Workspace() {
  const { i18n } = useTranslation();
  const language: "en" | "es" = i18n.language.startsWith("en") ? "en" : "es";
  const [sceneId, setSceneId] = useState<string>(LABELLED_SCENES[0]!.id);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [activeAxis, setActiveAxis] = useState<string>("A — Internal coherence");

  useEffect(() => {
    void fetch("/api/manifest")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setManifest(data))
      .catch(() => setManifest(null));
  }, []);

  const axes = useMemo(() => {
    const out: { id: string; cards: AxisCard[] }[] = [];
    for (const card of AXIS_CARDS) {
      const existing = out.find((x) => x.id === card.axis);
      if (existing) existing.cards.push(card);
      else out.push({ id: card.axis, cards: [card] });
    }
    return out;
  }, []);

  const visibleAxis = axes.find((a) => a.id === activeAxis) ?? axes[0]!;

  const summary = manifest as
    | {
        artifact_count?: number;
        builder_count?: number;
        claims_allowed_count?: number;
        derived_total_bytes?: number;
      }
    | null;

  return (
    <section className="ws-lab">
      <header className="ws-lab-head">
        <h2 style={{ marginTop: 0 }}>
          {language === "en" ? "Digital Laboratory" : "Laboratorio Digital"}
        </h2>
        <p style={{ marginTop: 6, marginBottom: 14, color: "var(--text-secondary)" }}>
          {language === "en"
            ? "Direct surface over the precompute layer. Every panel reads a real precompute artifact via the FastAPI; every number ships with a link to the underlying JSON."
            : "Vista directa sobre la capa precomputada. Cada panel lee un artefacto real vía FastAPI; cada número trae un link al JSON subyacente."}
        </p>

        {summary && (
          <div className="ws-lab-manifest">
            <span className="kpi">
              <span className="kpi-label">artifacts</span>
              <span className="kpi-value">{summary.artifact_count ?? "?"}</span>
            </span>
            <span className="kpi">
              <span className="kpi-label">builders</span>
              <span className="kpi-value">{summary.builder_count ?? "?"}</span>
            </span>
            <span className="kpi">
              <span className="kpi-label">claims_allowed</span>
              <span className="kpi-value">{summary.claims_allowed_count ?? "?"}</span>
            </span>
            <span className="kpi">
              <span className="kpi-label">derived size (MB)</span>
              <span className="kpi-value">
                {summary.derived_total_bytes
                  ? (summary.derived_total_bytes / (1024 * 1024)).toFixed(2)
                  : "?"}
              </span>
            </span>
          </div>
        )}

        <div className="ws-lab-pickers">
          <label className="ws-lab-picker">
            <span style={{ color: "var(--text-secondary)", marginRight: 8 }}>
              {language === "en" ? "scene" : "escena"}
            </span>
            <select
              value={sceneId}
              onChange={(e) => setSceneId(e.target.value)}
              className="btn-secondary"
            >
              {LABELLED_SCENES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
            {language === "en"
              ? "(HIDSAG subsets reachable directly via /api/eda/hidsag/{subset_code} and /api/method-statistics-hidsag/{subset_code})"
              : "(Subsets HIDSAG accesibles directo vía /api/eda/hidsag/{subset_code} y /api/method-statistics-hidsag/{subset_code})"}
          </span>
        </div>

        <nav className="ws-lab-axis-nav" style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {axes.map((a) => (
            <button
              key={a.id}
              className={a.id === activeAxis ? "btn-primary" : "btn-secondary"}
              onClick={() => setActiveAxis(a.id)}
              style={{ fontSize: 12 }}
            >
              {a.id}
            </button>
          ))}
        </nav>
      </header>

      <div className="ws-lab-cards">
        {visibleAxis.cards.map((card) => (
          <AxisPanel key={card.id} card={card} sceneId={sceneId} />
        ))}
      </div>

      <footer className="ws-lab-foot" style={{ marginTop: 32, padding: 16, borderTop: "1px solid var(--border-soft)" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 0 }}>
          {language === "en"
            ? "All readings come from the live precompute layer. The HIDSAG subsets are: "
            : "Todas las lecturas vienen de la capa precomputada en vivo. Los subsets HIDSAG son: "}
          {HIDSAG_SUBSETS.join(", ")}.
        </p>
      </footer>
    </section>
  );
}

function AxisPanel({ card, sceneId }: { card: AxisCard; sceneId: string }) {
  const url = card.fixed && card.fixedEndpoint ? card.fixedEndpoint : card.endpoint(sceneId);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPayload(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setPayload(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  const headline = payload ? card.headline(payload) : [];

  return (
    <article
      style={{
        border: "1px solid var(--border-soft)",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        background: "var(--bg-card)",
      }}
    >
      <header style={{ marginBottom: 8 }}>
        <div
          style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.6 }}
        >
          {card.axis}
        </div>
        <h3 style={{ margin: "4px 0 6px", fontSize: 16 }}>{card.title}</h3>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{card.description}</p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
        {loading && <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>loading…</span>}
        {error && <span style={{ color: "var(--accent-warning)", fontSize: 13 }}>{error}</span>}
        {!loading && !error && headline.length === 0 && (
          <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            (no headline metric extractable — open raw JSON)
          </span>
        )}
        {headline.map((h, i) => (
          <div key={i} style={{ minWidth: 110 }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {h.k}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{h.v}</div>
          </div>
        ))}
      </div>

      <footer style={{ marginTop: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
        <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)" }}>
          raw JSON →
        </a>
      </footer>
    </article>
  );
}
