// Centralized IPC registration and dispatch (S0.4).
//
// Single module that owns every `ipcMain.handle` call in the app.
// - Channel names come from a frozen allowlist map (no stringly-typed
//   channels scattered across main).
// - Each handler validates its arguments before running; invalid args are
//   rejected with a safe error envelope (no stack traces to the renderer).
// - Handlers are centralized: add a channel here, never elsewhere.

import { app, ipcMain, IpcMainInvokeEvent } from "electron";
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
