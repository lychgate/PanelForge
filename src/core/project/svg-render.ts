// PanelForge — Comic Layout Studio: SVG page render (S8.11).
//
// Deterministic vector pages from records (S8.2-S8.9):
//
// - `renderPageSvg` reads the page, its placements in
//   reading order (S8.9), border specs (S8.5),
//   balloons + tails + lettering (S8.6-S8.7) and SFX
//   (S8.8) and returns one SVG string.
// - `buildPageSvg` is the pure function underneath:
//   identical records always produce identical bytes
//   (no timestamps, no random ids, fixed attribute
//   order and number formatting).
// - Artwork is by reference only: `<image href>` uses
//   the asset's stored relative path. The renderer
//   never opens, copies, or modifies artwork files.
// - Balloon/SFX coordinates are page-absolute mm,
//   the same space as placements. Rasterization
//   and export stay Stage 10; the hand-rolled UI
//   stays S8.12.
//
// Read-only: no migration, no writes, no mutation.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { getPage } from "./pages";
import { getReadingOrder } from "./reading-order";
import type { PagePlacement } from "./placements";

export class SvgRenderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SvgRenderError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new SvgRenderError(identified.code, identified.message);
  }
}

/** Stable number formatting: 3dp, no float noise. */
function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy deterministic word wrap; explicit \n forces a break. */
export function wrapText(text: string, maxChars: number): string[] {
  const limit = Math.max(3, Math.floor(maxChars));
  const out: string[] = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w !== "");
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (line === "") {
        line = word;
      } else if ((line + " " + word).length <= limit) {
        line += " " + word;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

type BorderSpecLike = { style: string; widthMm: number; rounded: boolean };

type BalloonLike = {
  balloonId: string;
  kind: string;
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tailX: number | null;
  tailY: number | null;
  tailVisible: boolean;
  text: string;
};

type SfxLike = {
  sfxId: string;
  text: string;
  weight: string;
  angle: number;
  x: number;
  y: number;
  scale: number;
};

type PlacementLike = {
  placementId: string;
  panelId: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zOrder: number;
  border: string;
  readingIndex: number;
  assetHref: string | null;
  borderSpec: BorderSpecLike | null;
  balloons: BalloonLike[];
  sfx: SfxLike[];
};

type PageLike = {
  pageId: string;
  title: string;
  format: string;
  width: number;
  height: number;
};

/** Resolve the effective border for one placement (spec row wins, else placement preset). */
function effectiveBorder(placement: PlacementLike): { style: string; widthMm: number; rounded: boolean } {
  if (placement.borderSpec) {
    return placement.borderSpec;
  }
  if (placement.border === "none") return { style: "none", widthMm: 0, rounded: false };
  if (placement.border === "bold") return { style: "bold", widthMm: 2, rounded: false };
  return { style: "thin", widthMm: 0.5, rounded: false };
}

function renderBalloon(balloon: BalloonLike): string {
  const parts: string[] = [];
  const cx = balloon.x + balloon.width / 2;
  const dash = balloon.kind === "thought" ? ' stroke-dasharray="1 1"' : "";
  const commonShape = ' fill="#ffffff" stroke="#000000" stroke-width="0.3"';
  if (balloon.shape === "ellipse") {
    parts.push(
      `<ellipse cx="${fmt(cx)}" cy="${fmt(balloon.y + balloon.height / 2)}" rx="${fmt(balloon.width / 2)}" ry="${fmt(balloon.height / 2)}"${commonShape}${dash}/>`
    );
  } else if (balloon.shape === "rounded") {
    const rx = fmt(Math.min(3, balloon.width / 4, balloon.height / 4));
    parts.push(
      `<rect x="${fmt(balloon.x)}" y="${fmt(balloon.y)}" width="${fmt(balloon.width)}" height="${fmt(balloon.height)}" rx="${rx}"${commonShape}${dash}/>`
    );
  } else {
    parts.push(
      `<rect x="${fmt(balloon.x)}" y="${fmt(balloon.y)}" width="${fmt(balloon.width)}" height="${fmt(balloon.height)}"${commonShape}${dash}/>`
    );
  }
  if (balloon.tailVisible && balloon.tailX !== null && balloon.tailY !== null) {
    parts.push(
      `<line x1="${fmt(cx)}" y1="${fmt(balloon.y + balloon.height)}" x2="${fmt(balloon.tailX)}" y2="${fmt(balloon.tailY)}" stroke="#000000" stroke-width="0.3"/>`
    );
  }
  if (balloon.text !== "") {
    const maxChars = Math.max(3, Math.floor((balloon.width - 2) / 1.8));
    const lines = wrapText(balloon.text, maxChars);
    const fontSize = 3.5;
    const lineHeight = 4;
    const firstY = balloon.y + lineHeight;
    const tspans = lines.map((line, i) => `<tspan x="${fmt(cx)}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("");
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(firstY)}" text-anchor="middle" font-size="${fmt(fontSize)}" font-family="sans-serif">${tspans}</text>`
    );
  }
  return parts.join("");
}

function renderSfx(sfx: SfxLike): string {
  const weight = sfx.weight === "heavy" ? "900" : sfx.weight === "regular" ? "400" : "700";
  const size = 4 * sfx.scale;
  return `<text x="${fmt(sfx.x)}" y="${fmt(sfx.y)}" font-size="${fmt(size)}" font-weight="${weight}" font-family="sans-serif" text-anchor="middle" transform="rotate(${fmt(sfx.angle)} ${fmt(sfx.x)} ${fmt(sfx.y)})">${escapeXml(sfx.text)}</text>`;
}

/**
 * Pure SVG builder. Identical records produce
 * byte-identical output.
 */
export function buildPageSvg(page: PageLike, placements: PlacementLike[]): string {
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(page.width)} ${fmt(page.height)}" width="${fmt(page.width)}mm" height="${fmt(page.height)}mm" data-page-id="${escapeXml(page.pageId)}" data-format="${escapeXml(page.format)}">`
  );
  out.push(`<title>${escapeXml(page.title)}</title>`);
  out.push(`<rect x="0" y="0" width="${fmt(page.width)}" height="${fmt(page.height)}" fill="#ffffff"/>`);
  for (const placement of placements) {
    out.push(
      `<g data-placement-id="${escapeXml(placement.placementId)}" data-panel-id="${escapeXml(placement.panelId)}" data-asset-id="${escapeXml(placement.assetId)}" data-z-order="${fmt(placement.zOrder)}" data-reading-index="${fmt(placement.readingIndex)}">`
    );
    if (placement.assetHref !== null) {
      out.push(
        `<image href="${escapeXml(placement.assetHref)}" x="${fmt(placement.x)}" y="${fmt(placement.y)}" width="${fmt(placement.width)}" height="${fmt(placement.height)}" preserveAspectRatio="none"/>`
      );
    } else {
      out.push(
        `<rect x="${fmt(placement.x)}" y="${fmt(placement.y)}" width="${fmt(placement.width)}" height="${fmt(placement.height)}" fill="#eeeeee"/>`
      );
    }
    const border = effectiveBorder(placement);
    if (border.style !== "none" && border.widthMm > 0) {
      const rx = border.rounded ? ` rx="${fmt(Math.min(3, placement.width / 4, placement.height / 4))}"` : "";
      out.push(
        `<rect x="${fmt(placement.x)}" y="${fmt(placement.y)}" width="${fmt(placement.width)}" height="${fmt(placement.height)}" fill="none" stroke="#000000" stroke-width="${fmt(border.widthMm)}"${rx}/>`
      );
    }
    for (const balloon of placement.balloons) {
      out.push(renderBalloon(balloon));
    }
    for (const sfx of placement.sfx) {
      out.push(renderSfx(sfx));
    }
    out.push(`</g>`);
  }
  out.push(`</svg>`);
  return out.join("");
}

