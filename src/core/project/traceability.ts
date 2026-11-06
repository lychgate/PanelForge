// PanelForge — Comic Layout Studio: traceability (S8.13).
//
// Trace links from pages back to storyboard panels:
//
// - `getPlacementTrace` resolves one placement to
//   its source storyboard panel, the panel's scene
//   (S6.1) and its character versions (S4.7/S6.3
//   assignments with character/version labels).
// - `getPageTrace` groups those links per page in
//   reading order (S8.9) and flags pages with no
//   artwork slot (`EMPTY_PAGE`) without ever
//   failing: an empty page is a valid, renderable
//   result.
// - Read-only: no migration, no writes; missing
//   panels/scenes surface as flags, never throws.
//   (Unknown placement/page ids still reject
//   typed, like every other query.)
//
// Layout snapshots stay S8.10; the acceptance
// fixture stays S8.14.

import { identifyProject } from "./service";
import { getPage } from "./pages";
import { getPlacement } from "./placements";
import { getPanelDetails } from "./storyboard-board";
import { getReadingOrder } from "./reading-order";

export type PlacementTraceAssignment = {
  characterId: string;
  versionId: string;
  characterName: string;
  versionLabel: string;
};

export type PlacementTrace = {
  placementId: string;
  panelId: string;
  sceneId: string | null;
  scenePurpose: string | null;
  assignments: PlacementTraceAssignment[];
  flags: string[];
};

export type PageTrace = {
  pageId: string;
  hasArtwork: boolean;
  flags: string[];
  placements: PlacementTrace[];
};

export class TraceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TraceError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new TraceError(identified.code, identified.message);
  }
}

/** Trace one placement back to its source panel, scene, and character versions. */
export async function getPlacementTrace(root: string, placementId: string): Promise<PlacementTrace> {
  requireProject(root);
  if (typeof placementId !== "string" || placementId.trim() === "") {
    throw new TraceError("INVALID_ARGUMENTS", "placementId must not be empty");
  }
  const placement = await getPlacement(root, placementId);
  if (!placement) throw new TraceError("NOT_FOUND", `No placement with id: ${placementId}`);
  const flags: string[] = [];
  let details;
  try {
    details = await getPanelDetails(root, placement.panelId);
  } catch {
    return {
      placementId,
      panelId: placement.panelId,
      sceneId: null,
      scenePurpose: null,
      assignments: [],
      flags: ["MISSING_PANEL"],
    };
  }
  if (!details.scene) flags.push("MISSING_SCENE");
  if (details.assignments.length === 0) flags.push("UNASSIGNED");
  return {
    placementId,
    panelId: placement.panelId,
    sceneId: details.scene?.sceneId ?? null,
    scenePurpose: details.scene?.narrativePurpose ?? null,
    assignments: details.assignments.map((assignment) => ({
      characterId: assignment.characterId,
      versionId: assignment.versionId,
      characterName: assignment.characterName,
      versionLabel: assignment.versionLabel,
    })),
    flags,
  };
}

/**
 * Trace a whole page in reading order.
 * Empty pages are flagged EMPTY_PAGE, never broken.
 */
export async function getPageTrace(root: string, pageId: string): Promise<PageTrace> {
  requireProject(root);
  if (typeof pageId !== "string" || pageId.trim() === "") {
    throw new TraceError("INVALID_ARGUMENTS", "pageId must not be empty");
  }
  const page = await getPage(root, pageId);
  if (!page) throw new TraceError("NOT_FOUND", `No page with id: ${pageId}`);
  const ordered = await getReadingOrder(root, pageId);
  const placements: PlacementTrace[] = [];
  for (const placement of ordered) {
    placements.push(await getPlacementTrace(root, placement.placementId));
  }
  return {
    pageId,
    hasArtwork: placements.length > 0,
    flags: placements.length > 0 ? [] : ["EMPTY_PAGE"],
    placements,
  };
}
