// PanelForge — application lifecycle service (S0.9).
//
// Formalizes the startup/shutdown behavior that S0.6–S0.8 wired ad-hoc
// in main (spec: reliable startup and shutdown; the app must start and
// close without leaving avoidable resources behind).
//
// - Startup: an ordered list of steps runs in sequence. Each step is
//   failure-isolated — a throwing step is recorded in the summary and
//   later steps still run, so the window always opens.
// - Shutdown: registered cleanup hooks run in reverse registration
//   order (LIFO, so teardown unwinds setup), each failure-isolated.
//   shutdown() is idempotent: a second call runs no hooks.
// - State machine: idle → starting → ready → shutting-down → closed.
// - Lifecycle events ({type, name?, at}) are broadcast to registered
//   listeners for future engine/module use.
// - The service is dependency-free (steps/hooks are callbacks), so it
//   unit-tests in plain Node and never throws on its own behalf.

export type LifecycleState = "idle" | "starting" | "ready" | "shutting-down" | "closed";

export type StartupStep = {
  name: string;
  run: () => void | Promise<void>;
};

export type CleanupHook = {
  name: string;
  run: () => void | Promise<void>;
};

export type LifecycleEventType =
  | "startup:step"
  | "startup:complete"
  | "shutdown:step"
  | "shutdown:complete";

export type LifecycleEvent = {
  type: LifecycleEventType;
  name?: string;
  at: string;
};

export type StartupSummary = {
  ok: boolean;
  completed: string[];
  failed: string[];
};

export type ShutdownSummary = {
  ok: boolean;
  completed: string[];
  failed: string[];
};

type Listener = (event: LifecycleEvent) => void;

export type LifecycleService = {
  getState: () => LifecycleState;
  addListener: (listener: Listener) => void;
  start: (steps: StartupStep[]) => Promise<StartupSummary>;
  registerCleanup: (hook: CleanupHook) => void;
  shutdown: () => Promise<ShutdownSummary>;
  getCleanupNames: () => string[];
};

export function createLifecycleService(onEvent?: Listener): LifecycleService {
  let state: LifecycleState = "idle";
  const listeners: Listener[] = onEvent ? [onEvent] : [];
  const cleanups: CleanupHook[] = [];
  let startupSummary: StartupSummary | null = null;
  let shutdownSummary: ShutdownSummary | null = null;

  function emit(type: LifecycleEventType, name?: string): void {
    const event: LifecycleEvent = { type, name, at: new Date().toISOString() };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not affect lifecycle behavior.
      }
    }
  }

  function getState(): LifecycleState {
    return state;
  }

  function addListener(listener: Listener): void {
    listeners.push(listener);
  }

  async function start(steps: StartupStep[]): Promise<StartupSummary> {
    if (state === "ready" && startupSummary) return startupSummary;
    if (state === "closed" || state === "shutting-down") {
      return { ok: false, completed: [], failed: ["lifecycle-closed"] };
    }
    state = "starting";
    const summary: StartupSummary = { ok: true, completed: [], failed: [] };
    for (const step of steps) {
      emit("startup:step", step.name);
      try {
        await step.run();
        summary.completed.push(step.name);
      } catch {
        summary.failed.push(step.name);
      }
    }
    summary.ok = summary.failed.length === 0;
    startupSummary = summary;
    state = "ready";
    emit("startup:complete");
    return summary;
  }

  function registerCleanup(hook: CleanupHook): void {
    cleanups.push(hook);
  }

  function getCleanupNames(): string[] {
    return cleanups.map((c) => c.name);
  }

  async function shutdown(): Promise<ShutdownSummary> {
    if (state === "closed" && shutdownSummary) return shutdownSummary;
    state = "shutting-down";
    const summary: ShutdownSummary = { ok: true, completed: [], failed: [] };
    for (let i = cleanups.length - 1; i >= 0; i--) {
      const hook = cleanups[i];
      emit("shutdown:step", hook.name);
      try {
        await hook.run();
        summary.completed.push(hook.name);
      } catch {
        summary.failed.push(hook.name);
      }
    }
    summary.ok = summary.failed.length === 0;
    shutdownSummary = summary;
    state = "closed";
    emit("shutdown:complete");
    return summary;
  }

  return {
    getState,
    addListener,
    start,
    registerCleanup,
    shutdown,
    getCleanupNames,
  };
}

// Default singleton used by the main process.
export const defaultLifecycleService = createLifecycleService();
