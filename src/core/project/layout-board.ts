// PanelForge — Comic Layout Studio: layout board view model (S8.12).
//
// Read aggregation for the hand-rolled layout UI:
//
// - `listLayoutBoard` lists every layout page
//   (across all manuscripts) for the page list.
// - `getLayoutPage` returns one page's full card:
//   the page, its placements in reading order
//   (S8.9) with border specs (S8.5), balloons +
//   lettering (S8.6-S8.7), SFX (S8.8), and the
//   deterministic SVG string (S8.11) the canvas
//   draws from.
// - Edits stay in their own modules (placements,
//   borders, balloons, lettering, sfx,
//   reading-order); this file only reads, so the
//   UI surface cannot bypass typed errors.
// - No export controls live here (Stage 10 owns
//   rasterization/export).
//
// Traceability (pages -> panels/versions) stays S8.13.

import { identifyProject } from "./service";
import { listManuscripts } from "./manuscripts";
import { listPages, getPage, type LayoutPage } from "./pages";
import { getReadingOrder } from "./reading-order";
import { openProjectDatabase } from "./metadata";
import { renderPageSvg } from "./svg-render";
import { getBorder, type BorderSpec } from "./borders";
import type { PagePlacement } from "./placements";
import type { Balloon } from "./balloons";
import type { Sfx } from "./sfx";

export class LayoutBoardError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LayoutBoardError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LayoutBoardError(identified.code, identified.message);
  }
}

export type LayoutPlacementCard = Omit<PagePlacement, "border"> & {
  readingIndex: number;
  // shadows PagePlacement.border (string preset) with the
  // stored spec row (S8.5); null means "use preset".
  border: BorderSpec | null;
  balloons: Balloon[];
  sfx: Sfx[];
};

/** loosen Balloon to include lettering text for the UI card */
export type LayoutBalloonCard = Balloon & { text: string };

export type LayoutPlacementCardWithText = Omit<LayoutPlacementCard, "balloons"> & {
  balloons: LayoutBalloonCard[];
};

export type LayoutPageDetails = {
  page: LayoutPage;
  placements: LayoutPlacementCardWithText[];
  svg: string;
};

export type LayoutBoard = {
  pages: LayoutPage[];
};

/** Every layout page across all manuscripts, in creation order. */
export async function listLayoutBoard(root: string): Promise<LayoutBoard> {
  requireProject(root);
  const manuscripts = await listManuscripts(root);
  const pages: LayoutPage[] = [];
  for (const manuscript of manuscripts) {
    pages.push(...(await listPages(root, manuscript.manuscriptId)));
  }
  return { pages };
}

/** One page's full card for the layout UI: reading order + overlays + SVG. */
export async function getLayoutPage(root: string, pageId: string): Promise<LayoutPageDetails> {
  requireProject(root);
  if (typeof pageId !== "string" || pageId.trim() === "") {
    throw new LayoutBoardError("INVALID_ARGUMENTS", "pageId must not be empty");
  }
  const page = await getPage(root, pageId);
  if (!page) throw new LayoutBoardError("NOT_FOUND", `No page with id: ${pageId}`);
  const ordered = await getReadingOrder(root, pageId);
  const { db } = openProjectDatabase(root);
  try {
    const balloonRows = db
      .prepare("SELECT b.* FROM balloons b JOIN page_panels p ON p.placement_id = b.placement_id WHERE p.page_id = ? ORDER BY b.y, b.x, b.balloon_id")
      .all(pageId) as Array<Record<string, unknown>>;
    const balloonsByPlacement = new Map<string, LayoutBalloonCard[]>();
    for (const row of balloonRows) {
      const key = String(row.placement_id);
      const list = balloonsByPlacement.get(key) ?? [];
      list.push({
        balloonId: String(row.balloon_id),
        placementId: key,
        kind: String(row.kind) as LayoutBalloonCard["kind"],
        shape: String(row.shape) as LayoutBalloonCard["shape"],
        x: Number(row.x),
        y: Number(row.y),
        width: Number(row.width),
        height: Number(row.height),
        tailX: row.tail_x === null || row.tail_x === undefined ? null : Number(row.tail_x),
        tailY: row.tail_y === null || row.tail_y === undefined ? null : Number(row.tail_y),
        tailVisible: Number(row.tail_visible) === 1,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        text: row.text === null || row.text === undefined ? "" : String(row.text),
      });
      balloonsByPlacement.set(key, list);
    }
    const sfxRows = db
      .prepare("SELECT s.* FROM sfx s JOIN page_panels p ON p.placement_id = s.placement_id WHERE p.page_id = ? ORDER BY s.y, s.x, s.sfx_id")
      .all(pageId) as Array<Record<string, unknown>>;
    const sfxByPlacement = new Map<string, Sfx[]>();
    for (const row of sfxRows) {
      const key = String(row.placement_id);
      const list = sfxByPlacement.get(key) ?? [];
      list.push({
        sfxId: String(row.sfx_id),
        placementId: key,
        text: String(row.text),
        weight: String(row.weight) as Sfx["weight"],
        angle: Number(row.angle),
        x: Number(row.x),
        y: Number(row.y),
        scale: Number(row.scale),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      });
      sfxByPlacement.set(key, list);
    }
    const placements: LayoutPlacementCardWithText[] = [];
    for (let readingIndex = 0; readingIndex < ordered.length; readingIndex++) {
      const placement = ordered[readingIndex];
      placements.push({
        ...placement,
        readingIndex,
        border: await getBorder(root, placement.placementId),
        balloons: balloonsByPlacement.get(placement.placementId) ?? [],
        sfx: sfxByPlacement.get(placement.placementId) ?? [],
      });
    }
    const svg = await renderPageSvg(root, pageId);
    return { page, placements, svg };
  } finally {
    db.close();
  }
}
