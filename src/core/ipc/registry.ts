// Centralized IPC registration and dispatch (S0.4).
//
// Single module that owns every `ipcMain.handle` call in the app.
// - Channel names come from a frozen allowlist map (no stringly-typed
//   channels scattered across main).
// - Each handler validates its arguments before running; invalid args are
//   rejected with a safe error envelope (no stack traces to the renderer).
// - Handlers are centralized: add a channel here, never elsewhere.

import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent } from "electron";
import type {
  DiagnosticsGetArgs,
  DiagnosticsGetData,
  DiagnosticsPingArgs,
  DiagnosticsPingData,
  IpcRequest,
  IpcResult,
  ProjectArchiveArgs,
  ProjectCloseArgs,
  ProjectCreateArgs,
  ProjectListArgs,
  ProjectOpenArgs,
  ProjectRenameArgs,
} from "../../shared/types";
import {
  StoryboardRootArgs,
  StoryboardPanelDetailsArgs,
  StoryboardSetTextArgs,
  StoryboardSetCameraArgs,
  StoryboardSetInstructionsArgs,
  StoryboardCreatePanelArgs,
  StoryboardSnapshotCreateArgs,
  StoryboardSnapshotRestoreArgs,
  LayoutRootArgs,
  LayoutPageArgs,
  LayoutPlaceArgs,
  LayoutUpdatePlacementArgs,
  LayoutSetBorderArgs,
  LayoutCreateBalloonArgs,
  LayoutUpdateBalloonArgs,
  LayoutRetargetTailArgs,
  LayoutSetLetteringArgs,
  LayoutSetSfxArgs,
  LayoutSetReadingOrderArgs,
  ImportRootArgs,
  ImportImportArgs,
  ImportVerifyArgs,
  ImportOcrGetArgs,
  ImportOcrUpdateArgs,
  TextChapterKeyArgs,
} from "../../shared/types";
import { defaultLogService } from "../logging/service";
import {
  archiveProject,
  closeProject,
  createProjectAt,
  listProjects,
  openProject,
  renameProject,
  ProjectOpError,
  defaultProjectManager,
} from "../project/operations";
import * as fs from "fs";
import * as path from "path";
import { listBoard, getPanelDetails } from "../project/storyboard-board";
import { createPanel } from "../project/storyboard-panels";
import { setText } from "../project/panel-text";
import { setCamera } from "../project/panel-cameras";
import { setInstructions } from "../project/panel-instructions";
import { createSnapshot, listSnapshots, restoreSnapshot } from "../project/snapshots";
import { listLayoutBoard, getLayoutPage } from "../project/layout-board";
import { placePanel, updatePlacement } from "../project/placements";
import { setBorder } from "../project/borders";
import { createBalloon, updateBalloon, retargetTail } from "../project/balloons";
import { setLettering } from "../project/lettering";
import { createSfx, updateSfx } from "../project/sfx";
import { setReadingOrder } from "../project/reading-order";
import {
  detectManuscriptFormat,
  getManuscript,
  importManuscript,
  listManuscripts,
  verifyManuscript,
  ManuscriptError,
} from "../project/manuscripts";
import { importDocxManuscript } from "../project/docx-import";
import { importEpubManuscript } from "../project/epub-import";
import { importPdfAutodetect, getOcrText, updateOcrText } from "../project/pdf-ocr";
import { getNormalization, storeNormalization } from "../project/text-normalize";
import { listChapters, storeChapters } from "../project/chapters";

