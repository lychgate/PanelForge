// PanelForge — preload bridge (S8.12).
//
// Restricted bridge: exposes a frozen API object via contextBridge.
// - diagnostics.get() — the S0.5 diagnostic round-trip.
// - project.* — S1.10 basic project operations (S1.3 core ops via IPC).
// - storyboard.* — S6.11 minimal storyboard UI surface (read board,
//   edit text/camera/instructions, snapshot create/list/restore).
// - layout.* — S8.12 hand-rolled layout UI surface (read pages,
//   place/move placements, borders, balloons, lettering, SFX,
//   reading order). No export surface (Stage 10).
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
  storyboard: Object.freeze({
    async list(args: StoryboardRootArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.list", { root: args.root });
    },
    async panelDetails(args: StoryboardPanelDetailsArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.panelDetails", { root: args.root, panelId: args.panelId });
    },
    async createPanel(args: StoryboardCreatePanelArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.createPanel", { root: args.root, sceneId: args.sceneId });
    },
    async setText(args: StoryboardSetTextArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.setText", {
        root: args.root,
        panelId: args.panelId,
        dialogue: args.dialogue,
        captions: args.captions,
        actions: args.actions,
        expressions: args.expressions,
      });
    },
    async setCamera(args: StoryboardSetCameraArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.setCamera", {
        root: args.root,
        panelId: args.panelId,
        shotType: args.shotType,
        angle: args.angle,
      });
    },
    async setInstructions(args: StoryboardSetInstructionsArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.setInstructions", {
        root: args.root,
        panelId: args.panelId,
        compositionPrompt: args.compositionPrompt,
        backgroundDetail: args.backgroundDetail,
        artDirectionNotes: args.artDirectionNotes,
      });
    },
    async snapshotsList(args: StoryboardRootArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.snapshots.list", { root: args.root });
    },
    async snapshotCreate(args: StoryboardSnapshotCreateArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.snapshot.create", {
        root: args.root,
        name: args.name,
        parentSnapshotId: args.parentSnapshotId,
      });
    },
    async snapshotRestore(args: StoryboardSnapshotRestoreArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:storyboard.snapshot.restore", {
        root: args.root,
        snapshotId: args.snapshotId,
      });
    },
  }),
  layout: Object.freeze({
    async pages(args: LayoutRootArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.pages", { root: args.root });
    },
    async page(args: LayoutPageArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.page", { root: args.root, pageId: args.pageId });
    },
    async place(args: LayoutPlaceArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.place", {
        root: args.root,
        pageId: args.pageId,
        panelId: args.panelId,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
      });
    },
    async updatePlacement(args: LayoutUpdatePlacementArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.updatePlacement", {
        root: args.root,
        placementId: args.placementId,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
      });
    },
    async setBorder(args: LayoutSetBorderArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.setBorder", {
        root: args.root,
        placementId: args.placementId,
        style: args.style,
        widthMm: args.widthMm,
        rounded: args.rounded,
      });
    },
    async createBalloon(args: LayoutCreateBalloonArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.createBalloon", {
        root: args.root,
        placementId: args.placementId,
        kind: args.kind,
        shape: args.shape,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        tail: args.tail,
      });
    },
    async updateBalloon(args: LayoutUpdateBalloonArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.updateBalloon", {
        root: args.root,
        balloonId: args.balloonId,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
      });
    },
    async retargetTail(args: LayoutRetargetTailArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.retargetTail", {
        root: args.root,
        balloonId: args.balloonId,
        x: args.x,
        y: args.y,
        visible: args.visible,
      });
    },
    async setLettering(args: LayoutSetLetteringArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.setLettering", {
        root: args.root,
        balloonId: args.balloonId,
        text: args.text,
      });
    },
    async setSfx(args: LayoutSetSfxArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.setSfx", {
        root: args.root,
        placementId: args.placementId,
        text: args.text,
        weight: args.weight,
        angle: args.angle,
        x: args.x,
        y: args.y,
        scale: args.scale,
        sfxId: args.sfxId,
      });
    },
    async setReadingOrder(args: LayoutSetReadingOrderArgs): Promise<IpcResult<any>> {
      return invoke<any>("panelforge:layout.setReadingOrder", {
        root: args.root,
        pageId: args.pageId,
        placementIds: args.placementIds,
      });
    },
  }),
  version: Object.freeze({}),
});

contextBridge.exposeInMainWorld("panelforge", api);
