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

export const IPC_CHANNELS = {
  diagnosticsPing: "panelforge:diagnostics.ping",
  diagnosticsGet: "panelforge:diagnostics.get",
  projectCreate: "panelforge:project.create",
  projectList: "panelforge:project.list",
  projectOpen: "panelforge:project.open",
  projectClose: "panelforge:project.close",
  projectRename: "panelforge:project.rename",
  projectArchive: "panelforge:project.archive",
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
        defaultLogService.logError(err, `ipc handler failed: ${channel}`);
        if (err instanceof ProjectOpError) {
          return { ok: false, code: err.code as never, message: err.message };
        }
        return { ok: false, code: "HANDLER_ERROR", message: "Handler failed" };
      }
    });
  }
}