export const IPC_CHANNELS = {
  diagnosticsPing: "panelforge:diagnostics.ping",
  diagnosticsGet: "panelforge:diagnostics.get",
  projectCreate: "panelforge:project.create",
  projectList: "panelforge:project.list",
  projectOpen: "panelforge:project.open",
  projectClose: "panelforge:project.close",
  projectRename: "panelforge:project.rename",
  projectArchive: "panelforge:project.archive",
  storyboardList: "panelforge:storyboard.list",
  storyboardPanelDetails: "panelforge:storyboard.panelDetails",
  storyboardCreatePanel: "panelforge:storyboard.createPanel",
  storyboardSetText: "panelforge:storyboard.setText",
  storyboardSetCamera: "panelforge:storyboard.setCamera",
  storyboardSetInstructions: "panelforge:storyboard.setInstructions",
  storyboardSnapshotsList: "panelforge:storyboard.snapshots.list",
  storyboardSnapshotCreate: "panelforge:storyboard.snapshot.create",
  storyboardSnapshotRestore: "panelforge:storyboard.snapshot.restore",
  layoutPages: "panelforge:layout.pages",
  layoutPage: "panelforge:layout.page",
  layoutPlace: "panelforge:layout.place",
  layoutUpdatePlacement: "panelforge:layout.updatePlacement",
  layoutSetBorder: "panelforge:layout.setBorder",
  layoutCreateBalloon: "panelforge:layout.createBalloon",
  layoutUpdateBalloon: "panelforge:layout.updateBalloon",
  layoutRetargetTail: "panelforge:layout.retargetTail",
  layoutSetLettering: "panelforge:layout.setLettering",
  layoutSetSfx: "panelforge:layout.setSfx",
  layoutSetReadingOrder: "panelforge:layout.setReadingOrder",
  importPickFile: "panelforge:import.pickFile",
  importList: "panelforge:import.list",
  importImport: "panelforge:import.import",
  importVerify: "panelforge:import.verify",
  importOcrGet: "panelforge:import.ocrGet",
  importOcrUpdate: "panelforge:import.ocrUpdate",
  textGet: "panelforge:text.get",
  textNormalize: "panelforge:text.normalize",
  chaptersList: "panelforge:chapters.list",
  chaptersDerive: "panelforge:chapters.derive",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

type Handler<TArgs, TData> = (
  _event: IpcMainInvokeEvent,
  args: TArgs
) => Promise<TData>;

function isValidPingArgs(args: unknown): args is DiagnosticsPingArgs {
  if (args === null || typeof args !== "object") return false;
  const keys = Object.keys(args as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "token") return false;
  const { token } = args as DiagnosticsPingArgs;
  return typeof token === "string" && token.length > 0;
}

function isValidGetArgs(args: unknown): args is DiagnosticsGetArgs {
  if (args === null || typeof args !== "object") return false;
  const keys = Object.keys(args as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "token") return false;
  const { token } = args as DiagnosticsGetArgs;
  return typeof token === "string" && token.length > 0;
}

// Projects library dir (S1.10): <userData>/projects. Only the main
// process resolves it — the renderer never deals in absolute paths.
export function resolveProjectsLibraryDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      return path.join(app.getPath("userData"), "projects");
    }
  } catch {
    // Electron unavailable (unit tests) — fall through.
  }
  const envOverride = process.env.PANELFORGE_USER_DATA_DIR;
  if (envOverride && envOverride.trim() !== "") {
    return path.join(envOverride, "projects");
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".config", "panelforge", "projects");
}

function libraryDirOf(args: { parentDir?: string }): string {
  return args.parentDir && args.parentDir.trim() !== "" ? args.parentDir : resolveProjectsLibraryDir();
}

function isRecord(args: unknown): args is Record<string, unknown> {
  return args !== null && typeof args === "object";
}

function isValidProjectCreateArgs(args: unknown): args is ProjectCreateArgs {
  if (!isRecord(args)) return false;
  const a = args as Partial<ProjectCreateArgs>;
  if (typeof a.name !== "string" || a.name.trim() === "") return false;
  if (a.description !== undefined && a.description !== null && typeof a.description !== "string") return false;
  if (a.parentDir !== undefined && typeof a.parentDir !== "string") return false;
  return true;
}

function isValidProjectListArgs(args: unknown): args is ProjectListArgs {
  if (!isRecord(args)) return false;
  const a = args as Partial<ProjectListArgs>;
  return a.parentDir === undefined || typeof a.parentDir === "string";
}

function isValidProjectRootArgs(args: unknown): args is { root: string } {
  if (!isRecord(args)) return false;
  const a = args as { root?: unknown };
  return typeof a.root === "string" && a.root.trim() !== "";
}

