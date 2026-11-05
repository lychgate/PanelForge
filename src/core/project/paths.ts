// PanelForge — relative asset path service (S1.4).
//
// Stored project paths are canonical: relative to the project root with
// `/` separators (spec §7.2, D7). Native OS separators and symlinks are
// resolved ONLY at the filesystem boundary:
//
// - normalizeRelative() lexically canonicalizes a stored path
//   (collapses `//`, `.`, and internal `..`) and rejects anything that
//   cannot be stored safely: absolute paths, backslashes, and escapes.
// - resolveInProject() joins the canonical path against the project root
//   and verifies the SYMLINK-RESOLVED target still lands inside it — a
//   symlink pointing outside the project is rejected even when the
//   relative spelling looks valid (S1.4 acceptance clarification).
// - toStoragePath() is the inverse: filesystem path → canonical stored
//   form, rejected when outside the project.
//
// Non-existent files resolve by their parent (import flows address files
// that do not exist yet); canonicalization never requires existence.

import * as fs from "fs";
import * as path from "path";

export type PathErrorCode = "INVALID_PATH" | "NOT_RELATIVE" | "ESCAPES_ROOT";

export class PathError extends Error {
  code: PathErrorCode;
  constructor(code: PathErrorCode, message: string) {
    super(message);
    this.name = "PathError";
    this.code = code;
  }
}

/**
 * Lexically canonicalize a stored path. Throws PathError when the path
 * cannot be stored safely. Examples: "a//b/./c" → "a/b/c",
 * "characters/../locations/x" → "locations/x".
 */
export function normalizeRelative(input: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new PathError("INVALID_PATH", "Path must not be empty");
  }
  if (input.includes("\\")) {
    throw new PathError("INVALID_PATH", `Path must use '/' separators: ${JSON.stringify(input)}`);
  }
  if (path.posix.isAbsolute(input) || /^[A-Za-z]:/.test(input) || input.startsWith("//")) {
    throw new PathError("NOT_RELATIVE", `Path must be relative to the project root: ${JSON.stringify(input)}`);
  }
  const parts = input.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) {
        throw new PathError("ESCAPES_ROOT", `Path escapes the project root: ${JSON.stringify(input)}`);
      }
      out.pop();
      continue;
    }
    out.push(part);
  }
  if (out.length === 0) {
    throw new PathError("INVALID_PATH", `Path names nothing inside the project: ${JSON.stringify(input)}`);
  }
  return out.join("/");
}

function isWithinDir(rootReal: string, targetReal: string): boolean {
  return targetReal === rootReal || targetReal.startsWith(rootReal + path.sep);
}

/** Canonicalize a path that may not exist (parent must exist up to root). */
function canonicalizeForFs(root: string, joined: string): string {
  const normalized = path.resolve(joined);
  const base = path.resolve(root);
  const rel = path.relative(base, normalized);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathError("ESCAPES_ROOT", `Path escapes the project root: ${joined}`);
  }
  let existing = normalized;
  const tail: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    tail.unshift(path.basename(existing));
    existing = parent;
  }
  let real: string;
  try {
    real = fs.realpathSync(existing);
  } catch {
    throw new PathError("INVALID_PATH", `Path does not exist: ${joined}`);
  }
  const rootReal = fs.realpathSync(base);
  const targetReal = path.resolve(real, ...tail);
  if (!isWithinDir(rootReal, targetReal)) {
    throw new PathError("ESCAPES_ROOT", `Path escapes the project root (symlink?): ${joined}`);
  }
  return targetReal;
}

/**
 * Resolve a stored (canonical, relative) path to its filesystem path,
 * rejecting traversals AND symlink escapes (S1.4 acceptance).
 */
export function resolveInProject(root: string, relative: string): string {
  const canonical = normalizeRelative(relative);
  const joined = path.join(path.resolve(root), canonical);
  return canonicalizeForFs(root, joined);
}

/** Inverse of resolveInProject: filesystem path → canonical stored form. */
export function toStoragePath(root: string, absolutePath: string): string {
  if (!path.isAbsolute(absolutePath)) {
    throw new PathError("NOT_RELATIVE", `Expected an absolute filesystem path: ${absolutePath}`);
  }
  const targetReal = canonicalizeForFs(root, absolutePath);
  const rootReal = fs.realpathSync(path.resolve(root));
  const rel = path.relative(rootReal, targetReal);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathError("ESCAPES_ROOT", `Path is outside the project: ${absolutePath}`);
  }
  return rel.split(path.sep).join("/");
}
