// PanelForge — Art Studio: version history, approval, restoration (S7.13, spec §8.8).
//
// Approval never destroys history:
//
// - `setArtworkApproval` marks one artwork version
//   pending/approved/rejected (S4.8 pattern: rationale
//   required). Approving one version points
//   `panel_approved_artwork` at it; generation never
//   touches approvals (approved work is never silently
//   replaced, §2.4).
// - `restoreApproved` sets the approved pointer back to
//   an earlier version without deleting later versions
//   (they keep their ledger states).
// - `listHistory` is the version ledger with dependency
//   tracking (each job shows what it fed: template,
//   prompt, seed, conditioning via provenance).
// - Engine provisioning stays S7.14.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type HistoryEntry = {
  artworkId: string;
  versionNo: number;
  assetId: string;
  status: ApprovalStatus;
  rationale: string;
  decidedAt: string | null;
  generationId: string;
  jobId: string | null;
};

export class ArtworkApprovalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ArtworkApprovalError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ArtworkApprovalError(identified.code, identified.message);
  }
}

function validateStatus(status: string): asserts status is ApprovalStatus {
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    throw new ArtworkApprovalError("INVALID_ARGUMENTS", `status must be pending|approved|rejected: ${status}`);
  }
}

export type SetApprovalInput = {
  artworkId: string;
  status: ApprovalStatus;
  rationale: string;
};

function readHistoryRow(row: Record<string, unknown>): HistoryEntry {
  return {
    artworkId: String(row.artwork_id),
    versionNo: Number(row.version_no),
    assetId: String(row.asset_id),
    status: String(row.status ?? "pending") as ApprovalStatus,
    rationale: String(row.rationale ?? ""),
    decidedAt: row.decided_at === null || row.decided_at === undefined ? null : String(row.decided_at),
    generationId: String(row.generation_id),
    jobId: row.job_id === null || row.job_id === undefined ? null : String(row.job_id),
  };
}

/**
 * Mark one artwork version's approval.
 * Rationale is required for approved/rejected.
 */
export async function setArtworkApproval(root: string, input: SetApprovalInput): Promise<HistoryEntry> {
  requireProject(root);
  validateStatus(input.status);
  if (typeof input.artworkId !== "string" || input.artworkId.trim() === "") {
    throw new ArtworkApprovalError("INVALID_ARGUMENTS", "artworkId must not be empty");
  }
  if (input.status !== "pending" && (typeof input.rationale !== "string" || input.rationale.trim() === "")) {
    throw new ArtworkApprovalError("INVALID_ARGUMENTS", "rationale is required for approved/rejected");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const artwork = db.prepare("SELECT * FROM panel_artwork WHERE artwork_id = ?").get(input.artworkId) as Record<string, unknown> | undefined;
      if (!artwork) throw new ArtworkApprovalError("NOT_FOUND", `No artwork with id: ${input.artworkId}`);
      return await runWithBusyRetry<HistoryEntry>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "INSERT INTO artwork_approvals (artwork_id, status, rationale, decided_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(artwork_id) DO UPDATE SET status = excluded.status, rationale = excluded.rationale, decided_at = excluded.decided_at, updated_at = excluded.updated_at"
          ).run(input.artworkId, input.status, input.rationale ?? "", input.status === "pending" ? null : now, now);
          if (input.status === "approved") {
            db.prepare("INSERT OR REPLACE INTO panel_approved_artwork (panel_id, artwork_id, updated_at) VALUES (?, ?, ?)").run(artwork.panel_id, input.artworkId, now);
          }
          const row = db.prepare("SELECT pa.*, aa.status, aa.rationale, aa.decided_at FROM panel_artwork pa LEFT JOIN artwork_approvals aa ON aa.artwork_id = pa.artwork_id WHERE pa.artwork_id = ?").get(input.artworkId) as Record<string, unknown>;
          db.exec("COMMIT");
          return readHistoryRow(row);
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

/**
 * Restore: set the approved pointer back to an earlier
 * version. Later versions remain untouched.
 */
export async function restoreApproved(root: string, input: { panelId: string; artworkId: string; rationale: string }): Promise<HistoryEntry> {
  requireProject(root);
  if (typeof input.rationale !== "string" || input.rationale.trim() === "") {
    throw new ArtworkApprovalError("INVALID_ARGUMENTS", "rationale is required for restore");
  }
  const entry = await setArtworkApproval(root, { artworkId: input.artworkId, status: "approved", rationale: input.rationale });
  const { db } = openProjectDatabase(root);
  try {
    const artwork = db.prepare("SELECT panel_id FROM panel_artwork WHERE artwork_id = ?").get(input.artworkId) as Record<string, unknown>;
    if (String(artwork.panel_id) !== input.panelId) {
      throw new ArtworkApprovalError("INVALID_ARGUMENTS", `Artwork ${input.artworkId} does not belong to panel ${input.panelId}`);
    }
    return entry;
  } finally {
    db.close();
  }
}

/** The currently approved artwork for one panel (or null). */
export async function getApprovedArtwork(root: string, panelId: string): Promise<HistoryEntry | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db
      .prepare("SELECT pa.*, aa.status, aa.rationale, aa.decided_at FROM panel_approved_artwork pp JOIN panel_artwork pa ON pa.artwork_id = pp.artwork_id LEFT JOIN artwork_approvals aa ON aa.artwork_id = pa.artwork_id WHERE pp.panel_id = ?")
      .get(panelId) as Record<string, unknown> | undefined;
    return row ? readHistoryRow(row) : null;
  } finally {
    db.close();
  }
}

/** The full version ledger for one panel, oldest first. */
export async function listHistory(root: string, panelId: string): Promise<HistoryEntry[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT pa.*, aa.status, aa.rationale, aa.decided_at FROM panel_artwork pa LEFT JOIN artwork_approvals aa ON aa.artwork_id = pa.artwork_id WHERE pa.panel_id = ? ORDER BY pa.version_no")
      .all(panelId) as Array<Record<string, unknown>>;
    return rows.map(readHistoryRow);
  } finally {
    db.close();
  }
}