function isValidProjectRenameArgs(args: unknown): args is ProjectRenameArgs {
  if (!isValidProjectRootArgs(args)) return false;
  const a = args as ProjectRenameArgs;
  return typeof a.newName === "string" && a.newName.trim() !== "";
}

// Typed error mapping: project operation failures return their codes as
// envelope codes (messages carry no stack or sensitive detail). The
// dispatch catch below preserves ProjectOpError codes.
function unwrapProjectError(err: unknown): { code: string; message: string } {
  if (err instanceof ProjectOpError) {
    return { code: err.code, message: err.message };
  }
  throw err;
}

// Storyboard core errors (S6.11) carry the same typed .code shape;
// the dispatch catch preserves them so the renderer sees real codes
// (NOT_FOUND, INVALID_ARGUMENTS, NOT_APPROVED, ...) instead of a
// generic HANDLER_ERROR.
function coreErrorCode(err: unknown): string | null {
  if (err instanceof ProjectOpError) return err.code;
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" && code !== "" ? code : null;
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isStringFields(args: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => args[field] === undefined || typeof args[field] === "string");
}

const SHOT_TYPES = ["close-up", "medium", "wide", "extreme-wide"];

function isValidStoryboardRootArgs(args: unknown): args is StoryboardRootArgs {
  if (!isRecord(args)) return false;
  return isNonEmptyString((args as { root?: unknown }).root);
}

function isValidStoryboardPanelArgs(args: unknown): args is StoryboardPanelDetailsArgs {
  if (!isValidStoryboardRootArgs(args)) return false;
  return isNonEmptyString((args as { panelId?: unknown }).panelId);
}

function isValidStoryboardSetTextArgs(args: unknown): args is StoryboardSetTextArgs {
  if (!isValidStoryboardPanelArgs(args)) return false;
  return isStringFields(args as Record<string, unknown>, ["dialogue", "captions", "actions", "expressions"]);
}

function isValidStoryboardSetCameraArgs(args: unknown): args is StoryboardSetCameraArgs {
  if (!isValidStoryboardPanelArgs(args)) return false;
  const a = args as { shotType?: unknown; angle?: unknown };
  if (typeof a.shotType !== "string" || !SHOT_TYPES.includes(a.shotType)) return false;
  return a.angle === undefined || typeof a.angle === "string";
}

function isValidStoryboardSetInstructionsArgs(args: unknown): args is StoryboardSetInstructionsArgs {
  if (!isValidStoryboardPanelArgs(args)) return false;
  return isStringFields(args as Record<string, unknown>, ["compositionPrompt", "backgroundDetail", "artDirectionNotes"]);
}

function isValidStoryboardCreatePanelArgs(args: unknown): args is StoryboardCreatePanelArgs {
  if (!isValidStoryboardRootArgs(args)) return false;
  return isNonEmptyString((args as { sceneId?: unknown }).sceneId);
}

function isValidStoryboardSnapshotCreateArgs(args: unknown): args is StoryboardSnapshotCreateArgs {
  if (!isValidStoryboardRootArgs(args)) return false;
  const a = args as { name?: unknown; parentSnapshotId?: unknown };
  return (
    (a.name === undefined || typeof a.name === "string") &&
    (a.parentSnapshotId === undefined || (typeof a.parentSnapshotId === "string" && a.parentSnapshotId.trim() !== ""))
  );
}

function isValidStoryboardSnapshotRestoreArgs(args: unknown): args is StoryboardSnapshotRestoreArgs {
  if (!isValidStoryboardRootArgs(args)) return false;
  return isNonEmptyString((args as { snapshotId?: unknown }).snapshotId);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidLayoutRootArgs(args: unknown): args is LayoutRootArgs {
  if (!isRecord(args)) return false;
  return isNonEmptyString((args as { root?: unknown }).root);
}

function isValidLayoutPageArgs(args: unknown): args is LayoutPageArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  return isNonEmptyString((args as { pageId?: unknown }).pageId);
}

function isValidLayoutPlaceArgs(args: unknown): args is LayoutPlaceArgs {
  if (!isValidLayoutPageArgs(args)) return false;
  const a = args as LayoutPlaceArgs;
  return isNonEmptyString(a.panelId) && isFiniteNumber(a.x) && isFiniteNumber(a.y) && isFiniteNumber(a.width) && isFiniteNumber(a.height);
}

