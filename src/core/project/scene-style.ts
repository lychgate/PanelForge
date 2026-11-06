// PanelForge — Storyboard Studio: scene style overrides (S6.8, spec §8.7).
//
// Per-scene style guidance via S3.13 resolution:
//
// - `setSceneStyleOverride` records one scene-scoped variant per
//   call (backed by the S3.12 style_variants table; scope_ref is
//   the storyboard scene id). `listSceneOverrides` reads them
//   back in resolution order. `clearSceneStyleOverride` removes
//   one scene-scoped variant.
// - `resolveSceneStyle` resolves a scene's winning style through
//   `resolveStyle` (scene context, plus optional character/panel
//   context for the full precedence chain). Scenes with no
//   matching variant fall back to the canonical project default.
//   The result always carries guidance:"guidance-only".
//
// Panel instructions stay S6.9.

import { identifyProject } from "./service";
import { getScene } from "./storyboard-scenes";
import {
  createVariant,
  deleteVariant,
  listVariants,
  resolveStyle,
  type LockStrength,
  type StyleResolution,
  type StyleVariant,
} from "./style-variants";

export class SceneStyleError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SceneStyleError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new SceneStyleError(identified.code, identified.message);
  }
}

async function requireScene(root: string, sceneId: string): Promise<void> {
  if (typeof sceneId !== "string" || sceneId.trim() === "") {
    throw new SceneStyleError("INVALID_ARGUMENTS", "sceneId must not be empty");
  }
  const scene = await getScene(root, sceneId);
  if (!scene) {
    throw new SceneStyleError("NOT_FOUND", `No scene with id: ${sceneId}`);
  }
}

export type SetSceneStyleInput = {
  sceneId: string;
  styleId: string;
  priority?: number;
  lockStrength?: LockStrength;
};

/** Record one scene-scoped style override for a storyboard scene. */
export async function setSceneStyleOverride(root: string, input: SetSceneStyleInput): Promise<StyleVariant> {
  requireProject(root);
  await requireScene(root, input.sceneId);
  return createVariant(root, {
    styleId: input.styleId,
    scope: "scene",
    scopeRef: input.sceneId,
    priority: input.priority,
    lockStrength: input.lockStrength,
  });
}

/** Scene-scoped overrides for one scene, in resolution order. */
export async function listSceneOverrides(root: string, sceneId: string): Promise<StyleVariant[]> {
  requireProject(root);
  await requireScene(root, sceneId);
  const all = await listVariants(root, { scope: "scene" });
  return all.filter((v) => v.scopeRef === sceneId);
}

/** Remove one scene-scoped override (guards against clearing non-scene variants). */
export async function clearSceneStyleOverride(root: string, variantId: string): Promise<void> {
  requireProject(root);
  if (typeof variantId !== "string" || variantId.trim() === "") {
    throw new SceneStyleError("INVALID_ARGUMENTS", "variantId must not be empty");
  }
  const all = await listVariants(root, { scope: "scene" });
  const found = all.find((v) => v.variantId === variantId);
  if (!found) {
    throw new SceneStyleError("INVALID_ARGUMENTS", `Variant ${variantId} is not a scene-scoped override`);
  }
  await deleteVariant(root, variantId);
}

export type ResolveSceneStyleInput = {
  sceneId: string;
  characterId?: string;
  panelId?: string;
};

/**
 * Resolve the winning style for a scene's context. Unknown scenes
 * reject with NOT_FOUND; otherwise the S3.13 result (or canonical
 * default fallback) is returned unchanged, guidance-only.
 */
export async function resolveSceneStyle(root: string, input: ResolveSceneStyleInput): Promise<StyleResolution | null> {
  requireProject(root);
  await requireScene(root, input.sceneId);
  return resolveStyle(root, {
    sceneId: input.sceneId,
    characterId: input.characterId,
    panelId: input.panelId,
  });
}
