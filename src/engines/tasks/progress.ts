// PanelForge — honest progress reporting (S2.7).
//
// Turns task records into the §11.2 status view: task name/type, queue
// position, current stage, elapsed time, estimated remaining time,
// model/backend, resource profile, status, and logs/errors.
//
// Honesty rules (spec §11.1/§2.6/§11.2):
// - elapsedMs is always derived from recorded timestamps — never guessed.
// - estimatedRemainingMs is ONLY reported when a caller supplies
//   `estimatedRemainingMs` in params (a meaningful estimate); otherwise
//   it is null (shown as indeterminate, never fabricated).
// - model/backend/resourceProfile come from params metadata that the
//   caller (provider/queue) infused at enqueue; unknown means null.
// - errorMessage surfaces the last failure reason for failed records;
//   logs themselves live in the app log service (S0.7).

import type { TaskRecord, TaskStore } from "./store";

export type TaskProgress = {
  taskId: string;
  taskType: string;
  name: string;
  queuePosition: number;
  stage: TaskRecord["state"];
  status: TaskRecord["state"];
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  model: string | null;
  backend: string | null;
  resourceProfile: string | null;
  indeterminate: boolean;
  errorMessage: string | null;
};

export type ProgressErrorCode = "NOT_FOUND";

export class ProgressError extends Error {
  code: ProgressErrorCode;
  constructor(message: string) {
    super(message);
    this.name = "ProgressError";
    this.code = "NOT_FOUND";
  }
}

/** Build the §11.2 progress view for a single task. */
export async function describeTask(store: TaskStore, taskId: string): Promise<TaskProgress> {
  const record = await store.getTask(taskId);
  if (!record) throw new ProgressError(`No task with id: ${taskId}`);
  const all = await store.listTasks();
  const queuePosition = all.findIndex((t) => t.taskId === taskId) + 1;
  const params = record.params;
  const estimate = params.estimatedRemainingMs;
  const indeterminate =
    record.state === "generating" && (estimate === undefined || estimate === null);
  const name =
    typeof params.name === "string"
      ? params.name
      : `${record.taskType} (${record.taskId.slice(0, 8)})`;
  return {
    taskId: record.taskId,
    taskType: record.taskType,
    name,
    queuePosition,
    stage: record.state,
    status: record.state,
    elapsedMs: Date.now() - Date.parse(record.createdAt),
    estimatedRemainingMs:
      typeof estimate === "number" && Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
    model: typeof params.model === "string" ? params.model : null,
    backend: typeof params.backend === "string" ? params.backend : null,
    resourceProfile:
      typeof params.resourceProfile === "string" ? params.resourceProfile : null,
    indeterminate,
    errorMessage: record.errorMessage,
  };
}

/** Build the §11.2 progress view for every task (creation order). */
export async function describeAllTasks(store: TaskStore): Promise<TaskProgress[]> {
  const tasks = await store.listTasks();
  return Promise.all(tasks.map((t) => describeTask(store, t.taskId)));
}
