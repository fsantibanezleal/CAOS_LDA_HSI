import { useMemo } from "react";

import { type ExplorationSceneView, type SubsetCard, pickText } from "../../../lib/api";
import { useStore } from "../../../store/useStore";
import { topicColor } from "../SelectionBar";
import { tokenToWavelength } from "../workspaceUtils";

interface Props {
  card: SubsetCard;
  scene: ExplorationSceneView | null;
  language: "en" | "es";
}

const PIXEL_PALETTE = topicColor;

/**
 * Topics step — the LDAvis-equivalent triptych.
 *
 * Three coordinated panels:
 *  1. Intertopic map (left): topic discs in 2D, click to focus, ⌘-click to compare.
 *  2. Top-words (center): bars per band-token, λ slider drives ranking.
 *  3. Topic profile (right): full band-profile line + class loadings for the
 *     selected topic.
 *
 * Bidirectional brushing:
 * - Click topic → all panels update.
 * - Hover word → intertopic discs resize to P(topic | word).
 * - Click word → highlights that band's vertical line on profile + sets recipe
 *   wavelength range.
 * - Click class loading bar → adds the class to the global selection.
 */
export function TopicsStep({ card, scene, language }: Props) {
  const isEn = language === "en";
  const selection = useStore((s) => s.selection);
  const toggleTopic = useStore((s) => s.toggleTopic);
  const toggleClass = useStore((s) => s.toggleClass);
  const setWavelengthRange = useStore((s) => s.setWavelengthRange);

  if (!scene) {
    return (
      <div className="ws-empty">
        {isEn
          ? "No exploration view available for this subset's primary scene yet. Run scripts/local.* build-exploration-views."
          : "Aún no hay vista de exploración para la escena primaria de este subset. Corre scripts/local.* build-exploration-views."}
      </div>
    );
  }

  const K = scene.topic_count;
  const wavelengths = scene.wavelengths_nm;
  const profiles = scene.topic_band_profiles;
  const xy = scene.topic_intertopic_xy;
  const cosineSim = scene.topic_cosine_sim;
  const peakWl = scene.topic_peak_wavelength_nm;
  const concentration = scene.topic_top10_concentration;
  const classMixture = scene.class_topic_loadings;
  const classMeta = scene.class_summaries;

  const primaryTopic = selection.activeTopicIds[0] ?? null;
  const compareTopic = selection.activeTopicIds[1] ?? null;
  const compareThirdTopic = selection.activeTopicIds[2] ?? null;
  const focusedTopics = selection.activeTopicIds.length > 0 ? selection.activeTopicIds : Array.from({ length: K }, (_, i) => i);

  // Top-N words per topic re-ranked by relevance(λ): λ * log P(w|k) + (1-λ) * log P(w|k)/P(w)
  const wordsPerTopic = useMemo(() => {
    const topicMeta = scene.topics;
    if (topicMeta.length === 0) return [];
    // Approximate global P(w) by averaging P(w|k) across topics.
    const globalP: Record<string, number> = {};
    let topicCount = 0;
    for (const t of topicMeta) {
      topicCount += 1;
      for (const w of t.top_words) {
        globalP[w.token] = (globalP[w.token] ?? 0) + (w.weight as number);
      }
    }
    Object.keys(globalP).forEach((tok) => {
      globalP[tok] = globalP[tok] / topicCount;
    });
    const lam = selection.lambda;
    return topicMeta.map((t) => {
      const ranked = t.top_words.map((w) => {
        const p = w.weight as number;
        const pAvg = globalP[w.token] ?? p;
        const lift = pAvg > 1e-12 ? p / pAvg : 1;
        const logP = Math.log(Math.max(p, 1e-12));
        const logLift = Math.log(Math.max(lift, 1e-12));
        const relevance = lam * logP + (1 - lam) * logLift;
        return { token: w.token as string, weight: p, lift, relevance };
      });
      ranked.sort((a, b) => b.relevance - a.relevance);
      return ranked.slice(0, selection.topNWords);
    });
  }, [scene, selection.lambda, selection.topNWords]);

  const handleTopicClick = (topicIdx: number, event: React.MouseEvent) => {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey || event.shiftKey || selection.activeTopicIds.length > 0) {
      toggleTopic(topicIdx);
    } else {
      // First click: pin only this topic
      const current = selection.activeTopicIds;
      if (current.length === 1 && current[0] === topicIdx) {
        toggleTopic(topicIdx);
      } else {
        // clear and add
        useStore.getState().clearTopics();
        useStore.getState().toggleTopic(topicIdx);
      }
    }
  };

  return (
    <div className="ws-topics-grid">
      <IntertopicMap
        xy={xy}
        cosineSim={cosineSim}
        peakWl={peakWl}
        concentration={concentration}
        topicCount={K}
        focusedTopics={focusedTopics}
        primaryTopic={primaryTopic}
        compareTopic={compareTopic}
        compareThirdTopic={compareThirdTopic}
        onTopicClick={handleTopicClick}
        isEn={isEn}
      />
      <TopWordsPanel
        wordsPerTopic={wordsPerTopic}
        primaryTopic={primaryTopic}
        compareTopic={compareTopic}
        topicCount={K}
        focusedTopics={focusedTopics}
        lambda={selection.lambda}
        onWordClick={(token) => {
          const wl = tokenToWavelength(token);
          if (wl !== null) {
            setWavelengthRange([Math.max(wavelengths[0], wl - 50), Math.min(wavelengths[wavelengths.length - 1], wl + 50)]);
          }
        }}
        isEn={isEn}
      />
      <TopicProfilePanel
        profiles={profiles}
        wavelengths={wavelengths}
        topicCount={K}
        primaryTopic={primaryTopic}
        compareTopic={compareTopic}
        focusedTopics={focusedTopics}
        wavelengthRange={selection.wavelengthRange}
        isEn={isEn}
      />
      <ClassLoadingsPanel
        classMixture={classMixture}
        classMeta={classMeta}
        primaryTopic={primaryTopic}
        compareTopic={compareTopic}
        topicCount={K}
        activeClassIds={selection.activeClassIds}
        onClassClick={(classId) => toggleClass(classId)}
        isEn={isEn}
      />
      <SimilarityMatrixPanel
        matrix={cosineSim}
        wordJaccard={scene.topic_word_jaccard}
        topicCount={K}
        primaryTopic={primaryTopic}
        compareTopic={compareTopic}
        onCellClick={(i, j) => {
          if (i === j) {
            useStore.getState().clearTopics();
            useStore.getState().toggleTopic(i);
          } else {
            useStore.getState().clearTopics();
            useStore.getState().toggleTopic(i);
            useStore.getState().toggleTopic(j);
          }
        }}
        isEn={isEn}
      />
      <ScenePreviewPanel scene={scene} card={card} language={language} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel: Intertopic map (2D scatter with discs sized by concentration)
// ---------------------------------------------------------------------------

function IntertopicMap({
  xy,
  cosineSim: _cosine,
  peakWl,
  concentration,
  topicCount,
  focusedTopics,
  primaryTopic,
  compareTopic,
  compareThirdTopic,
  onTopicClick,
  isEn
}: {
  xy: number[][];
  cosineSim: number[][];
  peakWl: number[];
  concentration: number[];
  topicCount: number;
  focusedTopics: number[];
  primaryTopic: number | null;
  compareTopic: number | null;
  compareThirdTopic: number | null;
  onTopicClick: (i: number, event: React.MouseEvent) => void;
  isEn: boolean;
}) {
  void _cosine;
  const width = 360;
  const height = 320;
  const padding = 32;
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const sMax = Math.max(...concentration, 0.0001);

  const sx = (v: number) => {
    if (xMax === xMin) return width / 2;
    return padding + ((v - xMin) / (xMax - xMin)) * (width - padding * 2);
  };
  const sy = (v: number) => {
    if (yMax === yMin) return height / 2;
    return padding + (1 - (v - yMin) / (yMax - yMin)) * (height - padding * 2);
  };
  const sr = (v: number) => 8 + (v / sMax) * 22;

  return (
    <section className="ws-panel ws-panel-intertopic">
      <header className="ws-panel-header">
        <h4>{isEn ? "Intertopic map" : "Mapa intertópico"}</h4>
        <p>
          {isEn
            ? "PCA on topic band-profiles. Disc size = top-10 weight share. Click to focus; ⌘-click adds to compare."
            : "PCA sobre perfiles de banda. Tamaño del disco = peso de top-10. Click para foco; ⌘-click compara."}
        </p>
      </header>
      <svg viewBox={`0 0 ${width} ${height}`} className="ws-svg ws-intertopic-svg">
        <line className="ws-axis" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <line className="ws-axis" x1={padding} x2={padding} y1={padding} y2={height - padding} />
        {xy.map((p, i) => {
          const cx = sx(p[0]);
          const cy = sy(p[1]);
          const r = sr(concentration[i]);
          const isPrimary = primaryTopic === i;
          const isCompare = compareTopic === i;
          const isThird = compareThirdTopic === i;
          const isFocused = focusedTopics.includes(i);
          return (
            <g key={i} onClick={(ev) => onTopicClick(i, ev)} style={{ cursor: "pointer" }}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={topicColor(i)}
                fillOpacity={isFocused ? 0.7 : 0.18}
                stroke={isPrimary ? "#ffffff" : isCompare || isThird ? topicColor(i) : "transparent"}
                strokeWidth={isPrimary ? 3 : isCompare || isThird ? 2 : 0}
              />
              <text x={cx} y={cy + 4} textAnchor="middle" className="ws-intertopic-label">
                {i + 1}
              </text>
              <title>
                {`Topic ${i + 1} · peak ${peakWl[i]?.toFixed(0) ?? "?"} nm · concentration ${concentration[i]?.toFixed(2)}`}
              </title>
            </g>
          );
        })}
      </svg>
      <footer className="ws-panel-footer">
        <span>K = {topicCount}</span>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel: Top words bars (LDAvis-faithful with λ relevance)
// ---------------------------------------------------------------------------

function TopWordsPanel({
  wordsPerTopic,
  primaryTopic,
  compareTopic,
  topicCount,
  focusedTopics: _focus,
  lambda,
  onWordClick,
  isEn
}: {
  wordsPerTopic: Array<Array<{ token: string; weight: number; lift: number; relevance: number }>>;
  primaryTopic: number | null;
  compareTopic: number | null;
  topicCount: number;
  focusedTopics: number[];
  lambda: number;
  onWordClick: (token: string) => void;
  isEn: boolean;
}) {
  void _focus;
  const sourceTopic = primaryTopic ?? 0;
  const aWords = wordsPerTopic[sourceTopic] ?? [];
  const bWords = compareTopic !== null ? wordsPerTopic[compareTopic] ?? [] : null;
  const aMaxWeight = Math.max(...aWords.map((w) => w.weight), 0.0001);

  return (
    <section className="ws-panel ws-panel-words">
      <header className="ws-panel-header">
        <h4>
          {isEn ? "Top words by relevance" : "Top palabras por relevancia"} ·{" "}
          <span className="ws-mono">λ = {lambda.toFixed(2)}</span>
        </h4>
        <p>
          {isEn
            ? "λ=1: rank by P(w|topic). λ=0: rank by lift = P(w|topic)/P(w). Click a token to zoom the wavelength range."
            : "λ=1: ranking por P(w|topic). λ=0: ranking por lift. Click en un token para hacer zoom al rango de wavelength."}
        </p>
      </header>
      {primaryTopic === null ? (
        <p className="ws-panel-hint">
          {isEn
            ? "No topic selected. Click a topic disc on the map to populate the top-words list."
            : "Sin tópico seleccionado. Click en el mapa para poblar la lista de palabras."}
        </p>
      ) : (
        <div className="ws-words-grid">
          <TopWordsColumn
            words={aWords}
            color={topicColor(sourceTopic)}
            label={`Topic ${sourceTopic + 1}`}
            maxWeight={aMaxWeight}
            onClick={onWordClick}
          />
          {bWords && compareTopic !== null && (
            <TopWordsColumn
              words={bWords}
              color={topicColor(compareTopic)}
              label={`Topic ${compareTopic + 1}`}
              maxWeight={Math.max(...bWords.map((w) => w.weight), 0.0001)}
              onClick={onWordClick}
            />
          )}
        </div>
      )}
      {bWords && compareTopic !== null && (
        <WordOverlapPanel a={aWords} b={bWords} aIdx={sourceTopic} bIdx={compareTopic} isEn={isEn} />
      )}
      <footer className="ws-panel-footer">
        <span>{wordsPerTopic[sourceTopic]?.length ?? 0} words ranked of {topicCount} topics</span>
      </footer>
    </section>
  );
}

function TopWordsColumn({
  words,
  color,
  label,
  maxWeight,
  onClick
}: {
  words: Array<{ token: string; weight: number; lift: number; relevance: number }>;
  color: string;
  label: string;
  maxWeight: number;
  onClick: (token: string) => void;
}) {
  return (
    <div className="ws-words-col">
      <div className="ws-words-col-head" style={{ color }}>{label}</div>
      <ul className="ws-words-list">
        {words.map((w) => (
          <li key={w.token}>
            <button
              type="button"
              className="ws-word-row"
              onClick={() => onClick(w.token)}
              title={`P(w|t)=${w.weight.toFixed(4)} · lift=${w.lift.toFixed(2)} · relevance=${w.relevance.toFixed(2)}`}
            >
              <span className="ws-word-token">{w.token}</span>
              <span className="ws-word-bar">
                <span style={{ width: `${(w.weight / maxWeight) * 100}%`, background: color }} />
              </span>
              <span className="ws-word-value">{w.weight.toFixed(4)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WordOverlapPanel({
  a,
  b,
  aIdx,
  bIdx,
  isEn
}: {
  a: Array<{ token: string; weight: number; lift: number; relevance: number }>;
  b: Array<{ token: string; weight: number; lift: number; relevance: number }>;
  aIdx: number;
  bIdx: number;
  isEn: boolean;
}) {
  const aTokens = new Set(a.map((w) => w.token));
  const bTokens = new Set(b.map((w) => w.token));
  const shared: string[] = [];
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  aTokens.forEach((t) => (bTokens.has(t) ? shared.push(t) : onlyA.push(t)));
  bTokens.forEach((t) => {
    if (!aTokens.has(t)) onlyB.push(t);
  });
  const jaccard = aTokens.size + bTokens.size === 0 ? 0 : shared.length / (aTokens.size + bTokens.size - shared.length);
  return (
    <div className="ws-words-overlap">
      <div className="ws-words-overlap-head">
        <span style={{ color: topicColor(aIdx) }}>T{aIdx + 1}</span>
        ↔
        <span style={{ color: topicColor(bIdx) }}>T{bIdx + 1}</span>
        <span className="ws-mono"> Jaccard {jaccard.toFixed(2)}</span>
      </div>
      <div className="ws-words-overlap-cols">
        <div>
          <strong>{isEn ? "Shared" : "Compartidas"}</strong>
          <span>{shared.join(", ") || "—"}</span>
        </div>
        <div>
          <strong style={{ color: topicColor(aIdx) }}>only T{aIdx + 1}</strong>
          <span>{onlyA.join(", ") || "—"}</span>
        </div>
        <div>
          <strong style={{ color: topicColor(bIdx) }}>only T{bIdx + 1}</strong>
          <span>{onlyB.join(", ") || "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel: Topic profile (band profile line + topic ↔ topic compare)
// ---------------------------------------------------------------------------

function TopicProfilePanel({
  profiles,
  wavelengths,
  topicCount,
  primaryTopic,
  compareTopic,
  focusedTopics,
  wavelengthRange,
  isEn
}: {
  profiles: number[][];
  wavelengths: number[];
  topicCount: number;
  primaryTopic: number | null;
  compareTopic: number | null;
  focusedTopics: number[];
  wavelengthRange: [number, number] | null;
  isEn: boolean;
}) {
  const width = 720;
  const height = 240;
  const padding = { left: 50, right: 16, top: 16, bottom: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = profiles.flat();
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const xMin = wavelengths[0] ?? 0;
  const xMax = wavelengths[wavelengths.length - 1] ?? 1;

  const sx = (i: number) => {
    const wl = wavelengths[i] ?? i;
    if (xMax === xMin) return padding.left;
    return padding.left + ((wl - xMin) / (xMax - xMin)) * innerW;
  };
  const sy = (v: number) => {
    if (yMax === yMin) return padding.top + innerH / 2;
    return padding.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  };

  const showDiff = primaryTopic !== null && compareTopic !== null;

  return (
    <section className="ws-panel ws-panel-profile">
      <header className="ws-panel-header">
        <h4>
          {isEn ? "Topic band profile" : "Perfil de banda del tópico"}
        </h4>
        <p>
          {isEn
            ? "Reconstructed spectrum per topic. Range slider in the selection bar zooms the x axis. Compare mode shows the difference at the bottom."
            : "Espectro reconstruido por tópico. El slider de rango en la barra de selección hace zoom al eje x. En modo compare aparece la diferencia abajo."}
        </p>
      </header>
      <svg viewBox={`0 0 ${width} ${height}`} className="ws-svg">
        {/* Wavelength range mask */}
        {wavelengthRange && (
          <>
            <rect
              x={padding.left}
              y={padding.top}
              width={Math.max(0, ((wavelengthRange[0] - xMin) / (xMax - xMin)) * innerW)}
              height={innerH}
              className="ws-range-mask"
            />
            <rect
              x={padding.left + ((wavelengthRange[1] - xMin) / (xMax - xMin)) * innerW}
              y={padding.top}
              width={Math.max(
                0,
                innerW - ((wavelengthRange[1] - xMin) / (xMax - xMin)) * innerW
              )}
              height={innerH}
              className="ws-range-mask"
            />
          </>
        )}
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const v = yMin + (yMax - yMin) * t;
          const y = sy(v);
          return (
            <g key={i}>
              <line className="ws-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="ws-axis-label" x={padding.left - 6} y={y + 3} textAnchor="end">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* X axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const x = padding.left + t * innerW;
          const wl = xMin + t * (xMax - xMin);
          return (
            <text
              key={i}
              className="ws-axis-label"
              x={x}
              y={height - padding.bottom + 14}
              textAnchor="middle"
            >
              {Math.round(wl)} nm
            </text>
          );
        })}
        {/* Lines */}
        {profiles.map((profile, idx) => {
          const isPrimary = primaryTopic === idx;
          const isCompare = compareTopic === idx;
          const isFocused = focusedTopics.includes(idx);
          const opacity = isPrimary || isCompare ? 1 : isFocused ? 0.85 : 0.18;
          const sw = isPrimary ? 2.4 : isCompare ? 2.0 : 1.2;
          const path = profile
            .map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
            .join(" ");
          return (
            <path key={idx} d={path} fill="none" stroke={topicColor(idx)} strokeWidth={sw} opacity={opacity} />
          );
        })}
        {/* Difference baseline if comparing */}
        {showDiff && primaryTopic !== null && compareTopic !== null && (
          <path
            d={profiles[primaryTopic]
              .map((v, i) => {
                const diff = v - profiles[compareTopic][i];
                const y = sy(yMin + (diff - (yMin - yMax) / 2) * 0.3 + yMax * 0.05);
                return `${i === 0 ? "M" : "L"} ${sx(i).toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="#ef6f6c"
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      <footer className="ws-panel-footer">
        <span>
          {isEn ? "Topics:" : "Tópicos:"} {topicCount} ·{" "}
          {showDiff
            ? isEn
              ? "Δ shown as red dashed line"
              : "Δ mostrada como línea roja punteada"
            : isEn
              ? "select two topics to overlay diff"
              : "selecciona dos tópicos para ver el diff"}
        </span>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel: Class loadings (which classes prefer which topic)
// ---------------------------------------------------------------------------

function ClassLoadingsPanel({
  classMixture,
  classMeta,
  primaryTopic,
  compareTopic,
  topicCount: _K,
  activeClassIds,
  onClassClick,
  isEn
}: {
  classMixture: number[][];
  classMeta: Array<{ label_id: number | null; name: string | null; count: number | null; dominant_topic: number | null; topic_entropy: number | null }>;
  primaryTopic: number | null;
  compareTopic: number | null;
  topicCount: number;
  activeClassIds: number[];
  onClassClick: (id: number) => void;
  isEn: boolean;
}) {
  void _K;
  const sortIdx = useMemo(() => {
    if (primaryTopic === null) {
      return classMeta.map((_, i) => i).sort((a, b) => (classMeta[b].count ?? 0) - (classMeta[a].count ?? 0));
    }
    return classMeta
      .map((_, i) => i)
      .sort((a, b) => (classMixture[b]?.[primaryTopic] ?? 0) - (classMixture[a]?.[primaryTopic] ?? 0));
  }, [classMeta, classMixture, primaryTopic]);

  const showCompare = compareTopic !== null && primaryTopic !== compareTopic;

  return (
    <section className="ws-panel ws-panel-loadings">
      <header className="ws-panel-header">
        <h4>{isEn ? "Class loadings on selected topic" : "Carga de clases en el tópico seleccionado"}</h4>
        <p>
          {isEn
            ? "Mean θ_k per class. Click a bar to pin the class. In compare mode you see Δθ between primary and second topic."
            : "Mean θ_k por clase. Click una barra para fijar la clase. En modo compare ves Δθ entre el primer y segundo tópico."}
        </p>
      </header>
      {primaryTopic === null ? (
        <p className="ws-panel-hint">
          {isEn ? "Select a topic to see class loadings." : "Selecciona un tópico para ver carga de clases."}
        </p>
      ) : (
        <ul className="ws-class-loadings">
          {sortIdx.map((ci) => {
            const cls = classMeta[ci];
            const cid = cls.label_id;
            const wPrimary = classMixture[ci]?.[primaryTopic] ?? 0;
            const wCompare = compareTopic !== null ? classMixture[ci]?.[compareTopic] ?? 0 : 0;
            const delta = wPrimary - wCompare;
            const pinned = cid !== null && activeClassIds.includes(cid);
            return (
              <li key={ci}>
                <button
                  type="button"
                  className={pinned ? "ws-class-row is-pinned" : "ws-class-row"}
                  onClick={() => cid !== null && onClassClick(cid)}
                  title={cls.name ?? `class ${cid}`}
                >
                  <span className="ws-class-name">{cls.name ?? `class ${cid}`}</span>
                  <span className="ws-class-count">{cls.count ?? "—"}</span>
                  <span className="ws-class-bar">
                    <span
                      style={{
                        width: `${Math.max(2, Math.min(100, wPrimary * 100))}%`,
                        background: topicColor(primaryTopic)
                      }}
                    />
                    {showCompare && (
                      <span
                        className="ws-class-bar-compare"
                        style={{
                          width: `${Math.max(0, Math.min(100, wCompare * 100))}%`,
                          background: topicColor(compareTopic ?? 0)
                        }}
                      />
                    )}
                  </span>
                  <span className="ws-class-value">{(wPrimary * 100).toFixed(1)}%</span>
                  {showCompare && (
                    <span
                      className={`ws-class-delta ${delta >= 0 ? "is-up" : "is-down"}`}
                      title={`Δ vs T${(compareTopic ?? 0) + 1}`}
                    >
                      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}%
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel: similarity matrix (clickable cells)
// ---------------------------------------------------------------------------

function SimilarityMatrixPanel({
  matrix,
  wordJaccard,
  topicCount,
  primaryTopic,
  compareTopic,
  onCellClick,
  isEn
}: {
  matrix: number[][];
  wordJaccard: number[][];
  topicCount: number;
  primaryTopic: number | null;
  compareTopic: number | null;
  onCellClick: (i: number, j: number) => void;
  isEn: boolean;
}) {
  const cellSize = Math.max(20, Math.min(40, 280 / topicCount));
  return (
    <section className="ws-panel ws-panel-matrix">
      <header className="ws-panel-header">
        <h4>{isEn ? "Topic-topic similarity" : "Similitud tópico-tópico"}</h4>
        <p>
          {isEn
            ? "Upper triangle: cosine on band profiles. Lower triangle: top-word Jaccard. Click a cell to compare those two topics."
            : "Triángulo superior: coseno sobre perfiles. Inferior: Jaccard de top-words. Click en una celda para comparar."}
        </p>
      </header>
      <div className="ws-matrix-wrap">
        <table className="ws-matrix">
          <thead>
            <tr>
              <th></th>
              {Array.from({ length: topicCount }, (_, j) => (
                <th key={j} style={{ color: topicColor(j) }}>
                  T{j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <th style={{ color: topicColor(i) }}>T{i + 1}</th>
                {row.map((value, j) => {
                  const isUpper = j >= i;
                  const display = isUpper ? value : wordJaccard[i]?.[j] ?? 0;
                  const intensity = Math.max(0, Math.min(1, isUpper ? display : display));
                  const bg = `rgba(91,141,239,${(0.08 + intensity * 0.7).toFixed(3)})`;
                  const isHot =
                    (primaryTopic === i && compareTopic === j) ||
                    (primaryTopic === j && compareTopic === i);
                  return (
                    <td
                      key={j}
                      style={{ background: bg, width: cellSize, height: cellSize }}
                      className={isHot ? "ws-matrix-cell is-hot" : "ws-matrix-cell"}
                      onClick={() => onCellClick(i, j)}
                      title={
                        i === j
                          ? `T${i + 1}`
                          : isUpper
                            ? `cos(T${i + 1}, T${j + 1}) = ${display.toFixed(3)}`
                            : `jaccard(T${i + 1}, T${j + 1}) = ${display.toFixed(2)}`
                      }
                    >
                      {display.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel: Scene preview
// ---------------------------------------------------------------------------

function ScenePreviewPanel({
  scene,
  card,
  language
}: {
  scene: ExplorationSceneView;
  card: SubsetCard;
  language: "en" | "es";
}) {
  const isEn = language === "en";
  const layers: Array<{ id: string; src: string; label: string }> = [];
  if (scene.rgb_preview_path) layers.push({ id: "rgb", src: scene.rgb_preview_path, label: isEn ? "RGB false-colour" : "Color falso RGB" });
  if (scene.label_preview_path) layers.push({ id: "labels", src: scene.label_preview_path, label: isEn ? "Class labels" : "Etiquetas" });
  return (
    <section className="ws-panel ws-panel-scene">
      <header className="ws-panel-header">
        <h4>{isEn ? "Scene preview" : "Vista de escena"}</h4>
        <p>
          {scene.scene_name ?? scene.scene_id} · {pickText(card.title, language)}
        </p>
      </header>
      {layers.length === 0 ? (
        <p className="ws-panel-hint">
          {isEn ? "No preview images for this scene." : "Esta escena no tiene previews."}
        </p>
      ) : (
        <div className="ws-scene-grid">
          {layers.map((layer) => (
            <figure key={layer.id} className="ws-scene-fig">
              <img src={layer.src} alt={layer.label} loading="lazy" />
              <figcaption>{layer.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
