import { useEffect, useMemo, useRef } from "react";

import type { SpectralBrowserMeta } from "@/api/client";

type Props = {
  meta: SpectralBrowserMeta;
  spectra: Float32Array;
  isolatedLabel: number | null;
  maxLines: number;
};

/**
 * Renders thousands of individual spectra to a canvas. Each spectrum
 * is one line; lines are colored by their class label and drawn with
 * low alpha so density is visible. When a label is isolated, the
 * other classes fade further.
 *
 * Uses canvas because SVG cannot handle thousands of paths smoothly.
 * Spectra come in as a flat Float32Array of length N * B (row-major).
 */
export function SpectralBrowser({
  meta,
  spectra,
  isolatedLabel,
  maxLines,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const yRange = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    const n = Math.min(meta.N, spectra.length / meta.B);
    const limit = Math.min(n, maxLines);
    for (let i = 0; i < limit; i++) {
      for (let b = 0; b < meta.B; b++) {
        const v = spectra[i * meta.B + b];
        if (v === undefined) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    const pad = (hi - lo) * 0.04 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [meta, spectra, maxLines]);

  const w = 800;
  const h = 360;
  const padL = 60;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Axes
    ctx.strokeStyle = getComputedStyle(c).getPropertyValue(
      "--color-fg-faint",
    ) || "#888";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const xMin = meta.wavelengths_nm[0] ?? 0;
    const xMax = meta.wavelengths_nm[meta.wavelengths_nm.length - 1] ?? 1;
    const xScale = (nm: number) =>
      padL + ((nm - xMin) / (xMax - xMin || 1)) * plotW;
    const yScale = (v: number) =>
      padT + (1 - (v - yRange.lo) / (yRange.hi - yRange.lo || 1)) * plotH;

    // Tick labels
    ctx.fillStyle = getComputedStyle(c).getPropertyValue(
      "--color-fg-subtle",
    ) || "#666";
    ctx.font =
      "10.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const nm = xMin + ((xMax - xMin) * i) / 5;
      ctx.fillText(`${Math.round(nm)}`, xScale(nm), padT + plotH + 6);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = yRange.lo + ((yRange.hi - yRange.lo) * i) / 4;
      ctx.fillText(`${v.toFixed(0)}`, padL - 6, yScale(v));
    }

    // Draw lines per row, batched by isolation alpha
    const rows = meta.rows;
    const limit = Math.min(rows.length, maxLines, spectra.length / meta.B);
    // Order: draw isolated label last so it sits on top
    const order: number[] = [];
    if (isolatedLabel !== null) {
      for (let i = 0; i < limit; i++) {
        const r = rows[i]!;
        if (r.label_id !== isolatedLabel) order.push(i);
      }
      for (let i = 0; i < limit; i++) {
        const r = rows[i]!;
        if (r.label_id === isolatedLabel) order.push(i);
      }
    } else {
      for (let i = 0; i < limit; i++) order.push(i);
    }
    ctx.lineWidth = 1;
    for (const i of order) {
      const r = rows[i]!;
      const isIso = isolatedLabel === r.label_id;
      const dim = isolatedLabel !== null && !isIso;
      ctx.globalAlpha = dim ? 0.04 : 0.18;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      for (let b = 0; b < meta.B; b++) {
        const x = xScale(meta.wavelengths_nm[b] ?? 0);
        const y = yScale(spectra[i * meta.B + b] ?? 0);
        if (b === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [meta, spectra, isolatedLabel, maxLines, yRange, w, h, padL, plotW, plotH, padT]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        maxWidth: "100%",
      }}
      aria-label="Spectral browser canvas"
    />
  );
}
