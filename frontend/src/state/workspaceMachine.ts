import { setup, assign } from "xstate";

import type {
  DatasetFamily,
  RepresentationKind,
} from "@/state/useSelectionStore";

export type WorkspaceView =
  | "raw"
  | "spectra"
  | "labels"
  | "segmentation"
  | "embed2d"
  | "embed3d"
  | "topicMap"
  | "topicVsLabel";

export type WorkspaceContext = {
  family: DatasetFamily | null;
  subset: string | null;
  rep: RepresentationKind | null;
  view: WorkspaceView | null;
  docId: string | null;
};

export type WorkspaceEvent =
  | { type: "PICK_FAMILY"; family: DatasetFamily }
  | { type: "PICK_SUBSET"; subset: string }
  | { type: "PICK_REP"; rep: RepresentationKind }
  | { type: "GO_VIEW"; view: WorkspaceView }
  | { type: "PICK_DOC"; docId: string }
  | { type: "BACK" };

const initialContext: WorkspaceContext = {
  family: null,
  subset: null,
  rep: null,
  view: null,
  docId: null,
};

/**
 * Workspace wizard state machine — implements the FSM described in
 * `_CAOS_MANAGE/wip/caos-lda-hsi/web-app-spec.md` §4.
 *
 * Step gates: each transition is unconditional in this skeleton; guards
 * (e.g. `repAvailableForSubset`) will be added when the manifest is
 * wired and the page-level UIs are implemented.
 */
export const workspaceMachine = setup({
  types: {
    context: {} as WorkspaceContext,
    events: {} as WorkspaceEvent,
  },
}).createMachine({
  id: "workspace",
  initial: "pickFamily",
  context: initialContext,
  states: {
    pickFamily: {
      on: {
        PICK_FAMILY: {
          target: "pickSubset",
          actions: assign({ family: ({ event }) => event.family }),
        },
      },
    },
    pickSubset: {
      on: {
        PICK_SUBSET: {
          target: "pickRep",
          actions: assign({ subset: ({ event }) => event.subset }),
        },
        BACK: { target: "pickFamily", actions: assign({ subset: null }) },
      },
    },
    pickRep: {
      on: {
        PICK_REP: {
          target: "explore",
          actions: assign({ rep: ({ event }) => event.rep }),
        },
        BACK: { target: "pickSubset", actions: assign({ rep: null }) },
      },
    },
    explore: {
      initial: "raw",
      on: {
        GO_VIEW: {
          target: ".dynamic",
          actions: assign({ view: ({ event }) => event.view }),
        },
        PICK_DOC: {
          target: "benchmarkFork",
          actions: assign({ docId: ({ event }) => event.docId }),
        },
        BACK: { target: "pickRep" },
      },
      states: {
        raw: {},
        dynamic: {},
      },
    },
    benchmarkFork: { type: "final" },
  },
});
