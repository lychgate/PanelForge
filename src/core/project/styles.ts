// PanelForge — Art Style Manager (S3.11, spec §9).
//
// A project's visual identities, with one canonical default:
//
// - `createStyle` / `updateStyle` / `deleteStyle` CRUD over the §9
//   fields (name, description, reference images, preferred
//   models/LoRAs, color palette, lighting, line-art, rendering
//   technique, negative prompts, aspect ratios, other preferences).
// - `setDefaultStyle` keeps exactly one `is_default = 1` row (partial
//   unique index + transactional swap). The first profile becomes
//   the default automatically; deleting the default requires another
//   default to exist first (never orphaned).
// - Reference images are asset IDs validated against the S1.5 registry.
//
// Variants and priority resolution stay S3.13; generation
// consumption stays Stage 7.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getAsset } from "./registry";

export type StyleProfile = {
  styleId: string;
  name: string;
  description: string;
  referenceAssetIds: string[];
  preferredModels: string[];
  preferredLoras: string[];
  colorPalette: string[];
  lighting: string;
  lineArt: string;
  renderingTechnique: string;
  negativePrompt: string;
  aspectRatios: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StyleInput = {
  name: string;
  description?: string;
  referenceAssetIds?: string[];
  preferredModels?: string[];
  preferredLoras?: string[];
  colorPalette?: string[];
  lighting?: string;
  lineArt?: string;
  renderingTechnique?: string;
  negativePrompt?: string;
  aspectRatios?: string[];
};

export class StyleError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StyleError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new StyleError(identified.code, identified.message);
  }
}

function parseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function toRecord(row: Record<string, unknown>): StyleProfile {
  return {
    styleId: String(row.style_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    referenceAssetIds: parseList(String(row.reference_asset_ids)),
    preferredModels: parseList(String(row.preferred_models)),
    preferredLoras: parseList(String(row.preferred_loras)),
    colorPalette: parseList(String(row.color_palette)),
    lighting: String(row.lighting ?? ""),
    lineArt: String(row.line_art ?? ""),
    renderingTechnique: String(row.rendering_technique ?? ""),
    negativePrompt: String(row.negative_prompt ?? ""),
    aspectRatios: parseList(String(row.aspect_ratios)),
    isDefault: Number(row.is_default) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: StyleInput, partial: boolean): void {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new StyleError("INVALID_ARGUMENTS", "name must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "name" || key === "description" || key === "lighting" || key === "lineArt" || key === "renderingTechnique" || key === "negativePrompt") {
      if (value !== undefined && typeof value !== "string") {
        throw new StyleError("INVALID_ARGUMENTS", `${key} must be a string`);
      }
    } else if (value !== undefined) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new StyleError("INVALID_ARGUMENTS", `${key} must be a string array`);
      }
    }
  }
}

async function validateReferenceAssets(root: string, assetIds: string[]): Promise<void> {
  for (const assetId of assetIds) {
    const asset = await getAsset(root, assetId);
    if (!asset) throw new StyleError("NOT_FOUND", `No asset with id: ${assetId}`);
  }
}

