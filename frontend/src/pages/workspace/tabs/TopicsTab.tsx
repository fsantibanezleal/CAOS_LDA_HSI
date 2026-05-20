import { useMemo, useState } from "react";
import type { TopicPairLogOddsToken, TopicViews } from "@/api/client";
import { IntertopicMap, TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { TopicGraph } from "@/components/plots/TopicGraph";
import { TopicSpectrum } from "@/components/plots/TopicSpectrum";
import { TopicSpectrumComparison } from "@/components/plots/TopicSpectrumComparison";
import { TabEmpty } from "../components/TabStates";

const LAMBDA_VALUES = [0.0, 0.3, 0.5, 0.7, 1.0];

export function TopicsTab({
  isLoading,
  error,
  data,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  data: TopicViews | null;
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
  data: TopicViews;
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
  data: Record<string, TopicPairLogOddsToken[]>;
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
  tokens: TopicPairLogOddsToken[];
  maxAbs: number;
  ratioLabel: (t: TopicPairLogOddsToken) => string;
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
