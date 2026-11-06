// PanelForge — Comic Layout Studio: panel placement (S8.2).
//
// Place storyboard panels (approved artwork slots) on
// pages:
//
// - `placePanel`/`getPlacement`/`listPlacements` CRUD over
//   page_panels (x/y/w/h in mm validated inside the page
//   bounds, z-order, border style). Artwork is referenced
//   by asset id and never copied or modified; the slot
//   pins the panel's APPROVED artwork version (S7.13
//   pointer) at placement time.
// - `movePlacement` re-stacks one placement's z-order.
// - Placement changes never touch the asset store;
//   byte identity is preserved by construction.
// - Traditional/webtoon templates stay S8.3/S8.4.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getApprovedArtwork } from "./artwork-approval";
import * as crypto from "crypto";

export type PagePlacement = {
  placementId: string;
  pageId: string;
  panelId: string;
  assetId: string;
  artworkId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zOrder: number;
  border: string;
  createdAt: string;
  updatedAt: string;
};

export type PlacementInput = {
  pageId: string;
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zOrder?: number;
  border?: string;
};

export class PlacementError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PlacementError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PlacementError(identified.code, identified.message);
  }
}

function validateGeometry(input: PlacementInput, page: { width: number; height: number; margin: number }): void {
  for (const [key, value] of [["x", input.x], ["y", input.y], ["width", input.width], ["height", input.height]] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new PlacementError("INVALID_ARGUMENTS", `${key} must be a number`);
    }
  }
  if (input.width <= 0 || input.height <= 0) throw new PlacementError("INVALID_ARGUMENTS", "width and height must be positive");
  if (input.x < page.margin || input.y < page.margin) {
    throw new PlacementError("INVALID_ARGUMENTS", `placement must start inside the margin (${page.margin}mm)`);
  }
  if (input.x + input.width > page.width - page.margin || input.y + input.height > page.height - page.margin) {
    throw new PlacementError("INVALID_ARGUMENTS", `placement exceeds the printable area (${page.width}x${page.height} with ${page.margin}mm margins)`);
  }
  if (input.zOrder !== undefined && (!Number.isInteger(input.zOrder) || input.zOrder < 0)) {
    throw new PlacementError("INVALID_ARGUMENTS", "zOrder must be a non-negative integer");
  }
  if (input.border !== undefined && typeof input.border !== "string") {
    throw new PlacementError("INVALID_ARGUMENTS", "border must be a string");
  }
}

function toRecord(row: Record<string, unknown>): PagePlacement {
  return {
    placementId: String(row.placement_id),
    pageId: String(row.page_id),
    panelId: String(row.panel_id),
    assetId: String(row.asset_id),
    artworkId: String(row.artwork_id),
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    zOrder: Number(row.z_order),
    border: String(row.border),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Place (or re-place) one panel's approved artwork on a page. */
export async function placePanel(root: string, input: PlacementInput): Promise<PagePlacement> {
  requireProject(root);
  if (typeof input.pageId !== "string" || input.pageId.trim() === "") throw new PlacementError("INVALID_ARGUMENTS", "pageId must not be empty");
  if (typeof input.panelId !== "string" || input.panelId.trim() === "") throw new PlacementError("INVALID_ARGUMENTS", "panelId must not be empty");
  const now = new Date().toISOString();
  // The slot pins the APPROVED artwork version (never
  // latest generation, never copied bytes).
  const approved = await getApprovedArtwork(root, input.panelId);
  if (!approved) throw new PlacementError("NOT_APPROVED", `Panel ${input.panelId} has no approved artwork`);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const page = db.prepare("SELECT * FROM pages WHERE page_id = ?").get(input.pageId) as Record<string, unknown> | undefined;
      if (!page) throw new PlacementError("NOT_FOUND", `No page with id: ${input.pageId}`);
      validateGeometry(input, { width: Number(page.width), height: Number(page.height), margin: Number(page.margin) });
      return await runWithBusyRetry<PagePlacement>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM page_panels WHERE page_id = ? AND panel_id = ?").run(input.pageId, input.panelId);
          const placementId = crypto.randomUUID();
          db.prepare("INSERT INTO page_panels (placement_id, page_id, panel_id, asset_id, artwork_id, x, y, width, height, z_order, border, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
            placementId,
            input.pageId,
            input.panelId,
            approved.assetId,
            approved.artworkId,
            input.x,
            input.y,
            input.width,
            input.height,
            input.zOrder ?? 0,
            input.border ?? "thin",
            now,
            now
          );
          const row = db.prepare("SELECT * FROM page_panels WHERE placement_id = ?").get(placementId) as Record<string, unknown>;
          db.exec("COMMIT");
          return toRecord(row);
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

/** One placement, or null. */
export async function getPlacement(root: string, placementId: string): Promise<PagePlacement | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM page_panels WHERE placement_id = ?").get(placementId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All placements on one page, back-to-front (z-order, then position). */
export async function listPlacements(root: string, pageId: string): Promise<PagePlacement[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const page = db.prepare("SELECT page_id FROM pages WHERE page_id = ?").get(pageId);
    if (!page) throw new PlacementError("NOT_FOUND", `No page with id: ${pageId}`);
    const rows = db.prepare("SELECT * FROM page_panels WHERE page_id = ? ORDER BY z_order, y, x").all(pageId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Move one placement within its page's z-stack. */
export async function movePlacement(root: string, placementId: string, zOrder: number): Promise<PagePlacement> {
  requireProject(root);
  if (!Number.isInteger(zOrder) || zOrder < 0) throw new PlacementError("INVALID_ARGUMENTS", "zOrder must be a non-negative integer");
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM page_panels WHERE placement_id = ?").get(placementId);
      if (!current) throw new PlacementError("NOT_FOUND", `No placement with id: ${placementId}`);
      await runWithBusyRetry(() => db.prepare("UPDATE page_panels SET z_order = ?, updated_at = ? WHERE placement_id = ?").run(zOrder, now, placementId));
      const row = db.prepare("SELECT * FROM page_panels WHERE placement_id = ?").get(placementId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** Remove one placement from its page (artwork untouched). */
export async function removePlacement(root: string, placementId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT placement_id FROM page_panels WHERE placement_id = ?").get(placementId);
      if (!current) throw new PlacementError("NOT_FOUND", `No placement with id: ${placementId}`);
      await runWithBusyRetry(() => db.prepare("DELETE FROM page_panels WHERE placement_id = ?").run(placementId));
    } finally {
      db.close();
    }
  });
}
