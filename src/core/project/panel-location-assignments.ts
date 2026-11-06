// PanelForge — Storyboard Studio: location assignment (S6.4, spec §8.7).
//
// Panels name their location exactly:
//
// - `assignLocation` pins one location (and optionally one of its
//   variations) to a real `storyboard_panels` row. One
//   assignment per panel; reassigning replaces.
// - The variation, when set, must belong to the location
//   (cross-check); unknown panels/locations/variations reject.
// - `unassignLocation` removes the assignment.
//
// Character positioning stays S6.6.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type LocationAssignment = {
  assignmentId: string;
  panelId: string;
  locationId: string;
  variationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class LocationAssignmentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LocationAssignmentError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LocationAssignmentError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): LocationAssignment {
  return {
    assignmentId: String(row.assignment_id),
    panelId: String(row.panel_id),
    locationId: String(row.location_id),
    variationId: row.variation_id === null || row.variation_id === undefined ? null : String(row.variation_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Assign one location (and optional variation) to a panel (replaces). */
export async function assignLocation(root: string, panelId: string, locationId: string, variationId?: string): Promise<LocationAssignment> {
  requireProject(root);
  if (typeof panelId !== "string" || panelId.trim() === "") throw new LocationAssignmentError("INVALID_ARGUMENTS", "panelId must not be empty");
  if (typeof locationId !== "string" || locationId.trim() === "") throw new LocationAssignmentError("INVALID_ARGUMENTS", "locationId must not be empty");
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
      if (!panel) throw new LocationAssignmentError("NOT_FOUND", `No panel with id: ${panelId}`);
      const location = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId) as Record<string, unknown> | undefined;
      if (!location) throw new LocationAssignmentError("NOT_FOUND", `No location with id: ${locationId}`);
      if (variationId !== undefined) {
        const variation = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(variationId) as Record<string, unknown> | undefined;
        if (!variation) throw new LocationAssignmentError("NOT_FOUND", `No variation with id: ${variationId}`);
        if (String(variation.location_id) !== locationId) {
          throw new LocationAssignmentError("INVALID_ARGUMENTS", `Variation ${variationId} does not belong to location ${locationId}`);
        }
      }
      return await runWithBusyRetry<LocationAssignment>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_location_assignments WHERE panel_id = ?").run(panelId);
          const assignmentId = crypto.randomUUID();
          db.prepare(
            "INSERT INTO panel_location_assignments (assignment_id, panel_id, location_id, variation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
          ).run(assignmentId, panelId, locationId, variationId ?? null, now, now);
          const row = db.prepare("SELECT * FROM panel_location_assignments WHERE assignment_id = ?").get(assignmentId);
          db.exec("COMMIT");
          return toRecord(row as Record<string, unknown>);
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Surface the original error.
          }
          throw err;
        }
      });
    } finally {
      db.close();
    }
  });
}

/** The location assignment for one panel, or null. */
export async function getLocationAssignment(root: string, panelId: string): Promise<LocationAssignment | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_location_assignments WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** Remove one location assignment. */
export async function unassignLocation(root: string, assignmentId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM panel_location_assignments WHERE assignment_id = ?").get(assignmentId);
        if (!current) throw new LocationAssignmentError("NOT_FOUND", `No location assignment with id: ${assignmentId}`);
        db.prepare("DELETE FROM panel_location_assignments WHERE assignment_id = ?").run(assignmentId);
      });
    } finally {
      db.close();
    }
  });
}
