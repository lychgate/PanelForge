// PanelForge — keyboard shortcut registry (S0.10).
//
// Small, dependency-free registry mapping key combinations to named
// actions. It is deliberately DOM-free (no document access at import or
// use) so the matching logic unit-tests in plain Node; the renderer entry
// points it at real key events. Combinations normalize to
// "modifier+modifier+key" (lowercased key, modifiers sorted), so
// registrations and incoming events compare exactly. Registering the
// same id or combination twice throws — accidental ambiguity is a
// programming error, surfaced in tests, not in shipped UI.

export type KeyInput = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

export type ShortcutDef = {
  id: string;
  label: string;
  combo: string; // normalized form
};

const MODIFIERS = ["alt", "ctrl", "meta", "shift"] as const;

export function normalizeCombo(input: KeyInput | string): string {
  if (typeof input === "string") {
    const parts = input
      .split("+")
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 0);
    const key = parts.filter((p) => !(MODIFIERS as readonly string[]).includes(p)).pop() ?? "";
    const mods = MODIFIERS.filter((m) => parts.includes(m));
    return key ? [...mods, key].join("+") : mods.join("+");
  }
  const key = input.key.toLowerCase();
  const mods = MODIFIERS.filter((m) => {
    switch (m) {
      case "alt":
        return input.altKey === true;
      case "ctrl":
        return input.ctrlKey === true;
      case "meta":
        return input.metaKey === true;
      case "shift":
        return input.shiftKey === true;
    }
  });
  return [...mods, key].join("+");
}

export type ShortcutRegistry = {
  register: (id: string, label: string, combo: string) => ShortcutDef;
  find: (input: KeyInput | string) => ShortcutDef | null;
  list: () => ShortcutDef[];
  size: () => number;
};

export function createShortcutRegistry(): ShortcutRegistry {
  const byId = new Map<string, ShortcutDef>();
  const byCombo = new Map<string, ShortcutDef>();

  function register(id: string, label: string, combo: string): ShortcutDef {
    if (id.trim().length === 0) throw new Error("Shortcut id must not be empty");
    const normalized = normalizeCombo(combo);
    if (normalized.length === 0) throw new Error(`Shortcut combo must not be empty: ${combo}`);
    if (byId.has(id)) throw new Error(`Duplicate shortcut id: ${id}`);
    if (byCombo.has(normalized)) throw new Error(`Duplicate shortcut combo: ${normalized}`);
    const def: ShortcutDef = { id, label, combo: normalized };
    byId.set(id, def);
    byCombo.set(normalized, def);
    return def;
  }

  function find(input: KeyInput | string): ShortcutDef | null {
    return byCombo.get(normalizeCombo(input)) ?? null;
  }

  function list(): ShortcutDef[] {
    return [...byId.values()];
  }

  function size(): number {
    return byId.size;
  }

  return { register, find, list, size };
}
