// PanelForge — Character Studio: generation approval (S4.8, spec §8.4).
//
// Approval gates what can bind:
//
// - Every version carries an approval state: pending (default), or
//   approved/rejected with a rationale and timestamp.
// - `setApproval` records one decision; a decision's rationale is
//   required so the audit trail is never anonymous.
// - `bindVersion` (S4.7) refuses to bind pending/rejected
//   versions; existing bindings survive a later rejection but
//   `verifyBindingEra` warns about them.
// - Approved work is never silently replaced: approval steps do not
//   touch references, versions, or bindings.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRecord = {
  versionId: string;
  status: ApprovalStatus;
  rationale: string;
  decidedAt: string | null;
};

export class ApprovalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ApprovalError(identified.code, identified.message);
  }
}

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function toRecord(row: Record<string, unknown>): ApprovalRecord {
  return {
    versionId: String(row.version_id),
    status: String(row.approval_status ?? "pending") as ApprovalStatus,
    rationale: String(row.approval_rationale ?? ""),
    decidedAt: row.approval_decided_at === null || row.approval_decided_at === undefined ? null : String(row.approval_decided_at),
  };
}

/** Record one approval decision for a version (rationale required). */
export async function setApproval(root: string, versionId: string, status: ApprovalStatus, rationale: string): Promise<ApprovalRecord> {
  requireProject(root);
  if (!isApprovalStatus(status)) throw new ApprovalError("INVALID_ARGUMENTS", `Unknown approval status: ${String(status)}`);
  if (typeof rationale !== "string" || rationale.trim() === "") {
    throw new ApprovalError("INVALID_ARGUMENTS", "rationale must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
      if (!version) throw new ApprovalError("NOT_FOUND", `No version with id: ${versionId}`);
      return await runWithBusyRetry<ApprovalRecord>(() => {
        db.prepare("UPDATE character_versions SET approval_status = ?, approval_rationale = ?, approval_decided_at = ? WHERE version_id = ?").run(
          status,
          rationale.trim(),
          now,
          versionId
        );
        const row = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** The current approval state for a version, or null. */
export async function getApproval(root: string, versionId: string): Promise<ApprovalRecord | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}
