// PanelForge — Art Studio: workflow templates (S7.2, spec §8.8).
//
// Reusable, versioned workflow definitions as portable
// project files:
//
// - `saveTemplate` writes `workflows/<slug>.json` (the
//   ComfyUI API-format node graph) and registers it
//   (name, relative path, sha256, version). Saving the
//   same name again replaces file + registry row (new
//   version).
// - `getTemplate` reads the file and verifies it against
//   the registered hash BEFORE returning: tampered →
//   TEMPLATE_TAMPERED, missing file → TEMPLATE_MISSING,
//   unknown name → NOT_FOUND. Nothing is ever handed to
//   the runner unverified.
// - Files live under `workflows/` (reserved by S1.1), so
//   copy/backup/restore carry them with the project.
// - Versions are strings ("v1", "2026-11"); the registry
//   keeps the latest per name (no history table).
//
// Prompt assembly stays S7.3.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export type WorkflowTemplate = {
  templateId: string;
  name: string;
  relativePath: string;
  hash: string;
  version: string;
  createdAt: string;
  updatedAt: string;
};

export type LoadedTemplate = WorkflowTemplate & {
  workflow: Record<string, unknown>;
};

export class TemplateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new TemplateError(identified.code, identified.message);
  }
}

function slugify(name: string): string {
  const slug = name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (slug === "") throw new TemplateError("INVALID_ARGUMENTS", `Template name is not portable: ${name}`);
  return slug;
}

function validateName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TemplateError("INVALID_ARGUMENTS", "Template name must not be empty");
  }
  if (/[/\\]/.test(name) || name.includes("..")) {
    throw new TemplateError("INVALID_ARGUMENTS", "Template name must not contain path separators");
  }
}

function validateWorkflow(workflow: unknown): asserts workflow is Record<string, unknown> {
  if (workflow === null || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new TemplateError("INVALID_ARGUMENTS", "workflow must be a ComfyUI API-format object");
  }
  if (Object.keys(workflow).length === 0) {
    throw new TemplateError("INVALID_ARGUMENTS", "workflow must not be empty");
  }
  try {
    JSON.stringify(workflow);
  } catch {
    throw new TemplateError("INVALID_ARGUMENTS", "workflow is not JSON-serializable");
  }
}

function toRecord(row: Record<string, unknown>): WorkflowTemplate {
  return {
    templateId: String(row.template_id),
    name: String(row.name),
    relativePath: String(row.relative_path),
    hash: String(row.hash),
    version: String(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sha256(bytes: string): string {
  return crypto.createHash("sha256").update(bytes, "utf8").digest("hex");
}

async function findByName(root: string, name: string): Promise<WorkflowTemplate | null> {
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM workflow_templates WHERE name = ?").get(name) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/**
 * Save (or replace) a named workflow template as a portable
 * file under `workflows/` plus a registry row.
 */
export async function saveTemplate(
  root: string,
  input: { name: string; workflow: Record<string, unknown>; version?: string }
): Promise<WorkflowTemplate> {
  requireProject(root);
  validateName(input.name);
  validateWorkflow(input.workflow);
  const version = input.version ?? "v1";
  if (typeof version !== "string" || version.trim() === "") {
    throw new TemplateError("INVALID_ARGUMENTS", "version must not be empty");
  }
  const relativePath = `workflows/${slugify(input.name)}.json`;
  const bytes = JSON.stringify(input.workflow, null, 2) + "\n";
  const hash = sha256(bytes);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const absolute = path.join(path.resolve(root), relativePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, bytes, "utf8");
      return await runWithBusyRetry<WorkflowTemplate>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const existing = db.prepare("SELECT template_id FROM workflow_templates WHERE name = ?").get(input.name) as Record<string, unknown> | undefined;
          if (existing) {
            db.prepare("UPDATE workflow_templates SET relative_path = ?, hash = ?, version = ?, updated_at = ? WHERE name = ?").run(
              relativePath,
              hash,
              version,
              now,
              input.name
            );
          } else {
            db.prepare("INSERT INTO workflow_templates (template_id, name, relative_path, hash, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
              crypto.randomUUID(),
              input.name,
              relativePath,
              hash,
              version,
              now,
              now
            );
          }
          const row = db.prepare("SELECT * FROM workflow_templates WHERE name = ?").get(input.name) as Record<string, unknown>;
          db.exec("COMMIT");
          return toRecord(row);
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

/** All templates in the registry, by name. */
export async function listTemplates(root: string): Promise<WorkflowTemplate[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM workflow_templates ORDER BY name").all() as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/**
 * Load a template after verifying its bytes against the
 * registered hash. Tampering or a missing file refuses with
 * a typed error — the workflow is never returned unverified.
 */
export async function getTemplate(root: string, name: string): Promise<LoadedTemplate> {
  requireProject(root);
  validateName(name);
  const template = await findByName(root, name);
  if (!template) throw new TemplateError("NOT_FOUND", `No workflow template named: ${name}`);
  const absolute = path.join(path.resolve(root), template.relativePath);
  if (!fs.existsSync(absolute)) {
    throw new TemplateError("TEMPLATE_MISSING", `Template file missing (registry holds ${template.relativePath}): ${name}`);
  }
  const bytes = fs.readFileSync(absolute, "utf8");
  if (sha256(bytes) !== template.hash) {
    throw new TemplateError("TEMPLATE_TAMPERED", `Template file hash mismatch (registered ${template.hash.slice(0, 12)}…): ${name}`);
  }
  let workflow: unknown;
  try {
    workflow = JSON.parse(bytes);
  } catch {
    throw new TemplateError("TEMPLATE_TAMPERED", `Template file is not valid JSON: ${name}`);
  }
  validateWorkflow(workflow);
  return { ...template, workflow };
}
