// PanelForge — Character Studio: completeness scoring (S4.4, spec §8.4).
//
// Every version measured against its tier, with actionable warnings:
//
// - `scoreCompleteness` reads the version's S4.3 associations and
//   returns one verdict per tier — Basic, Recommended, Full — each
//   with `passed` and the exact `missing` slot requirements.
// - Basic: at least one reference. Recommended: portrait + front +
//   at least one expression. Full: portrait + front/side/rear +
//   multiple expressions (2) + a pose + clothing + equipment.
// - `overall` names the highest tier passed. A version with no
//   references fails every tier and says so in every `missing`.
//
// Tier requirements are hard-coded defaults until S4.5 makes them
// configurable; the scorer reads the exported `DEFAULT_TIERS`
// table so S4.5 only has to swap the source.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { isReferenceSlot, ReferenceSlot } from "./version-references";

export type CompletenessTier = "basic" | "recommended" | "full";

export type TierVerdict = {
  tier: CompletenessTier;
  passed: boolean;
  present: ReferenceSlot[];
  missing: string[];
};

export type CompletenessScore = {
  versionId: string;
  tiers: TierVerdict[];
  overall: CompletenessTier | null;
};

export class CompletenessError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CompletenessError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CompletenessError(identified.code, identified.message);
  }
}

/** §8.4 tier requirements as (slot, minimum count) pairs. */
export const DEFAULT_TIERS: Record<CompletenessTier, ReadonlyArray<{ slot: ReferenceSlot; min: number }>> = {
  basic: [{ slot: "portrait", min: 0 }] as ReadonlyArray<{ slot: ReferenceSlot; min: number }>,
  recommended: [
    { slot: "portrait", min: 1 },
    { slot: "front", min: 1 },
    { slot: "expression", min: 1 },
  ],
  full: [
    { slot: "portrait", min: 1 },
    { slot: "front", min: 1 },
    { slot: "side", min: 1 },
    { slot: "rear", min: 1 },
    { slot: "expression", min: 2 },
    { slot: "pose", min: 1 },
    { slot: "clothing", min: 1 },
    { slot: "equipment", min: 1 },
  ],
};

const TIER_ORDER: CompletenessTier[] = ["basic", "recommended", "full"];

/**
 * Score one version against Basic/Recommended/Full. Read-only;
 * unknown versions reject with NOT_FOUND.
 */
export async function scoreCompleteness(root: string, versionId: string): Promise<CompletenessScore> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
    if (!version) throw new CompletenessError("NOT_FOUND", `No version with id: ${versionId}`);
    const rows = db
      .prepare("SELECT slot, COUNT(*) AS n FROM character_version_references WHERE version_id = ? GROUP BY slot")
      .all(versionId) as Array<Record<string, unknown>>;
    const counts = new Map<ReferenceSlot, number>();
    for (const row of rows) {
      const slot = String(row.slot);
      if (isReferenceSlot(slot)) counts.set(slot, Number(row.n));
    }
    const present = [...counts.keys()].sort();
    // Tier requirements come from the S4.5 config table (defaults = §8.4).
    const { getTierConfig } = await import("./tier-config");
    const config = await getTierConfig(root);
    const tiers: TierVerdict[] = TIER_ORDER.map((tier) => {
      if (tier === "basic") {
        const any = counts.size > 0;
        return { tier, passed: any, present, missing: any ? [] : ["any reference"] };
      }
      const missing: string[] = [];
      for (const req of config[tier]) {
        const have = counts.get(req.slot) ?? 0;
        if (have < req.min) {
          missing.push(req.min === 1 ? req.slot : `${req.slot} (need ${req.min}, have ${have})`);
        }
      }
      return { tier, passed: missing.length === 0, present, missing };
    });
    let overall: CompletenessTier | null = null;
    for (const verdict of tiers) {
      if (verdict.passed) overall = verdict.tier;
    }
    return { versionId, tiers, overall };
  } finally {
    db.close();
  }
}
