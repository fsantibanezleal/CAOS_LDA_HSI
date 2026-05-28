import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { vSweepMethodReport, type VSweepRecipeReport } from "@/api/v-sweep";
import { METHOD_CATALOG } from "./methodCatalog";

type AxisKey = "f1" | "f2_cv" | "f7_nmi" | "f14_jacc" | "f18_07";

type MatrixCell = {
  recipe: string;
  scene: string;
  axis: AxisKey;
  value: number | null;
};

const AXES: {
  key: AxisKey;
  label: string;
  tooltip: string;
  lowerIsBetter?: boolean;
}[] = [
  { key: "f1", label: "F-1 routed", tooltip: "topic_routed_soft mean macro-F1 across 5 folds" },
  { key: "f2_cv", label: "F-2 c_v", tooltip: "top-10 c_v coherence" },
  { key: "f7_nmi", label: "F-7 NMI", tooltip: "normalised MI(topic_argmax, label)" },
  {
    key: "f14_jacc",
    label: "F-14 jacc",
    tooltip: "mean top-10 jaccard between topics (LOWER = more diverse)",
    lowerIsBetter: true,
  },
  {
    key: "f18_07",
    label: "F-18 ≥0.7",
    tooltip: "fraction of seed-pair topic alignments with top-10 cosine ≥ 0.7 (HIGHER = more reliable)",
  },
];

function colorFor(value: number | null, axis: AxisKey): string {
  if (value === null) return "var(--color-panel)";
  // Each axis has different natural scale; normalise to [0,1] for color
  let v = value;
  if (axis === "f1") v = Math.max(0, Math.min(1, value));
  if (axis === "f2_cv") v = Math.max(0, Math.min(1, value));
  if (axis === "f7_nmi") v = Math.max(0, Math.min(1, value));
  // Map v in [0,1] to color from cool (#1e3a8a) to warm (#dc2626) via teal/yellow
  const r = Math.round(30 + 195 * v);
  const g = Math.round(80 + 80 * Math.sin(Math.PI * v));
  const b = Math.round(150 - 110 * v);
  return `rgb(${r},${g},${b})`;
}

