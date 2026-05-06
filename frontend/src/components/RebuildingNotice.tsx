import { useTranslation } from "react-i18next";

type Props = {
  hint?: string;
};

export function RebuildingNotice({ hint }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-lg border p-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <p style={{ color: "var(--color-fg-subtle)" }}>
        {t("common:states.rebuilding")}
      </p>
      {hint ? (
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
