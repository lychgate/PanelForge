// S7.15 Stage 7 acceptance fixture tests.
//
// Stage-gate proof: a storyboard panel flows to first
// artwork — prompt assembled → conditioned → generated
// (fixture ComfyUI) → compared against approved refs →
// approved; variations + inpaint/outpaint produce new
// versions; approved work preserved throughout.
//
// Provenance complete for every generated version;
// version history retained; the approved pointer ends on
// the fixture's approved version.
//
// Imported from the built stage modules.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const templatesPath = path.join(root, "out/node/core/project/workflow-templates.js");
const assemblyPath = path.join(root, "out/node/core/project/prompt-assembly.js");
const negativesPath = path.join(root, "out/node/core/project/negative-prompts.js");
const conditioningPath = path.join(root, "out/node/core/project/reference-conditioning.js");
const generationPath = path.join(root, "out/node/core/project/panel-generation.js");
const variationsPath = path.join(root, "out/node/core/project/variations.js");
const inpaintPath = path.join(root, "out/node/core/project/inpaint.js");
const outpaintPath = path.join(root, "out/node/core/project/outpaint.js");
const comparisonPath = path.join(root, "out/node/core/project/comparison.js");
const provenancePath = path.join(root, "out/node/core/project/provenance.js");
const approvalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const provisionalPath = path.join(root, "out/node/engines/provider/provisioning.js");
const adapterPath = path.join(root, "out/node/engines/provider/comfyui.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalVPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const versionRefsPath = path.join(root, "out/node/core/project/version-references.js");
if (!fs.existsSync(servicePath) || !fs.existsSync(provisionalPath)) {
  throw new Error("Missing built modules — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { setInstructions } = require(instructionsPath);
const { saveTemplate } = require(templatesPath);
const { assemblePanelPrompt, savePanelPrompt } = require(assemblyPath);
const { assembleNegativeForPanel } = require(negativesPath);
const { setConditioning } = require(conditioningPath);
const { generatePanel, listArtwork } = require(generationPath);
const { generateVariations } = require(variationsPath);
const { setInpaintRegions, inpaintPanel } = require(inpaintPath);
const { setOutpaintExtension, outpaintPanel } = require(outpaintPath);
const { compareTwo, compareVsApprovedPortrait } = require(comparisonPath);
const { getProvenance } = require(provenancePath);
const { setArtworkApproval, getApprovedArtwork, listHistory, restoreApproved } = require(approvalPath);
const { detectEngines } = require(provisionalPath);
const { createComfyUiAdapter } = require(adapterPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval: setVersionApproval } = require(approvalVPath);
const { assignCharacter } = require(assignmentsPath);
const { importAsset } = require(registryPath);
const { associateReference } = require(versionRefsPath);

const PNG_BYTES = Buffer.from("89504e470d0a1a0av2", "hex");

const TEMPLATE = {
  "1": { class_type: "CLIPTextEncode", inputs: { text: "positive" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "negative" } },
  "3": { class_type: "KSampler", inputs: { seed: 0, width: 512, height: 512 } },
  "4": { class_type: "SaveImage", inputs: { filename_prefix: "panel" } },
};

let server;
let baseUrl;

function startFixture() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.local");
    if (url.pathname === "/system_stats" || url.pathname === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(url.pathname === "/v1/models" ? JSON.stringify({ data: [{ id: "fixture-model" }] }) : JSON.stringify({ system: {} }));
    } else if (url.pathname === "/prompt") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ prompt_id: "p1", node_errors: {} }));
    } else if (url.pathname === "/history/p1") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ p1: { status: { completed: true }, outputs: { 4: { images: [{ filename: "panel.png", subfolder: "", type: "output" }] } } } }));
    } else if (url.pathname === "/view") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG_BYTES);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

