import type { ReactNode } from "react";

type Props = {
  title: string;
  lead?: string | undefined;
  children?: ReactNode;
};

export function PageShell({ title, lead, children }: Props) {
  return (
    <section className="mx-auto max-w-screen-2xl px-6 py-10">
      <header className="mb-6">
        <h1
          className="text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: "var(--color-fg)" }}
        >
          {title}
        </h1>
        {lead ? (
          <p
            className="mt-2 max-w-3xl text-base"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {lead}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
