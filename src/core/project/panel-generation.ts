// PanelForge — Art Studio: individual panel generation (S7.6, spec §8.8).
//
// Dispatch engine: request → S7.1 → result bytes → S1.5
// asset import → artwork row.
//
// - `generatePanel` assembles the job from the stored
//   S7.3 prompt + S7.4 negative + S7.5 conditioning, fills
//   the S7.2 template's text nodes (prompt → first text
//   encode, negative → second), dispatches through the
//   gated S7.1 client, and imports the harvested image
//   bytes as an asset.
// - Every run is a new artwork version (version_no = count
//   + 1 per panel); regeneration never overwrites. The
//   job's stage chain (preparing/generating/saving) is
//   visible on the generation row.
// - Failed runs record `failed` + typed code; bytes never
//   half-stored (asset import or nothing).
// - Variations stay S7.7.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getPanelPrompt } from "./prompt-assembly";
import { getPanelNegativePrompt } from "./negative-prompts";
import { getConditioning } from "./reference-conditioning";
import { getTemplate } from "./workflow-templates";
import { importAsset } from "./registry";
import { runWorkflow } from "../../engines/provider/comfyui-client";
import type { ProviderAdapter, ProviderProgress } from "../../engines/provider/types";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

export type PanelArtwork = {
  artworkId: string;
  panelId: string;
  generationId: string;
  versionNo: number;
  assetId: string;
  createdAt: string;
};

export type PanelGeneration = {
  generationId: string;
  panelId: string;
  templateName: string;
  prompt: string;
  negativePrompt: string;
  conditioning: string;
  status: "running" | "completed" | "failed";
  stage: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export class GenerationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new GenerationError(identified.code, identified.message);
  }
}

