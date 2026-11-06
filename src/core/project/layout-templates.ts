// PanelForge — Comic Layout Studio: traditional layout templates (S8.3).
//
// Grid presets for traditional pages:
//
// - `listPresets` returns the built-in grid presets
//   (rows × cols); `applyPreset` generates evenly
//   guttered placements for a page's panels in
//   reading order (row-major).
// - Application is non-destructive to labeled
//   placements: placements carrying balloons or SFX
//   (S8.6/S8.8) stay in place; only UNLABELED
//   placements are replaced. Before lettering exists
//   every placement is unlabeled.
// - Webtoon layouts stay S8.4.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite } from "./metadata";
import { getPage } from "./pages";
import { placePanel, type PagePlacement } from "./placements";

export type LayoutPreset = {
  name: string;
  rows: number;
  cols: number;
  gutter: number;
};

const PRESETS: LayoutPreset[] = [
  { name: "single", rows: 1, cols: 1, gutter: 8 },
  { name: "two-up", rows: 1, cols: 2, gutter: 8 },
  { name: "four-panel", rows: 2, cols: 2, gutter: 8 },
  { name: "six-panel", rows: 2, cols: 3, gutter: 6 },
  { name: "nine-panel", rows: 3, cols: 3, gutter: 6 },
];

export class LayoutTemplateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LayoutTemplateError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LayoutTemplateError(identified.code, identified.message);
  }
}

/** Built-in traditional grid presets. */
export async function listPresets(): Promise<LayoutPreset[]> {
  return PRESETS.map((preset) => ({ ...preset }));
}

export type ApplyPresetInput = {
  pageId: string;
  preset: string;
  panelIds: string[];
  border?: string;
};

/**
 * Apply a preset: generate evenly guttered placements
 * for the panel list in row-major order. Labeled
 * placements (balloons/SFX present) are kept; only
 * unlabeled placements are replaced.
 */
export async function applyPreset(root: string, input: ApplyPresetInput): Promise<PagePlacement[]> {
  requireProject(root);
  const preset = PRESETS.find((entry) => entry.name === input.preset);
  if (!preset) throw new LayoutTemplateError("INVALID_ARGUMENTS", `Unknown preset: ${input.preset}`);
  if (!Array.isArray(input.panelIds) || input.panelIds.length === 0) {
    throw new LayoutTemplateError("INVALID_ARGUMENTS", "panelIds must list at least one panel");
  }
  if (input.panelIds.length > preset.rows * preset.cols) {
    throw new LayoutTemplateError("INVALID_ARGUMENTS", `Preset ${input.preset} holds ${preset.rows * preset.cols} panels, not ${input.panelIds.length}`);
  }
  const page = await getPage(root, input.pageId);
  if (!page) throw new LayoutTemplateError("NOT_FOUND", `No page with id: ${input.pageId}`);
  if (page.format !== "traditional") {
    throw new LayoutTemplateError("INVALID_ARGUMENTS", `Preset ${input.preset} is a traditional layout; page ${input.pageId} is ${page.format}`);
  }

  const usableWidth = page.width - page.margin * 2;
  const usableHeight = page.height - page.margin * 2;
  const cellWidth = (usableWidth - preset.gutter * (preset.cols - 1)) / preset.cols;
  const cellHeight = (usableHeight - preset.gutter * (preset.rows - 1)) / preset.rows;
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new LayoutTemplateError("INVALID_ARGUMENTS", `Preset ${input.preset} gutters exceed the printable area`);
  }

  // Non-destructive: drop only unlabeled placements.
  const labeledPanelIds = await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const labeled = new Set<string>();
      for (const table of ["balloons", "sfx"]) {
        try {
          const rows = db.prepare(`SELECT DISTINCT placement_id FROM ${table} WHERE page_id = ?`).all(input.pageId) as Array<Record<string, unknown>>;
          for (const row of rows) labeled.add(String(row.placement_id));
        } catch {
          // Table does not exist yet (S8.6/S8.8 not landed):
          // every placement is unlabeled.
        }
      }
      const placements = db.prepare("SELECT placement_id FROM page_panels WHERE page_id = ?").all(input.pageId) as Array<Record<string, unknown>>;
      for (const row of placements) {
        if (!labeled.has(String(row.placement_id))) {
          db.prepare("DELETE FROM page_panels WHERE placement_id = ?").run(row.placement_id);
        }
      }
      return labeled;
    } finally {
      db.close();
    }
  });
  void labeledPanelIds;

  const created: PagePlacement[] = [];
  for (let index = 0; index < input.panelIds.length; index++) {
    const row = Math.floor(index / preset.cols);
    const col = index % preset.cols;
    const x = page.margin + col * (cellWidth + preset.gutter);
    const y = page.margin + row * (cellHeight + preset.gutter);
    created.push(
      await placePanel(root, {
        pageId: input.pageId,
        panelId: input.panelIds[index],
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: Math.round(cellWidth * 10) / 10,
        height: Math.round(cellHeight * 10) / 10,
        zOrder: index,
        border: input.border,
      })
    );
  }
  return created;
}
