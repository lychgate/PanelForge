// PanelForge — task state transitions (S2.4).
//
// Ownership of state changes over the 12 §11.1 states: this module owns the
// allowed transition graph and rejects illegal transitions with a typed
// error (TransitionError, code INVALID_TRANSITION).
//
// The S2.2 records layer keeps its admin setState (records can be
// corrected operator-side); the queue and all future callers use
// transitionTask(), the guarded path. Crash-resume (running → queued) is
// a legal edge — S2.8 formalizes full recovery on top of it. Pause,
// cancel and retry edges exist here; their user-facing semantics land in
// S2.5/S2.6. Terminal states (complete, cancelled) have no outgoing edges.

import { isTaskState, type TaskRecord, type TaskState, type TaskStore } from "./store";

export type TransitionErrorCode = "INVALID_TRANSITION" | "NOT_FOUND";

export class TransitionError extends Error {
  code: TransitionErrorCode;
  constructor(code: TransitionErrorCode, message: string) {
    super(message);
    this.name = "TransitionError";
    this.code = code;
  }
}

const EDGES: Readonly<Record<TaskState, readonly TaskState[]>> = {
  // S2.5: a queued task can be paused before it starts (same semantics as
  // pausing mid-flight; resume is paused → queued).
  queued: ["preparing", "failed", "cancelled", "waiting-for-resources", "paused"],
  preparing: ["loading-model", "generating", "complete", "failed", "paused", "cancelled", "queued"],
  "loading-model": ["generating", "complete", "failed", "paused", "cancelled", "queued"],
  generating: ["post-processing", "complete", "failed", "cooling-down", "paused", "cancelled", "queued"],
  "post-processing": ["saving", "failed", "cancelled", "queued"],
  saving: ["complete", "failed", "queued"],
  complete: [],
  failed: ["queued"],
  paused: ["queued", "cancelled"],
  cancelled: [],
  "waiting-for-resources": ["queued", "cancelled"],
  "cooling-down": ["queued", "cancelled"],
};

export function allowedNextStates(from: TaskState): TaskState[] {
  return [...EDGES[from]];
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return isTaskState(to) && EDGES[from].includes(to);
}

/** Move a task through the guarded transition path. */
export async function transitionTask(
  store: TaskStore,
  taskId: string,
  to: TaskState
): Promise<TaskRecord> {
  const current = await store.getTask(taskId);
  if (!current) {
    throw new TransitionError("NOT_FOUND", `No task with id: ${taskId}`);
  }
  if (!isTaskState(to)) {
    throw new TransitionError("INVALID_TRANSITION", `Unknown task state: ${String(to)}`);
  }
  if (!EDGES[current.state].includes(to)) {
    throw new TransitionError(
      "INVALID_TRANSITION",
      `Illegal transition: ${current.state} → ${to}`
    );
  }
  return store.setState(taskId, to);
}
