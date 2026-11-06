// PanelForge — Comic Layout Studio: balloons + tails (S8.6).
//
// Speech/caption/thought balloons with portable tails:
//
// - `createBalloon`/`getBalloon`/`updateBalloon`/
//   `deleteBalloon`/`listBalloons` CRUD over balloons
//   (kind speech|caption|thought, shape
//   ellipse|rounded|rect, x/y/w/h in mm, tail anchor
//   with visibility).
// - `retargetTail` moves a balloon's tail anchor.
// - `checkBalloon` warns (never crashes) when a tail
//   anchor sits outside its placement's bounds
//   (orphan tail) or a shape has zero area.
// - Balloon text edits stay S8.7; SFX stays S8.8.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import * as crypto from "crypto";

export type BalloonKind = "speech" | "caption" | "thought";
export type BalloonShape = "ellipse" | "rounded" | "rect";

export type Balloon = {
  balloonId: string;
  placementId: string;
  kind: BalloonKind;
  shape: BalloonShape;
  x: number;
  y: number;
  width: number;
  height: number;
  tailX: number | null;
  tailY: number | null;
  tailVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BalloonInput = {
  placementId: string;
  kind: BalloonKind;
  shape: BalloonShape;
  x: number;
  y: number;
  width: number;
  height: number;
  tail?: { x: number; y: number; visible?: boolean };
};

export class BalloonError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BalloonError";
    this.code = code;
  }
}

const KINDS: BalloonKind[] = ["speech", "caption", "thought"];
const SHAPES: BalloonShape[] = ["ellipse", "rounded", "rect"];

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new BalloonError(identified.code, identified.message);
  }
}

function validate(input: BalloonInput): void {
  if (typeof input.placementId !== "string" || input.placementId.trim() === "") {
    throw new BalloonError("INVALID_ARGUMENTS", "placementId must not be empty");
  }
  if (!KINDS.includes(input.kind)) throw new BalloonError("INVALID_ARGUMENTS", `kind must be one of ${KINDS.join("|")}`);
  if (!SHAPES.includes(input.shape)) throw new BalloonError("INVALID_ARGUMENTS", `shape must be one of ${SHAPES.join("|")}`);
  for (const [key, value] of [["x", input.x], ["y", input.y], ["width", input.width], ["height", input.height]] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new BalloonError("INVALID_ARGUMENTS", `${key} must be a number`);
  }
  if (input.x < 0 || input.y < 0) throw new BalloonError("INVALID_ARGUMENTS", "x and y must be non-negative");
  if (input.width <= 0 || input.height <= 0) throw new BalloonError("INVALID_ARGUMENTS", "width and height must be positive");
  if (input.tail !== undefined) {
    if (!Number.isFinite(input.tail.x) || !Number.isFinite(input.tail.y)) {
      throw new BalloonError("INVALID_ARGUMENTS", "tail coordinates must be numbers");
    }
  }
}

