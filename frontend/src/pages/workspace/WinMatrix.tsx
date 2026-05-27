import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { vSweepMethodReport, type VSweepRecipeReport } from "@/api/v-sweep";
import { METHOD_CATALOG } from "./methodCatalog";

type AxisKey = "f1" | "f2_cv" | "f7_nmi";

type MatrixCell = {
  recipe: string;
  scene: string;
  axis: AxisKey;
  value: number | null;
};

const AXES: { key: AxisKey; label: string; tooltip: string }[] = [
  { key: "f1", label: "F-1 routed", tooltip: "topic_routed_soft mean macro-F1 across 5 folds" },
  { key: "f2_cv", label: "F-2 c_v", tooltip: "top-10 c_v coherence" },
  { key: "f7_nmi", label: "F-7 NMI", tooltip: "normalised MI(topic_argmax, label)" },
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
          if (key === "f7_nmi" && s.f7 !== undefined) {
            value = (s as any).f7?.normalised_mi ?? null;
          }
          out.push({ recipe: report.recipe, scene: s.scene_id, axis: key, value });
        });
      });
    });
    return out;
  }, [reports]);

  // Per-axis per-scene winner (max value)
  const winners = useMemo(() => {
    const map = new Map<string, string>();
    AXES.forEach(({ key }) => {
      scenes.forEach((scene) => {
        let best: string | null = null;
        let bestVal = -Infinity;
        cells.forEach((c) => {
          if (c.axis === key && c.scene === scene && c.value !== null && c.value > bestVal) {
            bestVal = c.value;
            best = c.recipe;
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
          <div className="overflow-x-auto">
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
                            borderColor: "var(--color-border)",
                            backgroundColor: cell?.value !== null && cell?.value !== undefined
                              ? colorFor(cell.value, key)
                              : "var(--color-panel)",
                            color: "white",
                            fontWeight: isWinner ? 700 : 400,
                            outline: isWinner ? "2px solid #fff" : undefined,
                            outlineOffset: isWinner ? -2 : undefined,
                          }}
                          title={
                            cell?.value !== null && cell?.value !== undefined
                              ? `${m.id} / ${scene}: ${cell.value.toFixed(4)}`
                              : "no data"
                          }
                        >
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