function toGeneration(row: Record<string, unknown>): PanelGeneration {
  return {
    generationId: String(row.generation_id),
    panelId: String(row.panel_id),
    templateName: String(row.template_name),
    prompt: String(row.prompt),
    negativePrompt: String(row.negative_prompt ?? ""),
    conditioning: String(row.conditioning ?? ""),
    status: String(row.status) as PanelGeneration["status"],
    stage: String(row.stage ?? ""),
    errorCode: row.error_code === null || row.error_code === undefined ? null : String(row.error_code),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Fill a template graph with the job's prompt/negative/seed/dims. */
function fillWorkflow(
  template: Record<string, unknown>,
  prompt: string,
  negativePrompt: string,
  seed?: number,
  dims?: { width: number; height: number }
): Record<string, unknown> {
  const workflow = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;
  let textNodes = 0;
  for (const node of Object.values(workflow)) {
    if (node === null || typeof node !== "object") continue;
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    const inputs = record.inputs ?? (record.inputs = {});
    if (typeof record.class_type === "string" && record.class_type.includes("CLIPTextEncode") && typeof inputs.text === "string") {
      textNodes++;
      inputs.text = textNodes === 1 ? prompt : negativePrompt;
    }
    if (typeof record.class_type === "string" && record.class_type.includes("KSampler")) {
      if (typeof inputs.seed === "number" && seed !== undefined) inputs.seed = seed;
      if (dims) {
        inputs.width = dims.width;
        inputs.height = dims.height;
      }
    }
  }
  if (textNodes === 0) {
    throw new GenerationError("WORKFLOW_INVALID", "template has no text-encode node to receive the prompt");
  }
  return workflow;
}

/**
 * Generate one panel's artwork. Regeneration appends a
 * new version; nothing is ever overwritten.
 */
export async function generatePanel(
  root: string,
  input: { panelId: string; templateName: string; adapter: ProviderAdapter; seed?: number; dims?: { width: number; height: number } }
): Promise<{ generation: PanelGeneration; artwork: PanelArtwork }> {
  requireProject(root);
  if (typeof input.panelId !== "string" || input.panelId.trim() === "") {
    throw new GenerationError("INVALID_ARGUMENTS", "panelId must not be empty");
  }
  const storedPrompt = await getPanelPrompt(root, input.panelId);
  if (!storedPrompt) throw new GenerationError("NOT_FOUND", `No prompt assembled for panel: ${input.panelId}`);
  const storedNegative = await getPanelNegativePrompt(root, input.panelId);
  const negativePrompt = storedNegative?.negative ?? "";
  const conditioning = await getConditioning(root, input.panelId);
  const conditioningJson = conditioning ? JSON.stringify(conditioning) : "";
  const template = await getTemplate(root, input.templateName);
  const workflow = fillWorkflow(template.workflow, storedPrompt.prompt, negativePrompt, input.seed, input.dims);

  const now = new Date().toISOString();
  const generationId = crypto.randomUUID();
  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new GenerationError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      await runWithBusyRetry(() =>
        db.prepare("INSERT INTO panel_generations (generation_id, panel_id, template_name, prompt, negative_prompt, conditioning, status, stage, error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          generationId,
          input.panelId,
          input.templateName,
          storedPrompt.prompt,
          negativePrompt,
          conditioningJson,
          "running",
          "preparing",
          null,
          now,
          now
        )
      );
    } finally {
      db.close();
    }
  });

  const setStage = async (stage: string): Promise<void> => {
    await enqueueWrite(async () => {
      const { db } = openProjectDatabase(root);
      try {
        await runWithBusyRetry(() => db.prepare("UPDATE panel_generations SET stage = ?, updated_at = ? WHERE generation_id = ?").run(stage, new Date().toISOString(), generationId));
      } finally {
        db.close();
      }
    });
  };

  const fail = async (code: string, message: string): Promise<void> => {
    await enqueueWrite(async () => {
      const { db } = openProjectDatabase(root);
      try {
        await runWithBusyRetry(() =>
          db.prepare("UPDATE panel_generations SET status = ?, error_code = ?, updated_at = ? WHERE generation_id = ?").run("failed", code, new Date().toISOString(), generationId)
        );
      } finally {
        db.close();
      }
    });
    throw new GenerationError(code as "FAILED", message);
  };

  const onProgress = (progress: ProviderProgress): void => {
    void setStage(progress.stage);
  };
  const result = await runWorkflow(input.adapter, {
    taskId: generationId,
    workflow,
    onProgress,
  });
  if (!result.ok) {
    await fail(result.code, result.message);
  }
  const image = result.ok ? result.output.images[0] : undefined;
  if (!result.ok || typeof image !== "string") {
    await fail("FAILED", "ComfyUI returned no image output");
  }

  const scratchFile = path.join(os.tmpdir(), `panelforge-gen-${generationId}.png`);
  fs.writeFileSync(scratchFile, Buffer.from(image!, "base64"));
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
  await setStage("saving");

  let artwork: PanelArtwork;
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
      artwork = {
        artworkId: String(row.artwork_id),
        panelId: String(row.panel_id),
        generationId: String(row.generation_id),
        versionNo,
        assetId: String(row.asset_id),
        createdAt: String(row.created_at),
      };
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

  return { generation: (await getGeneration(root, generationId))!, artwork: artwork! };
}

/** All artwork versions of one panel, oldest first. */
export async function listArtwork(root: string, panelId: string): Promise<PanelArtwork[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_artwork WHERE panel_id = ? ORDER BY version_no").all(panelId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      artworkId: String(row.artwork_id),
      panelId: String(row.panel_id),
      generationId: String(row.generation_id),
      versionNo: Number(row.version_no),
      assetId: String(row.asset_id),
      createdAt: String(row.created_at),
    }));
  } finally {
    db.close();
  }
}

/** All generation jobs of one panel, oldest first (stage chain visible). */
export async function listGenerations(root: string, panelId: string): Promise<PanelGeneration[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_generations WHERE panel_id = ? ORDER BY created_at, generation_id").all(panelId) as Array<Record<string, unknown>>;
    return rows.map(toGeneration);
  } finally {
    db.close();
  }
}

/** One generation job, or null. */
export async function getGeneration(root: string, generationId: string): Promise<PanelGeneration | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_generations WHERE generation_id = ?").get(generationId) as Record<string, unknown> | undefined;
    return row ? toGeneration(row) : null;
  } finally {
    db.close();
  }
}