export function WinMatrix() {
  const { t } = useTranslation(["pages"]);
  const [reports, setReports] = useState<Map<string, VSweepRecipeReport>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const wordifications = METHOD_CATALOG.filter((m) => m.hasSweepArtefacts);
    Promise.all(wordifications.map((m) => vSweepMethodReport(m.id))).then((all) => {
      if (!alive) return;
      const map = new Map<string, VSweepRecipeReport>();
      all.forEach((r) => map.set(r.recipe, r));
      setReports(map);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const scenes = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => r.scenes.forEach((s) => set.add(s.scene_id)));
    return Array.from(set).sort();
  }, [reports]);

  const cells: MatrixCell[] = useMemo(() => {
    const out: MatrixCell[] = [];
    reports.forEach((report) => {
      report.scenes.forEach((s) => {
        AXES.forEach(({ key }) => {
          let value: number | null = null;
          if (key === "f1" && s.f1) value = s.f1.topic_routed_soft_mean;
          if (key === "f2_cv" && s.f2) value = s.f2.c_v ?? null;
          if (key === "f7_nmi" && s.f7) value = s.f7.normalised_mi ?? null;
          if (key === "f14_jacc" && s.f14) value = s.f14.mean_pairwise_jaccard ?? null;
          if (key === "f18_07" && s.f18) value = s.f18.frac_above_0_7 ?? null;
          out.push({ recipe: report.recipe, scene: s.scene_id, axis: key, value });
        });
      });
    });
    return out;
  }, [reports]);

  // Per-axis per-scene winner (max value, or min for lower-is-better axes)
  const winners = useMemo(() => {
    const map = new Map<string, string>();
    AXES.forEach(({ key, lowerIsBetter }) => {
      scenes.forEach((scene) => {
        let best: string | null = null;
        let bestVal = lowerIsBetter ? Infinity : -Infinity;
        cells.forEach((c) => {
          if (c.axis === key && c.scene === scene && c.value !== null) {
            if (lowerIsBetter ? c.value < bestVal : c.value > bestVal) {
              bestVal = c.value;
              best = c.recipe;
            }
          }
        });
        if (best) map.set(`${key}|${scene}`, best);
      });
    });
    return map;
  }, [cells, scenes]);

  if (!loaded) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        Loading sweep matrix...
      </p>
    );
  }

  const wordifications = METHOD_CATALOG.filter((m) => m.hasSweepArtefacts);

  return (
    <div className="space-y-6">
      <p
        className="text-[13px] leading-relaxed max-w-3xl"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {t("pages:workspace_methods.matrix.lead")}
      </p>
      {AXES.map(({ key, label, tooltip }) => (
        <section key={key}>
          <h3
            className="mb-2 text-[13px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--color-fg-faint)" }}
            title={tooltip}
          >
            {label}
          </h3>
          <div className="md:hidden space-y-3">
            {scenes.map((scene) => (
              <div
                key={`mobile-${scene}`}
                className="border rounded-md p-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <p
                  className="text-[11.5px] font-mono mb-1.5"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  {scene}
                </p>
                <div className="flex flex-wrap gap-1">
                  {wordifications.map((m) => {
                    const cell = cells.find(
                      (c) => c.recipe === m.id && c.scene === scene && c.axis === key,
                    );
                    const isWinner = winners.get(`${key}|${scene}`) === m.id;
                    const val =
                      cell?.value !== null && cell?.value !== undefined
                        ? cell.value
                        : null;
                    return (
                      <div
                        key={`mobile-${m.id}-${scene}`}
                        className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                        style={{
                          backgroundColor:
                            val !== null
                              ? colorFor(val, key)
                              : "var(--color-panel)",
                          color: "white",
                          border: isWinner
                            ? "2px solid var(--color-accent)"
                            : "1px solid var(--color-border)",
                          fontWeight: isWinner ? 700 : 400,
                        }}
                        title={
                          val !== null
                            ? `${m.id} / ${scene}: ${val.toFixed(4)}${
                                isWinner ? " (winner)" : ""
                              }`
                            : "no data"
                        }
                      >
                        {isWinner ? "★" : ""}{m.id}: {val !== null ? val.toFixed(2) : "-"}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table
              className="text-[12px] border-collapse"
              style={{ borderColor: "var(--color-border)" }}
            >
              <thead style={{ backgroundColor: "var(--color-panel)" }}>
                <tr>
                  <th
                    className="text-left px-2 py-1 border"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    scene \ recipe
                  </th>
                  {wordifications.map((m) => (
                    <th
                      key={m.id}
                      className="text-center px-2 py-1 border font-mono"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {m.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenes.map((scene) => (
                  <tr key={scene}>
                    <td
                      className="px-2 py-1 border font-mono whitespace-nowrap"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {scene}
                    </td>
                    {wordifications.map((m) => {
                      const cell = cells.find(
                        (c) => c.recipe === m.id && c.scene === scene && c.axis === key,
                      );
                      const isWinner = winners.get(`${key}|${scene}`) === m.id;
                      return (
                        <td
                          key={m.id}
                          className="text-right px-2 py-1 border tabular-nums"
                          style={{
                            borderColor: isWinner
                              ? "var(--color-accent)"
                              : "var(--color-border)",
                            backgroundColor:
                              cell?.value !== null && cell?.value !== undefined
                                ? colorFor(cell.value, key)
                                : "var(--color-panel)",
                            color: "white",
                            fontWeight: isWinner ? 800 : 400,
                            // UX audit fix (c391): stronger winner badge.
                            // Was a 2px white outline that disappeared on
                            // bright cells; now a 3px accent ring + slight
                            // scale so the eye lands on the winner first.
                            outline: isWinner
                              ? "3px solid var(--color-accent)"
                              : undefined,
                            outlineOffset: isWinner ? -3 : undefined,
                            boxShadow: isWinner
                              ? "0 0 0 1px rgba(255,255,255,0.6) inset"
                              : undefined,
                          }}
                          title={
                            cell?.value !== null && cell?.value !== undefined
                              ? `${m.id} / ${scene}: ${cell.value.toFixed(4)}${
                                  isWinner ? " (winner)" : ""
                                }`
                              : "no data"
                          }
                        >
                          {isWinner ? "★ " : ""}
                          {cell?.value !== null && cell?.value !== undefined
                            ? cell.value.toFixed(2)
                            : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
