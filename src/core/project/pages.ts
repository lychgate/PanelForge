// PanelForge — Comic Layout Studio: page records (S8.1).
//
// Pages as first-class records with format + size:
//
// - `createPage`/`updatePage`/`deletePage` CRUD over
//   pages (title, format traditional|webtoon, size in mm,
//   margin in mm), listed per manuscript.
// - Invalid formats, sizes, or margins reject typed.
// - Panel placement and layouts stay S8.2+.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import * as crypto from "crypto";

export type PageFormat = "traditional" | "webtoon";

export type LayoutPage = {
  pageId: string;
  manuscriptId: string;
  title: string;
  format: PageFormat;
  width: number;
  height: number;
  margin: number;
  createdAt: string;
  updatedAt: string;
};

export type PageInput = {
  manuscriptId: string;
  title: string;
  format: PageFormat;
  width: number;
  height: number;
  margin?: number;
};

export class LayoutPageError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LayoutPageError";
    this.code = code;
  }
}

const FORMATS: PageFormat[] = ["traditional", "webtoon"];

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LayoutPageError(identified.code, identified.message);
  }
}

function validateInput(input: PageInput): void {
  if (typeof input.manuscriptId !== "string" || input.manuscriptId.trim() === "") {
    throw new LayoutPageError("INVALID_ARGUMENTS", "manuscriptId must not be empty");
  }
  if (typeof input.title !== "string" || input.title.trim() === "") {
    throw new LayoutPageError("INVALID_ARGUMENTS", "title must not be empty");
  }
  if (!FORMATS.includes(input.format)) {
    throw new LayoutPageError("INVALID_ARGUMENTS", `format must be one of ${FORMATS.join("|")}`);
  }
  for (const [key, value] of [["width", input.width], ["height", input.height]] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new LayoutPageError("INVALID_ARGUMENTS", `${key} must be a positive number`);
    }
  }
  if (input.margin !== undefined && (typeof input.margin !== "number" || !Number.isFinite(input.margin) || input.margin < 0)) {
    throw new LayoutPageError("INVALID_ARGUMENTS", "margin must be a non-negative number");
  }
  if (input.margin !== undefined && (input.margin * 2 >= Math.min(input.width, input.height))) {
    throw new LayoutPageError("INVALID_ARGUMENTS", "margin is too large for the page size");
  }
}

function toRecord(row: Record<string, unknown>): LayoutPage {
  return {
    pageId: String(row.page_id),
    manuscriptId: String(row.manuscript_id),
    title: String(row.title),
    format: String(row.format) as PageFormat,
    width: Number(row.width),
    height: Number(row.height),
    margin: Number(row.margin),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Create a page record. */
export async function createPage(root: string, input: PageInput): Promise<LayoutPage> {
  requireProject(root);
  validateInput(input);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const manuscript = db.prepare("SELECT manuscript_id FROM manuscripts WHERE manuscript_id = ?").get(input.manuscriptId);
      if (!manuscript) throw new LayoutPageError("NOT_FOUND", `No manuscript with id: ${input.manuscriptId}`);
      const pageId = crypto.randomUUID();
      await runWithBusyRetry(() =>
        db.prepare("INSERT INTO pages (page_id, manuscript_id, title, format, width, height, margin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          pageId,
          input.manuscriptId,
          input.title.trim(),
          input.format,
          input.width,
          input.height,
          input.margin ?? 10,
          now,
          now
        )
      );
      const row = db.prepare("SELECT * FROM pages WHERE page_id = ?").get(pageId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** Update a page record (title, format, size, margin). */
export async function updatePage(
  root: string,
  pageId: string,
  patch: Partial<Pick<PageInput, "title" | "format" | "width" | "height" | "margin">>
): Promise<LayoutPage> {
  requireProject(root);
  if (typeof pageId !== "string" || pageId.trim() === "") {
    throw new LayoutPageError("INVALID_ARGUMENTS", "pageId must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM pages WHERE page_id = ?").get(pageId) as Record<string, unknown> | undefined;
      if (!current) throw new LayoutPageError("NOT_FOUND", `No page with id: ${pageId}`);
      const merged: PageInput = {
        manuscriptId: String(current.manuscript_id),
        title: patch.title ?? String(current.title),
        format: (patch.format ?? String(current.format)) as PageFormat,
        width: patch.width ?? Number(current.width),
        height: patch.height ?? Number(current.height),
        margin: patch.margin ?? Number(current.margin),
      };
      validateInput(merged);
      await runWithBusyRetry(() =>
        db.prepare("UPDATE pages SET title = ?, format = ?, width = ?, height = ?, margin = ?, updated_at = ? WHERE page_id = ?").run(
          merged.title.trim(),
          merged.format,
          merged.width,
          merged.height,
          merged.margin ?? 10,
          now,
          pageId
        )
      );
      const row = db.prepare("SELECT * FROM pages WHERE page_id = ?").get(pageId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** Delete a page record. */
export async function deletePage(root: string, pageId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT page_id FROM pages WHERE page_id = ?").get(pageId);
      if (!current) throw new LayoutPageError("NOT_FOUND", `No page with id: ${pageId}`);
      await runWithBusyRetry(() => db.prepare("DELETE FROM pages WHERE page_id = ?").run(pageId));
    } finally {
      db.close();
    }
  });
}

/** One page record, or null. */
export async function getPage(root: string, pageId: string): Promise<LayoutPage | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM pages WHERE page_id = ?").get(pageId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** Pages of one manuscript, in creation order. */
export async function listPages(root: string, manuscriptId: string): Promise<LayoutPage[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM pages WHERE manuscript_id = ? ORDER BY created_at, page_id").all(manuscriptId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}
