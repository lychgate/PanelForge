// PanelForge — Storyboard Studio: composition review (S6.12, spec §8.7).
//
// Read-only gap/mismatch warnings before artwork exists:
//
// - `reviewBoard` scans panels (optionally one scene) and
//   returns warnings; each names the panel and the fix.
// - Checks: missing character assignment, missing location
//   assignment, unapproved bound versions (S6.3 assignments
//   and S4.7 bindings), era mismatches (bound age vs assigned
//   age; S4.7 `verifyBindingEra` warnings surfaced),
//   empty dialogue on action panels, duplicate sort slots.
// - Clean storyboards return no warnings. Nothing is written.
//
// The stage fixture stays S6.13.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { listBoard } from "./storyboard-board";
import { listAssignmentsByPanel } from "./panel-assignments";
import { getLocationAssignment } from "./panel-location-assignments";
import { getText } from "./panel-text";
import { getVersion } from "./character-versions";
import { getCharacter } from "./characters";
import { listBindingsByPanel, verifyBindingEra } from "./version-binding";

export type ReviewKind =
  | "missing-character"
  | "missing-location"
  | "unapproved-bound"
  | "era-mismatch"
  | "empty-dialogue"
  | "duplicate-slot";

export type CompositionWarning = {
  panelId: string;
  kind: ReviewKind;
  detail: string;
  fix: string;
};

export type CompositionReview = {
  sceneId: string | null;
  checkedPanels: string[];
  warnings: CompositionWarning[];
};

export class CompositionReviewError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CompositionReviewError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CompositionReviewError(identified.code, identified.message);
  }
}

function ageOf(profileAge: string, versionAge: string): string {
  return versionAge.trim() !== "" ? versionAge : profileAge;
}

/**
 * Scan the storyboard for gaps and mismatches. Read-only:
 * never writes.
 */
export async function reviewBoard(root: string, input?: { sceneId?: string }): Promise<CompositionReview> {
  requireProject(root);
  const sceneId = input?.sceneId;
  const board = await listBoard(root);
  const scenes = sceneId === undefined ? board.scenes : board.scenes.filter((scene) => scene.sceneId === sceneId);
  if (sceneId !== undefined && scenes.length === 0) {
    // Distinguish unknown scene from an empty (but real) one.
    const { db } = openProjectDatabase(root);
    try {
      const scene = db.prepare("SELECT scene_id FROM storyboard_scenes WHERE scene_id = ?").get(sceneId);
      if (!scene) throw new CompositionReviewError("NOT_FOUND", `No scene with id: ${sceneId}`);
    } finally {
      db.close();
    }
  }
  const warnings: CompositionWarning[] = [];
  const checkedPanels: string[] = [];

  for (const scene of scenes) {
    for (const panel of scene.panels) {
      checkedPanels.push(panel.panelId);
      const assignments = await listAssignmentsByPanel(root, panel.panelId);
      if (assignments.length === 0) {
        warnings.push({
          panelId: panel.panelId,
          kind: "missing-character",
          detail: `panel ${panel.panelId.slice(0, 8)} has no character assignment`,
          fix: "Assign an approved character version to this panel.",
        });
      }
      const location = await getLocationAssignment(root, panel.panelId);
      if (!location) {
        warnings.push({
          panelId: panel.panelId,
          kind: "missing-location",
          detail: `panel ${panel.panelId.slice(0, 8)} has no location assignment`,
          fix: "Assign a location to this panel.",
        });
      }

      // Bound-version approval + era (S4.7 bindings and S6.3 assignments).
      const { db } = openProjectDatabase(root);
      try {
        for (const assignment of assignments) {
          const versionRow = db.prepare("SELECT approval_status FROM character_versions WHERE version_id = ?").get(assignment.versionId) as Record<string, unknown> | undefined;
          const status = versionRow ? String(versionRow.approval_status ?? "pending") : "pending";
          if (status !== "approved") {
            warnings.push({
              panelId: panel.panelId,
              kind: "unapproved-bound",
              detail: `assigned version ${assignment.versionId.slice(0, 8)} is ${status}, not approved`,
              fix: "Approve the bound version, or reassign an approved version.",
            });
          }
        }
      } finally {
        db.close();
      }
      const bindings = await listBindingsByPanel(root, panel.panelId);
      for (const binding of bindings) {
        const era = await verifyBindingEra(root, panel.panelId, binding.characterId, "");
        for (const warning of era.warnings) {
          warnings.push({
            panelId: panel.panelId,
            kind: warning.includes("no longer approved") ? "unapproved-bound" : "era-mismatch",
            detail: warning,
            fix: "Approve the bound version, or rebind an approved version.",
          });
        }
        const assignment = assignments.find((entry) => entry.characterId === binding.characterId);
        if (assignment) {
          const boundVersion = await getVersion(root, binding.versionId);
          const assignedVersion = await getVersion(root, assignment.versionId);
          const character = await getCharacter(root, binding.characterId);
          const boundAge = boundVersion ? ageOf(character?.age ?? "", boundVersion.age) : "";
          const assignedAge = assignedVersion ? ageOf(character?.age ?? "", assignedVersion.age) : "";
          if (boundAge !== "" && assignedAge !== "" && boundAge !== assignedAge) {
            warnings.push({
              panelId: panel.panelId,
              kind: "era-mismatch",
              detail: `bound version age ${boundAge} disagrees with assigned version age ${assignedAge} for character ${binding.characterId.slice(0, 8)} in panel ${panel.panelId.slice(0, 8)}`,
              fix: "Rebind or reassign so both agree on the character's era.",
            });
          }
        }
      }

      const text = await getText(root, panel.panelId);
      if (text && text.actions.trim() !== "" && text.dialogue.trim() === "") {
        warnings.push({
          panelId: panel.panelId,
          kind: "empty-dialogue",
          detail: `panel ${panel.panelId.slice(0, 8)} describes actions but has no dialogue`,
          fix: "Add dialogue, or clear the actions if this panel is silent.",
        });
      }

      const slotPeers = scene.panels.filter(
        (other) => other.panelId !== panel.panelId && other.sortOrder === panel.sortOrder
      );
      if (slotPeers.length > 0) {
        warnings.push({
          panelId: panel.panelId,
          kind: "duplicate-slot",
          detail: `panel ${panel.panelId.slice(0, 8)} shares sort slot ${panel.sortOrder} with ${slotPeers.length} other panel(s)`,
          fix: "Move one panel in the scene to a free sort slot.",
        });
      }
    }
  }

  return { sceneId: sceneId ?? null, checkedPanels, warnings };
}