/**
 * Render one page to deterministic SVG.
 * Read-only: never modifies records or artwork.
 */
export async function renderPageSvg(root: string, pageId: string): Promise<string> {
  requireProject(root);
  if (typeof pageId !== "string" || pageId.trim() === "") {
    throw new SvgRenderError("INVALID_ARGUMENTS", "pageId must not be empty");
  }
  const page = await getPage(root, pageId);
  if (!page) throw new SvgRenderError("NOT_FOUND", `No page with id: ${pageId}`);
  const ordered = await getReadingOrder(root, pageId);
  const { db } = openProjectDatabase(root);
  try {
    const balloonRows = db
      .prepare("SELECT b.* FROM balloons b JOIN page_panels p ON p.placement_id = b.placement_id WHERE p.page_id = ? ORDER BY b.y, b.x, b.balloon_id")
      .all(pageId) as Array<Record<string, unknown>>;
    const balloonsByPlacement = new Map<string, BalloonLike[]>();
    for (const row of balloonRows) {
      const key = String(row.placement_id);
      const list = balloonsByPlacement.get(key) ?? [];
      list.push({
        balloonId: String(row.balloon_id),
        kind: String(row.kind),
        shape: String(row.shape),
        x: Number(row.x),
        y: Number(row.y),
        width: Number(row.width),
        height: Number(row.height),
        tailX: row.tail_x === null || row.tail_x === undefined ? null : Number(row.tail_x),
        tailY: row.tail_y === null || row.tail_y === undefined ? null : Number(row.tail_y),
        tailVisible: Number(row.tail_visible) === 1,
        text: row.text === null || row.text === undefined ? "" : String(row.text),
      });
      balloonsByPlacement.set(key, list);
    }
    const sfxRows = db
      .prepare("SELECT s.* FROM sfx s JOIN page_panels p ON p.placement_id = s.placement_id WHERE p.page_id = ? ORDER BY s.y, s.x, s.sfx_id")
      .all(pageId) as Array<Record<string, unknown>>;
    const sfxByPlacement = new Map<string, SfxLike[]>();
    for (const row of sfxRows) {
      const key = String(row.placement_id);
      const list = sfxByPlacement.get(key) ?? [];
      list.push({
        sfxId: String(row.sfx_id),
        text: String(row.text),
        weight: String(row.weight),
        angle: Number(row.angle),
        x: Number(row.x),
        y: Number(row.y),
        scale: Number(row.scale),
      });
      sfxByPlacement.set(key, list);
    }
    const placements: PlacementLike[] = ordered.map((placement: PagePlacement, readingIndex: number) => {
      const borderRow = db.prepare("SELECT style, width_mm, rounded FROM placement_borders WHERE placement_id = ?").get(placement.placementId) as
        | Record<string, unknown>
        | undefined;
      const assetRow = db.prepare("SELECT relative_path FROM assets WHERE asset_id = ?").get(placement.assetId) as Record<string, unknown> | undefined;
      return {
        placementId: placement.placementId,
        panelId: placement.panelId,
        assetId: placement.assetId,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        zOrder: placement.zOrder,
        border: placement.border,
        readingIndex,
        assetHref: assetRow ? String(assetRow.relative_path) : null,
        borderSpec: borderRow
          ? { style: String(borderRow.style), widthMm: Number(borderRow.width_mm), rounded: Number(borderRow.rounded) === 1 }
          : null,
        balloons: balloonsByPlacement.get(placement.placementId) ?? [],
        sfx: sfxByPlacement.get(placement.placementId) ?? [],
      };
    });
    return buildPageSvg({ pageId: page.pageId, title: page.title, format: page.format, width: page.width, height: page.height }, placements);
  } finally {
    db.close();
  }
}
