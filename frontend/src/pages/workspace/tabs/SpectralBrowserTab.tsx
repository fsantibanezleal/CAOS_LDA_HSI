import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { SpectralBrowserMeta } from "@/api/client";
import { SpectralBrowser } from "@/components/plots/SpectralBrowser";

export function SpectralBrowserTab({
  isLoading,
  error,
  meta,
}: {
  isLoading: boolean;
  error: Error | null;
  meta: SpectralBrowserMeta | null;
}) {
  const [isolatedLabel, setIsolatedLabel] = useState<number | null>(null);
  const [maxLines, setMaxLines] = useState<number>(2000);

  const buf = useQuery({
    queryKey: ["browser-bin", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/spectral_browser/${meta!.scene_id}/spectra.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const spectra = useMemo(() => {
    if (!buf.data) return null;
    return new Float32Array(buf.data);
  }, [buf.data]);

  const labels = useMemo(() => {
    if (!meta) return [];
    const seen = new Map<number, { label_id: number; name: string; color: string; count: number }>();
    for (const r of meta.rows) {
      const e = seen.get(r.label_id);
      if (e) {
        e.count += 1;
      } else {
        seen.set(r.label_id, {
          label_id: r.label_id,
          name: r.label_name,
          color: r.color,
          count: 1,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count);
  }, [meta]);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading browser metadata…
      </p>
    );
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
          Could not load /api/spectral-browser.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!meta) return null;

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div>
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Browser espectral · {meta.N.toLocaleString()} espectros muestreados
            </h4>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Each line is a real pixel (not an average); subsample{" "}
              {meta.sampling_strategy}. {meta.B} bandas (
              {Math.round(meta.wavelengths_nm[0]!)}–
              {Math.round(meta.wavelengths_nm[meta.wavelengths_nm.length - 1]!)}{" "}
              nm). Click a class to isolate it; reduce the rendered line count
              if your machine struggles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--color-fg-faint)" }}
            >
              lines
            </span>
            <select
              value={maxLines}
              onChange={(e) => setMaxLines(parseInt(e.target.value, 10))}
              className="rounded-md border px-2 py-1 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg)",
              }}
            >
              {[500, 1000, 2000, 4000, 8000].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        </header>

        {buf.isLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            Descargando {(meta.N * meta.B * 4).toLocaleString()} bytes binarios…
          </p>
        )}
        {buf.error && (
          <p style={{ color: "var(--color-warn)" }}>
            Could not load spectra.bin: {String(buf.error)}
          </p>
        )}
        {spectra && (
          <SpectralBrowser
            meta={meta}
            spectra={spectra}
            isolatedLabel={isolatedLabel}
            maxLines={maxLines}
          />
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIsolatedLabel(null)}
            className="rounded-md border px-2.5 py-1 text-[12px]"
            style={{
              borderColor:
                isolatedLabel === null
                  ? "var(--color-accent)"
                  : "var(--color-border)",
              backgroundColor:
                isolatedLabel === null
                  ? "var(--color-accent-soft)"
                  : "var(--color-panel)",
              color:
                isolatedLabel === null
                  ? "var(--color-accent)"
                  : "var(--color-fg-subtle)",
            }}
          >
            Todas
          </button>
          {labels.map((l) => {
            const isSel = isolatedLabel === l.label_id;
            return (
              <button
                key={l.label_id}
                type="button"
                onClick={() =>
                  setIsolatedLabel(isSel ? null : l.label_id)
                }
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel
                    ? "var(--color-fg)"
                    : "var(--color-fg-subtle)",
                }}
                title={`${l.count} espectros`}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: l.color }}
                />
                {l.name}
                <span
                  className="text-[10.5px] ml-1 opacity-70"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ({l.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {meta && spectra ? (
        <FalseColorBandPicker meta={meta} spectra={spectra} />
      ) : null}
    </div>
  );
}

function FalseColorBandPicker({
  meta,
  spectra,
}: {
  meta: SpectralBrowserMeta;
  spectra: Float32Array;
}) {
  const B = meta.B;
  const N = meta.N;
  const wavelengths = meta.wavelengths_nm;
  const [rBand, setRBand] = useState<number>(() => {
    const target = 660;
    let best = 0,
      bestDelta = Infinity;
    for (let i = 0; i < wavelengths.length; i++) {
      const d = Math.abs((wavelengths[i] ?? 0) - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    return best;
  });
  const [gBand, setGBand] = useState<number>(() => {
    const target = 550;
    let best = 0,
      bestDelta = Infinity;
    for (let i = 0; i < wavelengths.length; i++) {
      const d = Math.abs((wavelengths[i] ?? 0) - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    return best;
  });
  const [bBand, setBBand] = useState<number>(() => {
    const target = 450;
    let best = 0,
      bestDelta = Infinity;
    for (let i = 0; i < wavelengths.length; i++) {
      const d = Math.abs((wavelengths[i] ?? 0) - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    return best;
  });

  const [H, W] = meta.spatial_shape;
  const cellSize = Math.max(1, Math.floor(480 / Math.max(H, W)));

  const channelStats = useMemo(() => {
    const stats = { r: { min: Infinity, max: -Infinity }, g: { min: Infinity, max: -Infinity }, b: { min: Infinity, max: -Infinity } };
    for (let i = 0; i < N; i++) {
      const r = spectra[i * B + rBand]!;
      const g = spectra[i * B + gBand]!;
      const b = spectra[i * B + bBand]!;
      if (r < stats.r.min) stats.r.min = r;
      if (r > stats.r.max) stats.r.max = r;
      if (g < stats.g.min) stats.g.min = g;
      if (g > stats.g.max) stats.g.max = g;
      if (b < stats.b.min) stats.b.min = b;
      if (b > stats.b.max) stats.b.max = b;
    }
    return stats;
  }, [spectra, rBand, gBand, bBand, N, B]);

  const samples = useMemo(() => {
    const arr: { x: number; y: number; r: number; g: number; b: number }[] = [];
    const norm = (v: number, min: number, max: number) => {
      const span = max - min;
      return span > 0 ? Math.max(0, Math.min(255, Math.round(((v - min) / span) * 255))) : 0;
    };
    for (let i = 0; i < N; i++) {
      const row = meta.rows[i];
      if (!row) continue;
      const [x, y] = row.xy;
      const r = norm(spectra[i * B + rBand]!, channelStats.r.min, channelStats.r.max);
      const g = norm(spectra[i * B + gBand]!, channelStats.g.min, channelStats.g.max);
      const b = norm(spectra[i * B + bBand]!, channelStats.b.min, channelStats.b.max);
      arr.push({ x, y, r, g, b });
    }
    return arr;
  }, [meta.rows, spectra, rBand, gBand, bBand, channelStats, N, B]);

  const presetButtons = useMemo(() => {
    const findBand = (nm: number) => {
      let best = 0,
        bestDelta = Infinity;
      for (let i = 0; i < wavelengths.length; i++) {
        const d = Math.abs((wavelengths[i] ?? 0) - nm);
        if (d < bestDelta) {
          bestDelta = d;
          best = i;
        }
      }
      return best;
    };
    return [
      { label: "True colour · 660/550/450 nm", r: findBand(660), g: findBand(550), b: findBand(450) },
      { label: "Vegetation NIR · 800/660/550 nm", r: findBand(800), g: findBand(660), b: findBand(550) },
      { label: "SWIR mineral · 2200/1650/660 nm", r: findBand(2200), g: findBand(1650), b: findBand(660) },
      { label: "Water absorption · 1400/1900/2200 nm", r: findBand(1400), g: findBand(1900), b: findBand(2200) },
    ];
  }, [wavelengths]);

  return (
    <div
      className="rounded-lg border p-5 relative overflow-hidden mt-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgba(214,39,40,1) 0%, rgba(40,160,80,1) 50%, rgba(56,189,248,1) 100%)" }}
      />
      <header className="mt-1 mb-3">
        <h4 className="text-base font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
          False-colour band picker · choose 3 of {B} bands
        </h4>
        <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
          Dynamic compute on the client: each of the {N.toLocaleString()} stratified samples is
          painted at its spatial position {`(${H}×${W})`} with R/G/B taken from the picked bands and
          normalised per channel. Pick presets for canonical band-combos or drag the sliders for
          arbitrary {wavelengths[0]?.toFixed(0)}–{wavelengths[wavelengths.length - 1]?.toFixed(0)} nm
          combinations. Sample-sparse: only stratified pixels are coloured (uncovered area in dark
          background).
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr,420px] gap-5">
        <div>
          <div className="flex flex-wrap items-baseline gap-2 mb-2">
            <span className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-fg-faint)" }}>
              Presets
            </span>
            {presetButtons.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setRBand(p.r);
                  setGBand(p.g);
                  setBBand(p.b);
                }}
                className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
                style={{ borderColor: "var(--color-border)", color: "var(--color-fg-subtle)", backgroundColor: "transparent" }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {([
            { name: "R", value: rBand, set: setRBand, accent: "rgba(214,39,40,0.85)" },
            { name: "G", value: gBand, set: setGBand, accent: "rgba(40,160,80,0.85)" },
            { name: "B", value: bBand, set: setBBand, accent: "rgba(56,189,248,0.85)" },
          ] as const).map((ch) => (
            <div key={ch.name} className="flex items-baseline gap-3 my-2">
              <span className="text-[12px] font-mono font-semibold w-3" style={{ color: ch.accent }}>{ch.name}</span>
              <input
                type="range"
                min={0}
                max={B - 1}
                value={ch.value}
                onChange={(e) => ch.set(parseInt(e.target.value, 10))}
                className="flex-1"
                style={{ accentColor: ch.accent as string }}
                aria-label={`${ch.name} band`}
              />
              <span className="text-[12px] font-mono w-32 text-right" style={{ color: "var(--color-fg-subtle)" }}>
                band {ch.value} · {wavelengths[ch.value]?.toFixed(0)} nm
              </span>
            </div>
          ))}
        </div>

        <div className="overflow-auto" style={{ maxWidth: 420, maxHeight: 480 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block"
            style={{ width: Math.min(420, W * cellSize), height: Math.min(480, H * cellSize), backgroundColor: "var(--color-bg)" }}
            shapeRendering="crispEdges"
          >
            {samples.map((s, i) => (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={1}
                height={1}
                fill={`rgb(${s.r},${s.g},${s.b})`}
              />
            ))}
          </svg>
          <p className="text-[10.5px] mt-1" style={{ color: "var(--color-fg-faint)" }}>
            {samples.length.toLocaleString()} stratified pixels painted on a {W}×{H} grid.
          </p>
        </div>
      </div>
    </div>
  );
}
