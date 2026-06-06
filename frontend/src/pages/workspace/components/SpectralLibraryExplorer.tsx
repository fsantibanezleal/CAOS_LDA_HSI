import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/api/_http";

// Interactive viz for the individual-spectra families (USGS splib07,
// ECOSTRESS): the real reference spectra grouped by material, plus the
// wordification of a selected spectrum (spectrum -> quantised tokens), so the
// family is genuinely explorable and the representation is shown didactically.

interface LibrarySample {
  id: string;
  name: string;
  group: string;
  sensor: string;
  band_count: number;
  wavelengths_nm: number[];
  spectrum: number[];
  token_preview?: string[];
  absorption_tokens?: string[];
}
interface LibraryPayload {
  source: string;
  source_url: string;
  samples: LibrarySample[];
}

// Okabe-Ito colourblind-safe palette, assigned per material group.
const PALETTE = [
  "#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7",
  "#56B4E9", "#F0E442", "#999999", "#882255", "#44AA99",
];

const W = 760;
const H = 300;
const PADL = 44;
const PADR = 14;
const PADT = 12;
const PADB = 34;

export function SpectralLibraryExplorer({ datasetId }: { datasetId: string }) {
  const q = useQuery({
    queryKey: ["spectral-library", datasetId],
    queryFn: () =>
      request<LibraryPayload>("/generated/spectral/library_samples.json"),
    staleTime: 10 * 60_000,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [hideGroup, setHideGroup] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    for (const s of q.data?.samples ?? []) {
      if (!m.has(s.group)) m.set(s.group, PALETTE[i++ % PALETTE.length]!);
    }
    return m;
  }, [q.data]);

  if (q.isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Loading reference spectra…</p>
    );
  if (q.error || !q.data)
    return (
      <div
        className="rounded-lg border p-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-warn)" }}>Could not load the spectral library.</p>
      </div>
    );

  const samples = q.data.samples;
  const wl = samples[0]?.wavelengths_nm ?? [];
  const wlMin = wl.length ? wl[0]! : 400;
  const wlMax = wl.length ? wl[wl.length - 1]! : 2500;
  const allVals = samples.flatMap((s) => s.spectrum);
  const yMax = Math.max(0.01, ...allVals) * 1.05;

  const xScale = (nm: number) =>
    PADL + ((nm - wlMin) / (wlMax - wlMin)) * (W - PADL - PADR);
  const yScale = (v: number) =>
    PADT + (1 - v / yMax) * (H - PADT - PADB);

  const pathFor = (s: LibrarySample) =>
    s.spectrum
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(s.wavelengths_nm[i]!).toFixed(1)} ${yScale(v).toFixed(1)}`)
      .join(" ");

  const sel = samples.find((s) => s.id === selected) ?? null;
  const visible = samples.filter((s) => !hideGroup.has(s.group));

  const xTicks = [500, 1000, 1500, 2000, 2500].filter((t) => t >= wlMin && t <= wlMax);

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <header className="mb-2">
          <h4 className="text-base font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
            Reference spectra · {samples.length} materials · {wl.length} bands
          </h4>
          <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
            Reflectance vs wavelength, coloured by material group. Click a material
            below to highlight it and see how its spectrum becomes wordification
            tokens. Source: {q.data.source}.
          </p>
        </header>

        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="USGS reference reflectance spectra by material group"
          style={{ color: "var(--color-fg)", display: "block", backgroundColor: "var(--color-bg)", borderRadius: 6 }}
        >
          {/* axes */}
          <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke="var(--color-border)" />
          <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke="var(--color-border)" />
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={xScale(t)} y1={H - PADB} x2={xScale(t)} y2={H - PADB + 4} stroke="var(--color-border)" />
              <text x={xScale(t)} y={H - PADB + 16} textAnchor="middle" fontSize="10" fill="var(--color-fg-faint)">
                {t}
              </text>
            </g>
          ))}
          <text x={(PADL + W - PADR) / 2} y={H - 4} textAnchor="middle" fontSize="10.5" fill="var(--color-fg-faint)">
            wavelength (nm)
          </text>
          <text x={12} y={PADT + 8} fontSize="10.5" fill="var(--color-fg-faint)">refl.</text>

          {/* faint: all visible spectra */}
          {visible.map((s) => (
            <path
              key={s.id}
              d={pathFor(s)}
              fill="none"
              stroke={groups.get(s.group)}
              strokeWidth={sel && sel.id === s.id ? 2.4 : 0.9}
              opacity={sel ? (sel.id === s.id ? 1 : 0.18) : 0.7}
            />
          ))}
        </svg>

        {/* group legend (toggle) */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[...groups.entries()].map(([g, c]) => {
            const off = hideGroup.has(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() =>
                  setHideGroup((prev) => {
                    const n = new Set(prev);
                    n.has(g) ? n.delete(g) : n.add(g);
                    return n;
                  })
                }
                className="flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]"
                style={{ borderColor: "var(--color-border)", opacity: off ? 0.4 : 1, color: "var(--color-fg-subtle)" }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c, display: "inline-block" }} />
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* material picker */}
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
          materials — click to inspect
        </div>
        <div className="flex flex-wrap gap-1.5">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id === selected ? null : s.id)}
              className="rounded border px-2 py-0.5 text-[11px]"
              style={{
                borderColor: s.id === selected ? "var(--color-accent)" : "var(--color-border)",
                color: s.id === selected ? "var(--color-accent)" : "var(--color-fg-subtle)",
                backgroundColor: s.id === selected ? "var(--color-accent-soft)" : "transparent",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: groups.get(s.group), display: "inline-block", marginRight: 5 }} />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* selected sample: spectrum -> tokens (the representation, didactically) */}
      {sel && (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
            {sel.name} <span className="font-normal" style={{ color: "var(--color-fg-faint)" }}>· {sel.group} · {sel.sensor}</span>
          </h4>
          <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
            How this spectrum becomes an LDA "document": each band's reflectance is
            quantised, then named as a token. These tokens are the words the topic
            model sees.
          </p>
          {sel.token_preview && sel.token_preview.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
                quantised band tokens (preview)
              </div>
              <div className="flex flex-wrap gap-1">
                {sel.token_preview.slice(0, 40).map((tk, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[10.5px] font-mono"
                    style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-fg-subtle)" }}>
                    {tk}
                  </span>
                ))}
              </div>
            </div>
          )}
          {sel.absorption_tokens && sel.absorption_tokens.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
                absorption-feature tokens
              </div>
              <div className="flex flex-wrap gap-1">
                {sel.absorption_tokens.map((tk, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[10.5px] font-mono"
                    style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                    {tk}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
