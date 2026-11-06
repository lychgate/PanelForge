// PanelForge — project metadata schema (S1.2).
//
// The project's metadata persists in database/project.db — the
// authoritative operational store per the approved D5 resolution. The
// project.json marker (S1.1) carries the identity (projectId); this
// module owns the row that describes the project:
//
//   projects(project_id TEXT PRIMARY KEY, name TEXT NOT NULL,
//            description TEXT, created_at TEXT NOT NULL,
//            updated_at TEXT NOT NULL)
//
// Connection discipline mirrors the S0.8 app database: WAL + foreign keys
// + busy timeout at open, tracked migrations (schema_migrations table),
// serialized writes with busy retry. Every write goes through one
// in-process queue, so concurrent writers cannot produce uncontrolled
// interleavings.

import * as fs from "fs";
import * as path from "path";
import { identifyProject, PROJECT_DATABASE_DIR, PROJECT_DATABASE_FILE } from "./service";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite = require("node:sqlite") as {
  DatabaseSync: new (p: string) => DatabaseLike;
};

type StatementLike = {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
};

export type DatabaseLike = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  close: () => void;
};

export { StatementLike };

export const PROJECT_METADATA_VERSION = 1;

export type ProjectMetadataRecord = {
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ProjectMetadataError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMetadataError";
    this.code = code;
  }
}

type ProjectDbMigration = { version: number; name: string; statements: readonly string[] };

