import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

export function DocsPerTopicBar({
  counts,
  selected,
  onSelect,
  isFloat = false,
}: {
  counts: number[];
  selected: number | null;
  onSelect: (k: number) => void;
  isFloat?: boolean;
}) {
  const max = Math.max(...counts, 1);
  return (
    <div className="space-y-1.5">
      {counts.map((c, k) => {
        const pct = (c / max) * 100;
        const isSel = selected === k;
        const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className="w-full flex items-center gap-2 text-left"
            style={{ cursor: "pointer" }}
          >
            <span
              className="text-[11.5px] font-mono shrink-0 w-16"
              style={{
                color: isSel
                  ? "var(--color-accent)"
                  : "var(--color-fg-subtle)",
                fontWeight: isSel ? 600 : 400,
              }}
            >
              topic {k + 1}
            </span>
            <span
              className="flex-1 h-4 rounded-sm relative overflow-hidden"
              style={{ backgroundColor: "var(--color-bg)" }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  opacity: isSel ? 0.95 : 0.65,
                }}
              />
            </span>
            <span
              className="text-[11.5px] font-mono shrink-0 w-16 text-right"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {isFloat ? c.toFixed(2) : c.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
