// PanelForge — canon classification (S3.7, spec §2.7).
//
// Canon is not speculation. Every entity extraction takes exactly one
// of four statuses:
//
// - explicit: stated verbatim by the manuscript (canon).
// - interpretation: a reasonable reading (not canon until promoted).
// - suggestion: AI-generated (never canon until promoted).
// - unknown: contradictory or unverifiable (never canon, never merged).
//
// `canonQuery` satisfies only explicit rows — suggestions and
// interpretations cannot satisfy it until an explicit user promotion
// (always with a rationale) moves them. Contradictions surface as
// unknown: an explicit claim whose span conflicts with a prior
// explicit claim for the same name+type is recorded as unknown with
// the conflict cited, never silently merged.
//
// Continuity scoring stays Stage 9.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { listEntities, EntityRecord } from "./entities";

export type CanonStatus = "explicit" | "interpretation" | "suggestion" | "unknown";

export type CanonRecord = {
  canonId: string;
  entityId: string;
  status: CanonStatus;
  rationale: string;
  classifiedAt: string;
  promotedAt: string | null;
};

export class CanonError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CanonError";
    this.code = code;
  }
}

const STATUSES: readonly CanonStatus[] = ["explicit", "interpretation", "suggestion", "unknown"];

export function isCanonStatus(value: unknown): value is CanonStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CanonError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): CanonRecord {
  return {
    canonId: String(row.canon_id),
    entityId: String(row.entity_id),
    status: String(row.status) as CanonStatus,
    rationale: String(row.rationale),
    classifiedAt: String(row.classified_at),
    promotedAt: row.promoted_at === null ? null : String(row.promoted_at),
  };
}

/**
 * Classify one entity. An explicit claim conflicting with a prior
 * explicit claim (same name+type, different span) records unknown
 * instead — contradictions never merge.
 */