let projectRoot;
let panelId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  await setInstructions(projectRoot, panelId, { compositionPrompt: "wide, tavern at dawn" });
  const { prompt } = await assemblePanelPrompt(projectRoot, { panelId });
  await savePanelPrompt(projectRoot, { panelId, prompt });
  await assembleNegativeForPanel(projectRoot, { panelId, jobNegative: "no text" });
  await saveTemplate(projectRoot, { name: "panel-ink", workflow: TEMPLATE, version: "v1" });

  const character = await createCharacter(projectRoot, { name: "Robby" });
  const version = await createVersion(projectRoot, { characterId: character.characterId, label: "v1" });
  await setVersionApproval(projectRoot, version.versionId, "approved", "fixture approval");
  await assignCharacter(projectRoot, panelId, character.characterId, version.versionId);
  const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  fs.writeFileSync(path.join(assetScratch, "portrait.png"), "fixture-portrait");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: path.join(assetScratch, "portrait.png"),
    assetType: "reference",
    destinationRelative: "references/portrait.png",
  });
  await associateReference(projectRoot, { versionId: version.versionId, assetId: asset.assetId, slot: "portrait" });
  await setConditioning(projectRoot, { panelId, character: { versionId: version.versionId, slot: "portrait" } });
});

describe("S7.15 Stage 7 acceptance fixture", () => {
  it(
    "full pipeline: generate → vary + repaint → compare → approve → restore; provenance complete; history retained",
    async () => {
      await startFixture();
      const adapter = createComfyUiAdapter({ baseUrl });

      // 1. Generate the panel's first artwork.
      const first = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter, seed: 7 });
      expect(first.generation.prompt).toContain("wide, tavern at dawn");
      expect(first.generation.negativePrompt).toBe("no text");

      // 2. Variations + inpaint + outpaint produce new versions.
      const variations = await generateVariations(projectRoot, { panelId, templateName: "panel-ink", count: 2, adapter, seed: 20 });
      expect(variations.variants).toHaveLength(2);
      await setInpaintRegions(projectRoot, { panelId, regions: [{ x: 10, y: 10, width: 100, height: 80 }] });
      const inpainted = await inpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
      await setOutpaintExtension(projectRoot, { panelId, extension: { left: 50, right: 50, top: 0, bottom: 0 } });
      const outpainted = await outpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
      expect(outpainted.artwork.versionNo).toBe(5);

      // 3. Compare against approved refs (side-by-side + portrait modes).
      const pair = await compareTwo(projectRoot, first.artwork.artworkId, outpainted.artwork.artworkId);
      // The fixture server serves identical bytes for every run,
      // so pixel-identity holds by construction of the fixture.
      expect(pair.identical).toBe(true);
      const portraitPair = await compareVsApprovedPortrait(projectRoot, panelId);
      expect(portraitPair.b.assetId).toBeDefined();

      // 4. Approve the outpainted version; restore back to v1; history retained.
      await setArtworkApproval(projectRoot, { artworkId: outpainted.artwork.artworkId, status: "approved", rationale: "fixture ship" });
      expect((await getApprovedArtwork(projectRoot, panelId)).artworkId).toBe(outpainted.artwork.artworkId);
      await restoreApproved(projectRoot, { panelId, artworkId: first.artwork.artworkId, rationale: "fixture restore check" });
      expect((await getApprovedArtwork(projectRoot, panelId)).artworkId).toBe(first.artwork.artworkId);
      const history = await listHistory(projectRoot, panelId);
      expect(history).toHaveLength(5);

      // 5. Provenance complete for every generated version + engine detection.
      for (const entry of history) {
        const provenance = await getProvenance(projectRoot, entry.artworkId);
        expect(provenance.prompt).toBeTruthy();
        expect(provenance.templateName).toBe("panel-ink");
        expect(provenance.provider).toBe("comfyui");
      }
      const detected = await detectEngines(baseUrl, baseUrl);
      expect(detected.comfyui.detected).toBe(true);
      expect(detected.lmstudio.detected).toBe(true);

      server.close();
    },
    120000
  );
});
