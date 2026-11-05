// PanelForge — basic project operations (S1.3).
//
// Create, list, open, close, rename, and archive projects on top of the
// S1.1 folder format and S1.2 metadata schema. Each operation is an
// independent function on disk (no global project handle), with useful
// typed errors for invalid projects:
//
// - create: new folder under a parent dir + marker + metadata row.
// - list: scan a parent dir; valid projects only (unreadable entries
//   are skipped, never fatal to the whole list).
// - open/close: in-process exclusivity — an open project rejects a
//   second open, and rename/archive while open are rejected. "Open"
//   means the metadata is loadable and the project is marked open.
// - rename: renames the folder AND updates the metadata name; the
//   project ID (identity) never changes.
// - archive: moves the project into <parent>/.archived/<folder> so it
//   leaves the active library; restoring is not part of S1.3.
//
// Semantics not specified by the spec (archive move target, exclusivity)
// are engineering judgment, recorded in Docs/PanelForge-Project-Format.md.

import * as fs from "fs";
import * as path from "path";
import { createProject, identifyProject } from "./service";
import { createProjectMetadata, getProjectMetadata, updateProjectMetadata } from "./metadata";

export type ProjectSummary = {
  root: string;
  projectId: string;
  name: string;
};

export type ProjectOperationCode =
  | "INVALID_NAME"
  | "INVALID_ARGUMENTS"
  | "NOT_FOUND"
  | "NOT_A_PROJECT"
  | "CORRUPT_MARKER"
  | "UNSUPPORTED_VERSION"
  | "ALREADY_OPEN"
  | "ALREADY_CLOSED"
  | "ALREADY_EXISTS"
  | "INVALID_STATE";

export class ProjectOpError extends Error {
  code: ProjectOperationCode;
  constructor(code: ProjectOperationCode, message: string) {
    super(message);
    this.name = "ProjectOpError";
    this.code = code;
  }
}

const NAME_OK = /^[^/\\]+$/;

export function validateProjectName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || !NAME_OK.test(trimmed)) {
    throw new ProjectOpError("INVALID_NAME", `Invalid project name: ${JSON.stringify(name)}`);
  }
  return trimmed;
}

export type ProjectManager = {
  isOpen: (root: string) => boolean;
  open: (root: string) => string[]; // returns the open set (for tests)
  close: (root: string) => void;
};

export function createProjectManager(): ProjectManager {
  const open = new Set<string>();
  const norm = (root: string) => path.resolve(root);
  return {
    isOpen: (root) => open.has(norm(root)),
    open: (root) => {
      const key = norm(root);
      if (open.has(key)) throw new ProjectOpError("ALREADY_OPEN", `Project is already open: ${key}`);
      open.add(key);
      return [...open];
    },
    close: (root) => {
      const key = norm(root);
      if (!open.has(key)) throw new ProjectOpError("ALREADY_CLOSED", `Project is not open: ${key}`);
      open.delete(key);
    },
  };
}

/** Create a new project folder under parentDir with the given name. */
export async function createProjectAt(
  parentDir: string,
  name: string,
  opts: { description?: string | null } = {}
): Promise<{ root: string; projectId: string }> {
  if (typeof parentDir !== "string" || parentDir.trim() === "") {
    throw new ProjectOpError("INVALID_ARGUMENTS", "parentDir must not be empty");
  }
  const folder = validateProjectName(name);
  const root = path.join(path.resolve(parentDir), folder);
  if (fs.existsSync(root)) {
    throw new ProjectOpError("ALREADY_EXISTS", `Project already exists: ${root}`);
  }
  fs.mkdirSync(parentDir, { recursive: true });
  const metadata = createProject(root);
  const record = await createProjectMetadata(root, {
    name: folder,
    description: opts.description ?? null,
  });
  return { root, projectId: record.projectId };
}

/** List valid projects under parentDir (sorted by folder name). */
export async function listProjects(parentDir: string): Promise<ProjectSummary[]> {
  if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
    throw new ProjectOpError("NOT_FOUND", `Projects directory does not exist: ${parentDir}`);
  }
  const summaries: ProjectSummary[] = [];
  for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const root = path.join(parentDir, entry.name);
    const identified = identifyProject(root);
    if (!identified.ok) continue;
    const record = await getProjectMetadata(root);
    summaries.push({
      root: path.resolve(root),
      projectId: identified.metadata.projectId,
      name: record ? record.name : "",
    });
  }
  return summaries.sort((a, b) => a.root.localeCompare(b.root));
}

/** Open a project: must be valid, must load its metadata, marks it open. */
export async function openProject(
  root: string,
  manager: ProjectManager
): Promise<ProjectSummary> {
  const identified = identifyProject(root);
  if (!identified.ok) throw new ProjectOpError(identified.code, identified.message);
  const record = await getProjectMetadata(root);
  manager.open(root);
  return { root: path.resolve(root), projectId: identified.metadata.projectId, name: record?.name ?? "" };
}

export function closeProject(root: string, manager: ProjectManager): void {
  manager.close(root);
}

/** Rename a project: folder + metadata name; the project ID never changes. */
export async function renameProject(
  root: string,
  newName: string,
  manager: ProjectManager
): Promise<{ root: string; projectId: string }> {
  const identified = identifyProject(root);
  if (!identified.ok) throw new ProjectOpError(identified.code, identified.message);
  if (manager.isOpen(root)) {
    throw new ProjectOpError("INVALID_STATE", "Close the project before renaming it");
  }
  const folder = validateProjectName(newName);
  const parentDir = path.dirname(path.resolve(root));
  const newRoot = path.join(parentDir, folder);
  if (fs.existsSync(newRoot)) {
    throw new ProjectOpError("ALREADY_EXISTS", `Project already exists: ${newRoot}`);
  }
  fs.renameSync(root, newRoot);
  await updateProjectMetadata(newRoot, { name: folder });
  return { root: newRoot, projectId: identified.metadata.projectId };
}

/** Archive a project: move it out of the active library into .archived. */
export async function archiveProject(
  root: string,
  manager: ProjectManager
): Promise<{ root: string; projectId: string }> {
  const identified = identifyProject(root);
  if (!identified.ok) throw new ProjectOpError(identified.code, identified.message);
  if (manager.isOpen(root)) {
    throw new ProjectOpError("INVALID_STATE", "Close the project before archiving it");
  }
  const parentDir = path.dirname(path.resolve(root));
  const archiveDir = path.join(parentDir, ".archived");
  const folder = path.basename(path.resolve(root));
  const dest = path.join(archiveDir, folder);
  if (fs.existsSync(dest)) {
    throw new ProjectOpError("ALREADY_EXISTS", `Archived project already exists: ${dest}`);
  }
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(root, dest);
  return { root: dest, projectId: identified.metadata.projectId };
}

// Default singleton used by the IPC layer (main process).
export const defaultProjectManager = createProjectManager();
