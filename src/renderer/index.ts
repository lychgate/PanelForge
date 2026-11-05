// PanelForge — renderer entry (S0.3).
//
// Minimal renderer: renders a static placeholder page and has no
// business logic, no Node.js API use, and no IPC. Real UI arrives in later
// stages once the S0.4–S0.5 security/IPC boundary exists.

const root = document.getElementById("root");
if (root) {
  root.textContent = "PanelForge — initial window (S0.3)";
}
