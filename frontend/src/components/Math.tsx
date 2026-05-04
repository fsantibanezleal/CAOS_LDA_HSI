import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type Props = {
  tex: string;
  block?: boolean;
};

export function Math({ tex, block = false }: Props) {
  const ref = useRef<HTMLSpanElement | HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    katex.render(tex, ref.current, {
      throwOnError: false,
      displayMode: block,
      strict: "ignore",
      output: "html",
    });
  }, [tex, block]);

  return block ? (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="my-4 overflow-x-auto"
      aria-label={`equation: ${tex}`}
    />
  ) : (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      aria-label={`equation: ${tex}`}
    />
  );
}
