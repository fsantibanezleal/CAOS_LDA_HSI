import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type RepresentationPayload } from "@/api/client";

const DEEP_METHOD_OPTIONS: {
  key: string;
  label: string;
  K: number;
  family: "cae_1d" | "beta_vae" | "cae_2d" | "cae_3d" | "cae_3d_full";
}[] = [
  { key: "cae_1d_4", label: "CAE-1D K=4", K: 4, family: "cae_1d" },
  { key: "cae_1d_8", label: "CAE-1D K=8", K: 8, family: "cae_1d" },
  { key: "cae_1d_16", label: "CAE-1D K=16", K: 16, family: "cae_1d" },
  { key: "cae_1d_32", label: "CAE-1D K=32", K: 32, family: "cae_1d" },
  { key: "beta_vae_4", label: "β-VAE K=4 β=4", K: 4, family: "beta_vae" },
  { key: "beta_vae_8", label: "β-VAE K=8 β=4", K: 8, family: "beta_vae" },
  { key: "beta_vae_16", label: "β-VAE K=16 β=4", K: 16, family: "beta_vae" },
  { key: "beta_vae_32", label: "β-VAE K=32 β=4", K: 32, family: "beta_vae" },
  { key: "cae_2d_4", label: "CAE-2D K=4", K: 4, family: "cae_2d" },
  { key: "cae_2d_8", label: "CAE-2D K=8", K: 8, family: "cae_2d" },
  { key: "cae_2d_16", label: "CAE-2D K=16", K: 16, family: "cae_2d" },
  { key: "cae_2d_32", label: "CAE-2D K=32", K: 32, family: "cae_2d" },
  { key: "cae_3d_4", label: "CAE-3D K=4 (anchor)", K: 4, family: "cae_3d" },
  { key: "cae_3d_8", label: "CAE-3D K=8 (anchor)", K: 8, family: "cae_3d" },
  { key: "cae_3d_16", label: "CAE-3D K=16 (anchor)", K: 16, family: "cae_3d" },
  { key: "cae_3d_32", label: "CAE-3D K=32 (anchor)", K: 32, family: "cae_3d" },
  { key: "cae_3d_full_4", label: "CAE-3D K=4 (full-patch)", K: 4, family: "cae_3d_full" },
  { key: "cae_3d_full_8", label: "CAE-3D K=8 (full-patch)", K: 8, family: "cae_3d_full" },
];

const CLASS_LABEL_COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#aec7e8",
  "#ffbb78",
  "#98df8a",
  "#ff9896",
  "#c5b0d5",
  "#c49c94",
];

export function DeepLatentsTab({ sceneId }: { sceneId: string }) {
  const [methodKey, setMethodKey] = useState("cae_1d_8");
  const q = useQuery({
    queryKey: ["repr", methodKey, sceneId],
    queryFn: () => api.representation(methodKey, sceneId),
    retry: false,
  });

  const data = q.data;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Deep latents · CAE-1D / CAE-2D / CAE-3D / β-VAE × K
          </h4>
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
            Pick a deep encoder and latent dimension. Renders the per-document
            latent projected to PCA-2D / 3D, with K-means(latent) ARI vs label
            and per-class silhouette. Capacity-driven scaling shows in the ARI
            number on the top-right.
          </p>
        </header>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[12px]"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            Method:
          </span>
          {(["cae_1d", "beta_vae", "cae_2d", "cae_3d"] as const).map((fam) => (
            <div key={fam} className="flex items-center gap-1">
              <span
                className="text-[11px] mr-1 font-mono"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {fam === "cae_1d"
                  ? "CAE-1D"
                  : fam === "beta_vae"
                    ? "β-VAE"
                    : fam === "cae_2d"
                      ? "CAE-2D"
                      : "CAE-3D"}
              </span>
              {DEEP_METHOD_OPTIONS.filter((m) => m.family === fam).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethodKey(m.key)}
                  className="px-2 py-0.5 rounded text-[11px] font-mono"
                  style={{
                    backgroundColor:
                      methodKey === m.key
                        ? "var(--color-accent)"
                        : "var(--color-bg)",
                    color:
                      methodKey === m.key
                        ? "var(--color-bg)"
                        : "var(--color-fg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  K={m.K}
                </button>
              ))}
            </div>
          ))}
        </div>

        {!data ? (
          <p
            className="mt-4 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {q.isLoading
              ? `Loading ${methodKey} for ${sceneId}…`
              : `No payload for ${methodKey} on ${sceneId}.`}
          </p>
        ) : (
          <DeepLatentsBody data={data} />
        )}
      </div>
    </div>
  );
}

function DeepLatentsBody({ data }: { data: RepresentationPayload }) {
  const scatter = data.scatter_2d_3d_subsample ?? [];
  const xs = scatter.map((p) => p.x_2d);
  const ys = scatter.map((p) => p.y_2d);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const W = 560;
  const H = 360;
  const padding = 30;
  const xOf = (x: number) =>
    padding + ((x - xmin) / Math.max(1e-9, xmax - xmin)) * (W - 2 * padding);
  const yOf = (y: number) =>
    padding + ((ymax - y) / Math.max(1e-9, ymax - ymin)) * (H - 2 * padding);

  const ari = data.downstream_kmeans_vs_label?.ari;
  const nmi = data.downstream_kmeans_vs_label?.nmi;
  const sil = data.silhouette_label?.overall;
  const recRmse = data.fit_meta.reconstruction_rmse as number | undefined;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat2 label="latent_dim" value={String(data.latent_dim)} />
        <Stat2
          label="K-means ARI"
          value={ari != null ? ari.toFixed(3) : "—"}
        />
        <Stat2
          label="K-means NMI"
          value={nmi != null ? nmi.toFixed(3) : "—"}
        />
        <Stat2
          label="silhouette"
          value={sil != null ? sil.toFixed(3) : "—"}
        />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Deep latent PCA-2D projection"
        style={{
          backgroundColor: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "6px",
          width: "100%",
          maxWidth: `${W}px`,
        }}
      >
        {scatter.map((p, i) => (
          <circle
            key={i}
            cx={xOf(p.x_2d)}
            cy={yOf(p.y_2d)}
            r="2.4"
            fill={
              CLASS_LABEL_COLORS[(p.label_id - 1) % CLASS_LABEL_COLORS.length]
            }
            opacity="0.75"
          />
        ))}
      </svg>

      <p className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
        PCA-2D projection of the deep latent · {scatter.length} points,
        coloured by GT class. Reconstruction RMSE
        {recRmse != null ? ` = ${recRmse.toFixed(4)}` : " not in payload"}.
        Architecture:{" "}
        <code className="font-mono text-[11px]">
          {String(data.fit_meta.architecture ?? "n/a")}
        </code>
        .
      </p>
    </div>
  );
}

function Stat2({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md border p-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[10.5px] mb-1 font-mono uppercase tracking-wide"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="font-mono text-[13px]"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