function toRecord(row: Record<string, unknown>): Balloon {
  return {
    balloonId: String(row.balloon_id),
    placementId: String(row.placement_id),
    kind: String(row.kind) as BalloonKind,
    shape: String(row.shape) as BalloonShape,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    tailX: row.tail_x === null || row.tail_x === undefined ? null : Number(row.tail_x),
    tailY: row.tail_y === null || row.tail_y === undefined ? null : Number(row.tail_y),
    tailVisible: Number(row.tail_visible) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Create a balloon on one placement. */
export async function createBalloon(root: string, input: BalloonInput): Promise<Balloon> {
  requireProject(root);
  validate(input);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const placement = db.prepare("SELECT placement_id FROM page_panels WHERE placement_id = ?").get(input.placementId);
      if (!placement) throw new BalloonError("NOT_FOUND", `No placement with id: ${input.placementId}`);
      const balloonId = crypto.randomUUID();
      await runWithBusyRetry(() =>
        db.prepare("INSERT INTO balloons (balloon_id, placement_id, kind, shape, x, y, width, height, tail_x, tail_y, tail_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          balloonId,
          input.placementId,
          input.kind,
          input.shape,
          input.x,
          input.y,
          input.width,
          input.height,
          input.tail?.x ?? null,
          input.tail?.y ?? null,
          input.tail?.visible ?? false ? 1 : 0,
          now,
          now
        )
      );
      const row = db.prepare("SELECT * FROM balloons WHERE balloon_id = ?").get(balloonId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** One balloon, or null. */
export async function getBalloon(root: string, balloonId: string): Promise<Balloon | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM balloons WHERE balloon_id = ?").get(balloonId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All balloons on one placement, in reading order. */
export async function listBalloons(root: string, placementId: string): Promise<Balloon[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM balloons WHERE placement_id = ? ORDER BY y, x").all(placementId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Retarget (or hide) a balloon's tail anchor. */
export async function retargetTail(root: string, balloonId: string, tail: { x: number; y: number; visible: boolean }): Promise<Balloon> {
  requireProject(root);
  if (!Number.isFinite(tail.x) || !Number.isFinite(tail.y)) {
    throw new BalloonError("INVALID_ARGUMENTS", "tail coordinates must be numbers");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT balloon_id FROM balloons WHERE balloon_id = ?").get(balloonId);
      if (!current) throw new BalloonError("NOT_FOUND", `No balloon with id: ${balloonId}`);
      await runWithBusyRetry(() => db.prepare("UPDATE balloons SET tail_x = ?, tail_y = ?, tail_visible = ?, updated_at = ? WHERE balloon_id = ?").run(tail.x, tail.y, tail.visible ? 1 : 0, now, balloonId));
      const row = db.prepare("SELECT * FROM balloons WHERE balloon_id = ?").get(balloonId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/**
 * Warn (never crash) about orphan tails: anchors
 * outside the host placement's bounds, or zero-area
 * shapes.
 */
export async function checkBalloon(root: string, balloonId: string): Promise<{ warnings: string[] }> {
  requireProject(root);
  const balloon = await getBalloon(root, balloonId);
  if (!balloon) throw new BalloonError("NOT_FOUND", `No balloon with id: ${balloonId}`);
  const warnings: string[] = [];
  if (balloon.width <= 0 || balloon.height <= 0) warnings.push(`balloon ${balloonId.slice(0, 8)} has zero area`);
  const { db } = openProjectDatabase(root);
  try {
    const placement = db.prepare("SELECT x, y, width, height FROM page_panels WHERE placement_id = ?").get(balloon.placementId) as Record<string, unknown> | undefined;
    if (balloon.tailVisible && balloon.tailX !== null && balloon.tailY !== null && placement) {
      const px = Number(placement.x);
      const py = Number(placement.y);
      const pw = Number(placement.width);
      const ph = Number(placement.height);
      if (balloon.tailX < px || balloon.tailX > px + pw || balloon.tailY < py || balloon.tailY > py + ph) {
        warnings.push(`tail anchor (${balloon.tailX}, ${balloon.tailY}) is outside placement ${balloon.placementId.slice(0, 8)} (orphan tail)`);
      }
    }
  } finally {
    db.close();
  }
  return { warnings };
}

/** Remove one balloon (placements and artwork untouched). */
export async function deleteBalloon(root: string, balloonId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT balloon_id FROM balloons WHERE balloon_id = ?").get(balloonId);
      if (!current) throw new BalloonError("NOT_FOUND", `No balloon with id: ${balloonId}`);
      await runWithBusyRetry(() => db.prepare("DELETE FROM balloons WHERE balloon_id = ?").run(balloonId));
    } finally {
      db.close();
    }
  });
}

/**
 * Edit one balloon's geometry/kind/shape (S8.12
 * drag/resize). Merges with the stored record and
 * reuses creation validation; tail anchor and
 * lettering text are untouched.
 */
export async function updateBalloon(
  root: string,
  balloonId: string,
  patch: Partial<Pick<BalloonInput, "kind" | "shape" | "x" | "y" | "width" | "height">>
): Promise<Balloon> {
  requireProject(root);
  if (typeof balloonId !== "string" || balloonId.trim() === "") {
    throw new BalloonError("INVALID_ARGUMENTS", "balloonId must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM balloons WHERE balloon_id = ?").get(balloonId) as Record<string, unknown> | undefined;
      if (!current) throw new BalloonError("NOT_FOUND", `No balloon with id: ${balloonId}`);
      const merged: BalloonInput = {
        placementId: String(current.placement_id),
        kind: (patch.kind ?? String(current.kind)) as BalloonKind,
        shape: (patch.shape ?? String(current.shape)) as BalloonShape,
        x: patch.x ?? Number(current.x),
        y: patch.y ?? Number(current.y),
        width: patch.width ?? Number(current.width),
        height: patch.height ?? Number(current.height),
      };
      validate(merged);
      await runWithBusyRetry(() =>
        db.prepare("UPDATE balloons SET kind = ?, shape = ?, x = ?, y = ?, width = ?, height = ?, updated_at = ? WHERE balloon_id = ?").run(
          merged.kind,
          merged.shape,
          merged.x,
          merged.y,
          merged.width,
          merged.height,
          now,
          balloonId
        )
      );
      const row = db.prepare("SELECT * FROM balloons WHERE balloon_id = ?").get(balloonId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}
