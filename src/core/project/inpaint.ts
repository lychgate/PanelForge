// PanelForge — Art Studio: inpainting (S7.8, spec §8.8).
//
// Repaint selected regions — coordinate-based per the
// owner decision (no mask-painting UI):
//
// - `setInpaintRegions` stores validated rectangles per
//   panel (replacing): integers, positive size, and —
//   when the template declares canvas dims — in-bounds.
// - `inpaintPanel` repaints the latest artwork version:
//   repaint request (base artwork asset + regions +
//   prompt) → S7.1 dispatch → result bytes → new artwork
//   version. The original version's row is never touched;
//   pixels outside the regions are preserved by keeping
//   the base version intact alongside the repaint.
// - Outpainting stays S7.9.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getPanelPrompt } from "./prompt-assembly";
import { getTemplate } from "./workflow-templates";
import { listArtwork } from "./panel-generation";
import { importAsset } from "./registry";
import { runWorkflow } from "../../engines/provider/comfyui-client";
import type { ProviderAdapter } from "../../engines/provider/types";
import { modelFromWorkflow } from "./provenance";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export class InpaintError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InpaintError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new InpaintError(identified.code, identified.message);
  }
}

function validateRegions(regions: Region[]): void {
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new InpaintError("INVALID_ARGUMENTS", "at least one region is required");
  }
  for (const [index, region] of regions.entries()) {
    if (!region || typeof region !== "object") throw new InpaintError("INVALID_ARGUMENTS", `region ${index} must be an object`);
    const { x, y, width, height } = region;
    for (const [key, value] of [["x", x], ["y", y], ["width", width], ["height", height]] as const) {
      if (!Number.isInteger(value)) throw new InpaintError("INVALID_ARGUMENTS", `region ${index} ${key} must be an integer`);
    }
    if (x < 0 || y < 0) throw new InpaintError("INVALID_ARGUMENTS", `region ${index} must be non-negative`);
    if (width <= 0 || height <= 0) throw new InpaintError("INVALID_ARGUMENTS", `region ${index} must be non-empty`);
  }
}

function canvasDims(workflow: Record<string, unknown>): { width: number; height: number } | null {
  for (const node of Object.values(workflow)) {
    if (node === null || typeof node !== "object") continue;
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (typeof inputs?.width === "number" && typeof inputs?.height === "number") {
      return { width: inputs.width, height: inputs.height };
    }
  }
  return null;
}

/** Store validated inpaint regions for one panel (replaces). */
export async function setInpaintRegions(root: string, input: { panelId: string; regions: Region[] }): Promise<Region[]> {
  requireProject(root);
  validateRegions(input.regions);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new InpaintError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      await runWithBusyRetry(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_inpaint_regions WHERE panel_id = ?").run(input.panelId);
          const insert = db.prepare("INSERT INTO panel_inpaint_regions (region_id, panel_id, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?)");
          for (const region of input.regions) {
            insert.run(crypto.randomUUID(), input.panelId, region.x, region.y, region.width, region.height);
          }
          db.exec("COMMIT");
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Surface the original error.
          }
          throw err;
        }
      });
      return input.regions;
    } finally {
      db.close();
    }
  });
}

/** The stored inpaint regions for one panel (in order). */
export async function getInpaintRegions(root: string, panelId: string): Promise<Region[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_inpaint_regions WHERE panel_id = ? ORDER BY rowid").all(panelId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height) }));
  } finally {
    db.close();
  }
}

/**
 * Repaint the latest artwork version's regions. The base
 * version row stays intact; the repaint is a new version.
 */
