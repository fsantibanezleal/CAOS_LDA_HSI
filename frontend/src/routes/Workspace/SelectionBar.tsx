import { useTranslation } from "react-i18next";

import {
  type ExplorationSceneView,
  type SubsetCard,
  type SubsetCardSummary,
  pickText
} from "../../lib/api";
import { useStore } from "../../store/useStore";

interface Props {
  language: "en" | "es";
  subsetIndex: SubsetCardSummary[];
  card: SubsetCard | null;
  scene: ExplorationSceneView | null;
}

export function SelectionBar({ language, subsetIndex, card, scene }: Props) {
  const { t } = useTranslation();
  const selection = useStore((s) => s.selection);
  const setSubset = useStore((s) => s.setSubset);
  const setRecipe = useStore((s) => s.setRecipe);
  const setLambda = useStore((s) => s.setLambda);
  const setTopNWords = useStore((s) => s.setTopNWords);
  const setWavelengthRange = useStore((s) => s.setWavelengthRange);
  const toggleClass = useStore((s) => s.toggleClass);
  const toggleTopic = useStore((s) => s.toggleTopic);
  const clearTopics = useStore((s) => s.clearTopics);
  const clearClasses = useStore((s) => s.clearClasses);
  const setActivePixel = useStore((s) => s.setActivePixel);

  const activeRecipeIds =
    card?.corpus.map((entry) => entry.recipe_id).filter((value, idx, arr) => arr.indexOf(value) === idx) ?? [];

  const wlMin = scene?.wavelengths_nm[0] ?? null;
  const wlMax = scene?.wavelengths_nm[scene.wavelengths_nm.length - 1] ?? null;
  const range = selection.wavelengthRange ?? (wlMin !== null && wlMax !== null ? [wlMin, wlMax] : null);

  return (
    <div className="ws-selection-bar">
      <div className="ws-selection-row">
        <label className="ws-field">
          <span className="ws-field-label">{t("workspaceSelectionSubset", { defaultValue: "Subset" })}</span>
          <select
            className="ws-select"
            value={selection.subsetId ?? ""}
            onChange={(e) => setSubset(e.target.value || null)}
          >
            <option value="">—</option>
            {subsetIndex.map((s) => (
              <option key={s.id} value={s.id}>
                {pickText(s.title, language)} · {s.status}
              </option>
            ))}
          </select>
        </label>

        <label className="ws-field">
          <span className="ws-field-label">{t("workspaceSelectionRecipe", { defaultValue: "Recipe" })}</span>
          <select
            className="ws-select"
            value={selection.recipeId ?? ""}
            disabled={!card}
            onChange={(e) => setRecipe(e.target.value || null)}
          >
            <option value="">—</option>
            {activeRecipeIds.map((rid) => (
              <option key={rid} value={rid}>
                {rid}
              </option>
            ))}
          </select>
        </label>

        <label className="ws-field ws-field-slider">
          <span className="ws-field-label">
            λ {selection.lambda.toFixed(2)} <span className="ws-field-hint">(LDAvis relevance)</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={selection.lambda}
            onChange={(e) => setLambda(Number.parseFloat(e.target.value))}
          />
        </label>

        <label className="ws-field ws-field-slider">
          <span className="ws-field-label">Top-N {selection.topNWords}</span>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={selection.topNWords}
            onChange={(e) => setTopNWords(Number.parseInt(e.target.value, 10))}
          />
        </label>

        {range && (
          <label className="ws-field ws-field-slider">
            <span className="ws-field-label">
              {Math.round(range[0])}–{Math.round(range[1])} nm
              <button
                type="button"
                className="ws-field-reset"
                onClick={() => setWavelengthRange(null)}
                title="reset wavelength range"
              >
                reset
              </button>
            </span>
            <div className="ws-range-double">
              <input
                type="range"
                min={wlMin ?? 0}
                max={wlMax ?? 1}
                step={1}
                value={range[0]}
                onChange={(e) => {
                  const lo = Number.parseFloat(e.target.value);
                  setWavelengthRange([Math.min(lo, range[1] - 5), range[1]]);
                }}
              />
              <input
                type="range"
                min={wlMin ?? 0}
                max={wlMax ?? 1}
                step={1}
                value={range[1]}
                onChange={(e) => {
                  const hi = Number.parseFloat(e.target.value);
                  setWavelengthRange([range[0], Math.max(hi, range[0] + 5)]);
                }}
              />
            </div>
          </label>
        )}
      </div>

      <div className="ws-chip-row">
        {selection.activeTopicIds.length === 0 && selection.activeClassIds.length === 0 && !selection.activePixel ? (
          <span className="ws-chip-empty">
            {language === "en"
              ? "No active selection. Click topic discs, class chips or pixels to pin them."
              : "Sin selección activa. Haz click en discos de topic, chips de clase o pixeles para fijarlos."}
          </span>
        ) : null}

        {selection.activeTopicIds.map((tid) => {
          const meta = scene?.topics?.[tid];
          const label = meta?.name ?? `Topic ${tid + 1}`;
          return (
            <button
              key={`tchip-${tid}`}
              type="button"
              className="ws-chip ws-chip-topic"
              onClick={() => toggleTopic(tid)}
              title={`unpin topic ${tid + 1}`}
            >
              <span className="ws-chip-dot" style={{ background: topicColor(tid) }} aria-hidden />
              <span>{label}</span>
              <span className="ws-chip-x">✕</span>
            </button>
          );
        })}
        {selection.activeTopicIds.length > 1 && (
          <button type="button" className="ws-chip ws-chip-clear" onClick={clearTopics}>
            clear topics
          </button>
        )}

        {selection.activeClassIds.map((cid) => {
          const cls = scene?.class_summaries.find((c) => c.label_id === cid);
          const label = cls?.name ?? `class ${cid}`;
          return (
            <button
              key={`cchip-${cid}`}
              type="button"
              className="ws-chip ws-chip-class"
              onClick={() => toggleClass(cid)}
              title={`unpin class ${label}`}
            >
              <span>{label}</span>
              <span className="ws-chip-x">✕</span>
            </button>
          );
        })}
        {selection.activeClassIds.length > 1 && (
          <button type="button" className="ws-chip ws-chip-clear" onClick={clearClasses}>
            clear classes
          </button>
        )}

        {selection.activePixel && (
          <button
            type="button"
            className="ws-chip ws-chip-pixel"
            onClick={() => setActivePixel(null)}
            title="unpin pixel"
          >
            ({selection.activePixel.x},{selection.activePixel.y}) ✕
          </button>
        )}
      </div>
    </div>
  );
}

const TOPIC_PALETTE = [
  "#5b8def",
  "#f0b86d",
  "#6dd4a0",
  "#ef6f6c",
  "#9b88ff",
  "#5fd0d6",
  "#ffb1c4",
  "#a3c47a",
  "#e09f55",
  "#7d8ce3",
  "#c878d4",
  "#5fb389"
];

export function topicColor(index: number): string {
  return TOPIC_PALETTE[index % TOPIC_PALETTE.length];
}
