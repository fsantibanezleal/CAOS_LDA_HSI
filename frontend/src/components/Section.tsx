import type { ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
};

export function Section({ id, title, lead, children }: Props) {
  return (
    <section id={id} className="mt-10 first:mt-0">
      <h2
        className="text-xl md:text-2xl font-semibold tracking-tight"
        style={{ color: "var(--color-fg)" }}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className="mt-2 max-w-3xl text-base leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {lead}
        </p>
      ) : null}
      <div className="mt-4 max-w-3xl text-[15px] leading-relaxed">
        {children}
      </div>
    </section>
  );
}
