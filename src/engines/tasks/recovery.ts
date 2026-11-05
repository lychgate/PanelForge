// PanelForge — queue persistence and recovery (S2.8).
//
// Startup recovery: persisted tasks are reloaded and any task left in a
// running state by a crashed run is returned to queued (through the
// guarded transition path), so a restart never loses work on the floor —
// and since the reset is itself guarded, a recovery can never double-run
// a task. Terminal states (complete/failed/cancelled) and paused tasks
// are never touched: pause/cancel stay exactly as the user left them.
//
// Batch resumability (backend checkpoints) arrives with the real
// providers (S2.9–S2.10); S2.8 covers record-level recovery:

import { transitionTask } from "./transitions";
import type { TaskStore } from "./store";

export type RecoverySummary = {
  total: number;
  resumed: number;
  queued: number;
  paused: number;
  terminal: number;
};

const RUNNING_STATES = ["preparing", "loading-model", "generating", "post-processing", "saving"] as const;
const TERMINAL_STATES = ["complete", "failed", "cancelled"] as const;

/**
 * Recover the queue after a restart: tasks stuck in running states go
 * back to queued; everything else is left untouched. Idempotent.
 */
export async function recoverQueue(store: TaskStore): Promise<RecoverySummary> {
  const tasks = await store.listTasks();
  let resumed = 0;
  for (const task of tasks) {
    if ((RUNNING_STATES as readonly string[]).includes(task.state)) {
      await transitionTask(store, task.taskId, "queued");
      resumed++;
    }
  }
  const after = await store.listTasks();
  return {
    total: after.length,
    resumed,
    queued: after.filter((t) => t.state === "queued").length,
    paused: after.filter((t) => t.state === "paused").length,
    terminal: after.filter((t) => (TERMINAL_STATES as readonly string[]).includes(t.state)).length,
  };
}
