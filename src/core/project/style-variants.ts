// PanelForge — style variants + priority resolution (S3.13, spec §9.1/§9.2).
//
// A variant binds one S3.11 style profile to a scope with a deterministic
// priority and a lock strength:
//
// - Scopes, highest precedence first: panel > character > scene > project.
// - Within a scope, lower priority number wins, then earliest created_at,
//   then variant_id (total order ⇒ the same winner every time).
// - Project variants match everywhere; scene/character/panel variants
//   match only their scope_ref ID. Panel and character records themselves
//   stay Stages 6/4 — scope_ref is an opaque ID until then.
// - No matching variant falls back to the canonical project default.
// - Styles remain guidance, not guarantees: the result always carries
//   guidance:"guidance-only".
// - Conflicts (candidate style fields that disagree) and lock warnings
//   (a locked/strong lower-precedence variant overridden by a higher
//   one) are returned, never silent.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getStyle, getDefaultStyle } from "./styles";

export type StyleScope = "panel" | "character" | "scene" | "project";
export type LockStrength = "none" | "soft" | "strong" | "locked";

export type StyleVariant = {
  variantId: string;
  styleId: string;
  scope: StyleScope;
  scopeRef: string;
  priority: number;
  lockStrength: LockStrength;
  createdAt: string;
};

export type StyleVariantInput = {
  styleId: string;
  scope: StyleScope;
  scopeRef?: string;
  priority?: number;
  lockStrength?: LockStrength;
};

export type StyleResolutionInput = {
  sceneId?: string;
  characterId?: string;
  panelId?: string;
};

export type StyleConflict = {
  field: string;
  values: string[];
  variantIds: string[];
};

export type StyleResolution = {
  styleId: string;
  name: string;
  scope: StyleScope;
  scopeRef: string;
  variantId: string | null;
  lockStrength: LockStrength;
  guidance: "guidance-only";
  candidates: StyleVariant[];
  conflicts: StyleConflict[];
  warnings: string[];
};

export class StyleVariantError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StyleVariantError";
    this.code = code;
  }
}

const SCOPES: StyleScope[] = ["panel", "character", "scene", "project"];
const LOCKS: LockStrength[] = ["none", "soft", "strong", "locked"];

/** Precedence rank; lower wins. */
export function scopeRank(scope: StyleScope): number {
  return SCOPES.indexOf(scope);
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new StyleVariantError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): StyleVariant {
  return {
    variantId: String(row.variant_id),
    styleId: String(row.style_id),
    scope: String(row.scope) as StyleScope,
    scopeRef: String(row.scope_ref),
    priority: Number(row.priority),
    lockStrength: String(row.lock_strength) as LockStrength,
    createdAt: String(row.created_at),
  };
}

function validateInput(input: StyleVariantInput): void {
  if (!input.styleId || typeof input.styleId !== "string") {
    throw new StyleVariantError("INVALID_ARGUMENTS", "styleId must not be empty");
  }
  if (!SCOPES.includes(input.scope)) {
    throw new StyleVariantError("INVALID_ARGUMENTS", `scope must be one of ${SCOPES.join("|")}`);
  }
  const ref = typeof input.scopeRef === "string" ? input.scopeRef.trim() : "";
  if (input.scope === "project") {
    if (ref !== "") throw new StyleVariantError("INVALID_ARGUMENTS", "project scope takes no scopeRef");
  } else if (ref === "") {
    throw new StyleVariantError("INVALID_ARGUMENTS", `${input.scope} scope requires a scopeRef`);
  }
  if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0)) {
    throw new StyleVariantError("INVALID_ARGUMENTS", "priority must be a non-negative integer");
  }
  if (input.lockStrength !== undefined && !LOCKS.includes(input.lockStrength)) {
    throw new StyleVariantError("INVALID_ARGUMENTS", `lockStrength must be one of ${LOCKS.join("|")}`);
  }
}

