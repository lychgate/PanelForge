// PanelForge — preload bridge (S1.10).
//
// Restricted bridge: exposes a frozen API object via contextBridge.
// - diagnostics.get() — the S0.5 diagnostic round-trip.
// - project.* — S1.10 basic project operations (S1.3 core ops via IPC).
// The preload wraps the approved channels and does not expose
// ipcRenderer itself to the renderer.

import { contextBridge, ipcRenderer } from "electron";
import type {
  DiagnosticsGetData,
  IpcResult,
  ProjectArchiveData,
  ProjectCloseData,
  ProjectCreateArgs,
  ProjectCreateData,
  ProjectListData,
  ProjectOpenData,
  ProjectRenameData,
} from "../shared/types";

async function invoke<T>(channel: string, args: Record<string, unknown>): Promise<IpcResult<T>> {
  try {
    return (await ipcRenderer.invoke(channel, { args }) as unknown) as IpcResult<T>;
  } catch (err) {
    return {
      ok: false,
      code: "HANDLER_ERROR",
      message: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

const api = Object.freeze({
  diagnostics: Object.freeze({
    async get(): Promise<IpcResult<DiagnosticsGetData>> {
      return invoke<DiagnosticsGetData>("panelforge:diagnostics.get", { token: "diagnostic" });
    },
  }),
  project: Object.freeze({
    async create(args: ProjectCreateArgs): Promise<IpcResult<ProjectCreateData>> {
      return invoke<ProjectCreateData>("panelforge:project.create", {
        name: args.name,
        description: args.description ?? null,
      });
    },
    async list(): Promise<IpcResult<ProjectListData>> {
      return invoke<ProjectListData>("panelforge:project.list", {});
    },
    async open(root: string): Promise<IpcResult<ProjectOpenData>> {
      return invoke<ProjectOpenData>("panelforge:project.open", { root });
    },
    async close(root: string): Promise<IpcResult<ProjectCloseData>> {
      return invoke<ProjectCloseData>("panelforge:project.close", { root });
    },
    async rename(root: string, newName: string): Promise<IpcResult<ProjectRenameData>> {
      return invoke<ProjectRenameData>("panelforge:project.rename", { root, newName });
    },
    async archive(root: string): Promise<IpcResult<ProjectArchiveData>> {
      return invoke<ProjectArchiveData>("panelforge:project.archive", { root });
    },
  }),
  version: Object.freeze({}),
});

contextBridge.exposeInMainWorld("panelforge", api);
