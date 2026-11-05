// PanelForge — persistent task records (S2.2).
//
// Generation tasks persist in the app database (migration 002 `tasks`)
// with their §11.1 states, parameters, and timestamps. This is the
// record layer only: no queueing (S2.3), no transition ownership
// (S2.4), no execution (providers are S2.9+).
//
// - 12 machine states: queued, preparing, loading-model, generating,
//   post-processing, saving, complete, failed, paused, cancelled,
//   waiting-for-resources, cooling-down.
// - `params` stores as JSON; `project_id` is optional (tasks may target
//   a project later; unattached tasks are allowed).
// - Identity is a UUID; created/updated are ISO timestamps.

import * as crypto from "crypto";
import type { DatabaseService } from "../../database/service";
import { createDatabaseService } from "../../database/service";

export const TASK_STATES = [
  "queued",
  "preparing",
  "loading-model",
  "generating",
  "post-processing",
  "saving",
  "complete",
  "failed",
  "paused",
  "cancelled",
  "waiting-for-resources",
  "cooling-down",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export type TaskRecord = {
  taskId: string;
  taskType: string;
  state: TaskState;
  params: Record<string, unknown>;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskErrorCode = "INVALID_ARGUMENTS" | "NOT_FOUND" | "INVALID_STATE";

export class TaskError extends Error {
  code: TaskErrorCode;
  constructor(code: TaskErrorCode, message: string) {
    super(message);
    this.name = "TaskError";
    this.code = code;
  }
}

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === "string" && (TASK_STATES as readonly string[]).includes(value);
}

function toRecord(row: Record<string, unknown>): TaskRecord {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(String(row.params)) as Record<string, unknown>;
  } catch {
    params = {};
  }
  return {
    taskId: String(row.task_id),
    taskType: String(row.task_type),
    state: String(row.state) as TaskState,
    params,
    projectId: row.project_id == null ? null : String(row.project_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type TaskStore = {
  createTask: (input: {
    taskType: string;
    params?: Record<string, unknown>;
    projectId?: string | null;
  }) => Promise<TaskRecord>;
  getTask: (taskId: string) => Promise<TaskRecord | null>;
  listTasks: () => Promise<TaskRecord[]>;
  setState: (taskId: string, state: TaskState) => Promise<TaskRecord>;
};

export function createTaskStore(database: DatabaseService): TaskStore {
  database.initialize();

  async function createTask(input: {
    taskType: string;
    params?: Record<string, unknown>;
    projectId?: string | null;
  }): Promise<TaskRecord> {
    if (typeof input.taskType !== "string" || input.taskType.trim() === "") {
      throw new TaskError("INVALID_ARGUMENTS", "taskType must not be empty");
    }
    const now = new Date().toISOString();
    const record: TaskRecord = {
      taskId: crypto.randomUUID(),
      taskType: input.taskType,
      state: "queued",
      params: input.params ?? {},
      projectId: input.projectId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await database.write(
      "INSERT INTO tasks (task_id, task_type, state, params, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [record.taskId, record.taskType, record.state, JSON.stringify(record.params), record.projectId, now, now]
    );
    return record;
  }

  async function getTask(taskId: string): Promise<TaskRecord | null> {
    const rows = database.query("SELECT * FROM tasks WHERE task_id = ?", [taskId]);
    return rows.length === 0 ? null : toRecord(rows[0] as Record<string, unknown>);
  }

  async function listTasks(): Promise<TaskRecord[]> {
    // rowid order = insertion order (FIFO) — created_at timestamps share
    // millisecond resolution and cannot break ties deterministically.
    return database
      .query("SELECT * FROM tasks ORDER BY rowid")
      .map((row) => toRecord(row as Record<string, unknown>));
  }

  async function setState(taskId: string, state: TaskState): Promise<TaskRecord> {
    if (!isTaskState(state)) {
      throw new TaskError("INVALID_STATE", `Unknown task state: ${String(state)}`);
    }
    const current = await getTask(taskId);
    if (!current) throw new TaskError("NOT_FOUND", `No task with id: ${taskId}`);
    await database.write("UPDATE tasks SET state = ?, updated_at = ? WHERE task_id = ?", [
      state,
      new Date().toISOString(),
      taskId,
    ]);
    return { ...current, state, updatedAt: new Date().toISOString() };
  }

  return { createTask, getTask, listTasks, setState };
}

// Default store over the app database (main process singleton; the queue
// in S2.3 will share this store).
export const defaultTaskStore = createTaskStore(createDatabaseService());
