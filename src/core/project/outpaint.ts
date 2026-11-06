// PanelForge — Art Studio: outpainting (S7.9, spec §8.8).
//
// Extend canvas beyond the frame:
//
// - `setOutpaintExtension` stores validated pixels-per-side
//   for one panel (replacing): non-negative integers; the
//   resulting canvas (template dims + extension) must fit
//   the Small GPU envelope (1024 max dimension).
// - `outpaintPanel` outpaints the latest artwork version:
//   extension request → S7.1 dispatch → result bytes →
//   new artwork version. The base version's row stays
//   intact; results are distinct preserved versions.
// - Aspect ratio adjustment stays S7.10.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getPanelPrompt } from "./prompt-assembly";
import { getTemplate } from "./workflow-templates";
import { listArtwork } from "./panel-generation";
import { importAsset } from "./registry";
import { runWorkflow } from "../../engines/provider/comfyui-client";
import type { ProviderAdapter } from "../../engines/provider/types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

export const OUTPAINT_ENVELOPE = 1024;

export type Extension = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export class OutpaintError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OutpaintError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new OutpaintError(identified.code, identified.message);
  }
}

function validateExtension(extension: Extension): void {
  if (!extension || typeof extension !== "object") {
    throw new OutpaintError("INVALID_ARGUMENTS", "extension must be an object");
  }
  let total = 0;
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const value = extension[side];
    if (!Number.isInteger(value) || value < 0) {
      throw new OutpaintError("INVALID_ARGUMENTS", `extension.${side} must be a non-negative integer`);
    }
    total += value;
  }
  if (total === 0) throw new OutpaintError("INVALID_ARGUMENTS", "at least one side must extend");
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

/** Store validated extension pixels-per-side for one panel (replaces). */
export async function setOutpaintExtension(root: string, input: { panelId: string; extension: Extension }): Promise<Extension> {
  requireProject(root);
  validateExtension(input.extension);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new OutpaintError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      await runWithBusyRetry(() =>
        db.prepare(
          "INSERT OR REPLACE INTO panel_outpaint (panel_id, ext_left, ext_right, ext_top, ext_bottom, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(input.panelId, input.extension.left, input.extension.right, input.extension.top, input.extension.bottom, new Date().toISOString())
      );
      return input.extension;
    } finally {
      db.close();
    }
  });
}

/** The stored extension pixels-per-side for one panel, or null. */
export async function getOutpaintExtension(root: string, panelId: string): Promise<Extension | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_outpaint WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { left: Number(row.ext_left), right: Number(row.ext_right), top: Number(row.ext_top), bottom: Number(row.ext_bottom) };
  } finally {
    db.close();
  }
}

/**
 * Outpaint the latest artwork version with the stored
 * extension → new artwork version (base row untouched).
 */
export async function outpaintPanel(
  root: string,
  input: { panelId: string; templateName: string; adapter: ProviderAdapter; prompt?: string; seed?: number }
): Promise<{ outpaintId: string; artwork: { artworkId: string; versionNo: number; assetId: string } }> {
  requireProject(root);
  const extension = await getOutpaintExtension(root, input.panelId);
  if (!extension) throw new OutpaintError("NOT_FOUND", `No outpaint extension for panel: ${input.panelId}`);
  const versions = await listArtwork(root, input.panelId);
  if (versions.length === 0) throw new OutpaintError("NOT_FOUND", `No artwork for panel: ${input.panelId}`);
  const base = versions[versions.length - 1];
  const storedPrompt = await getPanelPrompt(root, input.panelId);
  const prompt = input.prompt ?? storedPrompt?.prompt ?? "outpaint extended canvas";
  const template = await getTemplate(root, input.templateName);
  const dims = canvasDims(template.workflow);
  if (dims) {
    if (dims.width + extension.left + extension.right > OUTPAINT_ENVELOPE || dims.height + extension.top + extension.bottom > OUTPAINT_ENVELOPE) {
      throw new OutpaintError("INVALID_ARGUMENTS", `extended canvas exceeds the ${OUTPAINT_ENVELOPE}px envelope`);
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
  }
  if (textNodes === 0) throw new OutpaintError("WORKFLOW_INVALID", "template has no text-encode node to receive the prompt");

  const generationId = crypto.randomUUID();
  const outpaintId = crypto.randomUUID();
  const now = new Date().toISOString();
  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new OutpaintError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      await runWithBusyRetry(() =>
        db.prepare("INSERT INTO panel_generations (generation_id, panel_id, template_name, prompt, negative_prompt, conditioning, status, stage, error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          generationId,
          input.panelId,
          input.templateName,
          prompt,
          "",
          JSON.stringify({ operation: "outpaint", baseArtworkId: base.artworkId, extension }),
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
    throw new OutpaintError(result.ok ? "FAILED" : (result.code as "FAILED"), result.ok ? "ComfyUI returned no image output" : result.message);
  }

  const scratchFile = path.join(os.tmpdir(), `panelforge-outpaint-${generationId}.png`);
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
          db.prepare("INSERT INTO panel_outpaints (outpaint_id, panel_id, base_artwork_id, extension_json, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            outpaintId,
            input.panelId,
            base.artworkId,
            JSON.stringify(extension),
            prompt,
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

  return { outpaintId, artwork: artwork! };
}
