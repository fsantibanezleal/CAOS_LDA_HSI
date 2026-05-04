import { useTranslation } from "react-i18next";
import { useMachine } from "@xstate/react";

import { PageShell } from "@/components/PageShell";
import { RebuildingNotice } from "@/components/RebuildingNotice";
import { workspaceMachine } from "@/state/workspaceMachine";

export default function Workspace() {
  const { t } = useTranslation(["pages"]);
  // Mount the FSM so the wiring is real even though the UI is empty.
  // Subsequent task branches render step views off `state.value` and
  // dispatch typed events to advance.
  const [state] = useMachine(workspaceMachine);
  void state;
  return (
    <PageShell title={t("pages:workspace.title")}>
      <RebuildingNotice />
    </PageShell>
  );
}
