import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, props: IconProps) {
  const { size: _omit, ...rest } = props;
  void _omit;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest
  };
}

export function SunIcon(props: IconProps) {
  const size = props.size ?? 16;
  return (
    <svg {...base(size, props)} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  const size = props.size ?? 16;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M21 12.6A8.5 8.5 0 0 1 11.4 3a7.5 7.5 0 1 0 9.6 9.6Z" />
    </svg>
  );
}

export function LanguagesIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M5 8h7M8.5 5v3M11 13l-1.5-3-1.5 3M5 13c0-2 2-5 4.5-5S14 11 14 13" />
      <path d="M11 14c1 2 3 4 6 4M19 18c-1.5 0-3-.5-4-1M19 18c1-1 2-2 2-3.5 0-1.7-1.3-3-3-3s-3 1.3-3 3" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  const size = props.size ?? 16;
  const { size: _omit, ...rest } = props;
  void _omit;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...rest}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55 0-.27-.01-1-.02-1.95-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.96 10.96 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14 0 1.55-.02 2.8-.02 3.18 0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function PaperIcon(props: IconProps) {
  const size = props.size ?? 16;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M7 4h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M14 4v4h4" />
      <path d="M9 13h6M9 16h6M9 10h2" />
    </svg>
  );
}

export function OrcidIcon(props: IconProps) {
  const size = props.size ?? 16;
  const { size: _omit, ...rest } = props;
  void _omit;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...rest}
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zM7.4 6.4c.6 0 1.1.5 1.1 1.1s-.5 1.1-1.1 1.1-1.1-.5-1.1-1.1.5-1.1 1.1-1.1zm.7 3.5h-1.4v8.2h1.4V9.9zm2.5 0h3.2c3 0 4.4 2.2 4.4 4.1 0 2.1-1.6 4.1-4.4 4.1h-3.2V9.9zm1.4 1.3v5.7h1.7c2 0 2.9-1.5 2.9-2.9 0-1.3-.9-2.9-2.9-2.9h-1.7z" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  const size = props.size ?? 16;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M5 4.5A2 2 0 0 1 7 2.5h11v17H7a2 2 0 0 0-2 2V4.5z" />
      <path d="M5 4.5v17M9 7h6M9 10h6" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8.5z" />
    </svg>
  );
}

export function BeakerIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M9 3h6M10 3v5L5 19a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 19l-5-11V3" />
      <path d="M7.5 14h9" />
    </svg>
  );
}

export function DatabaseIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
      <path d="M4.5 11.5v7c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-7" />
    </svg>
  );
}

export function LayoutIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

export function BarsIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M5 21V11M11 21V5M17 21v-7" />
    </svg>
  );
}

export function TerminalIcon(props: IconProps) {
  const size = props.size ?? 14;
  return (
    <svg {...base(size, props)} aria-hidden>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 10l3 2-3 2M13 14h4" />
    </svg>
  );
}

export function StackIcon(props: IconProps) {
  const size = props.size ?? 18;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3z" />
      <path d="m3 12 9 4.5L21 12" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  const size = props.size ?? 16;
  return (
    <svg {...base(size, props)} aria-hidden>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
