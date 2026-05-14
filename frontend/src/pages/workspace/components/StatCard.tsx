/**
 * Compact stat card used across Workspace tabs to render a labelled
 * scalar (count / fraction / formatted number).
 *
 * Originally named `UnmixingStat` inline in Workspace.tsx. Renamed and
 * extracted in cycle 135 because it's also used by ApplyToDocumentTab,
 * RecipesTab, RobustnessTab, SpatialTab, and UnmixingTab. The original
 * name is preserved as an export alias for backwards-compat with
 * usages still inlined in Workspace.tsx during the gradual extraction.
 */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[10px] uppercase tracking-widest font-semibold"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </span>
      <span
        className="text-[22px] font-mono leading-tight"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </span>
    </div>
  );
}

export { StatCard as UnmixingStat };
