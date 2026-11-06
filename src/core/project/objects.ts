// PanelForge — Object Studio: profile records (S5.4, spec §8.6).
//
// Object profiles following the S4.1/S5.1 pattern:
//
// - `createObject` / `updateObject` / `deleteObject` CRUD over
//   name (required), description, dimensions, materials,
//   appearance, damage states, and category hint (weapons,
//   tools, vehicles, equipment, personal belongings, technology,
//   story artifacts — free text until a category vote lands).
//   Every field except name is optional structured text; omitted
//   fields store as "".
// - Identity (`objectId`, `createdAt`) never changes.
//
// Variations stay S5.5; references stay S5.6; the entity bridge
// stays S5.7.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type ObjectProfile = {
  objectId: string;
  name: string;
  description: string;
  dimensions: string;
  materials: string;
  appearance: string;
  damageStates: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type ObjectInput = {
  name: string;
  description?: string;
  dimensions?: string;
  materials?: string;
  appearance?: string;
  damageStates?: string;
  category?: string;
};

export class ObjectProfileError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ObjectProfileError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ObjectProfileError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): ObjectProfile {
  return {
    objectId: String(row.object_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    dimensions: String(row.dimensions ?? ""),
    materials: String(row.materials ?? ""),
    appearance: String(row.appearance ?? ""),
    damageStates: String(row.damage_states ?? ""),
    category: String(row.category ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: ObjectInput, partial: boolean): void {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new ObjectProfileError("INVALID_ARGUMENTS", "name must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "name") continue;
    if (value !== undefined && typeof value !== "string") {
      throw new ObjectProfileError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
}

/** Create an object profile. */
export async function createObject(root: string, input: ObjectInput): Promise<ObjectProfile> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const objectId = crypto.randomUUID();
      return await runWithBusyRetry<ObjectProfile>(() => {
        db.prepare(
          "INSERT INTO objects (object_id, name, description, dimensions, materials, appearance, damage_states, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          objectId,
          input.name.trim(),
          input.description ?? "",
          input.dimensions ?? "",
          input.materials ?? "",
          input.appearance ?? "",
          input.damageStates ?? "",
          input.category ?? "",
          now,
          now
        );
        const row = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one object profile, or null. */
export async function getObject(root: string, objectId: string): Promise<ObjectProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all object profiles (creation order). */
export async function listObjects(root: string): Promise<ObjectProfile[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM objects ORDER BY created_at, object_id").all() as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update an object profile's fields (partial merges; identity never changes). */
export async function updateObject(root: string, objectId: string, patch: ObjectInput): Promise<ObjectProfile> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId) as Record<string, unknown> | undefined;
      if (!current) throw new ObjectProfileError("NOT_FOUND", `No object with id: ${objectId}`);
      const merged: ObjectInput & Record<string, unknown> = {
        name: patch.name ?? String(current.name),
        description: patch.description ?? String(current.description ?? ""),
        dimensions: patch.dimensions ?? String(current.dimensions ?? ""),
        materials: patch.materials ?? String(current.materials ?? ""),
        appearance: patch.appearance ?? String(current.appearance ?? ""),
        damageStates: patch.damageStates ?? String(current.damage_states ?? ""),
        category: patch.category ?? String(current.category ?? ""),
      };
      return await runWithBusyRetry<ObjectProfile>(() => {
        db.prepare(
          "UPDATE objects SET name = ?, description = ?, dimensions = ?, materials = ?, appearance = ?, damage_states = ?, category = ?, updated_at = ? WHERE object_id = ?"
        ).run(
          (merged.name as string).trim(),
          merged.description as string,
          merged.dimensions as string,
          merged.materials as string,
          merged.appearance as string,
          merged.damageStates as string,
          merged.category as string,
          now,
          objectId
        );
        const row = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Delete an object profile. */
export async function deleteObject(root: string, objectId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId);
        if (!current) throw new ObjectProfileError("NOT_FOUND", `No object with id: ${objectId}`);
        db.prepare("DELETE FROM objects WHERE object_id = ?").run(objectId);
      });
    } finally {
      db.close();
    }
  });
}
