// PanelForge — Comic Layout Studio: webtoon / vertical layout (S8.4).
//
// Continuous-scroll geometry for vertical strips:
//
// - `applyWebtoonLayout` requires a webtoon page. Panels
//   stack top→bottom in list order (1 per row), each
//   spanning the usable width, at `panelHeightMm` (or
//   derived from the first panel's aspect if unset).
//   Reading order follows vertical order.
// - The page height grows to fit the stack
//   (margins + panels + gaps); full-bleed drops the
//   horizontal margins.
// - Application replaces only unlabeled placements
//   (same rule as S8.3 presets); labeled placements
//   (balloons/SFX, S8.6/S8.8) stay in place.
// - Traditional grids stay S8.3; borders stay S8.5.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite } from "./metadata";
import { getPage, updatePage } from "./pages";
import { placePanel, type PagePlacement } from "./placements";

export class WebtoonError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WebtoonError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new WebtoonError(identified.code, identified.message);
  }
}

export type WebtoonInput = {
  pageId: string;
  panelIds: string[];
  gapMm?: number;
  panelHeightMm?: number;
  fullBleed?: boolean;
};

/**
 * Stack panels vertically on a webtoon page in list
 * order, growing the page height to fit. Returns the
 * created placements top-to-bottom (reading order).
 */
export async function applyWebtoonLayout(root: string, input: WebtoonInput): Promise<PagePlacement[]> {
  requireProject(root);
  if (!Array.isArray(input.panelIds) || input.panelIds.length === 0) {
    throw new WebtoonError("INVALID_ARGUMENTS", "panelIds must list at least one panel");
  }
  const page = await getPage(root, input.pageId);
  if (!page) throw new WebtoonError("NOT_FOUND", `No page with id: ${input.pageId}`);
  if (page.format !== "webtoon") {
    throw new WebtoonError("INVALID_ARGUMENTS", `webtoon layout needs a webtoon page; page ${input.pageId} is ${page.format}`);
  }
  const gap = input.gapMm ?? 0;
  if (typeof gap !== "number" || !Number.isFinite(gap) || gap < 0) {
    throw new WebtoonError("INVALID_ARGUMENTS", "gapMm must be a non-negative number");
  }
  const sideMargin = input.fullBleed ? 0 : page.margin;
  const usableWidth = page.width - sideMargin * 2;
  if (usableWidth <= 0) throw new WebtoonError("INVALID_ARGUMENTS", "page width too narrow for the margins");
  const panelHeight = input.panelHeightMm ?? usableWidth;
  if (typeof panelHeight !== "number" || !Number.isFinite(panelHeight) || panelHeight <= 0) {
    throw new WebtoonError("INVALID_ARGUMENTS", "panelHeightMm must be a positive number");
  }

  // Non-destructive: drop only unlabeled placements.
  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const labeled = new Set<string>();
      for (const table of ["balloons", "sfx"]) {
        try {
          const rows = db.prepare(`SELECT DISTINCT placement_id FROM ${table} WHERE page_id = ?`).all(input.pageId) as Array<Record<string, unknown>>;
          for (const row of rows) labeled.add(String(row.placement_id));
        } catch {
          // Table does not exist yet (S8.6/S8.8 not landed).
        }
      }
      const placements = db.prepare("SELECT placement_id FROM page_panels WHERE page_id = ?").all(input.pageId) as Array<Record<string, unknown>>;
      for (const row of placements) {
        if (!labeled.has(String(row.placement_id))) {
          db.prepare("DELETE FROM page_panels WHERE placement_id = ?").run(row.placement_id);
        }
      }
    } finally {
      db.close();
    }
  });

  // Grow the page first so placements validate against
  // the stack's own height, then place top-to-bottom.
  const totalHeight = Math.round((sideMargin + input.panelIds.length * panelHeight + (input.panelIds.length - 1) * gap + sideMargin) * 10) / 10;
  if (totalHeight !== page.height) {
    await updatePage(root, input.pageId, { height: totalHeight });
  }

  const created: PagePlacement[] = [];
  let y = sideMargin;
  for (let index = 0; index < input.panelIds.length; index++) {
    created.push(
      await placePanel(root, {
        pageId: input.pageId,
        panelId: input.panelIds[index],
        x: sideMargin,
        y: Math.round(y * 10) / 10,
        width: usableWidth,
        height: panelHeight,
        zOrder: index,
      })
    );
    y += panelHeight + gap;
  }
  return created;
}