/** Create a variant binding a style profile to a scope. */
export async function createVariant(root: string, input: StyleVariantInput): Promise<StyleVariant> {
  requireProject(root);
  validateInput(input);
  const style = await getStyle(root, input.styleId);
  if (!style) throw new StyleVariantError("NOT_FOUND", `No style with id: ${input.styleId}`);
  const scopeRef = input.scope === "project" ? "" : String(input.scopeRef ?? "").trim();
  const priority = input.priority ?? 0;
  const lockStrength = input.lockStrength ?? "none";
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const variantId = crypto.randomUUID();
      await runWithBusyRetry(() =>
        db.prepare(
          "INSERT INTO style_variants (variant_id, style_id, scope, scope_ref, priority, lock_strength, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(variantId, input.styleId, input.scope, scopeRef, priority, lockStrength, now)
      );
      const row = db.prepare("SELECT * FROM style_variants WHERE variant_id = ?").get(variantId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** List variants, optionally filtered by scope, in resolution order. */
export async function listVariants(root: string, input?: { scope?: StyleScope }): Promise<StyleVariant[]> {
  requireProject(root);
  if (input?.scope !== undefined && !SCOPES.includes(input.scope)) {
    throw new StyleVariantError("INVALID_ARGUMENTS", `scope must be one of ${SCOPES.join("|")}`);
  }
  const { db } = openProjectDatabase(root);
  try {
    const rows = (
      input?.scope
        ? db.prepare("SELECT * FROM style_variants WHERE scope = ? ORDER BY priority, created_at, variant_id").all(input.scope)
        : db.prepare("SELECT * FROM style_variants ORDER BY priority, created_at, variant_id").all()
    ) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Delete one variant. */
export async function deleteVariant(root: string, variantId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM style_variants WHERE variant_id = ?").get(variantId) as Record<string, unknown> | undefined;
      if (!current) throw new StyleVariantError("NOT_FOUND", `No variant with id: ${variantId}`);
      await runWithBusyRetry(() => db.prepare("DELETE FROM style_variants WHERE variant_id = ?").run(variantId));
    } finally {
      db.close();
    }
  });
}

function matches(variant: StyleVariant, input: StyleResolutionInput): boolean {
  if (variant.scope === "project") return true;
  if (variant.scope === "scene") return input.sceneId !== undefined && variant.scopeRef === input.sceneId;
  if (variant.scope === "character") return input.characterId !== undefined && variant.scopeRef === input.characterId;
  return input.panelId !== undefined && variant.scopeRef === input.panelId;
}

/**
 * Resolve the winning style for a scene/character/panel context.
 * Deterministic: scope rank, then priority, then created_at, then
 * variant_id. Falls back to the canonical default when no variant
 * matches. Conflicts and lock warnings are always visible.
 */
export async function resolveStyle(root: string, input: StyleResolutionInput): Promise<StyleResolution | null> {
  requireProject(root);
  const all = await listVariants(root);
  const candidates = all
    .filter((v) => matches(v, input))
    .sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope) || a.priority - b.priority || String(a.createdAt).localeCompare(String(b.createdAt)) || a.variantId.localeCompare(b.variantId));
  if (candidates.length === 0) {
    const fallback = await getDefaultStyle(root);
    if (!fallback) return null;
    return {
      styleId: fallback.styleId,
      name: fallback.name,
      scope: "project",
      scopeRef: "",
      variantId: null,
      lockStrength: "none",
      guidance: "guidance-only",
      candidates: [],
      conflicts: [],
      warnings: [],
    };
  }
  const winner = candidates[0];
  const style = await getStyle(root, winner.styleId);
  if (!style) throw new StyleVariantError("NOT_FOUND", `No style with id: ${winner.styleId}`);
  const warnings: string[] = [];
  for (const loser of candidates.slice(1)) {
    if (loser.lockStrength === "locked" || loser.lockStrength === "strong") {
      warnings.push(
        `${loser.lockStrength} ${loser.scope} variant ${loser.variantId} (style ${loser.styleId}) overridden by ${winner.scope} winner ${winner.variantId}`
      );
    }
  }
  const conflicts: StyleConflict[] = [];
  const fields: Array<[string, (s: { lighting: string; lineArt: string; renderingTechnique: string; negativePrompt: string; colorPalette: string[]; aspectRatios: string[] }) => string]> = [
    ["lighting", (s) => s.lighting],
    ["lineArt", (s) => s.lineArt],
    ["renderingTechnique", (s) => s.renderingTechnique],
    ["negativePrompt", (s) => s.negativePrompt],
    ["colorPalette", (s) => s.colorPalette.join(",")],
    ["aspectRatios", (s) => s.aspectRatios.join(",")],
  ];
  const profiles = new Map<string, { lighting: string; lineArt: string; renderingTechnique: string; negativePrompt: string; colorPalette: string[]; aspectRatios: string[] }>();
  for (const candidate of candidates) {
    const profile = await getStyle(root, candidate.styleId);
    if (!profile) throw new StyleVariantError("NOT_FOUND", `No style with id: ${candidate.styleId}`);
    profiles.set(candidate.variantId, profile);
  }
  for (const [field, pick] of fields) {
    const distinct = new Map<string, string[]>();
    for (const candidate of candidates) {
      const value = pick(profiles.get(candidate.variantId)!);
      if (!distinct.has(value)) distinct.set(value, []);
      distinct.get(value)!.push(candidate.variantId);
    }
    if (distinct.size > 1) {
      conflicts.push({
        field,
        values: [...distinct.keys()].sort(),
        variantIds: candidates.map((c) => c.variantId),
      });
    }
  }
  return {
    styleId: winner.styleId,
    name: style.name,
    scope: winner.scope,
    scopeRef: winner.scopeRef,
    variantId: winner.variantId,
    lockStrength: winner.lockStrength,
    guidance: "guidance-only",
    candidates,
    conflicts,
    warnings,
  };
}