function isValidLayoutUpdatePlacementArgs(args: unknown): args is LayoutUpdatePlacementArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutUpdatePlacementArgs;
  return isNonEmptyString(a.placementId) && isFiniteNumber(a.x) && isFiniteNumber(a.y) && isFiniteNumber(a.width) && isFiniteNumber(a.height);
}

const BORDER_STYLES = ["none", "thin", "bold"];
const BALLOON_KINDS = ["speech", "caption", "thought"];
const BALLOON_SHAPES = ["ellipse", "rounded", "rect"];
const SFX_WEIGHTS = ["regular", "bold", "heavy"];

function isValidLayoutSetBorderArgs(args: unknown): args is LayoutSetBorderArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutSetBorderArgs;
  if (!isNonEmptyString(a.placementId)) return false;
  if (typeof a.style !== "string" || !BORDER_STYLES.includes(a.style)) return false;
  if (a.widthMm !== undefined && !isFiniteNumber(a.widthMm)) return false;
  return a.rounded === undefined || typeof a.rounded === "boolean";
}

function isValidLayoutCreateBalloonArgs(args: unknown): args is LayoutCreateBalloonArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutCreateBalloonArgs;
  if (!isNonEmptyString(a.placementId)) return false;
  if (typeof a.kind !== "string" || !BALLOON_KINDS.includes(a.kind)) return false;
  if (typeof a.shape !== "string" || !BALLOON_SHAPES.includes(a.shape)) return false;
  if (!isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(a.width) || !isFiniteNumber(a.height)) return false;
  if (a.tail !== undefined) {
    if (a.tail === null || typeof a.tail !== "object") return false;
    if (!isFiniteNumber(a.tail.x) || !isFiniteNumber(a.tail.y)) return false;
    if (a.tail.visible !== undefined && typeof a.tail.visible !== "boolean") return false;
  }
  return true;
}

function isValidLayoutUpdateBalloonArgs(args: unknown): args is LayoutUpdateBalloonArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutUpdateBalloonArgs;
  return isNonEmptyString(a.balloonId) && isFiniteNumber(a.x) && isFiniteNumber(a.y) && isFiniteNumber(a.width) && isFiniteNumber(a.height);
}

function isValidLayoutRetargetTailArgs(args: unknown): args is LayoutRetargetTailArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutRetargetTailArgs;
  return isNonEmptyString(a.balloonId) && isFiniteNumber(a.x) && isFiniteNumber(a.y) && typeof a.visible === "boolean";
}

function isValidLayoutSetLetteringArgs(args: unknown): args is LayoutSetLetteringArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutSetLetteringArgs;
  return isNonEmptyString(a.balloonId) && typeof a.text === "string";
}

function isValidLayoutSetSfxArgs(args: unknown): args is LayoutSetSfxArgs {
  if (!isValidLayoutRootArgs(args)) return false;
  const a = args as LayoutSetSfxArgs;
  if (!isNonEmptyString(a.placementId)) return false;
  if (typeof a.text !== "string" || a.text.trim() === "") return false;
  if (!isFiniteNumber(a.x) || !isFiniteNumber(a.y)) return false;
  if (a.weight !== undefined && (typeof a.weight !== "string" || !SFX_WEIGHTS.includes(a.weight))) return false;
  if (a.angle !== undefined && !isFiniteNumber(a.angle)) return false;
  if (a.scale !== undefined && !isFiniteNumber(a.scale)) return false;
  if (a.sfxId !== undefined && !isNonEmptyString(a.sfxId)) return false;
  return true;
}

function isValidLayoutSetReadingOrderArgs(args: unknown): args is LayoutSetReadingOrderArgs {
  if (!isValidLayoutPageArgs(args)) return false;
  const a = args as LayoutSetReadingOrderArgs;
  if (!Array.isArray(a.placementIds) || a.placementIds.length === 0) return false;
  return a.placementIds.every((id) => typeof id === "string" && id.trim() !== "");
}

