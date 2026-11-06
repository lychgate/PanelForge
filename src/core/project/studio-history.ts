// PanelForge — Location/Object Studios: asset history (S5.9, spec §8.5/§8.6).
//
// Every change to a location/object profile or variation is
// traceable (S4.11 pattern, one table per studio):
//
// - `recordLocationEvent` / `recordObjectEvent` append one row
//   (profile, optional variation, event kind, detail). Rows are
//   never edited; deletion cascades only with the profile.
// - `listLocationHistory` / `listObjectHistory` (by profile) and
//   `listLocationHistoryByVariation` /
//   `listObjectHistoryByVariation` replay oldest-first.
// - Event kinds: created, updated, variation_created,
//   reference_added, reference_removed, request_created,
//   request_fulfilled.
//
// This task introduces the mechanism; the S5.10 fixture
// exercises it end-to-end (as S4.11 → S4.12).

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type StudioHistoryEvent =
  | "created"
  | "updated"
  | "variation_created"
  | "reference_added"
  | "reference_removed"
  | "request_created"
  | "request_fulfilled";

export type StudioHistoryRow = {
  historyId: string;
  profileId: string;
  variationId: string | null;
  event: StudioHistoryEvent;
  detail: string;
  createdAt: string;
};

export class StudioHistoryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StudioHistoryError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new StudioHistoryError(identified.code, identified.message);
  }
}

export function isStudioHistoryEvent(value: unknown): value is StudioHistoryEvent {
  return (
    value === "created" ||
    value === "updated" ||
    value === "variation_created" ||
    value === "reference_added" ||
    value === "reference_removed" ||
    value === "request_created" ||
    value === "request_fulfilled"
  );
}

type Studio = {
  historyTable: string;
  profileTable: string;
  variationTable: string;
};

const STUDIOS: Record<"location" | "object", Studio> = {
  location: { historyTable: "location_history", profileTable: "locations", variationTable: "location_variations" },
  object: { historyTable: "object_history", profileTable: "objects", variationTable: "object_variations" },
};

function toRecord(row: Record<string, unknown>): StudioHistoryRow {
  return {
    historyId: String(row.history_id),
    profileId: String(row.profile_id),
    variationId: row.variation_id === null || row.variation_id === undefined ? null : String(row.variation_id),
    event: String(row.event) as StudioHistoryEvent,
    detail: String(row.detail ?? ""),
    createdAt: String(row.created_at),
  };
}

async function record(
  root: string,
  studio: Studio,
  input: { profileId: string; variationId?: string; event: StudioHistoryEvent; detail?: string }
): Promise<StudioHistoryRow> {
  requireProject(root);
  if (typeof input.profileId !== "string" || input.profileId.trim() === "") {
    throw new StudioHistoryError("INVALID_ARGUMENTS", "profileId must not be empty");
  }
  if (!isStudioHistoryEvent(input.event)) {
    throw new StudioHistoryError("INVALID_ARGUMENTS", `Unknown history event: ${String(input.event)}`);
  }
  if (input.detail !== undefined && typeof input.detail !== "string") {
    throw new StudioHistoryError("INVALID_ARGUMENTS", "detail must be a string");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const profile = db.prepare(`SELECT * FROM ${studio.profileTable} WHERE ${profileIdColumn(studio)} = ?`).get(input.profileId) as Record<string, unknown> | undefined;
      if (!profile) throw new StudioHistoryError("NOT_FOUND", `No profile with id: ${input.profileId}`);
      if (input.variationId !== undefined) {
        const variation = db.prepare(`SELECT * FROM ${studio.variationTable} WHERE variation_id = ?`).get(input.variationId) as Record<string, unknown> | undefined;
        if (!variation) throw new StudioHistoryError("NOT_FOUND", `No variation with id: ${input.variationId}`);
      }
      const historyId = crypto.randomUUID();
      return await runWithBusyRetry<StudioHistoryRow>(() => {
        db.prepare(`INSERT INTO ${studio.historyTable} (history_id, profile_id, variation_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
          historyId,
          input.profileId,
          input.variationId ?? null,
          input.event,
          input.detail ?? "",
          now
        );
        const row = db.prepare(`SELECT * FROM ${studio.historyTable} WHERE history_id = ?`).get(historyId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

function profileIdColumn(studio: Studio): string {
  return studio.profileTable === "locations" ? "location_id" : "object_id";
}

async function list(root: string, studio: Studio, scope: { profileId?: string; variationId?: string }): Promise<StudioHistoryRow[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows =
      scope.variationId !== undefined
        ? (db.prepare(`SELECT * FROM ${studio.historyTable} WHERE variation_id = ? ORDER BY created_at, history_id`).all(scope.variationId) as Array<Record<string, unknown>>)
        : (db.prepare(`SELECT * FROM ${studio.historyTable} WHERE profile_id = ? ORDER BY created_at, history_id`).all(scope.profileId ?? "") as Array<Record<string, unknown>>);
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Append one location-history row. */
export async function recordLocationEvent(
  root: string,
  input: { profileId: string; variationId?: string; event: StudioHistoryEvent; detail?: string }
): Promise<StudioHistoryRow> {
  return record(root, STUDIOS.location, input);
}

/** Append one object-history row. */
export async function recordObjectEvent(
  root: string,
  input: { profileId: string; variationId?: string; event: StudioHistoryEvent; detail?: string }
): Promise<StudioHistoryRow> {
  return record(root, STUDIOS.object, input);
}

/** All location history for one profile, oldest first. */
export async function listLocationHistory(root: string, profileId: string): Promise<StudioHistoryRow[]> {
  return list(root, STUDIOS.location, { profileId });
}

/** All object history for one profile, oldest first. */
export async function listObjectHistory(root: string, profileId: string): Promise<StudioHistoryRow[]> {
  return list(root, STUDIOS.object, { profileId });
}

/** All location history for one variation, oldest first. */
export async function listLocationHistoryByVariation(root: string, variationId: string): Promise<StudioHistoryRow[]> {
  return list(root, STUDIOS.location, { variationId });
}

/** All object history for one variation, oldest first. */
export async function listObjectHistoryByVariation(root: string, variationId: string): Promise<StudioHistoryRow[]> {
  return list(root, STUDIOS.object, { variationId });
}
