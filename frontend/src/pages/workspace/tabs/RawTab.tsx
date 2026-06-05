import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { FelzenszwalbGroupings, ScenePerScene } from "@/api/client";
import { ClassDistributionBar } from "@/components/plots/ClassDistributionBar";
import { SpectralByClass } from "@/components/plots/SpectralByClass";
import { TabEmpty, TabError, TabLoading } from "../components/TabStates";

export function RawTab({
  isLoading,
  error,
  data,
  sceneId,
}: {
  isLoading: boolean;
  error: Error | null;
  data: ScenePerScene | null;
  sceneId: string | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return <TabLoading message={t("pages:workspace.tabs.RawTab.loading")} />;
  if (error)
    return (
      <TabError
        message={t("pages:workspace.tabs.RawTab.error_title")}
        detail={error.message}
      />
    );
  if (!data) return <TabEmpty />;

  return (
    <div className="space-y-8">
      <SceneStats data={data} />

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-3"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.RawTab.class_distribution")}
        </h4>
        <ClassDistributionBar classes={data.class_distribution} />
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.RawTab.spectral_envelopes")}
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.spectral_envelopes_help")}
        </p>
        <SpectralByClass
          wavelengths={data.wavelengths_nm}
          classMeans={data.class_mean_spectra}
          classDistribution={data.class_distribution}
        />
      </div>

      {sceneId && <SegmentationOverlayPanel sceneId={sceneId} />}
    </div>
  );
}

const SEGMENTATION_METHODS: { id: string; label: string; description: string }[] = [
  { id: "felzenszwalb", label: "Felzenszwalb", description: "graph-based segmentation (Felzenszwalb–Huttenlocher 2004)" },
  { id: "slic_500", label: "SLIC · 500", description: "SLIC superpixels target 500 segments" },
  { id: "slic_2000", label: "SLIC · 2000", description: "SLIC superpixels target 2000 segments" },
  { id: "patch_7", label: "Patch · 7×7", description: "fixed-size 7×7 pixel patches" },
  { id: "patch_15", label: "Patch · 15×15", description: "fixed-size 15×15 pixel patches" },
];

function SegmentationOverlayPanel({ sceneId }: { sceneId: string }) {
  const { t } = useTranslation(["pages"]);
  const [method, setMethod] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: ["seg-summary", method, sceneId],
    queryFn: () =>
      api.felzenszwalbGroupingsByMethod(method!, sceneId),
    enabled: method !== null,
    staleTime: 30 * 60_000,
  });
  const assignment = useQuery({
    queryKey: ["seg-assignment", method, sceneId],
    queryFn: () => {
      const path = `/generated/groupings/${method}/${sceneId}/assignment.bin`;
      return api.buffer(path);
    },
    enabled: method !== null,
    staleTime: 30 * 60_000,
    retry: false,
  });

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="flex items-baseline justify-between gap-3 mb-2">
        <h4
          className="text-base font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.RawTab.seg_overlay_title")}
        </h4>
        <div className="flex items-center gap-2">
          <label
            htmlFor="raw-segmentation-method"
            className="text-[11px] uppercase tracking-wider"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace.tabs.RawTab.method")}
          </label>
          <select
            id="raw-segmentation-method"
            value={method ?? ""}
            onChange={(e) => setMethod(e.target.value === "" ? null : e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-fg)",
            }}
          >
            <option value="">{t("pages:workspace.tabs.RawTab.off")}</option>
            {SEGMENTATION_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      <p
        className="text-sm mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.RawTab.seg_help")}
      </p>
      {method === null ? (
        <p
          className="text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.RawTab.pick_method")}
        </p>
      ) : assignment.isLoading || summary.isLoading ? (
        <p
          className="text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.RawTab.loading_seg", { method })}
        </p>
      ) : assignment.error || summary.error ? (
        <p
          className="text-[12px]"
          style={{ color: "var(--color-warn)" }}
        >
          {t("pages:workspace.tabs.RawTab.seg_error", { method, scene: sceneId })}
        </p>
      ) : assignment.data && summary.data ? (
        <SegmentationOverlayRaster
          method={method}
          summary={summary.data}
          buffer={assignment.data}
        />
      ) : null}
    </div>
  );
}

