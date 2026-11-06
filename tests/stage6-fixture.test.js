// S6.13 Stage 6 acceptance fixture tests.
//
// End-to-end proof of Stage 6 on the real book: import one
// tests/TestData chapter (scanned PDF → autodetect → OCR
// fallback with the saved editable text copy) → storyboard it
// (scenes, panels, assignments, camera, dialogue,
// instructions) → snapshot + branch + restore → composition
// review. Storyboard changes never touch approved artwork
// (character versions, style profiles, and assets stay
// byte-identical throughout).
//
// Characters are invented for the fixture, never asserted as
// canon.
//
// Imported from the built `out/node/core/project/pdf-ocr.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ocrPath = path.join(root, "out/node/core/project/pdf-ocr.js");
if (!fs.existsSync(ocrPath)) {
  throw new Error("Missing out/node/core/project/pdf-ocr.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const locAssignmentsPath = path.join(root, "out/node/core/project/panel-location-assignments.js");
const camerasPath = path.join(root, "out/node/core/project/panel-cameras.js");
const textPath = path.join(root, "out/node/core/project/panel-text.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const snapshotsPath = path.join(root, "out/node/core/project/snapshots.js");
const reviewPath = path.join(root, "out/node/core/project/composition-review.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { createLocation } = require(locationsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter } = require(assignmentsPath);
const { assignLocation } = require(locAssignmentsPath);
const { setCamera } = require(camerasPath);
const { setText } = require(textPath);
const { setInstructions } = require(instructionsPath);
const { createSnapshot, restoreSnapshot } = require(snapshotsPath);
const { reviewBoard } = require(reviewPath);
const { createStyle } = require(stylesPath);
const { importPdfAutodetect, getOcrText, updateOcrText } = require(ocrPath);

const CHAPTER_PDF = path.join(root, "tests/TestData/Chapter 1 - The Last Normal Day.pdf");

let projectRoot;
let manuscriptId;
let sceneId;
let panelId;
let versionId;
let styleId;

function dumpArtwork() {
  const { openProjectDatabase } = require(metadataPath);
  const { db } = openProjectDatabase(projectRoot);
  try {
    const dump = {};
    for (const table of ["character_versions", "characters", "styles", "assets", "locations"]) {
      dump[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => JSON.stringify(row)).sort();
    }
    return JSON.stringify(dump);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  expect(fs.existsSync(CHAPTER_PDF)).toBe(true);
});

describe("S6.13 Stage 6 acceptance fixture (real book chapter)", () => {
  it(
    "autodetect OCRs the scanned chapter once; saved copy is editable and reused on re-import",
    async () => {
      const first = await importPdfAutodetect(projectRoot, { sourceAbsolutePath: CHAPTER_PDF });
      expect(first.ocr).not.toBeNull();
      expect(first.ocr.pageCount).toBe(2);
      expect(first.ocr.ocrText).toContain("Ravenholt");
      manuscriptId = first.manuscript.manuscriptId;

      // Re-import reuses the saved copy (still one OCR row, same text).
      const second = await importPdfAutodetect(projectRoot, { sourceAbsolutePath: CHAPTER_PDF });
      expect(second.ocr.ocrText).toBe(first.ocr.ocrText);
      const { openProjectDatabase } = require(metadataPath);
      let ocrRowCount;
      {
        const { db } = openProjectDatabase(projectRoot);
        try {
          ocrRowCount = Number(db.prepare("SELECT COUNT(*) AS n FROM manuscript_ocr").get().n);
        } finally {
          db.close();
        }
      }
      expect(ocrRowCount).toBe(1);

      // The saved copy is editable (owner corrections persist).
      const corrected = await updateOcrText(projectRoot, manuscriptId, "Corrected: Ravenholt at dawn.");
      expect(corrected.ocrText).toBe("Corrected: Ravenholt at dawn.");
      expect((await getOcrText(projectRoot, manuscriptId)).ocrText).toBe("Corrected: Ravenholt at dawn.");
      // Restore the real OCR text for the storyboard assertions below.
      await updateOcrText(projectRoot, manuscriptId, first.ocr.ocrText);
    },
    300000
  );

  it(
    "full pipeline on the imported chapter: storyboard → snapshot/branch/restore → clean review; artwork byte-identical",
    async () => {
      const imported = await importPdfAutodetect(projectRoot, { sourceAbsolutePath: CHAPTER_PDF });
      manuscriptId = imported.manuscript.manuscriptId;

      const scene = await createScene(projectRoot, { manuscriptId, narrativePurpose: "Ravenholt morning (fixture)" });
      sceneId = scene.sceneId;
      panelId = (await createPanel(projectRoot, sceneId)).panelId;
      const character = await createCharacter(projectRoot, { name: "Robby", age: "7" });
      const version = await createVersion(projectRoot, { characterId: character.characterId, label: "Robert, age 7", age: "7" });
      versionId = version.versionId;
      await setApproval(projectRoot, versionId, "approved", "fixture approval");
      await assignCharacter(projectRoot, panelId, character.characterId, versionId);
      const location = await createLocation(projectRoot, { name: "Ravenholt towers" });
      await assignLocation(projectRoot, panelId, location.locationId);
      await setCamera(projectRoot, panelId, "wide", "low");
      await setText(projectRoot, panelId, { dialogue: "We go.", actions: "Robby stands.", captions: "Ravenholt at dawn." });
      await setInstructions(projectRoot, panelId, { compositionPrompt: "wide, towers, dawn" });
      styleId = (await createStyle(projectRoot, { name: "Fixture Ink", lighting: "pale gold" })).styleId;

      const artworkBefore = dumpArtwork();

      // Snapshot + branch + restore.
      const parent = await createSnapshot(projectRoot, { name: "fixture-parent" });
      await setText(projectRoot, panelId, { dialogue: "branched" });
      const child = await createSnapshot(projectRoot, { name: "fixture-branch", parentSnapshotId: parent.snapshotId });
      await restoreSnapshot(projectRoot, child.snapshotId);
      await restoreSnapshot(projectRoot, parent.snapshotId);

      // Composition review: fully wired panel passes silently.
      const review = await reviewBoard(projectRoot, { sceneId });
      expect(review.warnings).toEqual([]);
      expect(review.checkedPanels).toEqual([panelId]);

      // Storyboard changes never touched approved artwork.
      expect(dumpArtwork()).toBe(artworkBefore);
    },
    300000
  );

  it("migration v38 present; text-layer PDFs skip OCR", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(38);
    } finally {
      db.close();
    }
    // Text-layer PDF path: a tiny generated text PDF takes the
    // extracted branch (no OCR row, no pdftoppm needed).
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-textpdf-"));
    const textPdf = path.join(scratch, "tiny.pdf");
    const content = "BT /F1 24 Tf 72 720 Td (Hello text layer) Tj ET";
    const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream,
    ];
    const header = "%PDF-1.4\n";
    let body = "";
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(body));
      body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefPos = Buffer.byteLength(header) + Buffer.byteLength(body);
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      body += `${String(offset + 9).padStart(10, "0")} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    fs.writeFileSync(textPdf, header + body);
    const result = await importPdfAutodetect(projectRoot, { sourceAbsolutePath: textPdf });
    expect(result.ocr).toBeNull();
  });
});
