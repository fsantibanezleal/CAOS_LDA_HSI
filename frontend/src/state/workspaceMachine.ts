import { setup, assign } from "xstate";

import type {
  DatasetFamily,
  RepresentationKind,
} from "@/state/useSelectionStore";

export type WorkspaceContext = {
  family: DatasetFamily | null;
  subset: string | null;
  rep: RepresentationKind | null;
};

export type WorkspaceEvent =
  | { type: "PICK_FAMILY"; family: DatasetFamily }
  | { type: "PICK_SUBSET"; subset: string }
  | { type: "PICK_REP"; rep: RepresentationKind }
  | { type: "SWITCH_SUBSET"; subset: string }
  | { type: "BACK" };

const initialContext: WorkspaceContext = {
  family: null,
  subset: null,
  rep: null,
};

/**
 * Workspace wizard state machine. Tracks the four-step picker
 * (family -> subset -> rep -> explore) with per-step BACK and a
 * mid-explore SWITCH_SUBSET that lets the user pivot the dataset
 * without leaving the chosen recipe.
 *
 * Audit cleanup (#592 Tier 1 item 3, c389): the previous skeleton
 * carried orphaned GO_VIEW + PICK_DOC events, the matching `view`
 * and `docId` context fields, the `explore.dynamic` substate, and a
 * `benchmarkFork` final state — none of which were dispatched after
 * the 6-tab -> 28-tab refactor at c133. Removed.
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
      on: {
        SWITCH_SUBSET: {
          actions: assign({ subset: ({ event }) => event.subset }),
        },
        BACK: { target: "pickRep" },
      },
    },
  },
});
