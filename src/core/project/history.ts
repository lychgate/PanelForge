// PanelForge — Character Studio: history (S4.11, spec §8.4).
//
// Every change to a character or version is traceable:
//
// - `recordEvent` appends one row (character, optional version,
//   event kind, detail) to the append-only `character_history`
//   table. Rows are never edited; deletion only happens with the
//   character itself.
// - `listHistoryByCharacter` / `listHistoryByVersion` replay the
//   lifecycle in insertion order.
// - Event kinds: created, updated, version_created,
//   reference_added, reference_removed, approved, rejected,
//   bound, rebound, unbound, request_created, request_fulfilled.
//
// This task introduces the mechanism; callers record events.
// The S4.12 fixture exercises it end-to-end.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type HistoryEvent =
  | "created"
  | "updated"
  | "version_created"
  | "reference_added"
  | "reference_removed"
  | "approved"
  | "rejected"
  | "bound"
  | "rebound"
  | "unbound"
  | "request_created"
  | "request_fulfilled";

export type HistoryRow = {
  historyId: string;
  characterId: string;
  versionId: string | null;
  event: HistoryEvent;
  detail: string;
  createdAt: string;
};

export class HistoryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HistoryError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new HistoryError(identified.code, identified.message);
  }
}

export function isHistoryEvent(value: unknown): value is HistoryEvent {
  return (
    value === "created" ||
    value === "updated" ||
    value === "version_created" ||
    value === "reference_added" ||
    value === "reference_removed" ||
    value === "approved" ||
    value === "rejected" ||
    value === "bound" ||
    value === "rebound" ||
    value === "unbound" ||
    value === "request_created" ||
    value === "request_fulfilled"
  );
}

function toRecord(row: Record<string, unknown>): HistoryRow {
  return {
    historyId: String(row.history_id),
    characterId: String(row.character_id),
    versionId: row.version_id === null || row.version_id === undefined ? null : String(row.version_id),
    event: String(row.event) as HistoryEvent,
    detail: String(row.detail ?? ""),
    createdAt: String(row.created_at),
  };
}

/** Append one history row. */
export async function recordEvent(
  root: string,
  input: { characterId: string; versionId?: string; event: HistoryEvent; detail?: string }
): Promise<HistoryRow> {
  requireProject(root);
  if (typeof input.characterId !== "string" || input.characterId.trim() === "") {
    throw new HistoryError("INVALID_ARGUMENTS", "characterId must not be empty");
  }
  if (!isHistoryEvent(input.event)) {
    throw new HistoryError("INVALID_ARGUMENTS", `Unknown history event: ${String(input.event)}`);
  }
  if (input.detail !== undefined && typeof input.detail !== "string") {
    throw new HistoryError("INVALID_ARGUMENTS", "detail must be a string");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const character = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(input.characterId) as Record<string, unknown> | undefined;
      if (!character) throw new HistoryError("NOT_FOUND", `No character with id: ${input.characterId}`);
      if (input.versionId !== undefined) {
        const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(input.versionId) as Record<string, unknown> | undefined;
        if (!version) throw new HistoryError("NOT_FOUND", `No version with id: ${input.versionId}`);
      }
      const historyId = crypto.randomUUID();
      return await runWithBusyRetry<HistoryRow>(() => {
        db.prepare("INSERT INTO character_history (history_id, character_id, version_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          historyId,
          input.characterId,
          input.versionId ?? null,
          input.event,
          input.detail ?? "",
          now
        );
        const row = db.prepare("SELECT * FROM character_history WHERE history_id = ?").get(historyId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** All history for one character, oldest first. */
export async function listHistoryByCharacter(root: string, characterId: string): Promise<HistoryRow[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM character_history WHERE character_id = ? ORDER BY created_at, history_id").all(characterId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** All history for one version, oldest first. */
export async function listHistoryByVersion(root: string, versionId: string): Promise<HistoryRow[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM character_history WHERE version_id = ? ORDER BY created_at, history_id").all(versionId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}