export async function classifyEntity(
  root: string,
  entityId: string,
  status: CanonStatus,
  rationale: string
): Promise<CanonRecord> {
  requireProject(root);
  if (!isCanonStatus(status)) {
    throw new CanonError("INVALID_ARGUMENTS", `Unknown canon status: ${String(status)}`);
  }
  if (typeof rationale !== "string" || rationale.trim() === "") {
    throw new CanonError("INVALID_ARGUMENTS", "rationale must not be empty");
  }
  const { db: lookupDb } = openProjectDatabase(root);
  let entity: EntityRecord | null = null;
  try {
    const row = lookupDb.prepare("SELECT * FROM entities WHERE entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
    if (row) {
      entity = {
        entityId: String(row.entity_id),
        manuscriptId: String(row.manuscript_id),
        sceneId: row.scene_id === null ? null : String(row.scene_id),
        entityType: String(row.entity_type) as EntityRecord["entityType"],
        name: String(row.name),
        normStart: Number(row.norm_start),
        normEnd: Number(row.norm_end),
        confidence: Number(row.confidence),
        source: String(row.source) as EntityRecord["source"],
        createdAt: String(row.created_at),
      };
    }
  } finally {
    lookupDb.close();
  }
  if (!entity) throw new CanonError("NOT_FOUND", `No entity with id: ${entityId}`);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      let effective: CanonStatus = status;
      let effectiveRationale = rationale;
      if (status === "explicit") {
        // Conflict = another explicit claim for the same name+type in
        // the SAME manuscript but a different span. Spans across
        // manuscripts are incomparable (not conflicts).
        const prior = db
          .prepare(
            `SELECT c.* FROM canon c JOIN entities e ON e.entity_id = c.entity_id
             WHERE c.status = 'explicit' AND e.manuscript_id = ?
               AND e.entity_type = ? AND lower(e.name) = lower(?)
               AND (e.norm_start != ? OR e.norm_end != ?) LIMIT 1`
          )
          .get(entity.manuscriptId, entity.entityType, entity.name, entity.normStart, entity.normEnd) as Record<string, unknown> | undefined;
        if (prior) {
          effective = "unknown";
          effectiveRationale = `contradicts explicit ${String(prior.canon_id)}: ${rationale}`;
        }
      }
      return await runWithBusyRetry<CanonRecord>(() => {
        // One current classification per entity (upsert).
        const existing = db.prepare("SELECT * FROM canon WHERE entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
        if (existing) {
          db.prepare("UPDATE canon SET status = ?, rationale = ?, classified_at = ?, promoted_at = NULL WHERE entity_id = ?")
            .run(effective, effectiveRationale, now, entityId);
          const row = db.prepare("SELECT * FROM canon WHERE entity_id = ?").get(entityId);
          return toRecord(row as Record<string, unknown>);
        }
        const canonId = crypto.randomUUID();
        db.prepare("INSERT INTO canon (canon_id, entity_id, status, rationale, classified_at, promoted_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(canonId, entityId, effective, effectiveRationale, now, null);
        const row = db.prepare("SELECT * FROM canon WHERE canon_id = ?").get(canonId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}



/** Explicit user promotion: suggestion/interpretation → explicit, with rationale. */
export async function promoteToCanon(
  root: string,
  entityId: string,
  rationale: string
): Promise<CanonRecord> {
  requireProject(root);
  if (typeof rationale !== "string" || rationale.trim() === "") {
    throw new CanonError("INVALID_ARGUMENTS", "promotion rationale must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const existing = db.prepare("SELECT * FROM canon WHERE entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
      if (!existing) throw new CanonError("NOT_FOUND", `No classification for entity: ${entityId}`);
      if (String(existing.status) === "explicit") {
        return toRecord(existing);
      }
      if (String(existing.status) === "unknown") {
        throw new CanonError("INVALID_ARGUMENTS", "unknown contradictions cannot be promoted (re-classify with corrected span)");
      }
      return await runWithBusyRetry<CanonRecord>(() => {
        db.prepare("UPDATE canon SET status = 'explicit', rationale = ?, promoted_at = ? WHERE entity_id = ?")
          .run(`${rationale} (promoted)`, now, entityId);
        const row = db.prepare("SELECT * FROM canon WHERE entity_id = ?").get(entityId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/**
 * Canon lookup: only explicit rows satisfy, newest first. Suggestions
 * and interpretations are invisible here until promoted.
 */
export async function canonQuery(
  root: string,
  query: { entityType?: string; name?: string } = {}
): Promise<Array<CanonRecord & { entity: EntityRecord }>> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const conditions = ["c.status = 'explicit'"];
    const params: unknown[] = [];
    if (query.entityType) {
      conditions.push("e.entity_type = ?");
      params.push(query.entityType);
    }
    if (query.name) {
      conditions.push("lower(e.name) = lower(?)");
      params.push(query.name);
    }
    const rows = db
      .prepare(
        `SELECT c.* FROM canon c JOIN entities e ON e.entity_id = c.entity_id
         WHERE ${conditions.join(" AND ")} ORDER BY c.classified_at DESC`
      )
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const entityRow = db.prepare("SELECT * FROM entities WHERE entity_id = ?").get(String(row.entity_id)) as Record<string, unknown>;
      return {
        ...toRecord(row),
        entity: {
          entityId: String(entityRow.entity_id),
          manuscriptId: String(entityRow.manuscript_id),
          sceneId: entityRow.scene_id === null ? null : String(entityRow.scene_id),
          entityType: String(entityRow.entity_type) as EntityRecord["entityType"],
          name: String(entityRow.name),
          normStart: Number(entityRow.norm_start),
          normEnd: Number(entityRow.norm_end),
          confidence: Number(entityRow.confidence),
          source: String(entityRow.source) as EntityRecord["source"],
          createdAt: String(entityRow.created_at),
        },
      };
    });
  } finally {
    db.close();
  }
}

/** All classifications for one entity, oldest first. */
export async function listCanon(root: string, entityId: string): Promise<CanonRecord[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM canon WHERE entity_id = ? ORDER BY classified_at")
      .all(entityId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}