const PROJECT_DB_MIGRATIONS: readonly ProjectDbMigration[] = [
  {
    version: 1,
    name: "001_initial",
    statements: [
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S1.5: asset registry. Columns are the S1.5 subset of the §7.4 metadata
  // list (UID + relative path + type + dates + hash); version/approval/
  // relationships/provenance arrive with later tasks.
  {
    version: 2,
    name: "002_asset_registry",
    statements: [
      "CREATE TABLE IF NOT EXISTS assets (asset_id TEXT PRIMARY KEY, relative_path TEXT NOT NULL UNIQUE, asset_type TEXT NOT NULL, file_hash TEXT NOT NULL, file_size INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S3.1: source document records. Each row describes one imported
  // manuscript (title, format, byte size, content hash, timestamps);
  // the preserved original lives in the asset registry (manuscripts/
  // original/) and is linked by asset_id. FK keeps the link honest.
  {
    version: 3,
    name: "003_manuscripts",
    statements: [
      "CREATE TABLE IF NOT EXISTS manuscripts (manuscript_id TEXT PRIMARY KEY, title TEXT NOT NULL, format TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(asset_id), relative_path TEXT NOT NULL UNIQUE, byte_size INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S3.2: TXT/MD normalization. One row per manuscript: the normalized
  // text plus a JSON char-offset map (normalized index → source byte
  // offset), so every normalized span links back to the original bytes.
  {
    version: 4,
    name: "004_normalization",
    statements: [
      "CREATE TABLE IF NOT EXISTS normalization (manuscript_id TEXT PRIMARY KEY REFERENCES manuscripts(manuscript_id), normalized_text TEXT NOT NULL, offset_map TEXT NOT NULL, created_at TEXT NOT NULL)",
    ],
  },
  // S3.3: deterministic chapter segmentation. Each row records one
  // chapter's normalized span (norm_start/norm_end) + title + order;
  // source bytes resolve via the S3.2 offset map (never stored twice).
  {
    version: 5,
    name: "005_chapters",
    statements: [
      "CREATE TABLE IF NOT EXISTS chapters (chapter_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id), title TEXT NOT NULL, norm_start INTEGER NOT NULL, norm_end INTEGER NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL)",
    ],
  },
  // S3.4: scene segmentation within chapters. Each row records one
  // scene's normalized span + title + order + chapter link; `source`
  // is "auto" (rule-derived) or "override" (manually corrected).
  {
    version: 6,
    name: "006_scenes",
    statements: [
      "CREATE TABLE IF NOT EXISTS scenes (scene_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id), chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id), title TEXT NOT NULL, norm_start INTEGER NOT NULL, norm_end INTEGER NOT NULL, sort_order INTEGER NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL)",
    ],
  },
  // S3.6: entity extractions — typed candidates (character/location/
  // object/event/chronology) with exact normalized spans + heuristic
  // confidence; source is "deterministic" or "llm". Candidates without
  // resolvable spans are never stored.
  {
    version: 7,
    name: "007_entities",
    statements: [
      "CREATE TABLE IF NOT EXISTS entities (entity_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id), scene_id TEXT REFERENCES scenes(scene_id), entity_type TEXT NOT NULL, name TEXT NOT NULL, norm_start INTEGER NOT NULL, norm_end INTEGER NOT NULL, confidence REAL NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL)",
    ],
  },
  // S3.7: canon classification (§2.7). Four-way status per entity;
  // canon queries satisfy only "explicit". Promotion is always an
  // explicit, rationale-carrying user action.
  {
    version: 8,
    name: "008_canon",
    statements: [
      "CREATE TABLE IF NOT EXISTS canon (canon_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(entity_id), status TEXT NOT NULL, rationale TEXT NOT NULL, classified_at TEXT NOT NULL, promoted_at TEXT)",
    ],
  },
  // S3.11: art style profiles (§9). One canonical project default
  // enforced by a partial unique index (at most one is_default=1).
  {
    version: 9,
    name: "009_styles",
    statements: [
      "CREATE TABLE IF NOT EXISTS styles (style_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, reference_asset_ids TEXT NOT NULL, preferred_models TEXT NOT NULL, preferred_loras TEXT NOT NULL, color_palette TEXT NOT NULL, lighting TEXT NOT NULL, line_art TEXT NOT NULL, rendering_technique TEXT NOT NULL, negative_prompt TEXT NOT NULL, aspect_ratios TEXT NOT NULL, is_default INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_styles_single_default ON styles(is_default) WHERE is_default = 1",
    ],
  },
  // S3.13: style variants + priority resolution (§9.1/§9.2). A variant
  // binds one style profile to a scope (panel/character/scene/project)
  // with a deterministic priority (lower wins) and a lock strength.
  // Panel/character records themselves stay Stages 4/6; scope refs
  // are opaque IDs until then.
  {
    version: 10,
    name: "010_style_variants",
    statements: [
      "CREATE TABLE IF NOT EXISTS style_variants (variant_id TEXT PRIMARY KEY, style_id TEXT NOT NULL REFERENCES styles(style_id), scope TEXT NOT NULL, scope_ref TEXT NOT NULL, priority INTEGER NOT NULL, lock_strength TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_style_variants_style ON style_variants(style_id)",
    ],
  },
  // S4.1: character profile records (§8.4). Structured-text fields
  // (all optional except name); identity is character_id, stable
  // across updates.
  {
    version: 11,
    name: "011_characters",
    statements: [
      "CREATE TABLE IF NOT EXISTS characters (character_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, physical_appearance TEXT NOT NULL, age TEXT NOT NULL, personality TEXT NOT NULL, clothing TEXT NOT NULL, equipment TEXT NOT NULL, distinguishing_features TEXT NOT NULL, relationships TEXT NOT NULL, timeline TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S4.2: character version records (§8.4). Labels unique per
  // character via normalized label_key; per-version overrides
  // default to "" = inherit from the profile.
  {
    version: 12,
    name: "012_character_versions",
    statements: [
      "CREATE TABLE IF NOT EXISTS character_versions (version_id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(character_id), label TEXT NOT NULL, label_key TEXT NOT NULL, physical_appearance TEXT NOT NULL, age TEXT NOT NULL, clothing TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_character_versions_label ON character_versions(character_id, label_key)",
    ],
  },
  // S4.3: reference asset association (§8.4). Registry assets
  // bound to a version under one slot kind; an asset may serve any
  // number of versions/slots.
  {
    version: 13,
    name: "013_character_version_references",
    statements: [
      "CREATE TABLE IF NOT EXISTS character_version_references (reference_id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES character_versions(version_id), asset_id TEXT NOT NULL, slot TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_character_version_references_version ON character_version_references(version_id)",
    ],
  },
  // S4.5: MVRS tier config (§8.4). (tier, slot, min_count) rows
  // seeded with the spec defaults; the scorer reads this table.
  {
    version: 14,
    name: "014_completeness_tiers",
    statements: [
      "CREATE TABLE IF NOT EXISTS completeness_tiers (tier TEXT NOT NULL, slot TEXT NOT NULL, min_count INTEGER NOT NULL, PRIMARY KEY (tier, slot))",
      "INSERT OR IGNORE INTO completeness_tiers (tier, slot, min_count) VALUES ('recommended', 'portrait', 1), ('recommended', 'front', 1), ('recommended', 'expression', 1), ('full', 'portrait', 1), ('full', 'front', 1), ('full', 'side', 1), ('full', 'rear', 1), ('full', 'expression', 2), ('full', 'pose', 1), ('full', 'clothing', 1), ('full', 'equipment', 1)",
    ],
  },
  // S4.6: entity → character bridge. source_entity_id (nullable,
  // unique) records which Stage 3 extraction spawned a profile —
  // one profile per entity, never auto-created.
  {
    version: 15,
    name: "015_character_entity_bridge",
    statements: [
      "ALTER TABLE characters ADD COLUMN source_entity_id TEXT",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_source_entity ON characters(source_entity_id) WHERE source_entity_id IS NOT NULL",
    ],
  },
  // S4.7: character version binding (§8.4). panel_id is an opaque
  // ID until Stage 6 panel records exist; one binding per
  // (panel, character) pair.
  {
    version: 16,
    name: "016_panel_character_bindings",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_character_bindings (binding_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL, character_id TEXT NOT NULL REFERENCES characters(character_id), version_id TEXT NOT NULL REFERENCES character_versions(version_id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_character_bindings_pair ON panel_character_bindings(panel_id, character_id)",
      "CREATE INDEX IF NOT EXISTS idx_panel_character_bindings_version ON panel_character_bindings(version_id)",
    ],
  },
  // S4.8: generation approval (§8.4). Per-version status
  // (pending/approved/rejected) with rationale + timestamp.
  {
    version: 17,
    name: "017_character_version_approval",
    statements: [
      "ALTER TABLE character_versions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'",
      "ALTER TABLE character_versions ADD COLUMN approval_rationale TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE character_versions ADD COLUMN approval_decided_at TEXT",
    ],
  },
  // S4.9: generation-request records (§8.4 — request side only).
  // One request per (version, slot); result_asset_id stays NULL
  // until a Stage 7 run produces an asset. No execution here.
  {
    version: 18,
    name: "018_generation_requests",
    statements: [
      "CREATE TABLE IF NOT EXISTS generation_requests (request_id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES character_versions(version_id), slot TEXT NOT NULL, provider TEXT NOT NULL, prompt TEXT NOT NULL, negative_prompt TEXT NOT NULL, result_asset_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_requests_slot ON generation_requests(version_id, slot)",
    ],
  },
  // S4.11: character history (§8.4). Append-only — rows deleted
  // only with their character (FK cascade).
  {
    version: 19,
    name: "019_character_history",
    statements: [
      "CREATE TABLE IF NOT EXISTS character_history (history_id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(character_id) ON DELETE CASCADE, version_id TEXT REFERENCES character_versions(version_id), event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_character_history_character ON character_history(character_id)",
    ],
  },
  // S5.1: location profile records (§8.5). Structured-text
  // fields (name required); identity is location_id, stable.
  {
    version: 20,
    name: "020_locations",
    statements: [
      "CREATE TABLE IF NOT EXISTS locations (location_id TEXT PRIMARY KEY, name TEXT NOT NULL, architecture TEXT NOT NULL, geography TEXT NOT NULL, layout TEXT NOT NULL, lighting TEXT NOT NULL, time_of_day TEXT NOT NULL, weather TEXT NOT NULL, materials TEXT NOT NULL, color_palette TEXT NOT NULL, damage_states TEXT NOT NULL, historical_variations TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S5.2: location variations (§8.5). Labels unique per
  // location via normalized label_key; per-variation overrides
  // default to "" = inherit from the profile.
  {
    version: 21,
    name: "021_location_variations",
    statements: [
      "CREATE TABLE IF NOT EXISTS location_variations (variation_id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(location_id), label TEXT NOT NULL, label_key TEXT NOT NULL, lighting TEXT NOT NULL, time_of_day TEXT NOT NULL, weather TEXT NOT NULL, damage_states TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_location_variations_label ON location_variations(location_id, label_key)",
    ],
  },
  // S5.3: location reference association (§8.5). Registry assets
  // bound to a variation under one slot kind; an asset may serve
  // any number of variations/slots.
  {
    version: 22,
    name: "022_location_references",
    statements: [
      "CREATE TABLE IF NOT EXISTS location_references (reference_id TEXT PRIMARY KEY, variation_id TEXT NOT NULL REFERENCES location_variations(variation_id), asset_id TEXT NOT NULL, slot TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_location_references_variation ON location_references(variation_id)",
    ],
  },
  // S5.4: object profile records (§8.6). Structured-text
  // fields (name required); identity is object_id, stable.
  {
    version: 23,
    name: "023_objects",
    statements: [
      "CREATE TABLE IF NOT EXISTS objects (object_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, dimensions TEXT NOT NULL, materials TEXT NOT NULL, appearance TEXT NOT NULL, damage_states TEXT NOT NULL, category TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S5.5: object variations (§8.6). Labels unique per object
  // via normalized label_key; per-variation overrides default
  // to "" = inherit from the profile.
  {
    version: 24,
    name: "024_object_variations",
    statements: [
      "CREATE TABLE IF NOT EXISTS object_variations (variation_id TEXT PRIMARY KEY, object_id TEXT NOT NULL REFERENCES objects(object_id), label TEXT NOT NULL, label_key TEXT NOT NULL, appearance TEXT NOT NULL, damage_states TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_object_variations_label ON object_variations(object_id, label_key)",
    ],
  },
  // S5.6: object reference association (§8.6). Registry assets
  // bound to a variation under one slot kind; an asset may serve
  // any number of variations/slots.
  {
    version: 25,
    name: "025_object_references",
    statements: [
      "CREATE TABLE IF NOT EXISTS object_references (reference_id TEXT PRIMARY KEY, variation_id TEXT NOT NULL REFERENCES object_variations(variation_id), asset_id TEXT NOT NULL, slot TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_object_references_variation ON object_references(variation_id)",
    ],
  },
  // S5.7: entity → location/object bridge (S4.6 pattern).
  // source_entity_id (nullable, unique per table) records which
  // Stage 3 extraction spawned a profile — one profile per
  // entity, never auto-created.
  {
    version: 26,
    name: "026_location_object_bridge",
    statements: [
      "ALTER TABLE locations ADD COLUMN source_entity_id TEXT",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_source_entity ON locations(source_entity_id) WHERE source_entity_id IS NOT NULL",
      "ALTER TABLE objects ADD COLUMN source_entity_id TEXT",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_source_entity ON objects(source_entity_id) WHERE source_entity_id IS NOT NULL",
    ],
  },
  // S5.8: generation-request records for both studios (§8.5/§8.6
  // request side only). One shared table + subject
  // discriminator; result_asset_id stays NULL until a Stage 7
  // run produces an asset. No execution here.
  {
    version: 27,
    name: "027_studio_generation_requests",
    statements: [
      "CREATE TABLE IF NOT EXISTS studio_generation_requests (request_id TEXT PRIMARY KEY, studio TEXT NOT NULL, subject_id TEXT NOT NULL, slot TEXT NOT NULL, provider TEXT NOT NULL, prompt TEXT NOT NULL, negative_prompt TEXT NOT NULL, result_asset_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_requests_subject ON studio_generation_requests(studio, subject_id, slot)",
    ],
  },
  // S5.9: studio asset history (§8.5/§8.6). Append-only — rows
  // deleted only with their profile (FK cascade).
  {
    version: 28,
    name: "028_studio_history",
    statements: [
      "CREATE TABLE IF NOT EXISTS location_history (history_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES locations(location_id) ON DELETE CASCADE, variation_id TEXT REFERENCES location_variations(variation_id), event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_location_history_profile ON location_history(profile_id)",
      "CREATE TABLE IF NOT EXISTS object_history (history_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE, variation_id TEXT REFERENCES object_variations(variation_id), event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_object_history_profile ON object_history(profile_id)",
    ],
  },
  // S6.1: storyboard scene records (§8.7). Wraps Stage 3
  // extraction scenes; never rewrites them.
  {
    version: 29,
    name: "029_storyboard_scenes",
    statements: [
      "CREATE TABLE IF NOT EXISTS storyboard_scenes (scene_id TEXT PRIMARY KEY, manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id), chapter_id TEXT REFERENCES chapters(chapter_id), extraction_scene_id TEXT REFERENCES scenes(scene_id), narrative_purpose TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S6.2: storyboard panel records (§8.7). Panels carry no
  // artwork yet; sort order persists.
  {
    version: 30,
    name: "030_storyboard_panels",
    statements: [
      "CREATE TABLE IF NOT EXISTS storyboard_panels (panel_id TEXT PRIMARY KEY, scene_id TEXT NOT NULL REFERENCES storyboard_scenes(scene_id), sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_storyboard_panels_scene ON storyboard_panels(scene_id, sort_order)",
    ],
  },
  // S6.3: character/version assignment realizing S4.7 against
  // real panel rows; approved versions only (S4.8 gate).
  {
    version: 31,
    name: "031_panel_assignments",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_assignments (assignment_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), character_id TEXT NOT NULL REFERENCES characters(character_id), version_id TEXT NOT NULL REFERENCES character_versions(version_id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_assignments_pair ON panel_assignments(panel_id, character_id)",
    ],
  },
  // S6.4: location assignment (§8.7). One location (optional
  // variation) per panel.
  {
    version: 32,
    name: "032_panel_location_assignments",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_location_assignments (assignment_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), location_id TEXT NOT NULL REFERENCES locations(location_id), variation_id TEXT REFERENCES location_variations(variation_id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_location_assignments_panel ON panel_location_assignments(panel_id)",
    ],
  },
  // S6.5: camera and shot definitions (§8.7). One camera per
  // panel; shot type from the closed vocabulary.
  {
    version: 33,
    name: "033_panel_cameras",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_cameras (camera_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), shot_type TEXT NOT NULL, angle TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_cameras_panel ON panel_cameras(panel_id)",
    ],
  },
  // S6.6: character positioning (§8.7). Guidance per
  // assignment: depth + horizontal + note. Never a placement
  // promise.
  {
    version: 34,
    name: "034_panel_positions",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_positions (position_id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES panel_assignments(assignment_id), depth TEXT NOT NULL, horizontal TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_positions_assignment ON panel_positions(assignment_id)",
    ],
  },
  // S6.7: dialogue, captions, actions, expressions (§8.7).
  // One text block per panel.
  {
    version: 35,
    name: "035_panel_text",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_text (text_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), dialogue TEXT NOT NULL, captions TEXT NOT NULL, actions TEXT NOT NULL, expressions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_text_panel ON panel_text(panel_id)",
    ],
  },
  // S6.9: generation-ready panel instructions (§8.7).
  // One instruction block per panel.
  {
    version: 36,
    name: "036_panel_instructions",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_instructions (instruction_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), composition_prompt TEXT NOT NULL, background_detail TEXT NOT NULL, art_direction_notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_instructions_panel ON panel_instructions(panel_id)",
    ],
  },
  // S6.10: storyboard snapshots + lightweight branching (§8.7).
  // Immutable full-copy snapshots with parent lineage.
  {
    version: 37,
    name: "037_snapshots",
    statements: [
      "CREATE TABLE IF NOT EXISTS storyboard_snapshots (snapshot_id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_snapshot_id TEXT REFERENCES storyboard_snapshots(snapshot_id), created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS snapshot_panels (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), panel_id TEXT NOT NULL, scene_id TEXT NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, panel_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_assignments (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), assignment_id TEXT NOT NULL, panel_id TEXT NOT NULL, character_id TEXT NOT NULL, version_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, assignment_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_location_assignments (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), assignment_id TEXT NOT NULL, panel_id TEXT NOT NULL, location_id TEXT NOT NULL, variation_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, assignment_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_cameras (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), camera_id TEXT NOT NULL, panel_id TEXT NOT NULL, shot_type TEXT NOT NULL, angle TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, camera_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_positions (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), position_id TEXT NOT NULL, assignment_id TEXT NOT NULL, depth TEXT NOT NULL, horizontal TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, position_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_text (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), text_id TEXT NOT NULL, panel_id TEXT NOT NULL, dialogue TEXT NOT NULL, captions TEXT NOT NULL, actions TEXT NOT NULL, expressions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, text_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_instructions (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), instruction_id TEXT NOT NULL, panel_id TEXT NOT NULL, composition_prompt TEXT NOT NULL, background_detail TEXT NOT NULL, art_direction_notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, instruction_id))",
      "CREATE TABLE IF NOT EXISTS snapshot_panel_character_bindings (snapshot_id TEXT NOT NULL REFERENCES storyboard_snapshots(snapshot_id), binding_id TEXT NOT NULL, panel_id TEXT NOT NULL, character_id TEXT NOT NULL, version_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (snapshot_id, binding_id))",
    ],
  },
  // S6.13: OCR text copies attached to scanned-PDF manuscripts (§8.7).
  // Indexed by source content hash so re-imports reuse saved OCR.
  {
    version: 38,
    name: "038_manuscript_ocr",
    statements: [
      "CREATE TABLE IF NOT EXISTS manuscript_ocr (manuscript_id TEXT PRIMARY KEY REFERENCES manuscripts(manuscript_id), source_hash TEXT NOT NULL, source_name TEXT NOT NULL, ocr_text TEXT NOT NULL, page_count INTEGER NOT NULL, engine TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_manuscript_ocr_hash ON manuscript_ocr(source_hash)",
    ],
  },
  // S7.2: workflow template registry (§8.8). Files live under
  // workflows/; hash-verified at load.
  {
    version: 39,
    name: "039_workflow_templates",
    statements: [
      "CREATE TABLE IF NOT EXISTS workflow_templates (template_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, relative_path TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S7.3: assembled panel prompts (one exact string per panel).
  {
    version: 40,
    name: "040_panel_prompts",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_prompts (panel_id TEXT PRIMARY KEY REFERENCES storyboard_panels(panel_id), prompt TEXT NOT NULL, style_id TEXT, polished INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S7.4: negative prompts (one verbatim string per panel).
  {
    version: 41,
    name: "041_panel_negative_prompts",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_negative_prompts (panel_id TEXT PRIMARY KEY REFERENCES storyboard_panels(panel_id), negative_prompt TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S7.5: reference conditioning (slots + exact asset IDs per panel).
  {
    version: 42,
    name: "042_panel_conditioning",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_conditioning (panel_id TEXT PRIMARY KEY REFERENCES storyboard_panels(panel_id), character_slot TEXT, character_asset_ids TEXT, location_slot TEXT, location_asset_ids TEXT, object_slot TEXT, object_asset_ids TEXT, updated_at TEXT NOT NULL)",
    ],
  },
  // S7.6: panel generations + artwork versions.
  {
    version: 43,
    name: "043_panel_generations",
    statements: [
      "CREATE TABLE IF NOT EXISTS panel_generations (generation_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), template_name TEXT NOT NULL, prompt TEXT NOT NULL, negative_prompt TEXT NOT NULL, conditioning TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS panel_artwork (artwork_id TEXT PRIMARY KEY, panel_id TEXT NOT NULL REFERENCES storyboard_panels(panel_id), generation_id TEXT NOT NULL REFERENCES panel_generations(generation_id), version_no INTEGER NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(asset_id), created_at TEXT NOT NULL)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_artwork_version ON panel_artwork(panel_id, version_no)",
    ],
  },
];

export function projectDatabasePath(root: string): string {
  return path.join(path.resolve(root), PROJECT_DATABASE_DIR, PROJECT_DATABASE_FILE);
}

export function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code;
  return code === "SQLITE_BUSY" || /database is locked|busy/i.test(msg);
}

export async function runWithBusyRetry<T>(fn: () => T): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return fn();
    } catch (err) {
      attempt++;
      if (!isBusyError(err) || attempt > 3) throw err;
      await new Promise((r) => setTimeout(r, 10 * attempt));
    }
  }
}

let tail: Promise<unknown> = Promise.resolve();
export function enqueueWrite<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export type OpenProjectDatabaseResult = {
  db: DatabaseLike;
  /** True when the previous database was corrupted and preserved aside. */
  recovered: boolean;
  /** Location of the preserved original when recovered is true. */
  backupPath: string | null;
};

/**
 * Open (creating if needed) the project database and run migrations.
 *
 * S1.7 recovery from interrupted/corrupted writes (D10): the database is
 * checked with `PRAGMA integrity_check` at open. A corrupted database is
 * never silently overwritten — the original file is preserved as
 * `<db>.bak-<timestamp>` and a fresh database is started; the caller can
 * surface `recovered`/`backupPath` (a recovery dialog is a later UI task,
 * not part of S1.7).
 */
export function openProjectDatabase(root: string): OpenProjectDatabaseResult {
  const dbPath = projectDatabasePath(root);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const tryOpen = (): { db: DatabaseLike } => {
    const db = new sqlite.DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("PRAGMA busy_timeout=5000");
    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (!integrity || Object.values(integrity)[0] !== "ok") {
      try {
        db.close();
      } catch {
        // Best effort cleanup before recovery.
      }
      throw new Error("integrity_check failed");
    }
    return { db };
  };
  try {
    const { db } = tryOpen();
    applyMigrations(db);
    return { db, recovered: false, backupPath: null };
  } catch (firstErr) {
    if (!fs.existsSync(dbPath)) throw firstErr;
    // Preserve the corrupted original before starting fresh.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${dbPath}.bak-${stamp}`;
    try {
      fs.copyFileSync(dbPath, backupPath);
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
      const { db } = tryOpen();
      applyMigrations(db);
      return { db, recovered: true, backupPath };
    } catch {
      throw firstErr;
    }
  }
}

function applyMigrations(db: DatabaseLike): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
  );
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version))
  );
  for (const migration of PROJECT_DB_MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const stmt of migration.statements) db.exec(stmt);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Surface the original error.
      }
      throw err;
    }
  }
}

/**
 * Safe metadata write (S1.7): run fn inside one serialized transaction.
 * If fn throws (e.g. an interrupted edit), the whole transaction rolls
 * back — project metadata is never partially corrupted.
 */
export function withMetadataTransaction<T>(root: string, fn: (db: DatabaseLike) => T): Promise<T> {
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<T>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = fn(db);
          db.exec("COMMIT");
          return result;
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Surface the original error.
          }
          throw err;
        }
      });
    } finally {
      db.close();
    }
  });
}