function isValidImportRootArgs(args: unknown): args is ImportRootArgs {
  if (!isRecord(args)) return false;
  return isNonEmptyString((args as { root?: unknown }).root);
}

function isValidImportImportArgs(args: unknown): args is ImportImportArgs {
  if (!isValidImportRootArgs(args)) return false;
  const a = args as ImportImportArgs;
  if (typeof a.sourceAbsolutePath !== "string" || a.sourceAbsolutePath.trim() === "") return false;
  if (!path.isAbsolute(a.sourceAbsolutePath)) return false;
  return a.title === undefined || typeof a.title === "string";
}

function isValidImportKeyArgs(args: unknown): args is ImportVerifyArgs {
  if (!isValidImportRootArgs(args)) return false;
  return isNonEmptyString((args as { manuscriptId?: unknown }).manuscriptId);
}

function isValidImportOcrUpdateArgs(args: unknown): args is ImportOcrUpdateArgs {
  if (!isValidImportKeyArgs(args)) return false;
  const a = args as ImportOcrUpdateArgs;
  return typeof a.ocrText === "string" && a.ocrText.trim() !== "";
}

function isValidImportPickFileArgs(args: unknown): args is Record<string, never> {
  return isRecord(args);
}

// Text/Chapters UI (S8U.2): same key shape as import (root +
// manuscriptId); the renderer never deals in raw paths here.
function isValidTextChapterKeyArgs(args: unknown): args is TextChapterKeyArgs {
  if (!isValidImportRootArgs(args)) return false;
  return isNonEmptyString((args as { manuscriptId?: unknown }).manuscriptId);
}

const handlers: Record<
  string,
  {
    validate: (args: unknown) => boolean;
    handle: Handler<any, any>;
  }