function SegmentationOverlayRaster({
  method,
  summary,
  buffer,
}: {
  method: string;
  summary: FelzenszwalbGroupings;
  buffer: ArrayBuffer;
}) {
  const { t } = useTranslation(["pages"]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shape = summary.spatial_shape ?? [0, 0];
  const [h, w] = shape;
  const fmt = summary.assignment_format ?? "binary_uint16_le";

  const ids = useMemo(() => {
    if (fmt === "binary_uint32_le") return new Uint32Array(buffer);
    return new Uint16Array(buffer);
  }, [buffer, fmt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || h === 0 || w === 0) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const off = i * 4;
      // Deterministic colour from id via a small bit-hash that scatters
      // adjacent ids to distant hues for visual contrast.
      const x = id * 2654435761;
      const r = (x >> 16) & 0xff;
      const g = (x >> 8) & 0xff;
      const b = x & 0xff;
      img.data[off] = r;
      img.data[off + 1] = g;
      img.data[off + 2] = b;
      img.data[off + 3] = 200;
    }
    ctx.putImageData(img, 0, 0);
  }, [ids, h, w]);

  const viewW = 540;
  const viewH = w > 0 ? Math.round((viewW * h) / w) : 0;

  return (
    <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          style={{
            width: viewW,
            height: viewH,
            imageRendering: "pixelated",
            backgroundColor: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
          }}
          aria-label={t("pages:workspace.tabs.RawTab.aria_overlay", { method })}
        />
        <p
          className="mt-2 text-[11px] font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {method} · {summary.n_groups} segments · {h}×{w} · {ids.length.toLocaleString()} pixels
        </p>
      </div>
      <div
        className="rounded-md border p-3 text-[12.5px]"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
        }}
      >
        <div
          className="text-[11px] uppercase tracking-wider mb-2"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.RawTab.segment_statistics")}
        </div>
        <ul className="space-y-1 font-mono text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          <li>
            <span style={{ color: "var(--color-fg-faint)" }}>n_groups: </span>
            <span style={{ color: "var(--color-fg)" }}>{summary.n_groups.toLocaleString()}</span>
          </li>
          <li>
            <span style={{ color: "var(--color-fg-faint)" }}>size p25/p50/p75: </span>
            <span style={{ color: "var(--color-fg)" }}>
              {summary.group_size_distribution.p25} / {summary.group_size_distribution.p50} / {summary.group_size_distribution.p75}
            </span>
          </li>
          <li>
            <span style={{ color: "var(--color-fg-faint)" }}>size min / max: </span>
            <span style={{ color: "var(--color-fg)" }}>
              {summary.group_size_distribution.min} / {summary.group_size_distribution.max}
            </span>
          </li>
          <li className="pt-1.5" style={{ borderTop: "1px dashed var(--color-border)" }}>
            <span style={{ color: "var(--color-fg-faint)" }}>between/within var ratio: </span>
            <span style={{ color: "var(--color-fg)" }}>{summary.between_within_variance_ratio.toFixed(3)}</span>
          </li>
          <li>
            <span style={{ color: "var(--color-fg-faint)" }}>vs ground-truth ARI: </span>
            <span style={{ color: "var(--color-fg)" }}>{summary.agreement_vs_label.ari.toFixed(3)}</span>
          </li>
          <li>
            <span style={{ color: "var(--color-fg-faint)" }}>vs ground-truth NMI: </span>
            <span style={{ color: "var(--color-fg)" }}>{summary.agreement_vs_label.nmi.toFixed(3)}</span>
          </li>
          <li>
            <span style={{ color: "var(--color-fg-faint)" }}>labelled pixels in stat: </span>
            <span style={{ color: "var(--color-fg)" }}>
              {summary.agreement_vs_label.n_labelled_pixels.toLocaleString()}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
function SceneStats({
  data,
}: {
  data: {
    spatial_shape: [number, number];
    n_pixels: number;
    n_labelled_pixels: number;
    n_classes: number;
    imbalance_gini: number;
    sensor: string;
    wavelengths_nm: number[];
  };
}) {
  const { t } = useTranslation(["pages"]);
  const stats = [
    {
      label: t("pages:workspace.tabs.RawTab.stat_sensor"),
      value: data.sensor,
    },
    {
      label: t("pages:workspace.tabs.RawTab.stat_shape"),
      value: `${data.spatial_shape[0]} × ${data.spatial_shape[1]}`,
    },
    {
      label: t("pages:workspace.tabs.RawTab.stat_bands"),
      value: `${data.wavelengths_nm.length} (${Math.round(
        data.wavelengths_nm[0]!,
      )}–${Math.round(data.wavelengths_nm.at(-1)!)} nm)`,
    },
    {
      label: t("pages:workspace.tabs.RawTab.stat_labelled_pixels"),
      value: `${data.n_labelled_pixels.toLocaleString()} / ${data.n_pixels.toLocaleString()}`,
    },
    {
      label: t("pages:workspace.tabs.RawTab.stat_classes"),
      value: String(data.n_classes),
    },
    {
      label: t("pages:workspace.tabs.RawTab.stat_gini"),
      value: data.imbalance_gini.toFixed(3),
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-md border p-3"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
          }}
        >
          <div
            className="text-[11px] uppercase tracking-wider"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {s.label}
          </div>
          <div
            className="mt-0.5 text-base font-semibold tracking-tight"
            style={{ color: "var(--color-fg)" }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
