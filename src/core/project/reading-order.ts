// PanelForge — Comic Layout Studio: reading order (S8.9).
//
// Explicit reading order independent of z-order:
//
// - `setReadingOrder` stores the ordered placement list
//   per page (validated same-page membership).
// - `getReadingOrder` returns placements in the
//   explicit order; unset pages fall back to the
//   default (row-major traditional, vertical webtoon).
// - `moveInReadingOrder` reorders one item without
//   moving artwork (geometry + z-order untouched).
// - Layout snapshots stay S8.10.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getPage } from "./pages";
import { listPlacements, type PagePlacement } from "./placements";

export class ReadingOrderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReadingOrderError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ReadingOrderError(identified.code, identified.message);
  }
}

/**
 * Store the explicit reading order for a page.
 * Validated: every id must belong to the page.
 */
export async function setReadingOrder(root: string, input: { pageId: string; placementIds: string[] }): Promise<PagePlacement[]> {
  requireProject(root);
  if (typeof input.pageId !== "string" || input.pageId.trim() === "") {
    throw new ReadingOrderError("INVALID_ARGUMENTS", "pageId must not be empty");
  }
  if (!Array.isArray(input.placementIds) || input.placementIds.length === 0) {
    throw new ReadingOrderError("INVALID_ARGUMENTS", "placementIds must list at least one placement");
  }
  const placements = await listPlacements(root, input.pageId);
  const onPage = new Set(placements.map((p) => p.placementId));
  for (const placementId of input.placementIds) {
    if (!onPage.has(placementId)) {
      throw new ReadingOrderError("INVALID_ARGUMENTS", `placement ${placementId} is not on page ${input.pageId}`);
    }
  }
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() =>
        db.prepare("INSERT OR REPLACE INTO reading_order (page_id, order_json, updated_at) VALUES (?, ?, ?)").run(
          input.pageId,
          JSON.stringify(input.placementIds),
          new Date().toISOString()
        )
      );
      return getReadingOrder(root, input.pageId);
    } finally {
      db.close();
    }
  });
}

/**
 * Placements in reading order: explicit order when set,
 * otherwise the format default (row-major for
 * traditional, vertical for webtoon). Unlisted
 * placements append in z-order at the end.
 */
export async function getReadingOrder(root: string, pageId: string): Promise<PagePlacement[]> {
  requireProject(root);
  const page = await getPage(root, pageId);
  if (!page) throw new ReadingOrderError("NOT_FOUND", `No page with id: ${pageId}`);
  const placements = await listPlacements(root, pageId);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT order_json FROM reading_order WHERE page_id = ?").get(pageId) as Record<string, unknown> | undefined;
    if (!row) {
      return placements; // Default order == z-order, then (y, x).
    }
    let explicit: string[] = [];
    try {
      const parsed = JSON.parse(String(row.order_json)) as unknown;
      explicit = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      explicit = [];
    }
    const byId = new Map(placements.map((p) => [p.placementId, p]));
    const ordered: PagePlacement[] = [];
    for (const placementId of explicit) {
      const placement = byId.get(placementId);
      if (placement) ordered.push(placement);
    }
    for (const placement of placements) {
      if (!explicit.includes(placement.placementId)) ordered.push(placement);
    }
    return ordered;
  } finally {
    db.close();
  }
}

/** Move one placement within its page's reading order. */
export async function moveInReadingOrder(root: string, input: { pageId: string; placementId: string; toIndex: number }): Promise<PagePlacement[]> {
  requireProject(root);
  if (!Number.isInteger(input.toIndex) || input.toIndex < 0) {
    throw new ReadingOrderError("INVALID_ARGUMENTS", "toIndex must be a non-negative integer");
  }
  const current = await getReadingOrder(root, input.pageId);
  const from = current.findIndex((p) => p.placementId === input.placementId);
  if (from === -1) throw new ReadingOrderError("NOT_FOUND", `No placement with id: ${input.placementId} on page ${input.pageId}`);
  const ids = current.map((p) => p.placementId);
  ids.splice(from, 1);
  ids.splice(Math.min(input.toIndex, ids.length), 0, input.placementId);
  return setReadingOrder(root, { pageId: input.pageId, placementIds: ids });
}