/** Create a style profile; the first profile becomes the default. */
export async function createStyle(root: string, input: StyleInput): Promise<StyleProfile> {
  requireProject(root);
  validateInput(input, false);
  if (input.referenceAssetIds && input.referenceAssetIds.length > 0) {
    await validateReferenceAssets(root, input.referenceAssetIds);
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const styleId = crypto.randomUUID();
      return await runWithBusyRetry<StyleProfile>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const existing = db.prepare("SELECT COUNT(*) AS n FROM styles").get() as Record<string, unknown>;
          const first = Number(existing.n) === 0;
          db.prepare(
            "INSERT INTO styles (style_id, name, description, reference_asset_ids, preferred_models, preferred_loras, color_palette, lighting, line_art, rendering_technique, negative_prompt, aspect_ratios, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            styleId,
            input.name.trim(),
            input.description ?? "",
            JSON.stringify(input.referenceAssetIds ?? []),
            JSON.stringify(input.preferredModels ?? []),
            JSON.stringify(input.preferredLoras ?? []),
            JSON.stringify(input.colorPalette ?? []),
            input.lighting ?? "",
            input.lineArt ?? "",
            input.renderingTechnique ?? "",
            input.negativePrompt ?? "",
            JSON.stringify(input.aspectRatios ?? []),
            first ? 1 : 0,
            now,
            now
          );
          const row = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId);
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

/** Retrieve one style, or null. */
export async function getStyle(root: string, styleId: string): Promise<StyleProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all styles (default first, then creation order). */
export async function listStyles(root: string): Promise<StyleProfile[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM styles ORDER BY is_default DESC, created_at, style_id").all() as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** The one canonical project default, or null when no styles exist. */
export async function getDefaultStyle(root: string): Promise<StyleProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM styles WHERE is_default = 1").get() as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** Update a style's fields (partial merges; identity never changes). */
export async function updateStyle(root: string, styleId: string, patch: StyleInput): Promise<StyleProfile> {
  requireProject(root);
  validateInput(patch, true);
  if (patch.referenceAssetIds && patch.referenceAssetIds.length > 0) {
    await validateReferenceAssets(root, patch.referenceAssetIds);
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId) as Record<string, unknown> | undefined;
      if (!current) throw new StyleError("NOT_FOUND", `No style with id: ${styleId}`);
      const merged: StyleInput & Record<string, unknown> = {
        name: patch.name ?? String(current.name),
        description: patch.description ?? String(current.description ?? ""),
        referenceAssetIds: patch.referenceAssetIds ?? parseList(String(current.reference_asset_ids)),
        preferredModels: patch.preferredModels ?? parseList(String(current.preferred_models)),
        preferredLoras: patch.preferredLoras ?? parseList(String(current.preferred_loras)),
        colorPalette: patch.colorPalette ?? parseList(String(current.color_palette)),
        lighting: patch.lighting ?? String(current.lighting ?? ""),
        lineArt: patch.lineArt ?? String(current.line_art ?? ""),
        renderingTechnique: patch.renderingTechnique ?? String(current.rendering_technique ?? ""),
        negativePrompt: patch.negativePrompt ?? String(current.negative_prompt ?? ""),
        aspectRatios: patch.aspectRatios ?? parseList(String(current.aspect_ratios)),
      };
      return await runWithBusyRetry<StyleProfile>(() => {
        db.prepare(
          "UPDATE styles SET name = ?, description = ?, reference_asset_ids = ?, preferred_models = ?, preferred_loras = ?, color_palette = ?, lighting = ?, line_art = ?, rendering_technique = ?, negative_prompt = ?, aspect_ratios = ?, updated_at = ? WHERE style_id = ?"
        ).run(
          merged.name as string,
          merged.description as string,
          JSON.stringify(merged.referenceAssetIds),
          JSON.stringify(merged.preferredModels),
          JSON.stringify(merged.preferredLoras),
          JSON.stringify(merged.colorPalette),
          merged.lighting as string,
          merged.lineArt as string,
          merged.renderingTechnique as string,
          merged.negativePrompt as string,
          JSON.stringify(merged.aspectRatios),
          now,
          styleId
        );
        const row = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Set the one canonical default (transactional swap). */
export async function setDefaultStyle(root: string, styleId: string): Promise<StyleProfile> {
  requireProject(root);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<StyleProfile>(() => {
        const target = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId) as Record<string, unknown> | undefined;
        if (!target) throw new StyleError("NOT_FOUND", `No style with id: ${styleId}`);
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE styles SET is_default = 0 WHERE is_default = 1").run();
          db.prepare("UPDATE styles SET is_default = 1, updated_at = ? WHERE style_id = ?").run(now, styleId);
          const row = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId);
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

/** Delete a style. The current default needs a successor first (never orphaned). */
export async function deleteStyle(root: string, styleId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM styles WHERE style_id = ?").get(styleId) as Record<string, unknown> | undefined;
      if (!current) throw new StyleError("NOT_FOUND", `No style with id: ${styleId}`);
      if (Number(current.is_default) === 1) {
        const others = db.prepare("SELECT COUNT(*) AS n FROM styles WHERE is_default = 1 AND style_id != ?").get(styleId) as Record<string, unknown>;
        if (Number(others.n) === 0) {
          throw new StyleError("INVALID_STATE", "Cannot delete the canonical default — set another default first");
        }
      }
      await runWithBusyRetry(() => db.prepare("DELETE FROM styles WHERE style_id = ?").run(styleId));
    } finally {
      db.close();
    }
  });
}
