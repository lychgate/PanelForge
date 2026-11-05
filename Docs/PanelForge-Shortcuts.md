# PanelForge — Keyboard Shortcuts

Core navigation is fully usable without a mouse: every control is a native
focusable element (`Tab` + `Enter`/`Space`), and the views below have
dedicated shortcuts. All shortcuts are registered through the renderer
shortcut registry (`src/renderer/shortcuts.ts`) and documented here.

| Shortcut | Action |
|---|---|
| `Alt+1` | Go to the Diagnostics view |
| `Alt+2` | Go to the About view |
| `Tab` / `Shift+Tab` | Move focus through navigation and view controls |
| `Enter` / `Space` | Activate the focused control |
| `Ctrl+Q` (`Cmd+Q` on macOS) | Quit the application (application menu, File) |
| `Ctrl+R` (`Cmd+R` on macOS) | Reload the window (application menu, View) |

Notes:

- The diagnostics bridge call still only exposes
  `panelforge:diagnostics.ping` and `panelforge:diagnostics.get`; shortcuts
  never bypass the preload allowlist.
- Focus is always visible (`:focus-visible` outline in `index.html`).
- The current view is marked with `aria-current="page"` on its nav button.