/**
 * Basic autosave (S1.7): every metadata write is already a full committed
 * transaction, so there is no dirty in-memory state to lose. This folds
 * WAL pages into the main database file on demand (also runs on close).
 */
export function checkpointProjectDatabase(root: string): Promise<number> {
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const row = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
      return Number((row as unknown as Record<string, unknown>)?.busy ?? 0);
    } finally {
      db.close();
    }
  });
}

function toRecord(row: Record<string, unknown>): ProjectMetadataRecord {
  return {
    projectId: String(row.project_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function requireIdentified(root: string): { projectId: string; createdAt: string } {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ProjectMetadataError(identified.code, identified.message);
  }
  return { projectId: identified.metadata.projectId, createdAt: identified.metadata.createdAt };
}

/** Create the project's metadata row (identity and creation come from the marker). */
export async function createProjectMetadata(
  root: string,
  input: { name: string; description?: string | null }
): Promise<ProjectMetadataRecord> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new ProjectMetadataError("INVALID_ARGUMENTS", "Project name must not be empty");
  }
  const identity = requireIdentified(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const existing = db.prepare("SELECT project_id FROM projects WHERE project_id = ?").get(identity.projectId);
      if (existing) {
        throw new ProjectMetadataError("ALREADY_EXISTS", "Project metadata already exists");
      }
      const description = input.description ?? null;
      return await runWithBusyRetry<ProjectMetadataRecord>(() => {
        db.prepare("INSERT INTO projects (project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(identity.projectId, input.name, description, identity.createdAt, new Date().toISOString());
        const row = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Read the project's metadata row, or null when no row exists yet. */
export async function getProjectMetadata(root: string): Promise<ProjectMetadataRecord | null> {
  const identity = requireIdentified(root);
  const dbPath = projectDatabasePath(root);
  if (!fs.existsSync(dbPath)) return null;
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
    return row ? toRecord(row as Record<string, unknown>) : null;
  } finally {
    db.close();
  }
}

/** Patch the metadata row (name and/or description); bumps updated_at. */
export async function updateProjectMetadata(
  root: string,
  patch: { name?: string; description?: string | null }
): Promise<ProjectMetadataRecord> {
  const identity = requireIdentified(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const row = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
      if (!row) {
        throw new ProjectMetadataError("NOT_FOUND", "Project metadata row does not exist");
      }
      const current = toRecord(row as Record<string, unknown>);
      const nextName = patch.name ?? current.name;
      if (typeof nextName !== "string" || nextName.trim() === "") {
        throw new ProjectMetadataError("INVALID_ARGUMENTS", "Project name must not be empty");
      }
      const nextDescription = patch.description === undefined ? current.description : patch.description;
      const updatedAt = new Date().toISOString();
      return await runWithBusyRetry<ProjectMetadataRecord>(() => {
        db.prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE project_id = ?")
          .run(nextName, nextDescription, updatedAt, identity.projectId);
        const updated = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
        return toRecord(updated as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

export function validateRecordShape(raw: unknown): raw is ProjectMetadataRecord {
  if (raw === null || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.projectId === "string" &&
    typeof r.name === "string" &&
    typeof r.createdAt === "string" &&
    typeof r.updatedAt === "string"
  );
}
