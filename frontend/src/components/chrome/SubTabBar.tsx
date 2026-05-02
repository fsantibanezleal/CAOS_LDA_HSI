interface SubTab<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  tabs: SubTab<T>[];
  active: T;
  onChange: (id: T) => void;
}

export function SubTabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <nav className="subtab-row" aria-label="secondary">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === active ? "subtab-item is-active" : "subtab-item"}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
