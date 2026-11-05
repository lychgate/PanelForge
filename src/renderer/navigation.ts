// PanelForge — basic navigation model (S0.10).
//
// The app shell's core navigation: a small ordered set of views with a
// single current view. DOM-free (no document access) so it unit-tests in
// plain Node; the renderer entry renders nav buttons + sections from it.
// Unknown views are rejected (go() returns false and stays put) rather
// than silently navigating nowhere.

export type Navigation = {
  list: () => string[];
  current: () => string;
  go: (view: string) => boolean;
};

export function createNavigation(views: readonly string[], initial?: string): Navigation {
  const ordered = [...views];
  const start = initial && ordered.includes(initial) ? initial : ordered[0];
  if (!start) throw new Error("Navigation needs at least one view");
  let currentView = start;
  return {
    list: () => [...ordered],
    current: () => currentView,
    go: (view: string): boolean => {
      if (!ordered.includes(view)) return false;
      currentView = view;
      return true;
    },
  };
}
