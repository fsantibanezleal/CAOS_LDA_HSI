import { useEffect, useMemo, useRef, useState } from "react";

import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

type Props = {
  buffer: ArrayBuffer | null;
  shape: [number, number];
  sentinelUnlabelled: number;
  topicCount: number;
  selectedTopic: number | null;
  onPick: (info: PickInfo) => void;
};

export type PickInfo = {
  row: number;
  col: number;
  topic: number | null;
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [127, 127, 127];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/**
 * Canvas raster of the dominant-topic map. Each labelled pixel is
 * colored by the topic palette; unlabelled pixels (sentinel value 255)
 * are transparent. Click a pixel to dispatch its row/col and the
 * topic id at that location.
 *
 * Rendered at native resolution (e.g. 145x145), then upscaled with
 * `image-rendering: pixelated` so individual pixels stay crisp.
 */
export function DominantTopicRaster({
  buffer,
  shape,
  sentinelUnlabelled,
  topicCount,
  selectedTopic,
  onPick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<PickInfo | null>(null);
  const [h, w] = shape;

  const palette = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let k = 0; k < topicCount; k++) {
      out.push(hexToRgb(TOPIC_COLORS[k % TOPIC_COLORS.length]!));
    }
    return out;
  }, [topicCount]);

  const grid = useMemo(() => {
    if (!buffer) return null;
    return new Uint8Array(buffer);
  }, [buffer]);

  useEffect(() => {
    if (!canvasRef.current || !grid) return;
    const canvas = canvasRef.current;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i]!;
      const off = i * 4;
      if (t === sentinelUnlabelled || t >= topicCount) {
        img.data[off] = 0;
        img.data[off + 1] = 0;
        img.data[off + 2] = 0;
        img.data[off + 3] = 0;
        continue;
      }
      const dim = selectedTopic !== null && selectedTopic !== t;
      const [r, g, b] = palette[t]!;
      img.data[off] = r;
      img.data[off + 1] = g;
      img.data[off + 2] = b;
      img.data[off + 3] = dim ? 56 : 230;
    }
    ctx.putImageData(img, 0, 0);
  }, [grid, w, h, sentinelUnlabelled, topicCount, palette, selectedTopic]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const yRel = (e.clientY - rect.top) / rect.height;
    const col = Math.min(w - 1, Math.max(0, Math.floor(xRel * w)));
    const row = Math.min(h - 1, Math.max(0, Math.floor(yRel * h)));
    const t = grid?.[row * w + col] ?? sentinelUnlabelled;
    const topic = t === sentinelUnlabelled || t >= topicCount ? null : t;
    onPick({ row, col, topic });
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const yRel = (e.clientY - rect.top) / rect.height;
    const col = Math.min(w - 1, Math.max(0, Math.floor(xRel * w)));
    const row = Math.min(h - 1, Math.max(0, Math.floor(yRel * h)));
    const t = grid?.[row * w + col] ?? sentinelUnlabelled;
    const topic = t === sentinelUnlabelled || t >= topicCount ? null : t;
    setHover({ row, col, topic });
  };

  // Fit raster into a comfortable viewing box keeping aspect ratio.
  const viewW = 540;
  const viewH = Math.round((viewW * h) / w);

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        style={{
          width: viewW,
          height: viewH,
          imageRendering: "pixelated",
          backgroundColor: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          cursor: "crosshair",
          maxWidth: "100%",
        }}
        aria-label="Dominant topic raster"
      />
      <div
        className="mt-2 text-[12px] font-mono"
        style={{
          color: "var(--color-fg-faint)",
          minHeight: 18,
        }}
      >
        {hover
          ? `(${hover.row}, ${hover.col})  · tópico ${
              hover.topic === null ? "—" : hover.topic + 1
            }`
          : "Mueve el cursor para inspeccionar; click para fijar."}
      </div>
    </div>
  );
}
