import { useQuery } from "@tanstack/react-query";
import { request } from "@/api/_http";
import { Section } from "@/components/Section";

type CoverageAxis = {
  axis: string;
  cells: Record<string, Record<string, boolean>>;
  have: number;
  target: number;
  pct: number;
};

type CoverageMatrix = {
  scenes: string[];
  recipes: string[];
  axes: CoverageAxis[];
  generated_at: string;
};

const SCENE_SHORT: Record<string, string> = {
  "indian-pines-corrected": "IP",
  "salinas-corrected": "SAL",
  "salinas-a-corrected": "SAL-A",
  "pavia-university": "Pavia",
  "kennedy-space-center": "KSC",
  "botswana": "Bots",
};

export function VSweepCoverageMatrix() {
  const { data, isLoading, isError } = useQuery<CoverageMatrix>({
    queryKey: ["v-sweep-coverage"],
    queryFn: () => request<CoverageMatrix>("/api/v-sweep/coverage"),
    retry: false,
  });

  if (isLoading) return null;
  if (isError || !data) return null;

  return (
    <Section
      id="v-sweep-coverage"
      title="V-sweep coverage matrix (10 axes × 19 recipes × 6 scenes)"
      lead="Each cell = one (axis, scene, recipe) JSON artefact on disk. Green = complete, grey = missing. The right column is the per-axis completion percentage. F-2, F-7, F-13, F-14, F-22 plus the three backbones now cover all 19 recipes; F-1 and F-18 are filling V13..V20 incrementally."
    >
      <div className="overflow-x-auto">
        <table className="text-[10.5px] border-collapse" style={{ borderColor: "var(--color-border)" }}>
          <thead>
            <tr>
              <th
                className="text-left px-2 py-1 border font-mono"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
              >
                axis \ scene·recipe
              </th>
              {data.scenes.map((sc) => (
                data.recipes.map((r) => (
                  <th
                    key={`${sc}-${r}`}
                    className="text-center px-0.5 py-1 border font-mono"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
                    title={`${sc} · ${r}`}
                  >
                    <span style={{ color: "var(--color-fg-faint)" }}>{r}</span>
                  </th>
                ))
              ))}
              <th
                className="text-right px-2 py-1 border font-mono"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
              >
                %
              </th>
            </tr>
            <tr>
              <th />
              {data.scenes.map((sc) => (
                <th
                  key={`hdr-${sc}`}
                  colSpan={data.recipes.length}
                  className="text-center px-0.5 py-1 border font-mono"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
                >
                  {SCENE_SHORT[sc] ?? sc}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.axes.map((axis) => (
              <tr key={axis.axis}>
                <td
                  className="px-2 py-0.5 border font-mono whitespace-nowrap"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-fg)" }}
                >
                  {axis.axis}
                </td>
                {data.scenes.flatMap((sc) =>
                  data.recipes.map((r) => {
                    const present = axis.cells?.[sc]?.[r] ?? false;
                    return (
                      <td
                        key={`${axis.axis}-${sc}-${r}`}
                        className="border"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: present ? "#16a34a" : "transparent",
                          width: 8,
                          height: 14,
                        }}
                        title={`${axis.axis} · ${sc} · ${r}: ${present ? "✓" : "missing"}`}
                      />
                    );
                  }),
                )}
                <td
                  className="px-2 py-0.5 border text-right font-mono tabular-nums"
                  style={{
                    borderColor: "var(--color-border)",
                    color: axis.pct >= 99 ? "#16a34a" : axis.pct >= 80 ? "var(--color-fg)" : "var(--color-fg-subtle)",
                    fontWeight: axis.pct >= 99 ? 700 : 400,
                  }}
                >
                  {axis.pct.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="mt-2 text-[11.5px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Generated {new Date(data.generated_at).toISOString().slice(0, 10)}. Each tile = one JSON
        artefact in <code className="font-mono">data/derived/v_sweep/{`{axis}/{scene}_{recipe}_uniform_Q8.json`}</code>.
        F-17 cross-scene (only portable recipes V2/V10/V11/V14) and B-12 LLM tea-leaves (per-scene only) are
        reported separately.
      </p>
    </Section>
  );
}
