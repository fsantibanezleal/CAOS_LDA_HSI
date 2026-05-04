/**
 * The 13 step components of the guided Lab flow.
 * Each step:
 *   - shows its own controls (lab-controls bar)
 *   - fetches its own data lazily on mount / state change
 *   - renders ONE rich interactive visualisation
 *   - drives the flow forward via clicks (e.g. clicking a topic in
 *     the intertopic map sets state.selectedTopic; the spectral
 *     step then auto-loads that topic).
 */
import { useEffect, useMemo, useState } from "react";
import {
  fetchAnomaly,
  fetchBayesianLabelled,
  fetchCrossMethod,
  fetchCrossScene,
  fetchDominantMapBin,
  fetchEda,
  fetchEmbedded,
  fetchEndmember,
  fetchLdaSweep,
  fetchLinearProbe,
  fetchMutualInfo,
  fetchRateDistortion,
  fetchSpatial,
  fetchSpatialFull,
  fetchTopicRouted,
  fetchTopicStability,
  fetchTopicToData,
  fetchTopicViews,
  fetchUsgs,
  LABELLED_SCENES,
} from "../../api";
import {
  BarWithCI,
  ForestPlot,
  Heatmap,
  MultiLine,
  RasterMap,
  Scatter,
  SpectralPlot,
  StackedBar,
  topicColor,
} from "../../plots/plots";
import type { FlowState } from "./Lab";

interface StepProps {
  state: FlowState;
  update: (p: Partial<FlowState>) => void;
  lang: "en" | "es";
}

const RECIPES = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12"];
const SCHEMES = ["uniform", "quantile", "lloyd_max"];
const Q_VALUES = [8, 16, 32];

function Loading({ lang }: { lang: string }) {
  return <p style={{ color: "var(--text-tertiary)" }}>{lang === "es" ? "cargando…" : "loading…"}</p>;
}
function ErrorBox({ msg }: { msg: string }) {
  return <p style={{ color: "var(--accent-bad)" }}>{msg}</p>;
}

/* ============================================================
 * Step 1 — pick scene
 * ============================================================ */