> = {
  [IPC_CHANNELS.diagnosticsPing]: {
    validate: isValidPingArgs,
    handle: async (_event, args) => {
      void args;
      return { ok: true };
    },
  },
  [IPC_CHANNELS.diagnosticsGet]: {
    validate: isValidGetArgs,
    handle: async (_event, _args) => {
      void _args;
      return {
        appName: app.getName(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        channel: IPC_CHANNELS.diagnosticsGet,
        timestamp: new Date().toISOString(),
      };
    },
  },
  [IPC_CHANNELS.projectCreate]: {
    validate: isValidProjectCreateArgs,
    handle: async (_event, args) => {
      try {
        const parentDir = libraryDirOf(args);
        fs.mkdirSync(parentDir, { recursive: true });
        const result = await createProjectAt(parentDir, args.name, {
          description: args.description ?? null,
        });
        return { root: result.root, projectId: result.projectId };
      } catch (err) {
        unwrapProjectError(err);
        throw err;
      }
    },
  },
  [IPC_CHANNELS.projectList]: {
    validate: isValidProjectListArgs,
    handle: async (_event, args) => {
      const parentDir = libraryDirOf(args);
      fs.mkdirSync(parentDir, { recursive: true });
      const projects = await listProjects(parentDir);
      return { projects };
    },
  },
  [IPC_CHANNELS.projectOpen]: {
    validate: isValidProjectRootArgs,
    handle: async (_event, args) => {
      return openProject(args.root, defaultProjectManager);
    },
  },
  [IPC_CHANNELS.projectClose]: {
    validate: isValidProjectRootArgs,
    handle: async (_event, args) => {
      closeProject(args.root, defaultProjectManager);
      return { closed: true as const };
    },
  },
  [IPC_CHANNELS.projectRename]: {
    validate: isValidProjectRenameArgs,
    handle: async (_event, args) => {
      return renameProject(args.root, args.newName, defaultProjectManager);
    },
  },
  [IPC_CHANNELS.projectArchive]: {
    validate: isValidProjectRootArgs,
    handle: async (_event, args) => {
      return archiveProject(args.root, defaultProjectManager);
    },
  },
  [IPC_CHANNELS.storyboardList]: {
    validate: isValidStoryboardRootArgs,
    handle: async (_event, args) => {
      return listBoard(args.root);
    },
  },
  [IPC_CHANNELS.storyboardPanelDetails]: {
    validate: isValidStoryboardPanelArgs,
    handle: async (_event, args) => {
      return getPanelDetails(args.root, args.panelId);
    },
  },
  [IPC_CHANNELS.storyboardCreatePanel]: {
    validate: isValidStoryboardCreatePanelArgs,
    handle: async (_event, args) => {
      return createPanel(args.root, args.sceneId);
    },
  },
  [IPC_CHANNELS.storyboardSetText]: {
    validate: isValidStoryboardSetTextArgs,
    handle: async (_event, args) => {
      return setText(args.root, args.panelId, {
        dialogue: args.dialogue,
        captions: args.captions,
        actions: args.actions,
        expressions: args.expressions,
      });
    },
  },
  [IPC_CHANNELS.storyboardSetCamera]: {
    validate: isValidStoryboardSetCameraArgs,
    handle: async (_event, args) => {
      return setCamera(args.root, args.panelId, args.shotType as "close-up" | "medium" | "wide" | "extreme-wide", args.angle);
    },
  },
  [IPC_CHANNELS.storyboardSetInstructions]: {
    validate: isValidStoryboardSetInstructionsArgs,
    handle: async (_event, args) => {
      return setInstructions(args.root, args.panelId, {
        compositionPrompt: args.compositionPrompt,
        backgroundDetail: args.backgroundDetail,
        artDirectionNotes: args.artDirectionNotes,
      });
    },
  },
  [IPC_CHANNELS.storyboardSnapshotsList]: {
    validate: isValidStoryboardRootArgs,
    handle: async (_event, args) => {
      return { snapshots: await listSnapshots(args.root) };
    },
  },
  [IPC_CHANNELS.storyboardSnapshotCreate]: {
    validate: isValidStoryboardSnapshotCreateArgs,
    handle: async (_event, args) => {
      return createSnapshot(args.root, { name: args.name, parentSnapshotId: args.parentSnapshotId });
    },
  },
  [IPC_CHANNELS.storyboardSnapshotRestore]: {
    validate: isValidStoryboardSnapshotRestoreArgs,
    handle: async (_event, args) => {
      return restoreSnapshot(args.root, args.snapshotId);
    },
  },
  [IPC_CHANNELS.layoutPages]: {
    validate: isValidLayoutRootArgs,
    handle: async (_event, args) => {
      return listLayoutBoard(args.root);
    },
  },
  [IPC_CHANNELS.layoutPage]: {
    validate: isValidLayoutPageArgs,
    handle: async (_event, args) => {
      return getLayoutPage(args.root, args.pageId);
    },
  },
  [IPC_CHANNELS.layoutPlace]: {
    validate: isValidLayoutPlaceArgs,
    handle: async (_event, args) => {
      return placePanel(args.root, {
        pageId: args.pageId,
        panelId: args.panelId,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
      });
    },
  },
  [IPC_CHANNELS.layoutUpdatePlacement]: {
    validate: isValidLayoutUpdatePlacementArgs,
    handle: async (_event, args) => {
      return updatePlacement(args.root, args.placementId, { x: args.x, y: args.y, width: args.width, height: args.height });
    },
  },
  [IPC_CHANNELS.layoutSetBorder]: {
    validate: isValidLayoutSetBorderArgs,
    handle: async (_event, args) => {
      return setBorder(args.root, {
        placementId: args.placementId,
        style: args.style as "none" | "thin" | "bold",
        widthMm: args.widthMm,
        rounded: args.rounded,
      });
    },
  },
  [IPC_CHANNELS.layoutCreateBalloon]: {
    validate: isValidLayoutCreateBalloonArgs,
    handle: async (_event, args) => {
      return createBalloon(args.root, {
        placementId: args.placementId,
        kind: args.kind as "speech" | "caption" | "thought",
        shape: args.shape as "ellipse" | "rounded" | "rect",
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        tail: args.tail,
      });
    },
  },
  [IPC_CHANNELS.layoutUpdateBalloon]: {
    validate: isValidLayoutUpdateBalloonArgs,
    handle: async (_event, args) => {
      return updateBalloon(args.root, args.balloonId, { x: args.x, y: args.y, width: args.width, height: args.height });
    },
  },
  [IPC_CHANNELS.layoutRetargetTail]: {
    validate: isValidLayoutRetargetTailArgs,
    handle: async (_event, args) => {
      return retargetTail(args.root, args.balloonId, { x: args.x, y: args.y, visible: args.visible });
    },
  },
  [IPC_CHANNELS.layoutSetLettering]: {
    validate: isValidLayoutSetLetteringArgs,
    handle: async (_event, args) => {
      return setLettering(args.root, { balloonId: args.balloonId, text: args.text });
    },
  },
  [IPC_CHANNELS.layoutSetSfx]: {
    validate: isValidLayoutSetSfxArgs,
    handle: async (_event, args) => {
      if (args.sfxId !== undefined) {
        return updateSfx(args.root, args.sfxId, {
          text: args.text,
          weight: args.weight as "regular" | "bold" | "heavy" | undefined,
          angle: args.angle,
          x: args.x,
          y: args.y,
          scale: args.scale,
        });
      }
      return createSfx(args.root, {
        placementId: args.placementId,
        text: args.text,
        weight: args.weight as "regular" | "bold" | "heavy" | undefined,
        angle: args.angle,
        x: args.x,
        y: args.y,
        scale: args.scale,
      });
    },
  },
  [IPC_CHANNELS.layoutSetReadingOrder]: {
    validate: isValidLayoutSetReadingOrderArgs,
    handle: async (_event, args) => {
      return setReadingOrder(args.root, { pageId: args.pageId, placementIds: args.placementIds });
    },
  },
  [IPC_CHANNELS.importPickFile]: {
    validate: isValidImportPickFileArgs,
    handle: async (_event, _args) => {
      void _args;
      // Rule 6: picking happens in the main process. The renderer
      // only receives the chosen path (or a cancellation).
      const focused = BrowserWindow.getFocusedWindow();
      const dialogOptions = {
        properties: [("openFile" as const)],
        filters: [{ name: "Manuscripts", extensions: ["txt", "md", "docx", "epub", "pdf"] }],
      };
      const result = focused
        ? await dialog.showOpenDialog(focused, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      if (result.canceled || result.filePaths.length === 0) {
        return { filePath: null as string | null, canceled: true };
      }
      return { filePath: result.filePaths[0], canceled: false };
    },
  },
  [IPC_CHANNELS.importList]: {
    validate: isValidImportRootArgs,
    handle: async (_event, args) => {
      return { manuscripts: await listManuscripts(args.root) };
    },
  },
  [IPC_CHANNELS.importImport]: {
    validate: isValidImportImportArgs,
    handle: async (_event, args) => {
      const format = detectManuscriptFormat(args.sourceAbsolutePath);
      if (!format) {
        throw new ManuscriptError("INVALID_FORMAT", `Unsupported manuscript format for: ${path.basename(args.sourceAbsolutePath)}`);
      }
      const title = args.title?.trim() ? args.title.trim() : undefined;
      if (format === "docx") {
        return { manuscript: await importDocxManuscript(args.root, { sourceAbsolutePath: args.sourceAbsolutePath, title }), ocr: null };
      }
      if (format === "epub") {
        return { manuscript: await importEpubManuscript(args.root, { sourceAbsolutePath: args.sourceAbsolutePath, title }), ocr: null };
      }
      if (format === "pdf") {
        return importPdfAutodetect(args.root, { sourceAbsolutePath: args.sourceAbsolutePath, title });
      }
      return { manuscript: await importManuscript(args.root, { sourceAbsolutePath: args.sourceAbsolutePath, title, format }), ocr: null };
    },
  },
  [IPC_CHANNELS.importVerify]: {
    validate: isValidImportKeyArgs,
    handle: async (_event, args) => {
      const record = await getManuscript(args.root, args.manuscriptId);
      if (!record) {
        throw new ManuscriptError("NOT_FOUND", `No manuscript with id: ${args.manuscriptId}`);
      }
      return verifyManuscript(args.root, record);
    },
  },
  [IPC_CHANNELS.importOcrGet]: {
    validate: isValidImportKeyArgs,
    handle: async (_event, args) => {
      const record = await getManuscript(args.root, args.manuscriptId);
      if (!record) {
        throw new ManuscriptError("NOT_FOUND", `No manuscript with id: ${args.manuscriptId}`);
      }
      return { ocr: await getOcrText(args.root, args.manuscriptId) };
    },
  },
  [IPC_CHANNELS.importOcrUpdate]: {
    validate: isValidImportOcrUpdateArgs,
    handle: async (_event, args) => {
      return { ocr: await updateOcrText(args.root, args.manuscriptId, args.ocrText) };
    },
  },
  // Text/Chapters UI (S8U.2): read/derive the stored S3.2/S3.3 rows
  // around the existing core services. No backend behavior changes.
  // Handlers project away the offset map (renderer never needs it).
  [IPC_CHANNELS.textGet]: {
    validate: isValidTextChapterKeyArgs,
    handle: async (_event, args) => {
      const record = await getManuscript(args.root, args.manuscriptId);
      if (!record) {
        throw new ManuscriptError("NOT_FOUND", `No manuscript with id: ${args.manuscriptId}`);
      }
      const normalization = await getNormalization(args.root, args.manuscriptId);
      return {
        normalization: normalization
          ? {
              manuscriptId: normalization.manuscriptId,
              normalizedText: normalization.normalizedText,
              byteLength: normalization.byteLength,
              createdAt: normalization.createdAt,
            }
          : null,
      };
    },
  },
  [IPC_CHANNELS.textNormalize]: {
    validate: isValidTextChapterKeyArgs,
    handle: async (_event, args) => {
      const record = await getManuscript(args.root, args.manuscriptId);
      if (!record) {
        throw new ManuscriptError("NOT_FOUND", `No manuscript with id: ${args.manuscriptId}`);
      }
      const stored = await storeNormalization(args.root, args.manuscriptId);
      return {
        normalization: {
          manuscriptId: stored.manuscriptId,
          normalizedText: stored.normalizedText,
          byteLength: stored.byteLength,
          createdAt: stored.createdAt,
        },
      };
    },
  },
  [IPC_CHANNELS.chaptersList]: {
    validate: isValidTextChapterKeyArgs,
    handle: async (_event, args) => {
      const record = await getManuscript(args.root, args.manuscriptId);
      if (!record) {
        throw new ManuscriptError("NOT_FOUND", `No manuscript with id: ${args.manuscriptId}`);
      }
      return { chapters: await listChapters(args.root, args.manuscriptId) };
    },
  },
  [IPC_CHANNELS.chaptersDerive]: {
    validate: isValidTextChapterKeyArgs,
    handle: async (_event, args) => {
      const record = await getManuscript(args.root, args.manuscriptId);
      if (!record) {
        throw new ManuscriptError("NOT_FOUND", `No manuscript with id: ${args.manuscriptId}`);
      }
      return { chapters: await storeChapters(args.root, args.manuscriptId) };
    },
  },
};

export function registerIpcHandlers(): void {
  for (const [channel, { validate, handle }] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, payload: IpcRequest<any>): Promise<IpcResult<any>> => {
      if (!payload || typeof payload !== "object" || !("args" in payload)) {
        return { ok: false, code: "INVALID_ARGUMENTS", message: "Missing args" };
      }
      const args = (payload as IpcRequest<any>).args;
      if (!validate(args)) {
        return { ok: false, code: "INVALID_ARGUMENTS", message: "Invalid arguments" };
      }
      try {
        const data = await handle(event, args);
        return { ok: true, data };
      } catch (err) {
        // S0.7: handler failures are recorded; the renderer still only
        // ever sees the safe envelope (no stack, no sensitive detail).
        // S1.10: project operation codes are preserved as envelope codes.
        // S6.11: storyboard core typed codes are preserved the same way.
        defaultLogService.logError(err, `ipc handler failed: ${channel}`);
        const code = coreErrorCode(err);
        if (code) {
          return { ok: false, code: code as never, message: err instanceof Error ? err.message : "Operation failed" };
        }
        return { ok: false, code: "HANDLER_ERROR", message: "Handler failed" };
      }
    });
  }
}
