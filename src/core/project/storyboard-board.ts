// PanelForge — Storyboard Studio: board view model (S6.11, spec §8.7).
//
// Read aggregation for the minimal storyboard UI:
//
// - `listBoard` returns every storyboard scene (across all
//   manuscripts) with source links, each carrying its panels.
// - `getPanelDetails` returns one panel's full card: source
//   scene, character assignments with character/version
//   labels, location assignment, camera, text, and
//   instructions.
// - Edits stay in their own modules (panel-text,
//   panel-cameras, panel-instructions, snapshots); this file
//   only reads, so the UI surface cannot bypass typed errors.
// - No generation controls live here (Stage 7).
//
// Composition review stays S6.12.

import { identifyProject } from "./service";
import { listManuscripts } from "./manuscripts";
import { listScenes, getScene, type StoryboardScene } from "./storyboard-scenes";
import { listPanels, getPanel, type StoryboardPanel } from "./storyboard-panels";
import { listAssignmentsByPanel, type PanelAssignment } from "./panel-assignments";
import { getCharacter } from "./characters";
import { getVersion } from "./character-versions";
import { getLocationAssignment, type LocationAssignment } from "./panel-location-assignments";
import { getCamera, type PanelCamera } from "./panel-cameras";
import { getText, type PanelText } from "./panel-text";
import { getInstructions, type PanelInstructions } from "./panel-instructions";

export class BoardError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BoardError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new BoardError(identified.code, identified.message);
  }
}

export type PanelDetailAssignment = PanelAssignment & {
  characterName: string;
  versionLabel: string;
};

export type PanelDetails = {
  panel: StoryboardPanel;
  scene: StoryboardScene | null;
  assignments: PanelDetailAssignment[];
  locationAssignment: LocationAssignment | null;
  camera: PanelCamera | null;
  text: PanelText | null;
  instructions: PanelInstructions | null;
};

export type BoardScene = StoryboardScene & {
  panels: StoryboardPanel[];
};

export type Board = {
  scenes: BoardScene[];
};

/** Every storyboard scene with its panels, source-linked. */
export async function listBoard(root: string): Promise<Board> {
  requireProject(root);
  const manuscripts = await listManuscripts(root);
  const scenes: BoardScene[] = [];
  for (const manuscript of manuscripts) {
    for (const scene of await listScenes(root, manuscript.manuscriptId)) {
      scenes.push({ ...scene, panels: await listPanels(root, scene.sceneId) });
    }
  }
  return { scenes };
}

/** One panel's full card for the storyboard UI. */
export async function getPanelDetails(root: string, panelId: string): Promise<PanelDetails> {
  requireProject(root);
  if (typeof panelId !== "string" || panelId.trim() === "") {
    throw new BoardError("INVALID_ARGUMENTS", "panelId must not be empty");
  }
  const panel = await getPanel(root, panelId);
  if (!panel) throw new BoardError("NOT_FOUND", `No panel with id: ${panelId}`);
  const scene = await getScene(root, panel.sceneId);
  const rawAssignments = await listAssignmentsByPanel(root, panelId);
  const assignments: PanelDetailAssignment[] = [];
  for (const assignment of rawAssignments) {
    const character = await getCharacter(root, assignment.characterId);
    const version = await getVersion(root, assignment.versionId);
    assignments.push({
      ...assignment,
      characterName: character?.name ?? "(deleted character)",
      versionLabel: version?.label ?? "(deleted version)",
    });
  }
  return {
    panel,
    scene,
    assignments,
    locationAssignment: await getLocationAssignment(root, panelId),
    camera: await getCamera(root, panelId),
    text: await getText(root, panelId),
    instructions: await getInstructions(root, panelId),
  };
}
