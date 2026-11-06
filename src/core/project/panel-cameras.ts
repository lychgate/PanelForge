// PanelForge — Storyboard Studio: camera and shot definitions (S6.5, spec §8.7).
//
// Camera guidance per panel:
//
// - `setCamera` records one camera per real panel row: a shot
//   type from the closed vocabulary (close-up, medium, wide,
//   extreme-wide) plus a free-text angle ("low", "high",
//   "over-the-shoulder", …). Unknown shot types reject typed.
// - `getCamera` reads it back; `listCamerasByShotType` filters
//   a scene's panels by shot type.
// - One camera per panel; setting again replaces.
//
// Character positioning stays S6.6.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type ShotType = "close-up" | "medium" | "wide" | "extreme-wide";

export type PanelCamera = {
  cameraId: string;
  panelId: string;
  shotType: ShotType;
  angle: string;
  createdAt: string;
  updatedAt: string;
};

export class CameraError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CameraError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CameraError(identified.code, identified.message);
  }
}

export function isShotType(value: unknown): value is ShotType {
  return value === "close-up" || value === "medium" || value === "wide" || value === "extreme-wide";
}

function toRecord(row: Record<string, unknown>): PanelCamera {
  return {
    cameraId: String(row.camera_id),
    panelId: String(row.panel_id),
    shotType: String(row.shot_type) as ShotType,
    angle: String(row.angle ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Set (or replace) the camera for one panel. */
export async function setCamera(root: string, panelId: string, shotType: ShotType, angle?: string): Promise<PanelCamera> {
  requireProject(root);
  if (typeof panelId !== "string" || panelId.trim() === "") throw new CameraError("INVALID_ARGUMENTS", "panelId must not be empty");
  if (!isShotType(shotType)) throw new CameraError("INVALID_ARGUMENTS", `Unknown shot type: ${String(shotType)}`);
  if (angle !== undefined && typeof angle !== "string") throw new CameraError("INVALID_ARGUMENTS", "angle must be a string");
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
      if (!panel) throw new CameraError("NOT_FOUND", `No panel with id: ${panelId}`);
      return await runWithBusyRetry<PanelCamera>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_cameras WHERE panel_id = ?").run(panelId);
          const cameraId = crypto.randomUUID();
          db.prepare("INSERT INTO panel_cameras (camera_id, panel_id, shot_type, angle, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            cameraId,
            panelId,
            shotType,
            angle ?? "",
            now,
            now
          );
          const row = db.prepare("SELECT * FROM panel_cameras WHERE camera_id = ?").get(cameraId);
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

/** The camera for one panel, or null. */
export async function getCamera(root: string, panelId: string): Promise<PanelCamera | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_cameras WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All cameras across one scene's panels of a given shot type, in panel order. */
export async function listCamerasByShotType(root: string, sceneId: string, shotType: ShotType): Promise<PanelCamera[]> {
  requireProject(root);
  if (!isShotType(shotType)) throw new CameraError("INVALID_ARGUMENTS", `Unknown shot type: ${String(shotType)}`);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare(
        "SELECT c.* FROM panel_cameras c JOIN storyboard_panels p ON p.panel_id = c.panel_id WHERE p.scene_id = ? AND c.shot_type = ? ORDER BY p.sort_order"
      )
      .all(sceneId, shotType) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}
