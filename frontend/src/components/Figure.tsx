import type { ReactNode } from "react";

type Props = {
  caption?: string;
  children: ReactNode;
};

export function Figure({ caption, children }: Props) {
  return (
    <figure
      className="my-6 rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex justify-center overflow-x-auto">{children}</div>
      {caption ? (
        <figcaption
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
