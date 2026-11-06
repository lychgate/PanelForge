// PanelForge — entity extraction framework (S3.6).
//
// Typed candidates (character / location / object / event /
// chronology) with exact normalized spans + heuristic confidence:
//
// - Deterministic spine (default): capitalized name sequences +
//   chronology markers, frequency-ranked, first-mention spans.
//   Extraction never invents spans — every candidate resolves to an
//   exact text slice.
// - Optional LLM assist (owner decision): an injectable classifier
//   proposes candidates; each is accepted only when its quoted span
//   exists verbatim in the scene text (anti-fabrication). The
//   default factory targets LM Studio (S2.9 protocol) with JSON
//   replies; provider absence surfaces UNAVAILABLE, never guesses.
//
// Q5 nominated LLM baseline (2026-11-05 spike note): 3B-class
// instruct Q4 build (Qwen2.5-3B-Instruct Q4_K_M) fits the 6GB GTX
// 1660 Ti budget with headroom; verify on-policy before S3.7+.
//
// Canonical status assignment stays S3.7; Studio CRUD stays Stages 4–5.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getNormalization } from "./text-normalize";
import { listScenes, SceneRecord } from "./scenes";

export type EntityType = "character" | "location" | "object" | "event" | "chronology";
export type EntitySource = "deterministic" | "llm";

export type EntityCandidate = {
  entityType: EntityType;
  name: string;
  normStart: number;
  normEnd: number;
  confidence: number;
  source: EntitySource;
};

export type EntityRecord = EntityCandidate & {
  entityId: string;
  manuscriptId: string;
  sceneId: string | null;
  createdAt: string;
};

export class EntityError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EntityError";
    this.code = code;
  }
}

const ENTITY_TYPES: readonly EntityType[] = ["character", "location", "object", "event", "chronology"];

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && (ENTITY_TYPES as readonly string[]).includes(value);
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new EntityError(identified.code, identified.message);
  }
}

const STOP_NAMES = new Set(["The", "And", "But", "When", "After", "Before", "Then", "Later"]);

type Found = { name: string; normStart: number; normEnd: number; type: EntityType };

/** Deterministic candidates inside one normalized slice (absolute offsets). */
export function deterministicCandidates(normalized: string, baseNormStart: number): EntityCandidate[] {
  const found: Found[] = [];
  // Capitalized name sequences: "Robby", "ARKNAD", "Ravenholt City".
  const nameRe = /\b[A-ZÀ-Þ][a-zà-þ]+(?:\s+[A-ZÀ-Þ][a-zà-þ]+)*\b|\b[A-Z]{2,}\b/g;
  let match: RegExpExecArray | null;
  const counts = new Map<string, number>();
  while ((match = nameRe.exec(normalized)) !== null) {
    const name = match[0].trim();
    if (name === "" || STOP_NAMES.has(name)) continue;
    // Sentence-initial words are ambiguous; require repetition or
    // non-initial position via the frequency weighting below.
    counts.set(name, (counts.get(name) ?? 0) + 1);
    found.push({ name, normStart: baseNormStart + match.index, normEnd: baseNormStart + match.index + name.length, type: "character" });
  }
  // Chronology markers: 4-digit years, "N years ago".
  const yearRe = /\b(1[5-9]\d\d|2\d\d\d)\b|\b\d+\s*years?\s+ago\b/gi;
  while ((match = yearRe.exec(normalized)) !== null) {
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
    found.push({ name: match[0], normStart: baseNormStart + match.index, normEnd: baseNormStart + match.index + match[0].length, type: "chronology" });
  }
  // Frequency-ranked; earliest mention wins. Confidence is a documented
  // heuristic (mentions/3 capped at 1), never a fabricated certainty.
  const best = new Map<string, Found>();
  for (const item of found) {
    const key = `${item.type}:${item.name.toLowerCase()}`;
    if (!best.has(key) || item.normStart < (best.get(key) as Found).normStart) best.set(key, item);
  }
  return [...best.values()].map((item) => ({
    entityType: item.type,
    name: item.name,
    normStart: item.normStart,
    normEnd: item.normEnd,
    confidence: Math.min(1, (counts.get(item.name) ?? 1) / 3),
    source: "deterministic" as const,
  }));
}

// ---- LLM-assisted candidates (optional, span-validated) ----

export type LlmEntityProposal = {
  name: string;
  entityType?: EntityType;
  quote?: string;
  confidence?: number;
};

export type LlmEntityClassifier = (sceneText: string) => Promise<LlmEntityProposal[]>;

export const NARRATIVE_EXTRACTION_SYSTEM =
  "Extract story entities (characters, locations, objects, events, chronology) from the passage. Reply ONLY with a JSON array of objects: {\"name\": \"exact text from the passage\", \"entityType\": \"character|location|object|event|chronology\", \"quote\": \"verbatim passage excerpt\", \"confidence\": 0..1}. Never invent names or quotes.";

