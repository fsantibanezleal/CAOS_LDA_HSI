import {
  type WorkspaceStep,
  WORKSPACE_STEPS,
  useStore
} from "../../store/useStore";
import {
  BarsIcon,
  BeakerIcon,
  DatabaseIcon,
  HomeIcon,
  LayoutIcon,
  TerminalIcon
} from "../../components/chrome/Icons";

const STEP_ICON: Record<WorkspaceStep, (props: { size?: number }) => JSX.Element> = {
  data: HomeIcon,
  corpus: BeakerIcon,
  topics: DatabaseIcon,
  comparison: LayoutIcon,
  inference: BarsIcon,
  validation: TerminalIcon
};

const STEP_LABEL: Record<WorkspaceStep, { en: string; es: string }> = {
  data: { en: "Data", es: "Datos" },
  corpus: { en: "Corpus", es: "Corpus" },
  topics: { en: "Topics", es: "Tópicos" },
  comparison: { en: "Comparison", es: "Comparación" },
  inference: { en: "Inference", es: "Inferencia" },
  validation: { en: "Validation", es: "Validación" }
};

interface Props {
  language: "en" | "es";
  stepStatusById: Map<string, string>;
}

export function StepRail({ language, stepStatusById }: Props) {
  const active = useStore((s) => s.workspaceStep);
  const setStep = useStore((s) => s.setWorkspaceStep);

  return (
    <nav className="ws-step-rail" aria-label="workspace steps">
      {WORKSPACE_STEPS.map((step) => {
        const Icon = STEP_ICON[step];
        const status = stepStatusById.get(step) ?? "available";
        const disabled = status === "blocked";
        const isActive = step === active;
        return (
          <button
            key={step}
            type="button"
            className={[
              "ws-step-rail-item",
              isActive ? "is-active" : "",
              disabled ? "is-disabled" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => !disabled && setStep(step)}
            disabled={disabled}
            title={status === "blocked" ? `${STEP_LABEL[step][language]} (blocked)` : STEP_LABEL[step][language]}
          >
            <span className={`ws-step-status ws-step-status-${status}`} aria-hidden />
            <Icon size={14} />
            <span>{STEP_LABEL[step][language]}</span>
          </button>
        );
      })}
    </nav>
  );
}
