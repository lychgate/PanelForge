// PanelForge — task queue (S2.3) with pause and cancellation (S2.5).
//
// Sequential executor dispatch over the S2.2 records, implementing the
// S2.1 provider contract. Real providers arrive in S2.9–S2.10; until
// then the queue is driven by injected executors (mocks in tests).
//
// - enqueue() persists a task (queued) and returns its record.
// - runNext()/runUntilIdle() execute FIFO, one task at a time, driving
//   states queued → preparing → generating → complete/failed. A failed
//   task never aborts the queue (failure isolation, §11.4).
// - resumeInterrupted() resets tasks left in a running state to queued
//   (crash recovery's core; full startup recovery is S2.8).
// - pauseTask()/cancelTask() interrupt cooperating executors (S2.1
//   interruptors) and move the task to paused/cancelled. Paused tasks
//   skip execution until resumed (paused → queued); cancelled tasks are
//   terminal-dead — a late executor result is IGNORED, never resurrecting
//   the task. resumeTask() re-queues a paused task.
//
// Retry land in S2.6; provider-lifecycle safeguards land in S2.5's
// interrupt path (best-effort: executors that ignore interrupts still
// cannot resurrect cancelled/paused tasks).

import type { DatabaseService } from "../../database/service";
import type {
  ProviderProgress,
  ProviderResult,
  ProviderTaskRequest,
  TaskType,
} from "../provider/types";
import { createTaskStore, type TaskStore, type TaskRecord } from "./store";
import { transitionTask, TransitionError } from "./transitions";

export type TaskExecutor = (request: ProviderTaskRequest) => Promise<ProviderResult>;

export type ExecutorMap = Partial<Record<TaskType, TaskExecutor>>;

/** Best-effort interrupt callbacks per task type (S2.1 interrupt contract). */
export type InterruptorMap = Partial<Record<TaskType, (taskId: string) => void>>;

export type TaskQueue = {
  enqueue: (taskType: TaskType, params?: Record<string, unknown>, projectId?: string | null) => Promise<{ taskId: string }>;
  runNext: () => Promise<{ taskId: string; state: string } | null>;
  runUntilIdle: () => Promise<{ taskId: string; state: string }[]>;
  pauseTask: (taskId: string) => Promise<TaskRecord>;
  cancelTask: (taskId: string) => Promise<TaskRecord>;
  resumeTask: (taskId: string) => Promise<TaskRecord>;
  resumeInterrupted: () => Promise<number>;
};

const RUNNING_STATES = ["preparing", "loading-model", "generating", "post-processing", "saving"];

export function createTaskQueue(
  store: TaskStore,
  executors: ExecutorMap,
  interruptors: InterruptorMap = {}
): TaskQueue {
  async function enqueue(
    taskType: TaskType,
    params: Record<string, unknown> = {},
    projectId: string | null = null
  ): Promise<{ taskId: string }> {
    const record = await store.createTask({ taskType, params, projectId });
    return { taskId: record.taskId };
  }

  /** Settle an executing task, honoring a pause/cancel that landed mid-run. */
  async function settle(
    taskId: string,
    result: ProviderResult
  ): Promise<{ taskId: string; state: string }> {
    const current = await store.getTask(taskId);
    if (!current) return { taskId, state: "failed" };
    if (current.state === "paused" || current.state === "cancelled") {
      // No resurrection: an interrupted task's late result is ignored.
      return { taskId, state: current.state };
    }
    const finalState = result.ok ? "complete" : "failed";
    try {
      await transitionTask(store, taskId, finalState);
      return { taskId, state: finalState };
    } catch (err) {
      // A transition raced and lost (e.g. cancel landed last): the
      // stored state wins.
      const latest = await store.getTask(taskId);
      if (latest) return { taskId, state: latest.state };
      throw err;
    }
  }

  async function runNextInternal(): Promise<{ taskId: string; state: string } | null> {
    const queued = (await store.listTasks()).filter((t) => t.state === "queued");
    if (queued.length === 0) return null;
    const task = queued[0];
    const executor = executors[task.taskType as TaskType];
    if (!executor) {
      await transitionTask(store, task.taskId, "failed");
      return { taskId: task.taskId, state: "failed" };
    }
    await transitionTask(store, task.taskId, "preparing");
    // Container so TS doesn't narrow the closure-assigned promise to null.
    const progressState: { promise: Promise<unknown> | null } = { promise: null };
    const onProgress = (progress: ProviderProgress) => {
      if (progress.stage !== "preparing" && !progressState.promise) {
        // Chain the generating transition so runNext can await it before
        // the final transition (fire-and-forget raced with reads).
        progressState.promise = transitionTask(store, task.taskId, "generating").catch(() => undefined);
      }
    };
    let result: ProviderResult;
    try {
      result = await executor({
        taskId: task.taskId,
        taskType: task.taskType as TaskType,
        params: task.params,
        onProgress,
      });
    } catch {
      if (progressState.promise) await progressState.promise.catch(() => undefined);
      return settle(task.taskId, { ok: false, code: "FAILED", message: "executor failed" });
    }
    if (progressState.promise) await progressState.promise.catch(() => undefined);
    return settle(task.taskId, result);
  }

  async function runNext(): Promise<{ taskId: string; state: string } | null> {
    return runNextInternal();
  }

  async function runUntilIdle(): Promise<{ taskId: string; state: string }[]> {
    const done: { taskId: string; state: string }[] = [];
    for (;;) {
      const result = await runNextInternal();
      if (!result) break;
      done.push(result);
    }
    return done;
  }

  function interrupt(task: TaskRecord): void {
    try {
      interruptors[task.taskType as TaskType]?.(task.taskId);
    } catch {
      // Interruption is best-effort; state moves below still hold.
    }
  }

  async function pauseTask(taskId: string): Promise<TaskRecord> {
    const current = await store.getTask(taskId);
    if (!current) {
      const err = new TransitionError("NOT_FOUND", `No task with id: ${taskId}`);
      throw err;
    }
    interrupt(current);
    return transitionTask(store, taskId, "paused");
  }

  async function cancelTask(taskId: string): Promise<TaskRecord> {
    const current = await store.getTask(taskId);
    if (!current) {
      throw new TransitionError("NOT_FOUND", `No task with id: ${taskId}`);
    }
    interrupt(current);
    return transitionTask(store, taskId, "cancelled");
  }

  async function resumeTask(taskId: string): Promise<TaskRecord> {
    const current = await store.getTask(taskId);
    if (!current) {
      throw new TransitionError("NOT_FOUND", `No task with id: ${taskId}`);
    }
    return transitionTask(store, taskId, "queued");
  }

  async function resumeInterrupted(): Promise<number> {
    let resumed = 0;
    for (const task of await store.listTasks()) {
      if ((RUNNING_STATES as readonly string[]).includes(task.state)) {
        await transitionTask(store, task.taskId, "queued");
        resumed++;
      }
    }
    return resumed;
  }

  return { enqueue, runNext, runUntilIdle, pauseTask, cancelTask, resumeTask, resumeInterrupted };
}

export function createDefaultTaskQueue(
  database: DatabaseService,
  executors: ExecutorMap,
  interruptors: InterruptorMap = {}
): TaskQueue {
  return createTaskQueue(createTaskStore(database), executors, interruptors);
}

export { TransitionError };
