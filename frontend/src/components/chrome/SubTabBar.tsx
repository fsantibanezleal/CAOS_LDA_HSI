interface SubTab<T extends string> {
  id: T;
  label: string;
  status?: "ready" | "prototype" | "blocked" | null;
  disabled?: boolean;
}

interface Props<T extends string> {
  tabs: SubTab<T>[];
  active: T;
  onChange: (id: T) => void;
}

export function SubTabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <nav className="subtab-row" aria-label="secondary">
      {tabs.map((tab) => {
        const className = [
          "subtab-item",
          tab.id === active ? "is-active" : "",
          tab.disabled ? "is-disabled" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={tab.id}
            type="button"
            className={className}
            onClick={() => !tab.disabled && onChange(tab.id)}
            disabled={tab.disabled}
            aria-disabled={tab.disabled}
          >
            {tab.status && (
              <span
                className={`subtab-status-dot subtab-status-${tab.status}`}
                aria-hidden="true"
              />
            )}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
