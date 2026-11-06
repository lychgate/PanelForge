// PanelForge — Character Studio: reference comparison (S4.10, spec §8.4).
//
// Read-only side-by-side of two versions of one character:
//
// - `compareVersions` returns slot-by-slot reference sets (asset IDs
//   and counts per slot), the approval states of both versions,
//   and the field diffs (appearance/age/clothing, version override
//   falling back to the profile).
// - Comparison never mutates: it opens the database read-only.
// - A pair from different characters rejects with INVALID_ARGUMENTS;
//   unknown versions reject with NOT_FOUND.
//
// Character history stays S4.11.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { ReferenceSlot } from "./version-references";

export type SlotComparison = {
  slot: ReferenceSlot;
  a: string[];
  b: string[];
  same: boolean;
  onlyIn: "a" | "b" | null;
};

export type FieldDiff = {
  field: "physicalAppearance" | "age" | "clothing";
  a: string;
  b: string;
};

export type VersionComparison = {
  characterId: string;
  a: { versionId: string; label: string; approval: string };
  b: { versionId: string; label: string; approval: string };
  slots: SlotComparison[];
  fieldDiffs: FieldDiff[];
  identical: boolean;
};

export class ComparisonError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ComparisonError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ComparisonError(identified.code, identified.message);
  }
}

const SLOTS: ReferenceSlot[] = ["portrait", "front", "side", "rear", "expression", "pose", "clothing", "equipment"];

/** Compare two versions of one character. Read-only; no mutation. */
export async function compareVersions(root: string, versionAId: string, versionBId: string): Promise<VersionComparison> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const a = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionAId) as Record<string, unknown> | undefined;
    const b = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionBId) as Record<string, unknown> | undefined;
    if (!a) throw new ComparisonError("NOT_FOUND", `No version with id: ${versionAId}`);
    if (!b) throw new ComparisonError("NOT_FOUND", `No version with id: ${versionBId}`);
    if (String(a.character_id) !== String(b.character_id)) {
      throw new ComparisonError("INVALID_ARGUMENTS", "Both versions must belong to the same character");
    }
    const profile = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(String(a.character_id)) as Record<string, unknown> | undefined;

    const refsFor = (versionId: string): Map<ReferenceSlot, string[]> => {
      const rows = db
        .prepare("SELECT slot, asset_id FROM character_version_references WHERE version_id = ? ORDER BY slot, asset_id")
        .all(versionId) as Array<Record<string, unknown>>;
      const map = new Map<ReferenceSlot, string[]>();
      for (const row of rows) {
        const slot = String(row.slot) as ReferenceSlot;
        const list = map.get(slot) ?? [];
        list.push(String(row.asset_id));
        map.set(slot, list);
      }
      return map;
    };
    const refsA = refsFor(versionAId);
    const refsB = refsFor(versionBId);
    const slots: SlotComparison[] = SLOTS.map((slot) => {
      const assetsA = refsA.get(slot) ?? [];
      const assetsB = refsB.get(slot) ?? [];
      const same = assetsA.length === assetsB.length && assetsA.every((v, i) => v === assetsB[i]);
      const onlyIn = assetsA.length > assetsB.length ? "a" : assetsB.length > assetsA.length ? "b" : null;
      return { slot, a: assetsA, b: assetsB, same, onlyIn };
    });

    const effective = (version: Record<string, unknown>, field: string): string => {
      const override = version[field] !== null ? String(version[field] ?? "") : "";
      if (override !== "") return override;
      return profile ? String(profile[field] ?? "") : "";
    };
    const fieldDiffs: FieldDiff[] = [];
    for (const field of ["physical_appearance", "age", "clothing"] as const) {
      const valueA = effective(a, field);
      const valueB = effective(b, field);
      if (valueA !== valueB) {
        const pretty = field === "physical_appearance" ? "physicalAppearance" : field;
        fieldDiffs.push({ field: pretty as FieldDiff["field"], a: valueA, b: valueB });
      }
    }

    const approval = (version: Record<string, unknown>): string => String(version.approval_status ?? "pending");
    const identical = slots.every((s) => s.same) && fieldDiffs.length === 0 && approval(a) === approval(b);
    return {
      characterId: String(a.character_id),
      a: { versionId: versionAId, label: String(a.label), approval: approval(a) },
      b: { versionId: versionBId, label: String(b.label), approval: approval(b) },
      slots,
      fieldDiffs,
      identical,
    };
  } finally {
    db.close();
  }
}
