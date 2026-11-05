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
  | "UNREGISTERED_CHANNEL"
  // Project operations (S1.10) surface their typed codes directly.
  | "INVALID_NAME"
  | "NOT_A_PROJECT"
  | "CORRUPT_MARKER"
  | "UNSUPPORTED_VERSION"
  | "ALREADY_OPEN"
  | "ALREADY_CLOSED"
  | "ALREADY_EXISTS"
  | "INVALID_STATE";

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

// Project operations (S1.10) — one method per channel (D1). "parentDir"
// is optional in args: when omitted the main process resolves the
// projects library dir (<userData>/projects). UI callers normally omit it.
export type ProjectSummaryData = {
  root: string;
  projectId: string;
  name: string;
};

export type ProjectCreateArgs = {
  name: string;
  description?: string | null;
  parentDir?: string;
};

export type ProjectCreateData = {
  root: string;
  projectId: string;
};

export type ProjectListArgs = {
  parentDir?: string;
};

export type ProjectListData = {
  projects: ProjectSummaryData[];
};

export type ProjectOpenArgs = {
  root: string;
};

export type ProjectOpenData = ProjectSummaryData;

export type ProjectCloseArgs = {
  root: string;
};

export type ProjectCloseData = {
  closed: true;
};

export type ProjectRenameArgs = {
  root: string;
  newName: string;
};

export type ProjectRenameData = {
  root: string;
  projectId: string;
};

export type ProjectArchiveArgs = {
  root: string;
};

export type ProjectArchiveData = {
  root: string;
  projectId: string;
};