export function Step1Scene({ state, update, lang }: StepProps) {
  const [m, setM] = useState<{ scene: string; n: number; share: { class_name: string; share: number }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setM(null);
    void fetchEda(state.scene)
      .then((p) =>
        setM({
          scene: state.scene,
          n: p.n_pixels_labelled,
          share: p.class_distribution.map((c) => ({ class_name: c.class_name, share: c.share })),
        })
      )
      .catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  return (
    <div>
      <div className="lab-controls">
        <label>
          {lang === "es" ? "escena" : "scene"}:
          <select value={state.scene} onChange={(e) => update({ scene: e.target.value })}>
            {LABELLED_SCENES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.bands} bands · {s.classes} classes)
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && <ErrorBox msg={err} />}
      {!err && !m && <Loading lang={lang} />}
      {m && (
        <StackedBar
          title={`${LABELLED_SCENES.find((s) => s.id === state.scene)?.label} · ${m.n.toLocaleString()} ${lang === "es" ? "píxeles etiquetados" : "labelled pixels"}`}
          segments={m.share.slice(0, 12).map((c, i) => ({
            label: c.class_name,
            value: c.share,
            color: topicColor(i),
          }))}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Step 2 — EDA (mean spectra per class with percentile envelope)
 * ============================================================ */
export function Step2Eda({ state, lang }: StepProps) {
  const [eda, setEda] = useState<Awaited<ReturnType<typeof fetchEda>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<number[]>([]);

  useEffect(() => {
    setErr(null);
    setEda(null);
    setClassFilter([]);
    void fetchEda(state.scene).then(setEda).catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  const series = useMemo(() => {
    if (!eda) return [];
    const cls = classFilter.length > 0 ? eda.class_mean_spectra.classes.filter((c) => classFilter.includes(c.class_id)) : eda.class_mean_spectra.classes.slice(0, 8);
    return cls.map((c, i) => ({
      name: c.class_name,
      color: topicColor(i),
      mean: c.mean,
      band: { lo: c.p25, hi: c.p75 },
    }));
  }, [eda, classFilter]);

  return (
    <div>
      <div className="lab-controls">
        <span style={{ color: "var(--text-secondary)" }}>
          {lang === "es" ? "Click en un nombre para aislar la clase, click de nuevo para soltar." : "Click a class to isolate it; click again to release."}
        </span>
      </div>

      {err && <ErrorBox msg={err} />}
      {!err && !eda && <Loading lang={lang} />}
      {eda && (
        <>
          <SpectralPlot
            wavelengths={eda.class_mean_spectra.wavelengths_nm}
            series={series}
            title={lang === "es" ? "Espectro medio por clase ± p25-p75" : "Mean spectrum per class ± p25-p75"}
            yLabel={lang === "es" ? "reflectancia / radiancia" : "reflectance / radiance"}
          />
          <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {eda.class_distribution.map((c, i) => {
              const active = classFilter.includes(c.class_id);
              return (
                <button
                  key={c.class_id}
                  onClick={() =>
                    setClassFilter((curr) =>
                      curr.includes(c.class_id) ? curr.filter((x) => x !== c.class_id) : [...curr, c.class_id]
                    )
                  }
                  className={active ? "tag good" : "tag"}
                  style={{ cursor: "pointer", border: `1px solid ${active ? topicColor(i) : "var(--border-soft)"}` }}
                >
                  {c.class_name} · {(c.share * 100).toFixed(1)}%
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }} className="card">
            <h3>{lang === "es" ? "Imbalance Gini & total etiquetado" : "Imbalance Gini & total labelled"}</h3>
            <p>
              {lang === "es" ? "Gini" : "Gini"} = {eda.imbalance_gini.toFixed(3)} · {eda.n_pixels_labelled.toLocaleString()} {lang === "es" ? "píxeles etiquetados de" : "labelled pixels of"} {eda.n_pixels_total.toLocaleString()} (
              {((eda.n_pixels_labelled / eda.n_pixels_total) * 100).toFixed(1)}%).
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Step 3 — wordification recipe picker
 * ============================================================ */
export function Step3Wordification({ state, update, lang }: StepProps) {
  const [info, setInfo] = useState<{ V_actual: number; doc_len_mean: number; entropy_bits: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [topTokens, setTopTokens] = useState<{ token: string; count: number }[] | null>(null);

  useEffect(() => {
    setErr(null);
    setInfo(null);
    setTopTokens(null);
    fetch(`/api/wordifications/${encodeURIComponent(state.scene)}/${state.recipe}/${state.scheme}/${state.Q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((p: { V_actual: number; doc_length_distribution: { mean: number }; corpus_marginal_entropy_bits: number; top_tokens_by_count: { token: string; count: number }[] }) => {
        setInfo({
          V_actual: p.V_actual,
          doc_len_mean: p.doc_length_distribution.mean,
          entropy_bits: p.corpus_marginal_entropy_bits,
        });
        setTopTokens(p.top_tokens_by_count.slice(0, 16));
      })
      .catch((e: Error) => setErr(e.message));
  }, [state.scene, state.recipe, state.scheme, state.Q]);

  return (
    <div>
      <div className="lab-controls">
        <label>
          {lang === "es" ? "receta" : "recipe"}:
          <div className="group">
            {RECIPES.map((r) => (
              <button key={r} className={state.recipe === r ? "active" : ""} onClick={() => update({ recipe: r })}>
                {r}
              </button>
            ))}
          </div>
        </label>
        <label>
          scheme:
          <div className="group">
            {SCHEMES.map((s) => (
              <button key={s} className={state.scheme === s ? "active" : ""} onClick={() => update({ scheme: s })}>
                {s}
              </button>
            ))}
          </div>
        </label>
        <label>
          Q:
          <div className="group">
            {Q_VALUES.map((q) => (
              <button key={q} className={state.Q === q ? "active" : ""} onClick={() => update({ Q: q })}>
                {q}
              </button>
            ))}
          </div>
        </label>
      </div>

      {err && <ErrorBox msg={err} />}
      {!err && !info && <Loading lang={lang} />}
      {info && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="label">V_actual</div>
              <div className="value">{info.V_actual}</div>
              <div className="detail">{lang === "es" ? "tokens distintos" : "distinct tokens"}</div>
            </div>
            <div className="kpi">
              <div className="label">{lang === "es" ? "longitud media" : "mean doc length"}</div>
              <div className="value">{info.doc_len_mean.toFixed(1)}</div>
              <div className="detail">{lang === "es" ? "tokens / documento" : "tokens / doc"}</div>
            </div>
            <div className="kpi">
              <div className="label">{lang === "es" ? "entropía corpus" : "corpus entropy"}</div>
              <div className="value">{info.entropy_bits.toFixed(2)}</div>
              <div className="detail">bits</div>
            </div>
          </div>
          {topTokens && topTokens.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <BarWithCI
                title={lang === "es" ? "Top tokens del corpus" : "Top corpus tokens"}
                bars={topTokens.map((t) => ({ name: t.token, mean: t.count }))}
                yLabel={lang === "es" ? "conteo global" : "global count"}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Step 4 — LDA sweep (K vs perplexity vs coherence vs stability)
 * ============================================================ */
export function Step4LdaSweep({ state, update, lang }: StepProps) {
  const [sw, setSw] = useState<Awaited<ReturnType<typeof fetchLdaSweep>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setSw(null);
    void fetchLdaSweep(state.scene).then(setSw).catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && !sw && <Loading lang={lang} />}
      {sw && (
        <>
          <MultiLine
            title={lang === "es" ? `K × seed sweep (recomendado K=${sw.recommended_K})` : `K × seed sweep (recommended K=${sw.recommended_K})`}
            xLabel="K"
            series={[
              { name: lang === "es" ? "perplejidad test (norm.)" : "perplexity test (norm.)", points: sw.grid.map((g) => ({ x: g.K, y: (g.perplexity_test_mean ?? 0) / 200 })), color: "#e85e5e" },
              { name: "NPMI", points: sw.grid.map((g) => ({ x: g.K, y: g.npmi_mean })), color: "#4f8fff" },
              { name: lang === "es" ? "matched-cosine seed" : "matched-cosine seed", points: sw.grid.map((g) => ({ x: g.K, y: g.matched_cosine_mean })), color: "#5fce9b" },
              { name: lang === "es" ? "diversidad" : "diversity", points: sw.grid.map((g) => ({ x: g.K, y: g.topic_diversity_mean })), color: "#f0a060" },
            ]}
          />
          <div className="lab-controls" style={{ marginTop: 16 }}>
            <label>
              K:
              <div className="group">
                {sw.K_grid.map((k) => (
                  <button key={k} className={state.K === k || (!state.K && k === sw.recommended_K) ? "active" : ""} onClick={() => update({ K: k })}>
                    {k}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Step 5 — Intertopic distance map (LDAvis-faithful) + λ slider
 * ============================================================ */
export function Step5Intertopic({ state, update, lang }: StepProps) {
  const [tv, setTv] = useState<Awaited<ReturnType<typeof fetchTopicViews>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setTv(null);
    void fetchTopicViews(state.scene).then(setTv).catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  const points = useMemo(() => {
    if (!tv) return [];
    return tv.topic_intertopic_2d_js.map((p, i) => ({
      x: p.x,
      y: p.y,
      g: i,
      label: `T${i + 1}`,
      tip: `Topic ${i + 1} · prevalence ${(tv.topic_prevalence[i] ?? 0).toFixed(3)}`,
      r: 6 + Math.sqrt((tv.topic_prevalence[i] ?? 0) * 600),
    }));
  }, [tv]);

  // λ-relevance words for the selected topic (default: most prevalent)
  const selectedTopic = state.selectedTopic ?? 0;
  const lamKey = state.lambda <= 0.4 ? "lambda_0_3" : state.lambda <= 0.8 ? "lambda_0_6" : "lambda_1_0";
  const topWords = tv?.top_words_per_topic[selectedTopic]?.[lamKey] ?? [];

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && !tv && <Loading lang={lang} />}
      {tv && (
        <>
          <div className="lab-controls">
            <label>
              λ:
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.lambda}
                onChange={(e) => update({ lambda: parseFloat(e.target.value) })}
              />
              <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{state.lambda.toFixed(2)}</span>
            </label>
            <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              {lang === "es"
                ? "λ = 1 ranking puro p(w|k); λ = 0 ranking de exclusividad p(w|k)/p(w). Sievert & Shirley 2014."
                : "λ = 1 is plain p(w|k) ranking; λ = 0 is exclusivity p(w|k)/p(w). Sievert & Shirley 2014."}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
            <Scatter
              points={points}
              selected={selectedTopic}
              onSelect={(i) => update({ selectedTopic: i })}
              title={lang === "es" ? "Mapa intertópico (JS-MDS sobre φ)" : "Intertopic map (JS-MDS on φ)"}
              showLabels
              xLabel="JS-MDS dim 1"
              yLabel="JS-MDS dim 2"
            />
            <div className="plot">
              <h4>
                {lang === "es" ? "Top palabras de" : "Top words for"} T{selectedTopic + 1} · λ={state.lambda.toFixed(2)}
              </h4>
              <p className="sub">
                {lang === "es" ? `Prevalencia ${(tv.topic_prevalence[selectedTopic] ?? 0).toFixed(3)}` : `Prevalence ${(tv.topic_prevalence[selectedTopic] ?? 0).toFixed(3)}`}
              </p>
              <table style={{ width: "100%", fontSize: 13, marginTop: 10, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                    <th align="left" style={{ padding: 4 }}>token</th>
                    <th align="right" style={{ padding: 4 }}>relevance</th>
                  </tr>
                </thead>
                <tbody>
                  {topWords.slice(0, 16).map((w) => (
                    <tr key={w.token} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td style={{ padding: "4px 6px", fontFamily: "var(--mono)", fontSize: 12 }}>{w.token}</td>
                      <td align="right" style={{ padding: "4px 6px" }}>{w.relevance.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Step 6 — Per-topic spectral profile
 * ============================================================ */
export function Step6Spectral({ state, lang }: StepProps) {
  const [tv, setTv] = useState<Awaited<ReturnType<typeof fetchTopicViews>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [comparing, setComparing] = useState<number | null>(null);

  useEffect(() => {
    setErr(null);
    setTv(null);
    void fetchTopicViews(state.scene).then(setTv).catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  const sel = state.selectedTopic ?? 0;
  const series = tv
    ? [
        {
          name: `T${sel + 1}`,
          color: topicColor(sel),
          mean: tv.topic_band_profiles[sel] ?? [],
        },
      ]
    : [];
  if (tv && comparing != null && comparing !== sel) {
    series.push({
      name: `T${comparing + 1}`,
      color: topicColor(comparing),
      mean: tv.topic_band_profiles[comparing] ?? [],
    });
  }

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && !tv && <Loading lang={lang} />}
      {tv && (
        <>
          <div className="lab-controls">
            <label>
              {lang === "es" ? "tópico" : "topic"}:
              <div className="group">
                {tv.topic_band_profiles.map((_, i) => (
                  <button key={i} className={i === sel ? "active" : ""} style={{ borderColor: i === sel ? topicColor(i) : undefined }}>
                    T{i + 1}
                  </button>
                ))}
              </div>
            </label>
            <label>
              {lang === "es" ? "comparar con" : "compare with"}:
              <select value={comparing ?? ""} onChange={(e) => setComparing(e.target.value === "" ? null : parseInt(e.target.value, 10))}>
                <option value="">—</option>
                {tv.topic_band_profiles.map((_, i) => (
                  <option key={i} value={i}>
                    T{i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <SpectralPlot
            wavelengths={tv.wavelengths_nm}
            series={series}
            title={lang === "es" ? "Perfil espectral del tópico (φ-row × banda)" : "Topic spectral profile (φ-row × band)"}
            yLabel={lang === "es" ? "intensidad reconstruida" : "reconstructed intensity"}
          />
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Step 7 — Spatial dominance map (raster)
 * ============================================================ */
export function Step7Spatial({ state, lang }: StepProps) {
  const [t2d, setT2d] = useState<Awaited<ReturnType<typeof fetchTopicToData>> | null>(null);
  const [bin, setBin] = useState<Uint8Array | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pixel, setPixel] = useState<{ r: number; c: number; v: number } | null>(null);

  useEffect(() => {
    setErr(null);
    setT2d(null);
    setBin(null);
    void Promise.all([fetchTopicToData(state.scene), fetchDominantMapBin(state.scene)])
      .then(([t, b]) => {
        setT2d(t);
        setBin(new Uint8Array(b));
      })
      .catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  // Spatial-coherence summary
  const [sp, setSp] = useState<Awaited<ReturnType<typeof fetchSpatial>> | null>(null);
  const [spF, setSpF] = useState<Awaited<ReturnType<typeof fetchSpatialFull>> | null>(null);
  useEffect(() => {
    void fetchSpatial(state.scene).then(setSp).catch(() => setSp(null));
    void fetchSpatialFull(state.scene).then(setSpF).catch(() => setSpF(null));
  }, [state.scene]);

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && (!t2d || !bin) && <Loading lang={lang} />}
      {t2d && bin && (
        <>
          <RasterMap
            data={bin}
            shape={t2d.spatial_shape}
            sentinel={t2d.dominant_topic_map.sentinel_unlabelled}
            K={t2d.topic_count}
            title={lang === "es" ? `Mapa de tópico dominante · K=${t2d.topic_count}` : `Dominant topic map · K=${t2d.topic_count}`}
            onPixel={(r, c, v) => setPixel({ r, c, v })}
          />
          <div className="kpis" style={{ marginTop: 16 }}>
            {sp && (
              <div className="kpi">
                <div className="label">Moran's I (categorical)</div>
                <div className="value">{sp.morans_I_weighted_by_topic_support.toFixed(3)}</div>
                <div className="detail">{lang === "es" ? "submuestreo canónico" : "canonical subsample"}</div>
              </div>
            )}
            {spF && (
              <div className="kpi">
                <div className="label">Moran's I (full-pixel)</div>
                <div className="value">{spF.aggregated_morans_I_mean_over_topics.toFixed(3)}</div>
                <div className="detail">{lang === "es" ? "re-fit completo (B-10)" : "full-pixel refit (B-10)"}</div>
              </div>
            )}
            {sp && (
              <div className="kpi">
                <div className="label">{lang === "es" ? "max IoU vs clase" : "max IoU vs class"}</div>
                <div className="value">{sp.best_iou_summary.max_iou_overall.toFixed(3)}</div>
                <div className="detail">{lang === "es" ? "mejor solapamiento" : "best overlap"}</div>
              </div>
            )}
            {pixel && (
              <div className="kpi">
                <div className="label">{lang === "es" ? "píxel inspeccionado" : "inspected pixel"}</div>
                <div className="value">
                  {pixel.v === t2d.dominant_topic_map.sentinel_unlabelled ? "—" : `T${pixel.v + 1}`}
                </div>
                <div className="detail">({pixel.r}, {pixel.c})</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
 * Step 8 — External alignment (USGS chapters per topic)
 * ============================================================ */
export function Step8External({ state, lang }: StepProps) {
  const [u, setU] = useState<Awaited<ReturnType<typeof fetchUsgs>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    setU(null);
    void fetchUsgs(state.scene).then(setU).catch((e: Error) => setErr(e.message));
  }, [state.scene]);

  const sel = state.selectedTopic ?? 0;
  const top = u?.top_n_per_topic[sel] ?? [];
  const hist = u?.chapter_histogram_top50_per_topic[sel] ?? {};

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && !u && <Loading lang={lang} />}
      {u && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="plot">
            <h4>{lang === "es" ? `Top-20 USGS para T${sel + 1}` : `Top-20 USGS for T${sel + 1}`}</h4>
            <p className="sub">{u.library_sample_count} {lang === "es" ? "espectros · 7 capítulos" : "spectra · 7 chapters"}</p>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                  <th align="left">name</th>
                  <th>chapter</th>
                  <th align="right">cos</th>
                </tr>
              </thead>
              <tbody>
                {top.slice(0, 12).map((m) => (
                  <tr key={m.name + m.rank} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    <td style={{ padding: "3px 4px", fontFamily: "var(--mono)" }}>{m.name.slice(0, 38)}</td>
                    <td><span className="tag">{m.chapter}</span></td>
                    <td align="right">{m.cosine.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <BarWithCI
            title={lang === "es" ? `Histograma de capítulos (top-50) para T${sel + 1}` : `Chapter histogram (top-50) for T${sel + 1}`}
            bars={Object.entries(hist).map(([k, v]) => ({ name: k, mean: v }))}
            yLabel={lang === "es" ? "matches" : "matches"}
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Step 9 — Downstream battery
 * ============================================================ */
export function Step9Downstream({ state, lang }: StepProps) {
  const [view, setView] = useState<"linear" | "routed" | "embedded">("routed");
  const [lp, setLp] = useState<Awaited<ReturnType<typeof fetchLinearProbe>> | null>(null);
  const [tr, setTr] = useState<Awaited<ReturnType<typeof fetchTopicRouted>> | null>(null);
  const [eb, setEb] = useState<Awaited<ReturnType<typeof fetchEmbedded>> | null>(null);
  useEffect(() => {
    void fetchLinearProbe(state.scene).then(setLp).catch(() => setLp(null));
    void fetchTopicRouted(state.scene).then(setTr).catch(() => setTr(null));
    void fetchEmbedded(state.scene).then(setEb).catch(() => setEb(null));
  }, [state.scene]);

  const bars = useMemo(() => {
    if (view === "linear" && lp) {
      return lp.ranking_by_macro_f1_mean.slice(0, 12).map((r) => ({
        name: r.method,
        mean: r.macro_f1_mean,
        lo: r.macro_f1_ci95[0],
        hi: r.macro_f1_ci95[1],
      }));
    }
    if (view === "routed" && tr) {
      return tr.ranking_by_macro_f1_mean.map((r) => ({
        name: r.method,
        mean: r.macro_f1_mean,
        lo: r.macro_f1_ci95[0],
        hi: r.macro_f1_ci95[1],
      }));
    }
    if (view === "embedded" && eb) {
      return eb.ranking_by_macro_f1_mean.map((r) => ({
        name: r.method,
        mean: r.macro_f1_mean,
        lo: r.macro_f1_ci95[0],
        hi: r.macro_f1_ci95[1],
      }));
    }
    return [];
  }, [view, lp, tr, eb]);

  const title =
    view === "linear"
      ? lang === "es"
        ? "B-1 Linear probe panel (5-fold, CI95)"
        : "B-1 Linear probe panel (5-fold, CI95)"
      : view === "routed"
      ? lang === "es"
        ? "B-3 Topic-routed classifier (soft theta gating)"
        : "B-3 Topic-routed classifier (soft theta gating)"
      : lang === "es"
      ? "B-5 Embedded concat baseline ([θ | PCA-K])"
      : "B-5 Embedded concat baseline ([θ | PCA-K])";

  return (
    <div>
      <div className="lab-controls">
        <div className="group">
          <button className={view === "linear" ? "active" : ""} onClick={() => setView("linear")}>
            B-1 linear probe
          </button>
          <button className={view === "routed" ? "active" : ""} onClick={() => setView("routed")}>
            B-3 topic_routed
          </button>
          <button className={view === "embedded" ? "active" : ""} onClick={() => setView("embedded")}>
            B-5 embedded
          </button>
        </div>
      </div>
      {bars.length === 0 && <Loading lang={lang} />}
      {bars.length > 0 && (
        <BarWithCI
          title={title}
          xLabel={lang === "es" ? "método" : "method"}
          yLabel="macro F1"
          bars={bars}
          highlight={view === "routed" ? "topic_routed_soft" : undefined}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Step 10 — Bayesian posterior (forest plot, labelled scenes)
 * ============================================================ */
export function Step10Bayesian({ lang }: StepProps) {
  const [b, setB] = useState<Awaited<ReturnType<typeof fetchBayesianLabelled>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void fetchBayesianLabelled().then(setB).catch((e: Error) => setErr(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!b) return [];
    const sorted = [...b.method_posteriors].sort((a, c) => c.posterior_mean - a.posterior_mean);
    return sorted.map((m, i) => ({
      name: m.method,
      mean: m.posterior_mean,
      lo: m.hdi94_lo,
      hi: m.hdi94_hi,
      color: i === 0 ? "#5fce9b" : undefined,
    }));
  }, [b]);

  // Pairwise dominance matrix
  const pairwise = useMemo(() => {
    if (!b) return null;
    const names = b.method_names;
    const mat = names.map((a) =>
      names.map((c) => (a === c ? NaN : b.pairwise_p_a_gt_b[a]?.[c] ?? NaN))
    );
    return { names, mat };
  }, [b]);

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && !b && <Loading lang={lang} />}
      {b && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ForestPlot
            title={lang === "es" ? "Posterior μ + HDI94 (escenas etiquetadas)" : "Posterior μ + HDI94 (labelled scenes)"}
            rows={rows}
            xLabel={lang === "es" ? "efecto método" : "method effect"}
          />
          {pairwise && (
            <Heatmap
              title="P(μ_row > μ_col)"
              matrix={pairwise.mat}
              rowLabels={pairwise.names}
              colLabels={pairwise.names}
              cellRange={[0, 1]}
              formatVal={(v) => v.toFixed(2)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Step 11 — Reconstruction (rate-distortion curves)
 * ============================================================ */
export function Step11Reconstruction({ state, lang }: StepProps) {
  const [r, setR] = useState<Awaited<ReturnType<typeof fetchRateDistortion>> | null>(null);
  const [mi, setMi] = useState<Awaited<ReturnType<typeof fetchMutualInfo>> | null>(null);
  useEffect(() => {
    void fetchRateDistortion(state.scene).then(setR).catch(() => setR(null));
    void fetchMutualInfo(state.scene).then(setMi).catch(() => setMi(null));
  }, [state.scene]);

  return (
    <div>
      {!r && <Loading lang={lang} />}
      {r && (
        <MultiLine
          title={lang === "es" ? "Rate-distortion: K → RMSE test (B-2)" : "Rate-distortion: K → RMSE test (B-2)"}
          xLabel="K"
          yLabel="RMSE test"
          series={[
            { name: "LDA", color: "#4f8fff", points: r.method_curves.lda?.map((c) => ({ x: c.K, y: c.rmse_test })) ?? [] },
            { name: "NMF", color: "#5fce9b", points: r.method_curves.nmf?.map((c) => ({ x: c.K, y: c.rmse_test })) ?? [] },
            { name: "PCA", color: "#f0a060", points: r.method_curves.pca?.map((c) => ({ x: c.K, y: c.rmse_test })) ?? [] },
          ]}
        />
      )}
      {mi && (
        <div style={{ marginTop: 16 }}>
          <BarWithCI
            title={lang === "es" ? "B-4 MI(theta; label) vs MI(otras compresiones K-dim; label)" : "B-4 MI(theta; label) vs MI(other K-dim compressions; label)"}
            yLabel="joint MI clipped (nats)"
            bars={mi.ranking_by_joint_mi.slice(0, 10).map((m) => ({ name: m.method, mean: m.joint_mi_clipped }))}
            highlight="theta"
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Step 12 — Cross-scene transfer (5×5 heatmap)
 * ============================================================ */
export function Step12Transfer({ lang }: StepProps) {
  const [tr, setTr] = useState<Awaited<ReturnType<typeof fetchCrossScene>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void fetchCrossScene().then(setTr).catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <div>
      {err && <ErrorBox msg={err} />}
      {!err && !tr && <Loading lang={lang} />}
      {tr && (
        <Heatmap
          title={lang === "es" ? "Macro F1 transferida (source → target) sobre grilla AVIRIS-1997 común" : "Transferred macro F1 (source → target) on common AVIRIS-1997 grid"}
          matrix={tr.transfer_matrix_macro_f1}
          rowLabels={tr.scene_order.map((s) => s.replace(/-corrected/, ""))}
          colLabels={tr.scene_order.map((s) => s.replace(/-corrected/, ""))}
          cellRange={[0, 1]}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Step 13 — Per-seed stability matrix (Hungarian-matched cosine)
 * ============================================================ */
export function Step13Stability({ state, lang }: StepProps) {
  const [s, setS] = useState<Awaited<ReturnType<typeof fetchTopicStability>> | null>(null);
  const [cm, setCm] = useState<Awaited<ReturnType<typeof fetchCrossMethod>> | null>(null);
  const [an, setAn] = useState<Awaited<ReturnType<typeof fetchAnomaly>> | null>(null);
  const [em, setEm] = useState<Awaited<ReturnType<typeof fetchEndmember>> | null>(null);
  useEffect(() => {
    void fetchTopicStability(state.scene).then(setS).catch(() => setS(null));
    void fetchCrossMethod(state.scene).then(setCm).catch(() => setCm(null));
    void fetchAnomaly(state.scene).then(setAn).catch(() => setAn(null));
    void fetchEndmember(state.scene).then(setEm).catch(() => setEm(null));
  }, [state.scene]);

  return (
    <div>
      {s && (
        <Heatmap
          title={lang === "es" ? "B-6 Estabilidad por seeds — cosine matched 7×7" : "B-6 Per-seed stability — matched cosine 7×7"}
          matrix={s.seed_pair_matched_cosine_mean}
          rowLabels={s.seeds.map((sd) => `seed ${sd}`)}
          colLabels={s.seeds.map((sd) => `seed ${sd}`)}
          cellRange={[0.85, 1]}
        />
      )}

      {cm && (
        <div style={{ marginTop: 16 }}>
          <Heatmap
            title={lang === "es" ? "Acuerdo entre métodos (NMI)" : "Cross-method agreement (NMI)"}
            matrix={cm.pairwise_nmi}
            rowLabels={cm.partitions}
            colLabels={cm.partitions}
            cellRange={[0, 1]}
          />
        </div>
      )}

      <div className="kpis" style={{ marginTop: 16 }}>
        {an && (
          <div className="kpi">
            <div className="label">B-9 ρ(NLL, miscls)</div>
            <div className="value">{an.anomaly_to_misclassification_correlation.spearman_rho_nll.toFixed(3)}</div>
            <div className="detail">Spearman</div>
          </div>
        )}
        {em && (
          <div className="kpi">
            <div className="label">B-11 RMSE (norm)</div>
            <div className="value">{em.reconstruction_rmse_normalised.toFixed(3)}</div>
            <div className="detail">NFINDR + NNLS</div>
          </div>
        )}
        {s && (
          <div className="kpi">
            <div className="label">{lang === "es" ? "estabilidad media" : "stability mean"}</div>
            <div className="value">{s.scene_stability_summary.off_diagonal_mean.toFixed(3)}</div>
            <div className="detail">{lang === "es" ? "off-diagonal" : "off-diagonal"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
