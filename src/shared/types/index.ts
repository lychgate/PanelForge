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
  | "INVALID_STATE"
  // Storyboard UI (S6.11) surfaces core typed codes directly.
  | "NOT_APPROVED"
  | "BOUND_PANEL"
  | "BOUND_VERSION"
  // Import UI (S8U.1) surfaces core typed codes directly.
  | "INVALID_FORMAT"
  | "SOURCE_NOT_FOUND"
  | "OCR_UNAVAILABLE"
  | "OCR_FAILED";

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

// Storyboard UI (S6.11) — one method per channel (D1). "root" is
// the project directory resolved by the main process; the
// renderer never touches the database directly.
export type StoryboardRootArgs = {
  root: string;
};

export type StoryboardPanelDetailsArgs = {
  root: string;
  panelId: string;
};

export type StoryboardKeyArgs = StoryboardPanelDetailsArgs;

export type StoryboardSetTextArgs = {
  root: string;
  panelId: string;
  dialogue?: string;
  captions?: string;
  actions?: string;
  expressions?: string;
};

export type StoryboardSetCameraArgs = {
  root: string;
  panelId: string;
  shotType: string;
  angle?: string;
};

export type StoryboardSetInstructionsArgs = {
  root: string;
  panelId: string;
  compositionPrompt?: string;
  backgroundDetail?: string;
  artDirectionNotes?: string;
};

export type StoryboardCreatePanelArgs = {
  root: string;
  sceneId: string;
};

export type StoryboardSnapshotCreateArgs = {
  root: string;
  name?: string;
  parentSnapshotId?: string;
};

export type StoryboardSnapshotRestoreArgs = {
  root: string;
  snapshotId: string;
};

// Layout UI (S8.12) — one method per channel (D1). "root" is the
// project directory resolved by the main process; the renderer
// never touches the database directly.
export type LayoutRootArgs = {
  root: string;
};

export type LayoutPageArgs = {
  root: string;
  pageId: string;
};

export type LayoutPlaceArgs = {
  root: string;
  pageId: string;
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutUpdatePlacementArgs = {
  root: string;
  placementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutSetBorderArgs = {
  root: string;
  placementId: string;
  style: string;
  widthMm?: number;
  rounded?: boolean;
};

export type LayoutCreateBalloonArgs = {
  root: string;
  placementId: string;
  kind: string;
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tail?: { x: number; y: number; visible?: boolean };
};

export type LayoutUpdateBalloonArgs = {
  root: string;
  balloonId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutRetargetTailArgs = {
  root: string;
  balloonId: string;
  x: number;
  y: number;
  visible: boolean;
};

export type LayoutSetLetteringArgs = {
  root: string;
  balloonId: string;
  text: string;
};

export type LayoutSetSfxArgs = {
  root: string;
  placementId: string;
  text: string;
  weight?: string;
  angle?: number;
  x: number;
  y: number;
  scale?: number;
  sfxId?: string;
};

export type LayoutSetReadingOrderArgs = {
  root: string;
  pageId: string;
  placementIds: string[];
};

// Import UI (S8U.1) — one method per channel (D1). "root" is the
// project directory resolved by the main process; the file the
// renderer imports was picked by the main-process dialog
// (rule 6), never typed by the renderer itself.
export type ImportRootArgs = {
  root: string;
};

export type ImportImportArgs = {
  root: string;
  sourceAbsolutePath: string;
  title?: string;
};

export type ImportVerifyArgs = {
  root: string;
  manuscriptId: string;
};

export type ImportOcrGetArgs = {
  root: string;
  manuscriptId: string;
};

export type ImportOcrUpdateArgs = {
  root: string;
  manuscriptId: string;
  ocrText: string;
};
