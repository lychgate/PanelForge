// PanelForge — task queue (S2.3).
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
// - Progress events flow straight to the executor callback (honest
//   percent or indeterminate; no fabrication, per S2.1).
//
// Pause/cancel/retry/transition-ownership land in S2.5/S2.6/S2.4.

import type { DatabaseService } from "../../database/service";
import type {
  ProviderProgress,
  ProviderResult,
  ProviderTaskRequest,
  TaskType,
} from "../provider/types";
import { createTaskStore, type TaskStore } from "./store";
import { transitionTask } from "./transitions";

export type TaskExecutor = (request: ProviderTaskRequest) => Promise<ProviderResult>;

export type ExecutorMap = Partial<Record<TaskType, TaskExecutor>>;

export type TaskQueue = {
  enqueue: (taskType: TaskType, params?: Record<string, unknown>, projectId?: string | null) => Promise<{ taskId: string }>;
  runNext: () => Promise<{ taskId: string; state: string } | null>;
  runUntilIdle: () => Promise<{ taskId: string; state: string }[]>;
  resumeInterrupted: () => Promise<number>;
};

const RUNNING_STATES = ["preparing", "loading-model", "generating", "post-processing", "saving"];

export function createTaskQueue(store: TaskStore, executors: ExecutorMap): TaskQueue {
  async function enqueue(
    taskType: TaskType,
    params: Record<string, unknown> = {},
    projectId: string | null = null
  ): Promise<{ taskId: string }> {
    const record = await store.createTask({ taskType, params, projectId });
    return { taskId: record.taskId };
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
        progressState.promise = transitionTask(store, task.taskId, "generating");
      }
    };
    try {
      const result = await executor({
        taskId: task.taskId,
        taskType: task.taskType as TaskType,
        params: task.params,
        onProgress,
      });
      if (progressState.promise) await progressState.promise;
      const finalState = result.ok ? "complete" : "failed";
      await transitionTask(store, task.taskId, finalState);
      return { taskId: task.taskId, state: finalState };
    } catch (e) {
      if (progressState.promise) await progressState.promise.catch(() => undefined);
      await transitionTask(store, task.taskId, "failed");
      return { taskId: task.taskId, state: "failed" };
    }
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

  return { enqueue, runNext, runUntilIdle, resumeInterrupted };
}

export function createDefaultTaskQueue(database: DatabaseService, executors: ExecutorMap): TaskQueue {
  return createTaskQueue(createTaskStore(database), executors);
}
