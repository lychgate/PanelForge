// Shared IPC contract types (S0.4).
//
// One method per channel (D1). All requests carry a validated argument
// object; all responses use the standard envelope below. Zod is deferred
// (D1); validation in S0.4 is handwritten against these types, keeping the
// dependency footprint unchanged.

export type SafeErrorCode =
  | "INVALID_ARGUMENTS"
  | "NOT_FOUND"
  | "HANDLER_ERROR"
  | "UNREGISTERED_CHANNEL";

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: SafeErrorCode; message: string };

export type IpcRequest<TArgs> = {
  args: TArgs;
};

export type DiagnosticsPingArgs = {
  // Intentionally empty in S0.4: the allowlist registers one ping method
  // with strict no-args validation. S0.5 adds a diagnostic payload.
  token: string;
};

export type DiagnosticsPingData = {
  ok: true;
};

export type DiagnosticsGetArgs = {
  // Diagnostic request takes no arguments; the handler returns a minimal
  // safe payload proving the renderer → main path works end-to-end.
  token: string;
};

export type DiagnosticsGetData = {
  appName: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  channel: string;
  timestamp: string;
};