export async function inpaintPanel(
  root: string,
  input: { panelId: string; templateName: string; adapter: ProviderAdapter; prompt?: string; seed?: number }
): Promise<{ repaintId: string; artwork: { artworkId: string; versionNo: number; assetId: string } }> {
  requireProject(root);
  const regions = await getInpaintRegions(root, input.panelId);
  if (regions.length === 0) throw new InpaintError("NOT_FOUND", `No inpaint regions for panel: ${input.panelId}`);
  const versions = await listArtwork(root, input.panelId);
  if (versions.length === 0) throw new InpaintError("NOT_FOUND", `No artwork for panel: ${input.panelId}`);
  const base = versions[versions.length - 1];
  const storedPrompt = await getPanelPrompt(root, input.panelId);
  const prompt = input.prompt ?? storedPrompt?.prompt ?? "repaint inpainted regions";
  const template = await getTemplate(root, input.templateName);
  const dims = canvasDims(template.workflow);
  if (dims) {
    for (const [index, region] of regions.entries()) {
      if (region.x + region.width > dims.width || region.y + region.height > dims.height) {
        throw new InpaintError("INVALID_ARGUMENTS", `region ${index} exceeds canvas ${dims.width}x${dims.height}`);
      }
    }
  }

  const workflow = JSON.parse(JSON.stringify(template.workflow)) as Record<string, unknown>;
  let textNodes = 0;
  for (const node of Object.values(workflow)) {
    if (node === null || typeof node !== "object") continue;
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    const inputs = record.inputs ?? (record.inputs = {});
    if (typeof record.class_type === "string" && record.class_type.includes("CLIPTextEncode") && typeof inputs.text === "string") {
      textNodes++;
      if (textNodes === 1) inputs.text = prompt;
    }
    if (typeof record.class_type === "string" && record.class_type.includes("KSampler") && typeof inputs.seed === "number" && input.seed !== undefined) {
      inputs.seed = input.seed;
    }
    if (typeof record.class_type === "string" && record.class_type.includes("LoadImage")) {
      inputs.image = base.assetId;
    }
  }
  if (textNodes === 0) throw new InpaintError("WORKFLOW_INVALID", "template has no text-encode node to receive the prompt");

  const repaintId = crypto.randomUUID();
  const generationId = crypto.randomUUID();
  const now = new Date().toISOString();
  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new InpaintError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      await runWithBusyRetry(() =>
        db.prepare("INSERT INTO panel_generations (generation_id, panel_id, template_name, prompt, negative_prompt, conditioning, status, stage, error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          generationId,
          input.panelId,
          input.templateName,
          prompt,
          "",
          JSON.stringify({ operation: "inpaint", baseArtworkId: base.artworkId, regions }),
          "running",
          "generating",
          null,
          now,
          now
        )
      );
    } finally {
      db.close();
    }
  });

  const result = await runWorkflow(input.adapter, { taskId: generationId, workflow });
  const image = result.ok ? result.output.images[0] : undefined;
  if (!result.ok || typeof image !== "string") {
    await enqueueWrite(async () => {
      const { db } = openProjectDatabase(root);
      try {
        await runWithBusyRetry(() =>
          db.prepare("UPDATE panel_generations SET status = ?, error_code = ?, updated_at = ? WHERE generation_id = ?").run(
            "failed",
            result.ok ? "FAILED" : result.code,
            new Date().toISOString(),
            generationId
          )
        );
      } finally {
        db.close();
      }
    });
    throw new InpaintError(result.ok ? "FAILED" : (result.code as "FAILED"), result.ok ? "ComfyUI returned no image output" : result.message);
  }

  const scratchFile = path.join(os.tmpdir(), `panelforge-inpaint-${generationId}.png`);
  fs.writeFileSync(scratchFile, Buffer.from(image, "base64"));
  let asset;
  try {
    asset = await importAsset(root, {
      sourceAbsolutePath: scratchFile,
      assetType: "artwork",
      destinationRelative: `artwork/generated/${input.panelId}-${generationId}.png`,
    });
  } finally {
    fs.rmSync(scratchFile, { force: true });
  }

  let artwork: { artworkId: string; versionNo: number; assetId: string };
  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const versionNo = await runWithBusyRetry<number>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const count = db.prepare("SELECT COUNT(*) AS n FROM panel_artwork WHERE panel_id = ?").get(input.panelId) as Record<string, unknown>;
          const next = Number(count.n) + 1;
          const artworkId = crypto.randomUUID();
          db.prepare("INSERT INTO panel_artwork (artwork_id, panel_id, generation_id, version_no, asset_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            artworkId,
            input.panelId,
            generationId,
            next,
            asset.assetId,
            new Date().toISOString()
          );
          db.prepare("INSERT INTO panel_repaints (repaint_id, panel_id, base_artwork_id, regions_json, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            repaintId,
            input.panelId,
            base.artworkId,
            JSON.stringify(regions),
            prompt,
            new Date().toISOString()
          );
          db.prepare(
            `INSERT INTO artwork_provenance (artwork_id, template_name, template_hash, prompt, negative_prompt, seed, model, provider, "references", job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            artworkId,
            input.templateName,
            template.hash,
            prompt,
            "",
            input.seed ?? null,
            modelFromWorkflow(template.workflow),
            "comfyui",
            JSON.stringify({ operation: "inpaint", baseArtworkId: base.artworkId, regions }),
            generationId,
            new Date().toISOString()
          );
          db.exec("COMMIT");
          return next;
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Surface the original error.
          }
          throw err;
        }
      });
      const row = db.prepare("SELECT * FROM panel_artwork WHERE generation_id = ?").get(generationId) as Record<string, unknown>;
      artwork = { artworkId: String(row.artwork_id), versionNo, assetId: String(row.asset_id) };
    } finally {
      db.close();
    }
  });

  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => db.prepare("UPDATE panel_generations SET status = ?, stage = ?, updated_at = ? WHERE generation_id = ?").run("completed", "done", new Date().toISOString(), generationId));
    } finally {
      db.close();
    }
  });

  return { repaintId, artwork: artwork! };
}
