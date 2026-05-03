import { useMemo } from "react";

import { type ExplorationSceneView, type SubsetCard, pickText } from "../../../lib/api";
import { useStore } from "../../../store/useStore";
import { tokenToWavelength } from "../workspaceUtils";

interface Props {
  card: SubsetCard;
  scene: ExplorationSceneView | null;
  language: "en" | "es";
}

const RECIPE_HINTS: Record<string, { en: string; es: string }> = {
  "magnitude-phrase": {
    en: "V2 — quantised intensity bin as alphabet; spectrum becomes a phrase.",
    es: "V2 — cada nivel cuantizado como alfabeto; el espectro es una frase."
  },
  "band-frequency": {
    en: "V1 — wavelength as word; document is the per-band count vector.",
    es: "V1 — wavelength como palabra; el documento es el vector de cuentas por banda."
  },
  "band-magnitude-words": {
    en: "V4 — joint (band, intensity) tokens preserve wavelength + level.",
    es: "V4 — tokens conjuntos (banda, intensidad) preservan ambas dimensiones."
  },
  "patch-band-frequency": {
    en: "V7 — wordification on a patch / SLIC / region.",
    es: "V7 — wordificación en patch / SLIC / región."
  }
};

export function CorpusStep({ card, scene, language }: Props) {
  const isEn = language === "en";
  const selection = useStore((s) => s.selection);
  const setRecipe = useStore((s) => s.setRecipe);
  const setWavelengthRange = useStore((s) => s.setWavelengthRange);

  const recipes = useMemo(() => {
    const map = new Map<string, typeof card.corpus>();
    for (const item of card.corpus) {
      const list = map.get(item.recipe_id) ?? [];
      list.push(item);
      map.set(item.recipe_id, list);
    }
    return Array.from(map.entries()).map(([id, items]) => ({ id, items }));
  }, [card.corpus]);

  const activeRecipeId = selection.recipeId ?? recipes[0]?.id ?? null;
  const activeRecipe = recipes.find((r) => r.id === activeRecipeId) ?? null;

  const wavelengths = scene?.wavelengths_nm ?? [];
  const wlMin = wavelengths[0] ?? null;
  const wlMax = wavelengths[wavelengths.length - 1] ?? null;
  const range = selection.wavelengthRange ?? (wlMin !== null && wlMax !== null ? [wlMin, wlMax] : null);

  return (
    <div className="ws-corpus-grid">
      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Recipe selector" : "Selector de receta"}</h4>
          <p>
            {isEn
              ? "The recipe controls how spectra become words and documents before LDA sees them. Pick one to drive Topics, Comparison, Inference."
              : "La receta controla cómo los espectros se vuelven palabras y documentos antes de que LDA los vea."}
          </p>
        </header>
        <div className="ws-recipe-row">
          {recipes.map((r) => {
            const sample = r.items[0];
            const hint = RECIPE_HINTS[r.id];
            const isActive = r.id === activeRecipeId;
            return (
              <button
                key={r.id}
                type="button"
                className={isActive ? "ws-recipe-card is-active" : "ws-recipe-card"}
                onClick={() => setRecipe(r.id)}
              >
                <span className="ws-mono">{r.id}</span>
                <span className="ws-recipe-title">
                  {sample ? pickText(sample.recipe_title, language) : r.id}
                </span>
                {hint && <span className="ws-recipe-hint">{hint[language]}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {wavelengths.length > 0 && range && (
        <section className="ws-panel">
          <header className="ws-panel-header">
            <h4>{isEn ? "Band axis" : "Eje de bandas"}</h4>
            <p>
              {isEn
                ? "Drag the wavelength range slider in the selection bar to focus a region; this strip mirrors it. Click a band-token below to centre on its wavelength."
                : "Arrastra el slider de wavelength en la barra superior para enfocarte en una región; esta tira lo refleja."}
            </p>
          </header>
          <BandStrip wavelengths={wavelengths} range={range} />
        </section>
      )}

      {activeRecipe && (
        <section className="ws-panel">
          <header className="ws-panel-header">
            <h4>
              {isEn ? "Vocabulary preview · " : "Preview de vocabulario · "}
              <span className="ws-mono">{activeRecipe.id}</span>
            </h4>
            <p>
              {isEn
                ? "Per-dataset vocabulary size, document count, length quartiles and most frequent tokens. Click a token to focus the wavelength range."
                : "Vocabulario, número de documentos, cuartiles de largo y tokens más frecuentes. Click un token para enfocar el rango de wavelength."}
            </p>
          </header>
          <ul className="ws-corpus-grid-cards">
            {activeRecipe.items.map((item) => (
              <li key={`${item.recipe_id}-${item.dataset_id}`} className="ws-corpus-card">
                <header>
                  <strong>{item.dataset_id}</strong>
                </header>
                <dl>
                  <dt>{isEn ? "Vocabulary" : "Vocabulario"}</dt>
                  <dd>{item.vocabulary_size}</dd>
                  <dt>{isEn ? "Documents" : "Documentos"}</dt>
                  <dd>{item.document_count}</dd>
                  {item.document_length_quartiles.length === 5 && (
                    <>
                      <dt>{isEn ? "Length min/med/max" : "Largo min/med/max"}</dt>
                      <dd>
                        {item.document_length_quartiles[0].toFixed(0)} /{" "}
                        {item.document_length_quartiles[2].toFixed(0)} /{" "}
                        {item.document_length_quartiles[4].toFixed(0)}
                      </dd>
                    </>
                  )}
                </dl>
                {item.sample_tokens.length > 0 && (
                  <div className="ws-token-cloud">
                    {item.sample_tokens.map((tok, idx) => (
                      <button
                        key={`${tok}-${idx}`}
                        type="button"
                        className="ws-token-chip"
                        onClick={() => {
                          const wl = tokenToWavelength(tok);
                          if (wl !== null && wlMin !== null && wlMax !== null) {
                            setWavelengthRange([
                              Math.max(wlMin, wl - 50),
                              Math.min(wlMax, wl + 50)
                            ]);
                          }
                        }}
                      >
                        {tok}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {scene && scene.topic_word_cloud.length > 0 && (
        <section className="ws-panel">
          <header className="ws-panel-header">
            <h4>{isEn ? "Top tokens across all topics" : "Top tokens en todos los tópicos"}</h4>
            <p>
              {isEn
                ? "Sum of P(token | topic) across topics — the highest mass tokens of the trained model."
                : "Suma de P(token | topic) sobre tópicos — los tokens con mayor masa del modelo entrenado."}
            </p>
          </header>
          <div className="ws-token-cloud">
            {scene.topic_word_cloud.slice(0, 30).map((entry) => (
              <button
                key={entry.token as string}
                type="button"
                className="ws-token-chip"
                onClick={() => {
                  const wl = tokenToWavelength(entry.token as string);
                  if (wl !== null && wlMin !== null && wlMax !== null) {
                    setWavelengthRange([Math.max(wlMin, wl - 50), Math.min(wlMax, wl + 50)]);
                  }
                }}
                title={`weight ${(entry.weight as number).toFixed(4)}`}
                style={{
                  fontSize: `${10 + Math.min(8, (entry.weight as number) * 200)}px`
                }}
              >
                {entry.token as string}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BandStrip({ wavelengths, range }: { wavelengths: number[]; range: [number, number] }) {
  const width = 720;
  const height = 36;
  const padding = 12;
  const xMin = wavelengths[0] ?? 0;
  const xMax = wavelengths[wavelengths.length - 1] ?? 1;
  const sx = (wl: number) => {
    if (xMax === xMin) return padding;
    return padding + ((wl - xMin) / (xMax - xMin)) * (width - 2 * padding);
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ws-svg ws-bandstrip">
      <line className="ws-axis" x1={padding} x2={width - padding} y1={height / 2} y2={height / 2} />
      {wavelengths.map((wl, i) => (
        <line
          key={i}
          x1={sx(wl)}
          x2={sx(wl)}
          y1={height / 2 - 6}
          y2={height / 2 + 6}
          className={
            wl >= range[0] && wl <= range[1]
              ? "ws-bandstrip-tick is-in"
              : "ws-bandstrip-tick"
          }
        />
      ))}
      <rect
        x={sx(range[0])}
        width={Math.max(2, sx(range[1]) - sx(range[0]))}
        y={height / 2 - 10}
        height={20}
        className="ws-bandstrip-window"
      />
      <text x={padding} y={height - 4} className="ws-axis-label">
        {Math.round(xMin)} nm
      </text>
      <text x={width - padding} y={height - 4} className="ws-axis-label" textAnchor="end">
        {Math.round(xMax)} nm
      </text>
    </svg>
  );
}
