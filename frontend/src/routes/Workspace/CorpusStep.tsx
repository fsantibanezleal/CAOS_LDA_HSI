import { useMemo } from "react";

import { type SubsetCard, pickText } from "../../lib/api";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
  selectedRecipeId: string | null;
  onRecipeChange: (id: string) => void;
}

const RECIPE_HINTS: Record<string, { en: string; es: string }> = {
  "magnitude-phrase": {
    en: "V2 family — quantised intensity bin as the alphabet, the spectrum becomes a phrase.",
    es: "Familia V2 — cada nivel cuantizado es un elemento del alfabeto, el espectro es una frase."
  },
  "band-frequency": {
    en: "V1 family — each wavelength is a word, the document is the band-count vector.",
    es: "Familia V1 — cada wavelength es una palabra, el documento es el vector de cuentas por banda."
  },
  "band-magnitude-words": {
    en: "V4 family — joint (band, intensity) tokens preserve both wavelength and level.",
    es: "Familia V4 — tokens conjuntos (banda, intensidad) preservan wavelength y nivel."
  },
  "patch-band-frequency": {
    en: "V7 — wordify within a patch / SLIC superpixel / region.",
    es: "V7 — wordificacion dentro de patch / superpixel SLIC / region."
  }
};

export function CorpusStep({ card, language, selectedRecipeId, onRecipeChange }: Props) {
  const isEn = language === "en";

  const grouped = useMemo(() => {
    const map = new Map<string, typeof card.corpus>();
    for (const item of card.corpus) {
      const list = map.get(item.recipe_id) ?? [];
      list.push(item);
      map.set(item.recipe_id, list);
    }
    return map;
  }, [card.corpus]);

  const recipeIds = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const activeRecipe =
    selectedRecipeId && grouped.has(selectedRecipeId)
      ? selectedRecipeId
      : recipeIds[0] ?? null;
  const activeItems = activeRecipe ? grouped.get(activeRecipe) ?? [] : [];

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Choose the LDA modelling recipe" : "Elige la receta de modelado LDA"}</h4>
        <p>
          {isEn
            ? "The recipe controls how spectra become words and documents before LDA sees them. The active recipe drives the Topics, Comparison and Inference steps below."
            : "La receta controla como los espectros se vuelven palabras y documentos antes de que LDA los vea. La receta activa alimenta los pasos Topicos, Comparacion e Inferencia."}
        </p>
      </div>

      {recipeIds.length === 0 ? (
        <p className="workspace-selection-empty">
          {isEn
            ? "No corpus previews ship for this subset yet."
            : "Aun no se publican previews de corpus para este subset."}
        </p>
      ) : (
        <div className="workspace-recipe-row">
          {recipeIds.map((rid) => {
            const sample = grouped.get(rid)?.[0];
            const hint = RECIPE_HINTS[rid];
            return (
              <button
                key={rid}
                type="button"
                className={
                  rid === activeRecipe
                    ? "workspace-recipe-card is-active"
                    : "workspace-recipe-card"
                }
                onClick={() => onRecipeChange(rid)}
              >
                <span className="workspace-recipe-id">{rid}</span>
                <span className="workspace-recipe-title">
                  {sample ? pickText(sample.recipe_title, language) : rid}
                </span>
                {hint && (
                  <span className="workspace-recipe-hint">{hint[language]}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {activeRecipe && activeItems.length > 0 && (
        <div className="workspace-recipe-detail">
          <h4>
            {isEn ? "Corpus preview for" : "Preview del corpus para"}{" "}
            <span className="workspace-mono">{activeRecipe}</span>
          </h4>
          <ul className="workspace-corpus-grid">
            {activeItems.map((item) => (
              <li key={`${item.recipe_id}-${item.dataset_id}`} className="workspace-corpus-card">
                <header className="workspace-corpus-head">
                  <strong>{item.dataset_id}</strong>
                </header>
                <dl className="workspace-evidence-meta">
                  <dt>{isEn ? "Vocabulary" : "Vocabulario"}</dt>
                  <dd>{item.vocabulary_size}</dd>
                  <dt>{isEn ? "Documents" : "Documentos"}</dt>
                  <dd>{item.document_count}</dd>
                  {item.document_length_quartiles &&
                    item.document_length_quartiles.length === 5 && (
                      <>
                        <dt>{isEn ? "Length (min / med / max)" : "Largo (min / med / max)"}</dt>
                        <dd>
                          {item.document_length_quartiles[0].toFixed(0)} /{" "}
                          {item.document_length_quartiles[2].toFixed(0)} /{" "}
                          {item.document_length_quartiles[4].toFixed(0)}
                        </dd>
                      </>
                    )}
                </dl>
                {item.sample_tokens.length > 0 && (
                  <div className="workspace-token-row">
                    <span className="workspace-evidence-modality">
                      {isEn ? "Sample tokens" : "Tokens de muestra"}
                    </span>
                    <ul className="workspace-token-list">
                      {item.sample_tokens.map((tok, idx) => (
                        <li key={`${tok}-${idx}`}>{tok}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
