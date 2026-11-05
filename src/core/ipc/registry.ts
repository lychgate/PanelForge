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
} from "../../shared/types";

export const IPC_CHANNELS = {
  diagnosticsPing: "panelforge:diagnostics.ping",
  diagnosticsGet: "panelforge:diagnostics.get",
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
      } catch {
        return { ok: false, code: "HANDLER_ERROR", message: "Handler failed" };
      }
    });
  }
}
