// PanelForge — Character Studio: MVRS tier config (S4.5, spec §8.4).
//
// Tier requirements stored as config rows, editable at runtime:
//
// - `getTierConfig` reads the S4.4 tier table (defaults seeded at
//   migration time, equal to §8.4).
// - `setTierRequirement` / `removeTierRequirement` edit one
//   (tier, slot, min) row; unknown tiers/slots and bad counts
//   reject typed.
// - `resetTierConfig` restores the §8.4 defaults.
// - `scoreCompleteness` reads this config, not constants.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { isReferenceSlot, ReferenceSlot } from "./version-references";
import { CompletenessTier, DEFAULT_TIERS } from "./completeness";

export type TierConfig = Record<CompletenessTier, Array<{ slot: ReferenceSlot; min: number }>>;

export class TierConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TierConfigError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new TierConfigError(identified.code, identified.message);
  }
}

function isTier(value: unknown): value is CompletenessTier {
  return value === "basic" || value === "recommended" || value === "full";
}

export const TIER_NAMES: CompletenessTier[] = ["basic", "recommended", "full"];

/** Read the current tier requirements (seeded defaults = §8.4). */
export async function getTierConfig(root: string): Promise<TierConfig> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM completeness_tiers ORDER BY tier, slot").all() as Array<Record<string, unknown>>;
    const config = {} as TierConfig;
    for (const tier of TIER_NAMES) config[tier] = [];
    for (const row of rows) {
      const tier = String(row.tier);
      const slot = String(row.slot);
      if (isTier(tier) && isReferenceSlot(slot)) {
        config[tier].push({ slot, min: Number(row.min_count) });
      }
    }
    // Any tier with no rows falls back to its §8.4 defaults.
    for (const tier of TIER_NAMES) {
      if (config[tier].length === 0) config[tier] = [...DEFAULT_TIERS[tier]];
    }
    return config;
  } finally {
    db.close();
  }
}

/** Set (or replace) one (tier, slot) minimum count. */
export async function setTierRequirement(root: string, tier: CompletenessTier, slot: ReferenceSlot, min: number): Promise<TierConfig> {
  requireProject(root);
  if (!isTier(tier)) throw new TierConfigError("INVALID_ARGUMENTS", `Unknown tier: ${String(tier)}`);
  if (!isReferenceSlot(slot)) throw new TierConfigError("INVALID_ARGUMENTS", `Unknown reference slot: ${String(slot)}`);
  if (!Number.isInteger(min) || min < 0 || min > 20) {
    throw new TierConfigError("INVALID_ARGUMENTS", "min must be an integer between 0 and 20");
  }
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        db.prepare(
          "INSERT INTO completeness_tiers (tier, slot, min_count) VALUES (?, ?, ?) ON CONFLICT(tier, slot) DO UPDATE SET min_count = excluded.min_count"
        ).run(tier, slot, min);
      });
    } finally {
      db.close();
    }
    return getTierConfig(root);
  });
}

/** Remove one (tier, slot) requirement (missing = no requirement). */
export async function removeTierRequirement(root: string, tier: CompletenessTier, slot: ReferenceSlot): Promise<TierConfig> {
  requireProject(root);
  if (!isTier(tier)) throw new TierConfigError("INVALID_ARGUMENTS", `Unknown tier: ${String(tier)}`);
  if (!isReferenceSlot(slot)) throw new TierConfigError("INVALID_ARGUMENTS", `Unknown reference slot: ${String(slot)}`);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        db.prepare("DELETE FROM completeness_tiers WHERE tier = ? AND slot = ?").run(tier, slot);
      });
    } finally {
      db.close();
    }
    return getTierConfig(root);
  });
}

/** Restore the §8.4 defaults for every tier. */
export async function resetTierConfig(root: string): Promise<TierConfig> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM completeness_tiers").run();
          for (const tier of TIER_NAMES) {
            for (const req of DEFAULT_TIERS[tier]) {
              db.prepare("INSERT INTO completeness_tiers (tier, slot, min_count) VALUES (?, ?, ?)").run(tier, req.slot, req.min);
            }
          }
          db.exec("COMMIT");
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
    return getTierConfig(root);
  });
}
