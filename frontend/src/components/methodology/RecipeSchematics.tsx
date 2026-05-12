const W = 130;
const H = 78;
const PAD = 6;
const AXIS = "var(--color-border)";
const STROKE = "var(--color-fg-subtle)";
const ACCENT = "var(--color-accent)";

function Frame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      style={{
        color: "var(--color-fg)",
        display: "block",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={H - 1}
        fill="none"
        stroke={AXIS}
        rx="3"
      />
      {children}
    </svg>
  );
}

function spectrum(): string {
  const xs = Array.from({ length: 30 }, (_, i) => i);
  const points = xs
    .map((i) => {
      const x = PAD + (i / 29) * (W - 2 * PAD);
      const y =
        H -
        PAD -
        20 -
        14 *
          Math.sin(i * 0.6) *
          Math.exp(-Math.abs(i - 15) / 18);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return points;
}

export function RecipeV1Svg() {
  // band-frequency: small histogram bars
  const bars = [12, 22, 30, 26, 18, 28, 38, 32, 20, 10];
  const bw = (W - 2 * PAD) / bars.length;
  return (
    <Frame label="V1 band-frequency schematic">
      <line
        x1={PAD}
        y1={H - PAD}
        x2={W - PAD}
        y2={H - PAD}
        stroke={AXIS}
      />
      {bars.map((b, i) => (
        <rect
          key={i}
          x={PAD + i * bw + 1.5}
          y={H - PAD - b}
          width={bw - 3}
          height={b}
          fill={ACCENT}
          opacity="0.75"
        />
      ))}
    </Frame>
  );
}

export function RecipeV2Svg() {
  // intensity-as-word: single (band, level) capsule
  return (
    <Frame label="V2 intensity-as-word schematic">
      <polyline
        points={spectrum()}
        fill="none"
        stroke={STROKE}
        strokeWidth="1"
      />
      <circle cx={W / 2} cy={H / 2 + 4} r="5" fill={ACCENT} />
      <rect
        x={W / 2 + 10}
        y={H / 2 - 5}
        width={36}
        height={18}
        rx="3"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
      />
      <text
        x={W / 2 + 28}
        y={H / 2 + 7}
        textAnchor="middle"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        fill="var(--color-fg)"
      >
        b·ℓ
      </text>
    </Frame>
  );
}

export function RecipeV3Svg() {
  // concat-spectra: long flat token vector
  return (
    <Frame label="V3 concat-spectra schematic">
      <polyline
        points={spectrum()}
        fill="none"
        stroke={STROKE}
        strokeWidth="1"
      />
      <g>
        {Array.from({ length: 18 }, (_, i) => (
          <rect
            key={i}
            x={PAD + 2 + i * 6.5}
            y={H - PAD - 10}
            width={5}
            height={6}
            fill={ACCENT}
            opacity={0.45 + (i % 3) * 0.18}
          />
        ))}
      </g>
    </Frame>
  );
}

export function RecipeV4Svg() {
  // derivative-bin: 1st-derivative curve
  const pts = Array.from({ length: 40 }, (_, i) => {
    const x = PAD + (i / 39) * (W - 2 * PAD);
    const y =
      H / 2 + 4 + 12 * Math.cos(i * 0.5) * Math.exp(-Math.abs(i - 20) / 14);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Frame label="V4 derivative-bin schematic">
      <line
        x1={PAD}
        y1={H / 2 + 4}
        x2={W - PAD}
        y2={H / 2 + 4}
        stroke={AXIS}
        strokeDasharray="2 2"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
    </Frame>
  );
}

export function RecipeV5Svg() {
  // 2nd-derivative: more oscillation
  const pts = Array.from({ length: 50 }, (_, i) => {
    const x = PAD + (i / 49) * (W - 2 * PAD);
    const y =
      H / 2 +
      4 +
      14 * Math.sin(i * 0.9) * Math.exp(-Math.abs(i - 25) / 18);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Frame label="V5 2nd-derivative schematic">
      <line
        x1={PAD}
        y1={H / 2 + 4}
        x2={W - PAD}
        y2={H / 2 + 4}
        stroke={AXIS}
        strokeDasharray="2 2"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
    </Frame>
  );
}

export function RecipeV6Svg() {
  // wavelet: mother + scaled
  const mexicanHat = (k: number, scale: number) => {
    const t = (k - 15) / scale;
    return (1 - t * t) * Math.exp(-(t * t) / 2);
  };
  const wave = (scale: number, yMid: number) =>
    Array.from({ length: 30 }, (_, i) => {
      const x = PAD + (i / 29) * (W - 2 * PAD);
      const y = yMid - 10 * mexicanHat(i, scale);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  return (
    <Frame label="V6 wavelet schematic">
      <polyline
        points={wave(3, H / 2 - 12)}
        fill="none"
        stroke={STROKE}
        strokeWidth="1"
      />
      <polyline
        points={wave(6, H / 2 + 14)}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
    </Frame>
  );
}

export function RecipeV7Svg() {
  // absorption-triplet: three valleys
  const pts = Array.from({ length: 60 }, (_, i) => {
    const x = PAD + (i / 59) * (W - 2 * PAD);
    const valleys = [
      Math.exp(-((i - 14) ** 2) / 12),
      Math.exp(-((i - 30) ** 2) / 14),
      Math.exp(-((i - 46) ** 2) / 12),
    ];
    const y = PAD + 16 + 22 * (valleys[0]! + valleys[1]! + valleys[2]!);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Frame label="V7 absorption-triplet schematic">
      <polyline
        points={pts}
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      {[14, 30, 46].map((i) => {
        const x = PAD + (i / 59) * (W - 2 * PAD);
        return (
          <circle
            key={i}
            cx={x}
            cy={H - PAD - 4}
            r="2"
            fill={ACCENT}
          />
        );
      })}
    </Frame>
  );
}

export function RecipeV8Svg() {
  // endmember-fraction: weighted basis spectra
  const lineY = (offset: number, amp: number) =>
    Array.from({ length: 30 }, (_, i) => {
      const x = PAD + (i / 29) * (W - 2 * PAD);
      const y = offset + amp * Math.sin(i * 0.4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  return (
    <Frame label="V8 endmember-fraction schematic">
      <polyline
        points={lineY(H / 2 - 18, 4)}
        fill="none"
        stroke={STROKE}
        strokeWidth="0.8"
        opacity="0.7"
      />
      <polyline
        points={lineY(H / 2, 4)}
        fill="none"
        stroke={STROKE}
        strokeWidth="0.8"
        opacity="0.7"
      />
      <polyline
        points={lineY(H / 2 + 18, 4)}
        fill="none"
        stroke={STROKE}
        strokeWidth="0.8"
        opacity="0.7"
      />
      <text
        x={W - PAD - 2}
        y={PAD + 10}
        textAnchor="end"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        fill={ACCENT}
      >
        Σ αᵢ φᵢ
      </text>
    </Frame>
  );
}

export function RecipeV9Svg() {
  // region-token: spatial segments
  return (
    <Frame label="V9 region-token schematic">
      <rect
        x={PAD + 6}
        y={PAD + 6}
        width="38"
        height="28"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
      />
      <rect
        x={PAD + 50}
        y={PAD + 4}
        width="28"
        height="36"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.7"
      />
      <rect
        x={PAD + 84}
        y={PAD + 10}
        width="32"
        height="22"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.55"
      />
      <rect
        x={PAD + 10}
        y={PAD + 42}
        width="46"
        height="24"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.8"
      />
      <rect
        x={PAD + 64}
        y={PAD + 44}
        width="50"
        height="22"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.6"
      />
    </Frame>
  );
}

export function RecipeV10Svg() {
  // band-group: contiguous band groups under spectrum
  return (
    <Frame label="V10 band-group schematic">
      <polyline
        points={spectrum()}
        fill="none"
        stroke={STROKE}
        strokeWidth="1"
      />
      {[
        [PAD + 2, 28, ACCENT],
        [PAD + 32, 26, "var(--color-accent)"],
        [PAD + 60, 32, ACCENT],
        [PAD + 94, 22, "var(--color-accent)"],
      ].map(([x, w, c], i) => (
        <rect
          key={i}
          x={x as number}
          y={H - PAD - 6}
          width={w as number}
          height="3"
          fill={c as string}
          opacity={0.4 + i * 0.15}
        />
      ))}
    </Frame>
  );
}

export function RecipeV11Svg() {
  // codebook-VQ: spectrum to centroid
  return (
    <Frame label="V11 codebook-VQ schematic">
      <polyline
        points={spectrum()}
        fill="none"
        stroke={STROKE}
        strokeWidth="1"
      />
      <g>
        <circle
          cx={PAD + 26}
          cy={H / 2 + 12}
          r="3"
          fill={ACCENT}
          opacity="0.85"
        />
        <circle
          cx={PAD + 60}
          cy={H / 2 - 6}
          r="3"
          fill={ACCENT}
          opacity="0.85"
        />
        <circle
          cx={PAD + 92}
          cy={H / 2 + 10}
          r="3"
          fill={ACCENT}
          opacity="0.85"
        />
      </g>
      <line
        x1={PAD + 26}
        y1={H / 2 + 12}
        x2={PAD + 60}
        y2={H / 2 - 6}
        stroke={ACCENT}
        strokeDasharray="2 2"
        opacity="0.6"
      />
      <line
        x1={PAD + 60}
        y1={H / 2 - 6}
        x2={PAD + 92}
        y2={H / 2 + 10}
        stroke={ACCENT}
        strokeDasharray="2 2"
        opacity="0.6"
      />
    </Frame>
  );
}

export function RecipeV12Svg() {
  // GMM-token: probabilistic ellipses
  return (
    <Frame label="V12 GMM-token schematic">
      <ellipse
        cx={PAD + 30}
        cy={H / 2 + 4}
        rx="20"
        ry="11"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.85"
      />
      <ellipse
        cx={PAD + 70}
        cy={H / 2 - 8}
        rx="16"
        ry="9"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.7"
        transform={`rotate(20 ${PAD + 70} ${H / 2 - 8})`}
      />
      <ellipse
        cx={PAD + 96}
        cy={H / 2 + 14}
        rx="14"
        ry="8"
        fill="var(--color-accent-soft)"
        stroke={ACCENT}
        opacity="0.6"
        transform={`rotate(-15 ${PAD + 96} ${H / 2 + 14})`}
      />
      <circle cx={PAD + 30} cy={H / 2 + 4} r="1.5" fill={ACCENT} />
      <circle cx={PAD + 70} cy={H / 2 - 8} r="1.5" fill={ACCENT} />
      <circle cx={PAD + 96} cy={H / 2 + 14} r="1.5" fill={ACCENT} />
    </Frame>
  );
}

const SCHEMATICS: {
  id: string;
  title: string;
  caption: string;
  Component: () => React.ReactElement;
}[] = [
  {
    id: "V1",
    title: "V1 band-frequency",
    caption: "Per-band intensity histogram → one count per (band, level) bin.",
    Component: RecipeV1Svg,
  },
  {
    id: "V2",
    title: "V2 intensity-as-word",
    caption: "Pixel reduces to a single (band, quantized-level) token.",
    Component: RecipeV2Svg,
  },
  {
    id: "V3",
    title: "V3 concat-spectra",
    caption: "Full spectrum is unrolled into a long token vector.",
    Component: RecipeV3Svg,
  },
  {
    id: "V4",
    title: "V4 derivative-bin",
    caption: "1st-derivative spectrum is binned and tokenized.",
    Component: RecipeV4Svg,
  },
  {
    id: "V5",
    title: "V5 2nd-derivative",
    caption: "Curvature spectrum is binned — sensitive to inflection points.",
    Component: RecipeV5Svg,
  },
  {
    id: "V6",
    title: "V6 wavelet",
    caption: "Wavelet coefficients at multiple scales become tokens.",
    Component: RecipeV6Svg,
  },
  {
    id: "V7",
    title: "V7 absorption-triplet",
    caption: "Each strongest absorption valley → triplet token (centroid-band bucket, depth bin, area bin).",
    Component: RecipeV7Svg,
  },
  {
    id: "V8",
    title: "V8 endmember-fraction",
    caption: "Pixel as weighted sum of endmember spectra; α-coefficients tokenize.",
    Component: RecipeV8Svg,
  },
  {
    id: "V9",
    title: "V9 region-token",
    caption: "Spatial segments contribute their own region-id tokens.",
    Component: RecipeV9Svg,
  },
  {
    id: "V10",
    title: "V10 band-group",
    caption: "Three coarse spectral regions (VNIR / SWIR-1 / SWIR-2) → one mean-bin token per region.",
    Component: RecipeV10Svg,
  },
  {
    id: "V11",
    title: "V11 codebook-VQ",
    caption: "Each pixel quantized to the nearest codebook centroid (hard VQ).",
    Component: RecipeV11Svg,
  },
  {
    id: "V12",
    title: "V12 GMM-token",
    caption: "Pixel as soft posterior over a GMM; posteriors quantized.",
    Component: RecipeV12Svg,
  },
];

export function RecipeSchematicsGrid() {
  return (
    <div
      className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
      role="list"
      aria-label="Recipe V1-V12 schematics"
    >
      {SCHEMATICS.map((s) => {
        const C = s.Component;
        return (
          <figure
            key={s.id}
            role="listitem"
            className="rounded-md border p-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
            }}
          >
            <C />
            <figcaption className="mt-2">
              <div
                className="font-mono text-[12px] font-semibold"
                style={{ color: "var(--color-fg)" }}
              >
                {s.title}
              </div>
              <div
                className="text-[12px] mt-0.5 leading-snug"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                {s.caption}
              </div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