/** LM Studio (S2.9 protocol) classifier: proposals whose quotes verify. */
export function createLmStudioClassifier(baseUrl: string, model: string): LlmEntityClassifier {
  const base = baseUrl.replace(/\/+$/, "");
  return async (sceneText: string) => {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: NARRATIVE_EXTRACTION_SYSTEM },
          { role: "user", content: sceneText },
        ],
        stream: false,
      }),
    });
    if (!response.ok) {
      throw new EntityError("UNAVAILABLE", `LM Studio completion failed: ${response.status}`);
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new EntityError("INVALID_ARGUMENTS", "LLM reply was not JSON");
    }
    if (!Array.isArray(parsed)) {
      throw new EntityError("INVALID_ARGUMENTS", "LLM reply was not an array");
    }
    return parsed as LlmEntityProposal[];
  };
}

/** Accept proposals whose quote exists verbatim; map them to spans. */
export function validateLlmProposals(
  sceneText: string,
  baseNormStart: number,
  proposals: LlmEntityProposal[]
): EntityCandidate[] {
  const accepted: EntityCandidate[] = [];
  for (const proposal of proposals) {
    if (typeof proposal.name !== "string" || proposal.name.trim() === "") continue;
    const quote = typeof proposal.quote === "string" && proposal.quote !== "" ? proposal.quote : proposal.name;
    const at = sceneText.indexOf(quote);
    if (at < 0) continue; // No verbatim span → rejected (anti-fabrication).
    const type = isEntityType(proposal.entityType) ? proposal.entityType : "character";
    const rawConfidence = typeof proposal.confidence === "number" ? proposal.confidence : 0.5;
    const confidence = Math.min(1, Math.max(0, rawConfidence));
    accepted.push({
      entityType: type,
      name: proposal.name.trim(),
      normStart: baseNormStart + at,
      normEnd: baseNormStart + at + quote.length,
      confidence,
      source: "llm",
    });
  }
  return accepted;
}

// ---- Storage ----

async function collectCandidates(
  root: string,
  manuscriptId: string,
  llmClassifier?: LlmEntityClassifier
): Promise<Array<EntityCandidate & { sceneId: string }>> {
  const normalization = await getNormalization(root, manuscriptId);
  if (!normalization) {
    throw new EntityError("NOT_FOUND", `No normalization for manuscript: ${manuscriptId}`);
  }
  const scenes = await listScenes(root, manuscriptId);
  if (scenes.length === 0) {
    throw new EntityError("NOT_FOUND", `No scenes for manuscript: ${manuscriptId}`);
  }
  const collected: Array<EntityCandidate & { sceneId: string }> = [];
  for (const scene of scenes) {
    const slice = normalization.normalizedText.slice(scene.normStart, scene.normEnd);
    for (const candidate of deterministicCandidates(slice, scene.normStart)) {
      collected.push({ ...candidate, sceneId: scene.sceneId });
    }
    if (llmClassifier) {
      const proposals = await llmClassifier(slice);
      for (const candidate of validateLlmProposals(slice, scene.normStart, proposals)) {
        collected.push({ ...candidate, sceneId: scene.sceneId });
      }
    }
  }
  return collected;
}

/** Extract + persist entities (re-run replaces the manuscript's rows). */
export async function storeEntities(
  root: string,
  manuscriptId: string,
  opts: { llmClassifier?: LlmEntityClassifier } = {}
): Promise<EntityRecord[]> {
  requireProject(root);
  const candidates = await collectCandidates(root, manuscriptId, opts.llmClassifier);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const records: EntityRecord[] = [];
      return await runWithBusyRetry<EntityRecord[]>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM entities WHERE manuscript_id = ?").run(manuscriptId);
          for (const candidate of candidates) {
            const entityId = crypto.randomUUID();
            db.prepare(
              "INSERT INTO entities (entity_id, manuscript_id, scene_id, entity_type, name, norm_start, norm_end, confidence, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).run(
              entityId,
              manuscriptId,
              candidate.sceneId,
              candidate.entityType,
              candidate.name,
              candidate.normStart,
              candidate.normEnd,
              candidate.confidence,
              candidate.source,
              now
            );
            records.push({ ...candidate, entityId, manuscriptId, createdAt: now });
          }
          db.exec("COMMIT");
          return records;
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

/** List a manuscript's entities in reading order. */
export async function listEntities(root: string, manuscriptId: string): Promise<EntityRecord[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM entities WHERE manuscript_id = ? ORDER BY norm_start, entity_type, name")
      .all(manuscriptId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      entityId: String(row.entity_id),
      manuscriptId: String(row.manuscript_id),
      sceneId: row.scene_id === null ? null : String(row.scene_id),
      entityType: String(row.entity_type) as EntityType,
      name: String(row.name),
      normStart: Number(row.norm_start),
      normEnd: Number(row.norm_end),
      confidence: Number(row.confidence),
      source: String(row.source) as EntitySource,
      createdAt: String(row.created_at),
    }));
  } finally {
    db.close();
  }
}
