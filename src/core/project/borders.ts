// PanelForge — Comic Layout Studio: borders (S8.5).
//
// Vector borders for placed panels:
//
// - Presets (none, thin, bold) + adjustable width +
//   rounded option, stored per placement
//   (`placement_borders`). Preset defaults set the
//   width; custom widths validate (positive, ≤ 10mm).
// - Stored per placement; rendered in SVG by S8.11,
//   never baked into artwork.
// - Border changes never touch the asset store.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type BorderStyle = "none" | "thin" | "bold";

export type BorderSpec = {
  style: BorderStyle;
  widthMm: number;
  rounded: boolean;
};

const PRESET_WIDTHS: Record<BorderStyle, number> = {
  none: 0,
  thin: 0.5,
  bold: 2,
};

export const BORDER_STYLES: BorderStyle[] = ["none", "thin", "bold"];
export const MAX_BORDER_WIDTH_MM = 10;

export class BorderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BorderError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new BorderError(identified.code, identified.message);
  }
}

function validateBorder(style: BorderStyle, widthMm: number, rounded: boolean): void {
  if (!BORDER_STYLES.includes(style)) {
    throw new BorderError("INVALID_ARGUMENTS", `style must be one of ${BORDER_STYLES.join("|")}`);
  }
  if (typeof widthMm !== "number" || !Number.isFinite(widthMm) || widthMm < 0 || widthMm > MAX_BORDER_WIDTH_MM) {
    throw new BorderError("INVALID_ARGUMENTS", `widthMm must be in 0..${MAX_BORDER_WIDTH_MM}`);
  }
  if (typeof rounded !== "boolean") {
    throw new BorderError("INVALID_ARGUMENTS", "rounded must be a boolean");
  }
  if (style === "none" && widthMm > 0) {
    throw new BorderError("INVALID_ARGUMENTS", "style none takes no width");
  }
}

/** Store a border spec for one placement (replaces). */
export async function setBorder(root: string, input: { placementId: string; style: BorderStyle; widthMm?: number; rounded?: boolean }): Promise<BorderSpec> {
  requireProject(root);
  if (typeof input.placementId !== "string" || input.placementId.trim() === "") {
    throw new BorderError("INVALID_ARGUMENTS", "placementId must not be empty");
  }
  const widthMm = input.widthMm ?? PRESET_WIDTHS[input.style] ?? 0;
  const rounded = input.rounded ?? false;
  validateBorder(input.style, widthMm, rounded);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const placement = db.prepare("SELECT placement_id FROM page_panels WHERE placement_id = ?").get(input.placementId);
      if (!placement) throw new BorderError("NOT_FOUND", `No placement with id: ${input.placementId}`);
      await runWithBusyRetry(() =>
        db.prepare("INSERT OR REPLACE INTO placement_borders (placement_id, style, width_mm, rounded, updated_at) VALUES (?, ?, ?, ?, ?)").run(
          input.placementId,
          input.style,
          widthMm,
          rounded ? 1 : 0,
          new Date().toISOString()
        )
      );
      return { style: input.style, widthMm, rounded };
    } finally {
      db.close();
    }
  });
}

/** The stored border spec for one placement, or null. */
export async function getBorder(root: string, placementId: string): Promise<BorderSpec | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM placement_borders WHERE placement_id = ?").get(placementId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      style: String(row.style) as BorderStyle,
      widthMm: Number(row.width_mm),
      rounded: Number(row.rounded) === 1,
    };
  } finally {
    db.close();
  }
}
