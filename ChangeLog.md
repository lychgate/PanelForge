# ChangeLog

All notable changes to PanelForge are documented here.
Format follows Keep a Changelog (task sections under `## [Unreleased]` once a release is cut).
The operational task register [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md)
remains the authoritative progress record; this file summarizes what each task changed.

## [Unreleased]

### S5.9 — Studio Asset History (2026-11-06) — [`c424beb`](https://github.com/lychgate/PanelForge/commit/c424beb75f6184cd12aeb276d45e63ca572054ec)

**Added**

- `src/core/project/studio-history.ts` — append-only per-studio
  history (`recordLocationEvent`/`recordObjectEvent` +
  profile- and variation-scoped lists, S4.11 pattern).
- Migration 028 (`location_history` + `object_history` with
  profile cascades) in `src/core/project/metadata.ts`.
- `tests/studio-history.test.js` — 4 tests: lifecycle replay
  per studio, validation, append-only + cascade + migration
  v28.

**Changed**

- Register: S5.9 marked **Complete**; Stage 5 now 9 of 10;
  §11 next eligible is S5.10.
- `Plan.md`: S5.9 checked off (2026-11-06).

### S5.8 — Generation-Request Records (Both Studios) (2026-11-06) — [`5880660`](https://github.com/lychgate/PanelForge/commit/5880660f8f157c38c62deef8201f13dda2d19c4f)

**Added**

- `src/core/project/studio-requests.ts` — request-side only:
  `createRequest` (provider/prompt validation, one request per
  (studio, variation, slot), recreate replaces) /
  `getRequest` / `listRequestsBySubject` / `attachResultAsset`
  (fulfilled link for Stage 7). One shared table + subject
  discriminator; subjects validated against the matching
  variation table. No provider imports, no network.
- Migration 027 (`studio_generation_requests` table) in
  `src/core/project/metadata.ts`.
- `tests/studio-requests.test.js` — 4 tests: store/replace,
  studio isolation, table-matched subjects + zero provider
  traffic scan, result attach + migration v27.

**Changed**

- Register: S5.8 marked **Complete**; Stage 5 now 8 of 10;
  §11 next eligible is S5.9.
- `Plan.md`: S5.8 checked off (2026-11-06).

### S5.7 — Entity → Location/Object Bridge (2026-11-06) — [`3be35c1`](https://github.com/lychgate/PanelForge/commit/3be35c1fab452895a6bd70fd5fa0f348d25ac7c7)

**Added**

- `src/core/project/location-object-bridge.ts` — explicit
  create-from-entity for both studios
  (`createLocationFromEntity`/`createObjectFromEntity`: copies
  only the name, records `source_entity_id`, everything else
  starts empty; one profile per entity per studio) +
  `getLocationFromEntity`/`getObjectFromEntity`. The S4.6
  `resolveEntitySource` remains the shared span resolver.
- Migration 026 (`source_entity_id` on `locations` + `objects`
  with partial unique indexes) in
  `src/core/project/metadata.ts`.
- `tests/location-object-bridge.test.js` — 6 tests:
  name-only copy for both studios, `DUPLICATE_SOURCE` per
  studio, typed rejections, exact source resolution,
  migration v26.

**Changed**

- Register: S5.7 marked **Complete**; Stage 5 now 7 of 10;
  §11 next eligible is S5.8.
- `Plan.md`: S5.7 checked off (2026-11-06).

### S5.6 — Object Reference Association (2026-11-06) — [`e21548a`](https://github.com/lychgate/PanelForge/commit/e21548a1840e02fa134fd9907ad6249c640625d1)

**Added**

- `src/core/project/object-references.ts` — §8.6 reference
  association (`associateReference`/`getReference`/
  `listReferencesByVariation`/`listReferencesBySlot`/
  `removeReference`): S1.5-registry-validated assets bound to a
  variation under one of five slot kinds (front, side, detail,
  in-use, damaged); an asset may serve any number of
  variations/slots.
- Migration 025 (`object_references` table) in
  `src/core/project/metadata.ts`.
- `tests/object-references.test.js` — 5 tests: association by
  slot with registry validation, typed rejections, all five
  slots, multi-variation asset reuse, remove + migration v25.

**Changed**

- Register: S5.6 marked **Complete**; Stage 5 now 6 of 10;
  §11 next eligible is S5.7.
- `Plan.md`: S5.6 checked off (2026-11-06).

### S5.5 — Object Variations (2026-11-06) — [`3fe1e2b`](https://github.com/lychgate/PanelForge/commit/3fe1e2b994956232217d232473279ddf12864148)

**Added**

- `src/core/project/object-variations.ts` — variation CRUD
  (`createVariation`/`getVariation`/`listVariations`/
  `updateVariation`/`deleteVariation`): labels unique per
  object (case-insensitive), per-variation overrides
  (appearance/damage states) defaulting to `""` = inherit from
  the profile; identity stable.
- Migration 024 (`object_variations` table + unique index) in
  `src/core/project/metadata.ts`.
- `tests/object-variations.test.js` — 5 tests: multiple
  variations per object, per-object label uniqueness, FK +
  validation, override inheritance, rename collision,
  list/delete + migration v24.

**Changed**

- Register: S5.5 marked **Complete**; Stage 5 now 5 of 10;
  §11 next eligible is S5.6.
- `Plan.md`: S5.5 checked off (2026-11-06).

### S5.4 — Object Profile Records (2026-11-06) — [`6f470d6`](https://github.com/lychgate/PanelForge/commit/6f470d63cdb6332ca27e6f9e9bccbff04299c494)

**Added**

- `src/core/project/location-references.ts` — §8.5 reference
  association (`associateReference`/`getReference`/
  `listReferencesByVariation`/`listReferencesBySlot`/
  `removeReference`): S1.5-registry-validated assets bound to a
  variation under one of eight slot kinds (exterior, interior,
  overview, detail, day, night, weather, damaged); an asset may
  serve any number of variations/slots.
- Migration 022 (`location_references` table) in
  `src/core/project/metadata.ts`.
- `tests/location-references.test.js` — 5 tests: association by
  slot with registry validation, typed rejections, all eight
  slots, multi-variation asset reuse, remove + migration v22.

**Changed**

- Register: S5.3 marked **Complete**; Stage 5 now 3 of 10;
  §11 next eligible is S5.4.
- `Plan.md`: S5.3 checked off (2026-11-06).

### S5.2 — Location Variations (2026-11-06) — [`3ba1b77`](https://github.com/lychgate/PanelForge/commit/3ba1b77c2ec138d29b66a8177e0978d3f2f3e25d)

**Added**

- `src/core/project/location-variations.ts` — variation CRUD
  (`createVariation`/`getVariation`/`listVariations`/
  `updateVariation`/`deleteVariation`): labels unique per
  location (case-insensitive), per-variation overrides
  (lighting/time of day/weather/damage states) defaulting to
  `""` = inherit from the profile; identity stable.
- Migration 021 (`location_variations` table + unique index)
  in `src/core/project/metadata.ts`.
- `tests/location-variations.test.js` — 5 tests: multiple
  variations per location, per-location label uniqueness, FK +
  validation, override inheritance, rename collision,
  list/delete + migration v21.

**Changed**

- Register: S5.2 marked **Complete**; Stage 5 now 2 of 10;
  §11 next eligible is S5.3.
- `Plan.md`: S5.2 checked off (2026-11-06).

### S5.1 — Location Profile Records (2026-11-06) — [`e1e4df5`](https://github.com/lychgate/PanelForge/commit/e1e4df5575d87268ea8315400b006ef6011b9409)

**Added**

- `src/core/project/locations.ts` — §8.5 profile CRUD
  (`createLocation`/`getLocation`/`listLocations`/
  `updateLocation`/`deleteLocation`): name required, all other
  fields (architecture, geography, interior/exterior layout,
  lighting, time of day, weather, materials, color palette,
  damage states, historical/chronological variations) optional
  structured text defaulting to `""`; identity stable.
- Migration 020 (`locations` table) in
  `src/core/project/metadata.ts`.
- `tests/locations.test.js` — 5 tests: create with §8.5 fields,
  empty-string defaults, validation, partial-update identity
  stability, list/delete + migration v20.

**Changed**

- Register: S5.1 marked **Complete**; Stage 5 now 1 of 10;
  §11 next eligible is S5.2.
- `Plan.md`: S5.1 checked off (2026-11-06).

### Stages 5 + 6 Planning — Location/Object + Storyboard Expansion (2026-11-06)

**Changed**

- Register §4E: Stage 5 expanded to 10 micro-tasks S5.1–S5.10
  and Stage 6 to 13 micro-tasks S6.1–S6.13 (owner-authorized
  planning). Stage 5 answers: link-never-create seeding,
  records-only generation. Stage 6 answers: infra first +
  minimal hand-rolled UI second (no framework; CSP still
  deferred), full-copy snapshots with lineage branching.
- `Plan.md`: Stage 5 + Stage 6 task lists added (all Not
  Started).
- `Docs/PanelForge-Project-Format.md`: schema-evolution table
  (migrations 001–019) added.
- `Docs/PanelForge-Security-Baseline.md`: superseded-notes
  banner (bridge now allowlisted; CSP still deferred).
- `tests/TestData/`: owner's novel committed (25 PDFs,
  ~2.6 MB) with `README.md` documenting the journal-entry
  layout (chapters ~4–15), the all-scanned import status under
  the S3.10 text-layer-only parser, and the Epilogue inflate
  finding.
- **No implementation yet** — S5.1/S6.1 must not begin without
  explicit owner authorization.
- **PDF import strategy (owner decision, 2026-11-06, for S6.13):**
  autodetect — text layer first, then OCR fallback; OCR output
  saved as an editable text copy (runs once per file, reusable
  and correctable). Supersedes S3.10's no-OCR stance for the
  Stage 6 path.

### S4.12 — Stage 4 Acceptance Fixture (2026-11-06) — [`ac6afc9`](https://github.com/lychgate/PanelForge/commit/ac6afc9fac5e7a4f2bed5f42457671e1dcc1eaf6)

**Added**

- `tests/stage4-fixture.test.js` — 2 acceptance tests running
  fixture characters through the whole Character Studio
  (entity → bridge → versions → references → tiers → approval
  → binding → comparison → history replay), plus a second
  character proving the same gates. Incomplete references
  warn; approved work intact.

**Changed**

- Register: S4.12 marked **Complete**; Stage 4 gate passes (12
  of 12); next stage (Stage 5 Location/Object) expands only per
  §16.2 before implementation.
- `Plan.md`: S4.12 checked off (2026-11-06); Stage 4 complete.

### S4.11 — Character History (2026-11-06) — [`8004a63`](https://github.com/lychgate/PanelForge/commit/8004a63b5ba8024da50dccda568ab9ecfccf26fd)

**Added**

- `src/core/project/history.ts` — append-only
  (`recordEvent`/`listHistoryByCharacter`/`listHistoryByVersion`)
  with event kinds covering the full lifecycle.
- Migration 019 (`character_history`, cascade on character
  delete) in `src/core/project/metadata.ts`.
- `tests/history.test.js` — 3 tests: fixture lifecycle replays
  in order, validation, append-only + cascade + migration v19.

**Changed**

- Register: S4.11 marked **Complete**; Stage 4 now 11 of 12;
  §11 next eligible is S4.12.
- `Plan.md`: S4.11 checked off (2026-11-06).

### S4.10 — Reference Comparison (2026-11-06) — [`824dfe9`](https://github.com/lychgate/PanelForge/commit/824dfe9281061a255be46c04f15d47eb2364a82b)

**Added**

- `src/core/project/version-comparison.ts` — read-only
  `compareVersions`: slot-by-slot reference sets from both
  versions (with `onlyIn`), effective field diffs
  (override-or-inherited), and approval states. Cross-character
  pairs reject; comparison never mutates.
- `tests/version-comparison.test.js` — 4 tests: slot/field
  diffs named exactly, approval + identical-clean, rejections,
  zero mutation.

**Changed**

- Register: S4.10 marked **Complete**; Stage 4 now 10 of 12;
  §11 next eligible is S4.11.
- `Plan.md`: S4.10 checked off (2026-11-06).

### S4.9 — Generation-Request Records (2026-11-06) — [`90a3a6e`](https://github.com/lychgate/PanelForge/commit/90a3a6eac9cbac972b296ec8c704358d1b8f2615)

**Added**

- `src/core/project/generation-requests.ts` — request-side
  only: `createGenerationRequest` (provider/prompt validation
  against the Stage 2 contract shape, one request per
  (version, slot), recreate replaces) / `getGenerationRequest` /
  `listGenerationRequestsByVersion` / `attachResultAsset`
  (fulfilled link for Stage 7). No provider imports, no network.
- Migration 018 (`generation_requests` table) in
  `src/core/project/metadata.ts`.
- `tests/generation-requests.test.js` — 4 tests: store/replace,
  typed validation + built-service import scan proving zero
  provider traffic, result attach, slot-order listing +
  migration v18.

**Changed**

- Register: S4.9 marked **Complete**; Stage 4 now 9 of 12; §11 next
  eligible is S4.10.
- `Plan.md`: S4.9 checked off (2026-11-06).

### S4.8 — Generation Approval (2026-11-06) — [`b9cc8d2`](https://github.com/lychgate/PanelForge/commit/b9cc8d241c9a3d1db60940cb27bc0d35dc8ddd5b)

**Added**

- `src/core/project/approval.ts` — per-version approval
  (`setApproval`/`getApproval`): pending default, rationale
  required, timestamped.
- Migration 017 (`character_versions` approval columns) in
  `src/core/project/metadata.ts`.
- `tests/approval.test.js` — 5 tests: pending default + recorded
  rationale, validation, binding gate, later-rejection warn,
  migration v17.

**Changed**

- `src/core/project/version-binding.ts`: `bindVersion` refuses
  pending/rejected versions (`NOT_APPROVED`); era check warns on
  rejected bound versions (bindings survive). Version-binding
  test fixture now approves before binding.
- Register: S4.8 marked **Complete**; Stage 4 now 8 of 12; §11 next
  eligible is S4.9.
- `Plan.md`: S4.8 checked off (2026-11-06).

### S4.7 — Character Version Binding (2026-11-06) — [`e640be4`](https://github.com/lychgate/PanelForge/commit/e640be469e959689243e712abeee46cb691f0941)

**Added**

- `src/core/project/version-binding.ts` — binding CRUD
  (`bindVersion`/`getBinding`/`listBindingsByPanel`/
  `listBindingsByCharacter`/`unbind`: one binding per
  (panel, character) pair, panel_id opaque until Stage 6;
  rebinding replaces) + `verifyBindingEra` (age mismatch
  warnings).
- Migration 016 (`panel_character_bindings`) in
  `src/core/project/metadata.ts`.
- `tests/version-binding.test.js` — 5 tests: exact-version
  pinning, typed rejections, bound-version delete guard, era
  clash/match/unbound warnings, character-scoped listing +
  migration v16.

**Changed**

- `src/core/project/character-versions.ts`: deleting a version
  now refuses while bound (`BOUND_VERSION`).
- Register: S4.7 marked **Complete**; Stage 4 now 7 of 12; §11 next
  eligible is S4.8.
- `Plan.md`: S4.7 checked off (2026-11-06).

### S4.6 — Entity → Character Bridge (2026-11-06) — [`0ae0b62`](https://github.com/lychgate/PanelForge/commit/0ae0b6207ff9dde6f824989dcf28a5b038c4d134)

**Added**

- `src/core/project/entity-bridge.ts` — explicit
  create-from-entity (`createProfileFromEntity`: copies only the
  name, records `source_entity_id`, everything else starts empty;
  one profile per entity), `getCharacterFromEntity`,
  `resolveEntitySource` (exact normalized slice + original bytes
  via the S3.2 offset map).
- Migration 015 (`characters.source_entity_id` + partial unique
  index) in `src/core/project/metadata.ts`;
  `src/core/project/characters.ts` surfaces `sourceEntityId`.
- `tests/entity-bridge.test.js` — 5 tests: name-only copy,
  `DUPLICATE_SOURCE` on second creation, typed rejections, exact
  source resolution, migration v15.

**Changed**

- Register: S4.6 marked **Complete**; Stage 4 now 6 of 12; §11 next
  eligible is S4.7.
- `Plan.md`: S4.6 checked off (2026-11-06).

### S4.5 — MVRS Tier Config (2026-11-06) — [`9af6bdc`](https://github.com/lychgate/PanelForge/commit/9af6bdcb83f8341c68b5995685b79211712d596d)

**Added**

- `src/core/project/tier-config.ts` — runtime-editable tier
  config (`getTierConfig`/`setTierRequirement`/
  `removeTierRequirement`/`resetTierConfig`).
- Migration 014 (`completeness_tiers` rows seeded with the §8.4
  defaults) in `src/core/project/metadata.ts`.
- `tests/tier-config.test.js` — 5 tests: seeded §8.4 defaults,
  same-fixture rescore on edit, reset, validation, migration v14.

**Changed**

- `src/core/project/completeness.ts`: scorer now reads the
  config table, not constants. `tests/completeness.test.js`:
  missing-order expectation updated to the config's
  alphabetical slot order.
- Register: S4.5 marked **Complete**; Stage 4 now 5 of 12; §11 next
  eligible is S4.6.
- `Plan.md`: S4.5 checked off (2026-11-06).

### S4.4 — Reference Completeness Scoring (2026-11-06) — [`988226c`](https://github.com/lychgate/PanelForge/commit/988226c2e33441f3cad9aa6d70f40c2d6ddf2541)

**Added**

- `src/core/project/completeness.ts` — deterministic §8.4
  scoring (`scoreCompleteness` + `DEFAULT_TIERS`): per-tier
  verdicts (Basic = any reference; Recommended = portrait +
  front + expression; Full = + side/rear, 2 expressions, pose,
  clothing, equipment) with `missing` naming the exact gaps and
  the highest passed tier as `overall`. Read-only; no migration.
- `tests/completeness.test.js` — 5 tests: empty version fails
  all tiers, per-tier gaps named, full set passes silently.

**Changed**

- Register: S4.4 marked **Complete**; Stage 4 now 4 of 12; §11 next
  eligible is S4.5.
- `Plan.md`: S4.4 checked off (2026-11-06).

### S4.3 — Reference Asset Association (2026-11-06) — [`b238a96`](https://github.com/lychgate/PanelForge/commit/b238a9647fa5604acdbcb3717a14574d8ba934cb)

**Added**

- `src/core/project/version-references.ts` — §8.4 reference
  association (`associateReference`/`getReference`/
  `listReferencesByVersion`/`listReferencesBySlot`/
  `removeReference`): S1.5-registry-validated assets bound to a
  version under one of eight slot kinds (portrait, front, side,
  rear, expression, pose, clothing, equipment); an asset may serve
  any number of versions/slots.
- Migration 013 (`character_version_references` table) in
  `src/core/project/metadata.ts`.
- `tests/version-references.test.js` — 5 tests: association by
  slot with registry validation, typed rejections, all eight
  slots, multi-version asset reuse, remove + migration v13.

**Changed**

- Register: S4.3 marked **Complete**; Stage 4 now 3 of 12; §11 next
  eligible is S4.4.
- `Plan.md`: S4.3 checked off (2026-11-06).

### S4.2 — Character Version Records (2026-11-06) — [`4dc3c8c`](https://github.com/lychgate/PanelForge/commit/4dc3c8cc59129729e6dd8a60abaf313bfdedb836)

**Added**

- `src/core/project/character-versions.ts` — §8.4 version CRUD
  (`createVersion`/`getVersion`/`listVersions`/`updateVersion`/
  `deleteVersion`): labels unique per character (case-insensitive),
  per-version overrides (appearance/age/clothing) defaulting to `""`
  = inherit from the profile; identity stable across updates.
- Migration 012 (`character_versions` table + unique index) in
  `src/core/project/metadata.ts`.
- `tests/character-versions.test.js` — 5 tests: multiple versions
  per character, per-character label uniqueness, FK + validation,
  override inheritance, rename collision, list/delete + migration
  v12.

**Changed**

- Register: S4.2 marked **Complete**; Stage 4 now 2 of 12; §11 next
  eligible is S4.3.
- `Plan.md`: S4.2 checked off (2026-11-06).

### S4.1 — Character Profile Records (2026-11-06) — [`ef87547`](https://github.com/lychgate/PanelForge/commit/ef875476b685ff9318df2b2b66f6f44a3144aa88)

**Added**

- `src/core/project/characters.ts` — §8.4 profile CRUD
  (`createCharacter`/`getCharacter`/`listCharacters`/
  `updateCharacter`/`deleteCharacter`): name required, all other
  fields (description, physical appearance, age, personality,
  clothing, equipment, distinguishing features, relationships,
  timeline) optional structured text defaulting to `""`; identity
  stable across updates.
- Migration 011 (`characters` table) in
  `src/core/project/metadata.ts`.
- `tests/characters.test.js` — 5 tests: create with §8.4 fields,
  empty-string defaults, validation, partial-update identity
  stability, list/delete + migration v11.

**Changed**

- Register: S4.1 marked **Complete**; Stage 4 now 1 of 12; §11 next
  eligible is S4.2.
- `Plan.md`: S4.1 checked off (2026-11-06).

### Stage 4 Planning — Character Studio Expansion (2026-11-06)

**Changed**

- Register §4E: Stage 4 expanded to 12 micro-tasks S4.1–S4.12
  (owner-authorized planning), spine first: profile CRUD, version
  records, reference association, completeness tiers + MVRS config,
  entity bridge, version binding, approval, generation-request
  records, comparison + history, acceptance fixture last.
- Owner decisions (2026-11-06): records + approval only (no live
  generation; ComfyUI execution stays Stage 7); entity bridge links,
  never auto-creates; panel binding table now with opaque panel_id
  (Stage 6 populates panel records).
- `Plan.md`: Stage 4 task list added (all Not Started).
- **No implementation yet** — S4.1 must not begin without explicit
  owner authorization.

### S3.14 — Stage 3 Acceptance Fixture (2026-11-06) — [`e28eb59`](https://github.com/lychgate/PanelForge/commit/e28eb599e76ba2682bb2c60889fc866e2755756c)

**Added**

- `tests/stage3-fixture.test.js` — 4 acceptance tests running a
  fixture manuscript through the full Stage 3 pipeline (S3.1 import
  → S3.2 normalization → S3.3 chapters → S3.4 scenes → S3.5
  relationship chain → S3.6 entities → S3.7 canon explicit vs
  suggestion/promotion → S3.11 styles applied to a scene via S3.13
  `resolveStyle`), plus a second CRLF text proving the same
  guarantees. Every entity span resolves to exact original bytes;
  the preserved original is hash-verified untouched throughout.

**Changed**

- Register: S3.14 marked **Complete**; Stage 3 gate passes (14 of
  14); next stage (Stage 4 Character Studio) expands only per §16.2
  before implementation.
- `Plan.md`: S3.14 checked off (2026-11-06); Stage 3 complete.

### S3.13 — Style Variants + Priority Resolution (2026-11-06) — [`4efddec`](https://github.com/lychgate/PanelForge/commit/4efddec433301f93ae5e71e67199524a6974fc4b)

**Added**

- `src/core/project/style-variants.ts` — §9.1/§9.2 predictable
  conflict resolution: `createVariant`/`listVariants`/
  `deleteVariant` (validated style, scope, priority, lock),
  `resolveStyle` (deterministic panel > character > scene >
  project, lower number wins, total tie-break; default fallback;
  field conflicts + locked/strong override warnings; explicit
  guidance-only note).
- Migration 010 (`style_variants` table + style index) in
  `src/core/project/metadata.ts`.
- `tests/style-variants.test.js` — 6 tests: CRUD validation,
  scope precedence, same-winner determinism, lock warnings +
  conflicts, silent-identical + default fallback.

**Changed**

- `src/core/project/styles.ts`: deleting a style now cascades to
  its variants (FK-safe cleanup; existing behavior unchanged
  otherwise).
- Register: S3.13 marked **Complete**; §11 next eligible is S3.14.
- `Plan.md`: S3.13 checked off (2026-11-06).

### S3.12 — Style Profile Persistence (2026-11-06) — [`c15a1d2`](https://github.com/lychgate/PanelForge/commit/c15a1d2c8e584b4eb9728afc65e68346496f20b6)

**Added**

- `src/core/project/style-persistence.ts` — read-only portability
  verification for S3.11 style profiles: `verifyStylePortability`
  (registry lookup per reference asset, portable-path check per S1.4,
  in-project existence), `isPortablePath` (rejects absolute paths and
  drive letters, `/`-separated relative paths only),
  `StylePersistenceError` for non-project roots.
- `tests/style-persistence.test.js` — 4 tests: portability pass/fail,
  snapshot create → restore round-trip to a new path, plain copy to
  a new path reopens identically, no machine-specific absolute paths
  in style rows.

**Changed**

- Register: S3.12 marked **Complete**; §11 next eligible is S3.13.
- `Plan.md`: S3.12 checked off (2026-11-06).

### S3.11 — Art Style Manager (2026-11-06) — [`ecb26a6`](https://github.com/lychgate/PanelForge/commit/ecb26a603bba9d8916908fd20798aa549643434e)

**Added**

- `src/core/project/styles.ts` — §9 style profile CRUD
  (`createStyle`/`updateStyle`/`deleteStyle`, registry-validated
  reference images), `setDefaultStyle` (transactional atomic swap;
  first profile auto-defaults; deleting the default requires a
  successor), `getStyle`/`listStyles`/`getDefaultStyle`.
- Migration 009 (`styles` table + partial unique index: at most one
  default) in `src/core/project/metadata.ts`.
- `tests/art-styles.test.js` — 7 tests: first-default auto, atomic
  swaps, partial updates, delete guards, reference validation,
  migration v9.

**Changed**

- Register: S3.11 marked **Complete**; §11 next eligible is S3.12.
- `Plan.md`: S3.11 checked off (2026-11-06).

### S3.10 — PDF Import (2026-11-05) — [`c203241`](https://github.com/lychgate/PanelForge/commit/c203241126d11884fb2ad79b866bf1143052f867)

**Added**

- `src/core/project/pdf-import.ts` — zero-dependency text-layer
  reader (`extractPdfStreams` with FlateDecode inflate,
  `extractContentStream` Tj/TJ operators, ToUnicode subset,
  `extractPdfText`, `importPdfManuscript`). Extracted PDFs persist
  normalization; scanned-only PDFs record with status "scanned" and
  no normalization row (Unknown by design, never silent).
- `tests/pdf-import.test.js` — 5 tests: inflate in order, twin match,
  ToUnicode mapping, scanned→Unknown, extracted persistence +
  non-PDF rejection.

**Changed**

- Register: S3.10 marked **Complete**; §11 next eligible is S3.11.
- `Plan.md`: S3.10 checked off (2026-11-05).

### S3.9 — EPUB Import (2026-11-05) — [`0fc34d8`](https://github.com/lychgate/PanelForge/commit/0fc34d821074df506a13ddd17a8db05aa239700e)

**Added**

- `src/core/project/epub-import.ts` — zero-dependency spine reader
  (container.xml → OPF → XHTML order): `epubRootfilePath`,
  `epubSpineOrder`, `extractXhtmlText` (h1–h6 → markers, scripts/
  styles stripped), `extractEpubText`, `importEpubManuscript`
  (original preserved via S3.1, normalization via S3.2). MathML/
  footnotes out of scope.
- `tests/epub-import.test.js` — 4 tests: spine order, heading
  extraction, preservation + normalization, non-EPUB rejection.

**Changed**

- Register: S3.9 marked **Complete**; §11 next eligible is S3.10.
- `Plan.md`: S3.9 checked off (2026-11-05).

### S3.8 — DOCX Import (2026-11-05) — [`248dd2a`](https://github.com/lychgate/PanelForge/commit/248dd2a33ab03d5101ccdc3ebe395b5c20950d11)

**Added**

- `src/core/project/docx-import.ts` — zero-new-dependency reader
  (Node `zlib` ZIP inflate + XML tokenizer): `readZipEntries`,
  `extractDocumentXml` (paragraphs, Heading1–3 → markdown markers,
  tabs/breaks), `importDocxManuscript` (original preserved via S3.1,
  normalization persisted via S3.2). Tracked changes/comments out of
  scope.
- `tests/docx-import.test.js` — 5 tests: stored/deflated ZIP +
  corrupt rejection, twin match, entities + tabs/breaks, preservation
  + normalization, missing-document/source rejection.

**Changed**

- Register: S3.8 marked **Complete**; §11 next eligible is S3.9.
- `Plan.md`: S3.8 checked off (2026-11-05).

### S3.7 — Canon Classification (2026-11-05) — [`9cb65dd`](https://github.com/lychgate/PanelForge/commit/9cb65ddc3af27049cb8d953c6180c1e917cd33ee)

**Added**

- `src/core/project/canon.ts` — four-way classification
  (explicit/interpretation/suggestion/unknown) with single-row
  upserts, `promoteToCanon` (explicit user action + rationale,
  unknowns refuse), `canonQuery` (explicit-only — suggestions never
  satisfy), and contradiction detection (conflicting explicit span
  records unknown, never merged).
- Migration 008 (`canon` table) in `src/core/project/metadata.ts`.
- `tests/canon.test.js` — 5 tests: suggestion quarantine + promotion,
  direct explicit, unknown non-promotable, contradiction handling,
  missing-id rejection.

**Changed**

- Register: S3.7 marked **Complete**; §11 next eligible is S3.8.
- `Plan.md`: S3.7 checked off (2026-11-05).

### S3.6 — Entity Extraction Framework (2026-11-05) — [`fa0e774`](https://github.com/lychgate/PanelForge/commit/fa0e774d8559f1940c2013a8949be2efbff1cc30)

**Added**

- `src/core/project/entities.ts` — typed candidates (character/
  location/object/event/chronology) with exact spans + heuristic
  confidence; `deterministicCandidates` spine, injectable
  `LlmEntityClassifier` + LM Studio factory with verbatim-quote
  validation (hallucinations rejected), `storeEntities`/`listEntities`.
- Migration 007 (`entities` table) in `src/core/project/metadata.ts`.
- `tests/entities.test.js` — 5 tests: exact spans, hallucination
  rejection, fixture storage + source resolution, classifier
  injection, missing-input rejection. Q5 LLM baseline nominated in
  the module header (3B instruct Q4; verify on-policy).

**Changed**

- Register: S3.6 marked **Complete**; §11 next eligible is S3.7.
- `Plan.md`: S3.6 checked off (2026-11-05).

### S3.5 — Source Relationships (2026-11-05) — [`6828c83`](https://github.com/lychgate/PanelForge/commit/6828c8368fbeebf83ca2e6166a9cfb8a68548c60)

**Added**

- `src/core/project/relationships.ts` — `traverseFromScene`
  (scene → chapter → manuscript → normalized slice → original bytes)
  and `verifySourceChain` (re-derived comparison, tiling + containment
  checks, S3.2 map resolution). FK joins + re-verification; no new
  tables. Entity linkage stays S3.6.
- `tests/relationships.test.js` — 5 tests: traversal exactness, CRLF
  bytes, span-tamper + escape detection, override verification.

**Changed**

- Register: S3.5 marked **Complete**; §11 next eligible is S3.6.
- `Plan.md`: S3.5 checked off (2026-11-05).

### S3.4 — Scene Extraction (2026-11-05) — [`8c4a205`](https://github.com/lychgate/PanelForge/commit/8c4a205f9551d3552d60a3bb5d16a4ce2f8e4ba9)

**Added**

- `src/core/project/scenes.ts` — deterministic scene-break rules
  (`***`, level 2–3 ATX, INT./EXT./LATER/MEANWHILE/BACK TO/CUT TO cues),
  `splitChapterIntoScenes` with exact tiling spans (bare `***` absorbs
  into the scene it opens), `storeScenes` (chapter-linked), and
  `recutScenes` manual overrides from explicit split points.
- Migration 006 (`scenes` table) in `src/core/project/metadata.ts`;
  scene cues excluded from the chapter all-caps rule.
- `tests/scenes.test.js` — 5 tests: fixture segmentation, fallback,
  chapter linking + byte resolution, override recuts, typed rejections.

**Changed**

- Register: S3.4 marked **Complete**; §11 next eligible is S3.5.
- `Plan.md`: S3.4 checked off (2026-11-05).

### S3.3 — Chapter Extraction (2026-11-05) — [`df93505`](https://github.com/lychgate/PanelForge/commit/df935052d84ededd0a5c8f632e2bb87e91cfb3be)

**Added**

- `src/core/project/chapters.ts` — deterministic heading segmentation
  (`matchChapterHeading`: Markdown ATX + CHAPTER/PART + all-caps
  convention; `extractChapters` with exact tiling spans; front-matter/
  untitled fallbacks), `storeChapters`/`listChapters`.
- Migration 005 (`chapters` table) in `src/core/project/metadata.ts`.
- `tests/chapters.test.js` — 5 tests: expected segmentation, prose
  rejection, CRLF byte-offset resolution, determinism, missing-
  normalization rejection. Source text never altered.

**Changed**

- Register: S3.3 marked **Complete**; §11 next eligible is S3.4.
- `Plan.md`: S3.3 checked off (2026-11-05).

### S3.2 — TXT/Markdown Normalization (2026-11-05) — [`bf8d427`](https://github.com/lychgate/PanelForge/commit/bf8d4274a09457ceb50c913617d4784086b2c29e)

**Added**

- `src/core/project/text-normalize.ts` — reversible CRLF/CR→LF folding
  (`normalizeManuscriptBytes` with byte-exact offset map),
  `sourceSpanFor` + `spansReconstructOriginal`, `storeNormalization`
  (DB row + `manuscripts/processed/` mirror), `getNormalization`.
- Migration 004 (`normalization` table) in
  `src/core/project/metadata.ts`.
- `tests/text-normalize.test.js` — 5 tests: exhaustive span round-trip,
  multi-byte offsets, empty/LF passthrough, store/get + mirror, non-txt
  rejection. Originals untouched.

**Changed**

- Register: S3.2 marked **Complete**; §11 next eligible is S3.3.
- `Plan.md`: S3.2 checked off (2026-11-05).

### S3.1 — Source Document Records (2026-11-05) — [`0ca58a5`](https://github.com/lychgate/PanelForge/commit/0ca58a54869f8ff41e15874f1aace20743c4502f)

**Added**

- `src/core/project/manuscripts.ts` — `importManuscript` (copy into
  `manuscripts/original/`, asset-registered, hashed, row inserted),
  `getManuscript`/`listManuscripts`, `readManuscriptOriginal`
  (byte-for-byte re-open), `verifyManuscript` (ok/modified/missing/
  unreadable), extension format detection.
- Migration 003 (`manuscripts` table + FK to assets) in
  `src/core/project/metadata.ts`.
- `tests/manuscripts.test.js` — 5 tests: preservation + hash, round-trip,
  integrity without mutation, typed rejections, migration v3.

**Changed**

- Register: S3.1 marked **Complete**; §11 next eligible is S3.2.
- `Plan.md`: S3.1 checked off (2026-11-05).

### S2.18 — Small GPU Mode (2026-11-05) — [`a30f908`](https://github.com/lychgate/PanelForge/commit/a30f908cffaa5b215420b97e4b197d0007b6de51)

**Added**

- `src/engines/tasks/smallgpu.ts` — GTX 1660 Ti-class envelope
  (`resolveSmallGpuProfile`: concurrency 1, sequential model loading,
  1024×1024 cap, conservative memory, release-after-each-task),
  `createSmallGpuQueue` (release hook fires per execution), and
  `retryOomWithLowerResources` (halves resolution to the 256 minimum,
  `resourceMode: cpu-fallback`, original stays failed; refuses
  fail-closed for approved images and minimum/unsized tasks).
- `tests/small-gpu.test.js` — 6 tests: envelope shape, in-budget
  execution with parking + release counting, OOM downsized retry,
  approved-image guard, minimum/unsized refusal, OOM wording match.

**Changed**

- Register: S2.18 marked **Complete**; **Stage 2 complete (18 of 18)**.
- `Plan.md`: S2.18 checked off (2026-11-05).
- `README.md`: Stage 2 completion noted; Stage 3 expands per §16.2 only.

### S2.17 — Cooling Down State (2026-11-05) — [`edbcc3d`](https://github.com/lychgate/PanelForge/commit/edbcc3db9c10439858406e7a5265b376011da8d0)

**Added**

- `src/engines/tasks/cooling.ts` — user-configurable soft/hard
  thresholds (`validateThresholds`, `evaluateThermal`: measured °C
  only; unknown telemetry never triggers), `describeCooling`
  (§10.5 five-question view), and `createCoolingQueue` (while hot,
  new dispatch blocks — queued tasks wait, never fail; generating
  tasks cooperatively interrupt to `cooling-down` → `queued`;
  `onCoolingChange` notifications; `resumeCooled` on cooldown).
- `tests/cooling-down.test.js` — 7 tests: threshold tripping/unknown
  honesty, validation, blocked dispatch + waiting, cooperative
  cool-down + resume, descriptor fields, notification edges,
  no-control guard.

**Changed**

- Register: S2.17 marked **Complete**; §11 next task is S2.18.
- `Plan.md`: S2.17 checked off (2026-11-05).

### S2.16 — Graceful Telemetry Failure (2026-11-05) — [`5ef2e45`](https://github.com/lychgate/PanelForge/commit/5ef2e45749bf74118b22b9a88d612823373b7595)

**Added**

- `src/engines/hardware/telemetry-status.ts` — `displayMetric`
  (Unknown, never 0/estimates), `summarizeTelemetry` (availability
  verdict + `Telemetry unavailable` indicator), and
  `resolveEffectiveProfile` (concurrency clamps to 1 when telemetry is
  unavailable; user-configured cooling interval preserved). The app
  stays fully usable on the effective profile.
- `tests/telemetry-failure.test.js` — 6 tests: killed-telemetry
  verdict, present-telemetry clearing, Unknown display honesty,
  conservative clamp with cooling preserved, invalid-sample rejection,
  queue completion without telemetry.

**Changed**

- Register: S2.16 marked **Complete**; §11 next task is S2.17.
- `Plan.md`: S2.16 checked off (2026-11-05).

### S2.15 — Telemetry Adapter Interface (2026-11-05) — [`b300085`](https://github.com/lychgate/PanelForge/commit/b300085440f52fc2d55cbd74de247941c6fb0b88)

**Added**

- `src/engines/hardware/telemetry.ts` — `TelemetryAdapter` contract
  (one `sample()` method), `createTelemetryRegistry` (ordered
  `sampleAll`; throws/malformed samples normalize to unknown), OS
  memory and NVIDIA (`nvidia-smi` CSV, first GPU) adapters, and
  `isTelemetrySample` validation (value-only-when-detected, numbers
  always > 0).
- `detectHardware` now takes `telemetryAdapters`: monitoring is
  Detected with adapter ids, otherwise Unknown.
- `tests/telemetry-adapter.test.js` — 8 tests: registry order,
  throw/malformed normalization, validator honesty, OS/NVIDIA
  sampling, zero-fabrication, monitoring wiring, Resource Manager
  decoupling.

**Changed**

- Register: S2.15 marked **Complete**; §11 next task is S2.16.
- `Plan.md`: S2.15 checked off (2026-11-05).

### S2.14 — Hardware Detection (2026-11-05) — [`b35afbb`](https://github.com/lychgate/PanelForge/commit/b35afbbc432eb57cfc9a81bebd074905cc96ce5e)

**Added**

- `src/engines/hardware/detect.ts` — `detectHardware()` with injectable
  probes: RAM/CPU via `os`, GPU via `nvidia-smi`, LM Studio/ComfyUI
  health probes, monitoring `unknown` until S2.15. Every signal is
  Detected/Unavailable/Unknown with `value` present only when detected
  (never 0, never fabricated); `isHardwareSnapshot` enforces the rule.
- Startup step `hardware-detection` in `src/main/index.ts` (logs the
  detected count; failures never block the window).
- `tests/hardware-detection.test.js` — 8 tests: honest typing, absent
  vs ambiguous branches, zero-RAM/empty-CPU degradation, validator
  rejection, non-blocking startup wiring.

**Changed**

- Register: S2.14 marked **Complete**; §11 next task is S2.15.
- `Plan.md`: S2.14 checked off (2026-11-05).

### S2.13 — Resource Profiles (2026-11-05) — [`0438158`](https://github.com/lychgate/PanelForge/commit/0438158577adf7d1333b6c2d60100f06121e08c7)

**Added**

- `src/engines/tasks/resources.ts` — Safe/Balanced/Performance/Custom
  resource profiles (§10.2) with `resolveResourceProfile` validation
  (typed `ResourceError`), `isOversizedForProfile`, and
  `createProfileQueue` enforcement: per-batch `queueConcurrency`,
  oversized tasks parked to `waiting-for-resources`, `coolingIntervalMs`
  between batches, and `params.resourceProfile` stamping for the S2.7
  progress view. No overclock/fan/power control; detection/telemetry
  inputs stay S2.14–S2.16.
- `tests/resource-profiles.test.js` — 9 tests: preset shapes, unknown
  profile/limit rejections, custom limits with balanced fallbacks,
  oversize detection, parallel-vs-sequential overlap, memory parking,
  cooling separation, profile stamping, no-overclock source guard.

**Changed**

- Register: S2.13 marked **Complete**; §11 next task is S2.14.
- `Plan.md`: S2.13 checked off (2026-11-05).

### S2.12 — Mock Provider Testing (2026-11-05) — [`4812845`](https://github.com/lychgate/PanelForge/commit/48128454127a3c42ed120db0761ca1c14d7783ea)

**Added**

- `src/engines/provider/mock.ts` — `createMockAdapter` (scripted S2.1
  test doubles: `success`, `failure`, `slow` with cancellable wait,
  `mixed` varied progress from a caller-supplied script; `failNext` for
  retry testing; `healthStatus` for gated-executor testing; `getCalls`
  invocation counting).
- `tests/mock-provider.test.js` — 10 tests proving the Stage-2
  acceptance (create→persist→execute→interrupt→resume→recover) against
  mocks: queue success/failure isolation, S2.1 validator conformance,
  scripted progress sequence, slow interrupt → INTERRUPTED, queue
  pause/resume, failNext + bounded retry, health gating with zero
  dispatches, restart recovery, and no production import of mocks.

**Changed**

- Register: S2.12 marked **Complete**; §11 next task is S2.13.
- `Plan.md`: S2.12 checked off (2026-11-05).

### S2.11 — Provider Health Checks (2026-11-05) — [`362f6dc`](https://github.com/lychgate/PanelForge/commit/362f6dc018dfe491896c8a3d7a4945cc77121055)

**Added**

- `src/engines/provider/health.ts` — `checkProviderHealth` (probe + shape
  validation + expected-model verification; malformed reports degrade to
  `unknown`), `createHealthMonitor` (parallel `checkAll`, cached timestamped
  reports, `isReady`/`requireReady`), and `createGatedExecutor` (typed
  `UNAVAILABLE` fast-fail; zero executions against unhealthy providers).
- `tests/provider-health.test.js` — 8 tests: ready/unavailable/unknown
  reports, missing-model unhealthy, monitor caching, UNHEALTHY gating, gated
  no-dispatch (0 executor calls).

**Changed**

- Register: S2.11 marked **Complete**; §11 next task is S2.12.
- `Plan.md`: S2.11 checked off (2026-11-05).

### S2.10 — ComfyUI Connection Adapter (2026-11-05) — [`b59591f`](https://github.com/lychgate/PanelForge/commit/b59591f2643aef4eec08a3c761ff4b1be644276f)

**Added**

- `src/engines/provider/comfyui.ts` — the image provider (S2.1 contract):
  `system_stats` health, `prompt` submission with node-error detection,
  `history` polling, per-output image fetch (base64), per-task
  AbortControllers + best-effort `/interrupt`, typed
  `UNAVAILABLE`/`TIMEOUT`/`FAILED`/`INTERRUPTED` results. Built-in `fetch`
  only; presence optional (§6.6).
- `tests/comfyui.test.js` — 5 tests against a real local-HTTP mock server:
  health-ready execute (images match), fail-closed workflow validation,
  closed-port graceful absence, node-error typing, interrupt during polling.

**Changed**

- Register: S2.10 marked **Complete**; §11 next task is S2.11.
- `Plan.md`: S2.10 checked off (2026-11-05).

### S2.9 — LM Studio Connection Adapter (2026-11-05) — [`acdf4c0`](https://github.com/lychgate/PanelForge/commit/acdf4c027fb1878d8e40635c84ee699b7b3a354e)

**Added**

- `src/engines/provider/lmstudio.ts` — the first real provider (S2.1 contract):
  `createLmStudioAdapter` over LM Studio's OpenAI-compatible HTTP API
  (`GET /v1/models` health + model listing, streaming `POST
  /v1/chat/completions` with SSE progress, per-task abort interrupts, typed
  `UNAVAILABLE`/`TIMEOUT`/`FAILED`/`UNSUPPORTED`/`INTERRUPTED` results). Built-in
  `fetch` only — no new dependencies; presence optional (§6.6), so an
  unreachable endpoint never throws across the boundary.
- `tests/lmstudio.test.js` — 4 tests against a real local-HTTP mock server:
  health-ready + streaming completion, graceful absence on a closed port,
  mid-stream interrupt, HTTP error mapping.

**Changed**

- Register: S2.9 marked **Complete**; §11 next task is S2.10.
- `Plan.md`: S2.9 checked off (2026-11-05).

### S2.8 — Queue Persistence and Recovery (2026-11-05) — [`102e31f`](https://github.com/lychgate/PanelForge/commit/102e31fd19880f3a697f3fc50f486f1bfb326a45)

**Added**

- `src/engines/tasks/recovery.ts` — `recoverQueue()`: running states
  (`preparing`/`loading-model`/`generating`/`post-processing`/`saving`) return
  to `queued` through the guarded transition path; paused/terminal tasks are
  untouched; the summary (`total`/`resumed`/`queued`/`paused`/`terminal`) is
  idempotent across restarts.
- Startup step `queue-recovery` in main (after database init): logs
  `queue recovered (total=…, resumed=…, queued=…)` on launch; failures are
  recorded, never blocking the window.
- `tests/queue-recovery.test.js` — 7 tests: restart resume executes exactly
  once (no double-runs), paused/terminal untouched, idempotency, every running
  state recovered, summary counts, main wiring.

**Changed**

- Backend checkpoint resumability arrives with real providers (S2.9–S2.10).
- Register: S2.8 marked **Complete**; §11 next task is S2.9.
- `Plan.md`: S2.8 checked off (2026-11-05).

### S2.7 — Progress Reporting (2026-11-05) — [`f84e340`](https://github.com/lychgate/PanelForge/commit/f84e34097cb7ab2c2842b8dc9959eb93056dc9b1)

**Added**

- `src/engines/tasks/progress.ts` — `describeTask`/`describeAllTasks`: the §11.2
  view (name, type, queue position, stage, elapsed, estimate, model, backend,
  resource profile, status, errorMessage, indeterminate flag). Elapsed is always
  timestamp-derived; `estimatedRemainingMs` is only reported when the caller
  supplied a meaningful estimate (otherwise `null`, shown as indeterminate) —
  percentages are never fabricated.
- App DB migration 003 (`003_task_progress`): `started_at`/`finished_at`/
  `error_message` on tasks; `setState` maintains started/finished timestamps.
- `tests/task-progress.test.js` — 9 tests covering all §11.2 fields, estimate
  honesty, queue order, timing, and NOT_FOUND.

**Changed**

- `tests/database.test.js`: migration list now asserts `003_task_progress`.
- Register: S2.7 marked **Complete**; §11 next task is S2.8.
- `Plan.md`: S2.7 checked off (2026-11-05).

### S2.6 — Retry Handling (2026-11-05) — [`1b8cbbe`](https://github.com/lychgate/PanelForge/commit/1b8cbbeb608c9dabee527869972ab19f21ba0350)

**Added**

- `src/engines/tasks/retry.ts` — `retryTaskWithPolicy(store, queue, taskId, policy)`:
  bounded attempts (`maxAttempts`), exponential backoff (`backoffMs × 2^(n-1)`),
  failed-only guard, typed `RetryError` codes. Deferred: none — retries are
  explicit, never automatic storms.
- `TaskQueue.runTask(taskId)` — single-task execution (needed by retry); the
  `runNext` path now shares the same `executeOne` core.
- `tests/task-retry.test.js` — 6 tests: flaky-then-ok within budget, permanent
  failure stops after N, sibling isolation, INVALID_STATE/NOT_FOUND/INVALID_POLICY,
  no hardcoded paths.

**Changed**

- Sibling isolation is structural (only the retried task re-queues).
- Register: S2.6 marked **Complete**; §11 next task is S2.7.
- `Plan.md`: S2.6 checked off (2026-11-05).

### S2.5 — Pause and Cancellation (2026-11-05) — [`4f51ecb`](https://github.com/lychgate/PanelForge/commit/4f51ecbee42019679212df27590eee0ba18bb6fc)

**Added**

- `src/engines/tasks/queue.ts` — `pauseTask`/`cancelTask`/`resumeTask` with an
  optional per-type `InterruptorMap` (S2.1 interrupt contract, best-effort),
  plus a no-resurrection settle: an interrupted task's late executor result is
  ignored, so pause/cancel wins and cancelled tasks stay cancelled.
- `tests/task-pause.test.js` — 7 tests: in-flight pause + resume, in-flight
  cancel + no resurrection, interruptor call capture, queued pre-start pause,
  NOT_FOUND/terminal rejection, cancel-while-queued never executes.

**Changed**

- Transition graph: `queued → paused` added (pausing before start; resumes
  through the existing `paused → queued`); `preparing`/`loading-model → complete`
  added (fast executors that report no intermediate stages complete directly —
  §11: not every provider walks every state).
- Register: S2.5 marked **Complete**; §11 next task is S2.6.
- `Plan.md`: S2.5 checked off (2026-11-05).

### S2.4 — Task State Transitions (2026-11-05) — [`ba43acf`](https://github.com/lychgate/PanelForge/commit/ba43acf59440da15ce857fd84f2861b695d0c3ac)

**Added**

- `src/engines/tasks/transitions.ts` — the allowed transition graph over the 12
  states, `canTransition`/`allowedNextStates`, and the guarded
  `transitionTask()` (`TransitionError` with `INVALID_TRANSITION`/`NOT_FOUND`;
  complete/cancelled terminal; running states may crash-resume to queued).
- `tests/task-transitions.test.js` — 7 tests: happy-path walk, illegal-edge
  rejection, retry/cancel semantics, unknown-state/task codes, graph queries.

**Changed**

- The queue now drives state changes through `transitionTask()` (S2.3 stays green
  against the guards); the progress→generating transition is awaited before the
  final transition (fixed a fire-and-forget race it had).
- Register: S2.4 marked **Complete**; §11 next task is S2.5.
- `Plan.md`: S2.4 checked off (2026-11-05).

### S2.3 — Task Queue (2026-11-05) — [`c745a09`](https://github.com/lychgate/PanelForge/commit/c745a090c40cd866a4cbc13fe12a28efe4c3e5fd)

**Added**

- `src/engines/tasks/queue.ts` — sequential executor dispatch
  (`createTaskQueue(store, executors)`): `enqueue`, `runNext`, `runUntilIdle`,
  `resumeInterrupted` (running states reset to queued). Drives
  `queued → preparing → generating → complete/failed`; a failed task never
  aborts the queue (failure isolation, §11.4); tasks without a registered
  executor fail closed.
- `tests/task-queue.test.js` — 9 tests: FIFO order and completion, empty
  queue, failure isolation, `ok:false` handling, fail-closed, progress
  callbacks, resume-to-queued, persisted-restart execution, no hardcoded paths.

**Changed**

- `src/engines/tasks/store.ts`: task listing is ordered by insertion (rowid)
  so FIFO order is deterministic even within the same millisecond.
- No real providers yet (S2.9–S2.10); pause/cancel/retry and transition
  ownership land in S2.5/S2.6/S2.4.
- Register: S2.3 marked **Complete**; §11 next task is S2.4.
- `Plan.md`: S2.3 checked off (2026-11-05).

### S2.2 — Persistent Task Records (2026-11-05) — [`ca9b34c`](https://github.com/lychgate/PanelForge/commit/ca9b34c9d1e95fc8232ea5077314b3be46067e2f)

**Added**

- `src/engines/tasks/store.ts` — persistent task records in the app database:
  `createTask` / `getTask` / `listTasks` / `setState` over the `tasks` table
  (UUID task_id, task_type, 12 §11.1 states as machine strings, JSON params,
  optional project link, created/updated timestamps; `defaultTaskStore` singleton).
- `tasks` table via app DB migration 002 (`002_tasks`).
- `tests/task-records.test.js` — 7 tests: create/get roundtrip, restart
  persistence, state updates, all 12 states, typed errors, list order.

**Changed**

- `tests/database.test.js`: migration list now asserts `002_tasks`.
- Records layer only — queueing/execution arrive with S2.3+, transition
  ownership with S2.4.
- Register: S2.2 marked **Complete**; §11 next task is S2.3.
- `Plan.md`: S2.2 checked off (2026-11-05).

### S2.1 — Provider Interface Definitions (2026-11-05) — [`c44c989`](https://github.com/lychgate/PanelForge/commit/c44c9894ebed259b109eebf15e091ce39fdac816)

**Added**

- `src/engines/provider/types.ts` — the adapter contract: `ProviderAdapter`
  (execute/interrupt/health), task types (`text`/`image`), progress stages,
  `ProviderErrorCode` (7 codes), health statuses
  (`ready`/`unavailable`/`unknown`), runtime validators, `listTaskTypes`.
  Progress percentages are only valid when measured (finite 0–100); the
  contract rejects invented values. No real provider code; zero
  renderer/UI/Electron/network imports.
- `tests/provider-contract.test.js` — 7 tests: fake-adapter conformance,
  progress/health/result validation, code taxonomy, dependency-free source.

**Changed**

- Register: S2.1 marked **Complete**; §11 next task is S2.2.
- `Plan.md`: S2.1 checked off (2026-11-05).

### S1.11 — Stage 1 Test Fixture (2026-11-05) — [`682d753`](https://github.com/lychgate/PanelForge/commit/682d753311c66ac23bed1290a4a38ed198038a03)

**Added**

- `tests/stage1-fixture.test.js` — 2 tests: one sample project exercises the
  whole Stage 1 lifecycle (create → identify → list/metadata → import asset →
  integrity → copy → reopen at a new path → snapshot → restore (integrity ok) →
  rename → archive), plus a gate test that ends with zero missing or modified
  assets. No production code changed.
- `Docs/PanelForge-Project-Format.md`: fixture section.

**Changed**

- Register: S1.11 marked **Complete**; **Stage 1 is complete**; §11 next task is S2.1.
- `Plan.md`: S1.11 checked off (2026-11-05); Stage 1 marked complete.

### S1.10 — Basic Project Interface (2026-11-05) — [`31aa931`](https://github.com/lychgate/PanelForge/commit/31aa931bb348284b19341ed2c96ff604f09f4d79)

**Added**

- Six project IPC channels (`panelforge:project.{create,list,open,close,rename,archive}`):
  validated args, S1.3 operations under the Core-owned manager, and preserved
  typed envelope codes. Optional `parentDir` (defaults to main-resolved
  `<userData>/projects`, so the renderer never deals in absolute paths).
- Preload frozen `project.*` bridge + Projects view (create form, list,
  open/close/rename/archive, `Alt+3`) with `aria-current` focus management.
- `tests/ipc.test.js` now 9 tests (8-channel allowlist, full round-trip through
  the envelope, typed codes) and `tests/project-interface.test.js` (5 tests,
  including a live renderer probe driving `Alt+3`).

**Changed**

- `SafeErrorCode` extended with project operation codes.
- Register: S1.10 marked **Complete**; §11 next task is S1.11.
- `Plan.md`: S1.10 checked off (2026-11-05).

### S1.9 — Project Portability Test (2026-11-05) — [`78e1949`](https://github.com/lychgate/PanelForge/commit/78e1949c0ab19cc835b28c3d5ec3b285003ceb62)

**Added**

- `tests/portability.test.js` — 5 tests proving the portability proof: a project
  copied to a different directory path (different nesting depth) opens normally
  (identify + metadata + list + asset integrity, all via the standard APIs);
  a moved project still opens after the original is deleted; the marker and
  database rows contain no machine-specific absolute paths; the operations list
  works at the new location; identity and metadata survive the move unchanged.

**Changed**

- No production code changed — S1.9 is the test itself.
- Register: S1.9 marked **Complete**; §11 next task is S1.10.
- `Plan.md`: S1.9 checked off (2026-11-05).

### S1.8 — Backup and Snapshot System (2026-11-05) — [`24246a5`](https://github.com/lychgate/PanelForge/commit/24246a56eb172c9c9b0716a8d81d10a5955addbb)

**Added**

- `src/core/project/backup.ts` — snapshots inside the project
  (`backups/snapshots/<id>/` with `project.json`, `project.db`, `files/`, and a
  `manifest.json` byte-hash map), external backups (snapshot copied out of the
  project), `verifySnapshot` (manifest byte-hash comparison: missing/modified
  reported), `restoreSnapshot` (copy into a fresh target — never over the
  original — then identify + integrity verification), and explicit retention
  (`pruneSnapshots(keep)`).
- `tests/backup-snapshot.test.js` — 9 tests: snapshot structure and manifest,
  clean verification, tamper detection, restore-then-integrity with the original
  undamaged, refusal of tampered/occupied/self restores, external backup copy,
  retention pruning, NOT_FOUND.

**Changed**

- Format/retention/restore semantics are engineering judgment where the spec is
  silent (documented in the module header): full copies, no dedup, explicit
  pruning, fresh-target restores only.
- Register: S1.8 marked **Complete**; §11 next task is S1.9.
- `Plan.md`: S1.8 checked off (2026-11-05).

### S1.7 — Atomic Metadata Operations (2026-11-05) — [`a3d9141`](https://github.com/lychgate/PanelForge/commit/a3d9141699fd30b212aa3d07bee00685510bd1c8)

**Added**

- Atomic writes everywhere in project metadata: `withMetadataTransaction`
  (serialized `BEGIN IMMEDIATE` batches — a throwing batch rolls back fully),
  an fsync-backed `project.json` marker write (S1.1), and
  `checkpointProjectDatabase` (WAL checkpoint = basic autosave; every write is
  already a full commit, so there is no dirty state to lose).
- Corruption recovery at open (D10): `PRAGMA integrity_check`; a corrupted
  database is preserved as `<db>.bak-<timestamp>` and a fresh database starts,
  with `recovered`/`backupPath` reported to the caller. A recovery dialog UI
  remains a later task.
- `tests/atomic-metadata.test.js` — 8 tests: transaction commit, interrupted-
  write rollback (values untouched), serialized concurrency, corruption recovery
  (original preserved, fresh DB usable), healthy-DB no-recovery, checkpoint,
  fsync source check.

**Changed**

- Project DB open in `openProjectDatabase` now runs versioned migrations from a
  table (`001_initial`, `002_asset_registry`) and performs the recovery check;
  `database/project.db` callers receive the richer `{db, recovered, backupPath}` shape.
- Register: S1.7 marked **Complete**; §11 next task is S1.8.
- `Plan.md`: S1.7 checked off (2026-11-05).

### S1.6 — Asset Integrity Checking (2026-11-05) — [`9ec25bb`](https://github.com/lychgate/PanelForge/commit/9ec25bbc971092e56f5f5c9a628c828eccc3a426)

**Added**

- `src/core/project/integrity.ts` — `verifyProjectIntegrity()`: compares every
  registry row against its file and returns an integrity report
  (`{projectId, checkedAt, entries, summary}`) with per-asset
  `ok|missing|modified|unreadable` statuses and expected/actual SHA-256 hashes.
  Verification is read-only; paths resolve through the S1.4 symlink-safe checker.
- `tests/asset-integrity.test.js` — 7 tests: clean project all-ok, deleted →
  missing, tampered → modified (actual hash recorded), mixed-damage counts,
  empty registry, marker requirement, no-mutation guarantee.

**Changed**

- Register: S1.6 marked **Complete**; §11 next task is S1.7.
- `Plan.md`: S1.6 checked off (2026-11-05).

### S1.5 — Asset Registry (2026-11-05) — [`96b28fd`](https://github.com/lychgate/PanelForge/commit/96b28fd3abd53bc60dffe4a1ba7e864b32bcf4d7)

**Added**

- `src/core/project/registry.ts` — asset registry in `database/project.db`
  (migration 002 `assets` table): `importAsset` (external copy-in, SHA-256 hash,
  UID row — identity is the ID, never the path, per D6), `copyAsset` (mints a
  new identity; the original is unchanged), `getAsset`, `listAssets`.
  `relative_path` is unique per project (duplicate destinations rejected);
  destinations resolve through the S1.4 path service.
- `tests/asset-registry.test.js` — 9 tests: import copy+hash+row, get/list
  retrieval, copy new-identity behavior, duplicate-path rejection (import and
  copy), source/ID errors, traversal rejection, persistence.

**Changed**

- Project metadata migrations are now a versioned list (002 adds the registry;
  pre-existing v1 databases migrate forward), and the open/queue/busy-retry
  helpers are shared with the registry.
- S1.5 records the §7.4 subset (UID + relative path + type + dates + hash);
  version/approval/relationships/provenance remain later tasks.
- Register: S1.5 marked **Complete**; §11 next task is S1.6.
- `Plan.md`: S1.5 checked off (2026-11-05).

### S1.4 — Relative Asset Path Service (2026-11-05) — [`89214ff`](https://github.com/lychgate/PanelForge/commit/89214ff122cbba87235ab5f391d6ab3b609ef422)

**Added**

- `src/core/project/paths.ts` — relative asset path service: `normalizeRelative`
  (lexical canonicalization; rejects absolute paths, backslashes, and escapes),
  `resolveInProject` (canonicalize + join + symlink-resolved target verification —
  a link pointing outside the project is rejected even when its spelling looks
  valid), and the `toStoragePath` inverse. Non-existent files resolve by parent.
- `tests/project-paths.test.js` — 10 tests: correct resolution of valid paths,
  normalization, traversal/absolute/backslash rejection, symlink escape rejected
  + internal symlink accepted, non-existent-file resolution, storage inverse.

**Changed**

- `Docs/PanelForge-Project-Format.md` (paths section already specified these
  rules; S1.4 implements them).
- Register: S1.4 marked **Complete**; §11 next task is S1.5.
- `Plan.md`: S1.4 checked off (2026-11-05).

### S1.3 — Basic Project Operations (2026-11-05) — [`dea5e4c`](https://github.com/lychgate/PanelForge/commit/dea5e4c54f8e15b4ec10add55497c95b3c5f30de)

**Added**

- `src/core/project/operations.ts` — basic operations over the S1.1/S1.2 project
  layer: `createProjectAt` (folder + marker + metadata), `listProjects`
  (valid projects only, junk skipped), `openProject`/`closeProject`
  (in-process open-set exclusivity), `renameProject` (folder + metadata name,
  project ID unchanged), `archiveProject` (moves into sibling `.archived/`,
  leaving the active library). All failures are `ProjectOpError` with typed
  codes (`INVALID_NAME`, `INVALID_ARGUMENTS`, `NOT_FOUND`, `NOT_A_PROJECT`,
  `CORRUPT_MARKER`, `UNSUPPORTED_VERSION`, `ALREADY_OPEN`, `ALREADY_CLOSED`,
  `ALREADY_EXISTS`, `INVALID_STATE`).
- `tests/project-operations.test.js` — 9 tests covering each operation
  independently and each error code.

**Changed**

- Semantics for what the spec leaves unspecified (engineering judgment,
  documented): rename renames folder + metadata; archive moves to
  `<parent>/.archived/<folder>`; rename/archive while open are rejected.
- No IPC channels added this task — operation UIs arrive with S1.10.
- Register: S1.3 marked **Complete**; §11 next task is S1.4.
- `Plan.md`: S1.3 checked off (2026-11-05).

### S1.2 — Project Metadata Schema (2026-11-05) — [`a6d8566`](https://github.com/lychgate/PanelForge/commit/a6d8566bcaa42347bc051348067f266a7ff73023)

**Added**

- `src/core/project/metadata.ts` — project database service on
  `database/project.db` (the authoritative store per D5):
  `projects(project_id, name, description, created_at, updated_at)`, WAL +
  foreign keys + busy timeout 5000, tracked migrations, serialized writes with
  busy retry, and `createProjectMetadata` / `getProjectMetadata` /
  `updateProjectMetadata` (name validation, typed error codes:
  `INVALID_ARGUMENTS` / `NOT_A_PROJECT` / `ALREADY_EXISTS` / `NOT_FOUND`).
  `projectId` and `createdAt` come from the S1.1 marker.
- `tests/project-metadata.test.js` — 8 tests: marker-identity rows, roundtrip,
  reopen persistence, `updated_at` bump, validation and error codes, and
  marker-required checks.

**Changed**

- `Docs/PanelForge-Project-Format.md`: metadata schema section.
- Register: S1.2 marked **Complete**; §11 next task is S1.3.
- `Plan.md`: S1.2 checked off (2026-11-05).

### S1.1 — Project Folder Format (2026-11-05) — [`3a6d599`](https://github.com/lychgate/PanelForge/commit/3a6d5993c20d3157a0955b8f12dc6385438da63f)

**Added**

- `src/core/project/service.ts` — project folder format (`PROJECT_FORMAT_VERSION=1`,
  full §7.1 tree, `ProjectMetadata` `{formatVersion, projectId, createdAt}`,
  `createProject` (tree + atomic marker), `identifyProject` (identification +
  version-check with typed codes), `resolveProjectPath` (D7 relative-path
  enforcement)).
- `Docs/PanelForge-Project-Format.md` — the folder specification (layout,
  marker fields, version-check rules, D5 canonical-store statement, path rules).
- `tests/project.test.js` — 11 tests: marker content, complete tree, D5 paths,
  identify positive/negative/corrupt/newer-version, traversal rejection, atomicity.

**Changed**

- Owner adopted the D5 proposal (recorded as [APPROVED CHANGE — owner]):
  `database/project.db` is the authoritative operational store; `project.json`
  is the version/ID marker + minimal manifest; JSON files inside the project
  are regenerable mirrors (database wins on conflict).
- Register: S1.1 marked **Complete**; §11 next task is S1.2.
- `Plan.md`: S1.1 checked off (2026-11-05).

### S0.12 — Stage 0 Verification (2026-11-05) — [`a548284`](https://github.com/lychgate/PanelForge/commit/a548284dda33b1016d43a63d35bb8e508d35cf8a)

**Added**

- `scripts/smoke-test.js` — repeatable end-to-end launch check (`npm run smoke`):
  isolated userData dir, asserts the full lifecycle (`PanelForge starting →
  database ready (journal=wal) → startup complete → shutting down →
  shutdown complete`), config/logs/database artifacts present, no stray
  processes. Skips (exit 0) when headless.
- `Docs/PanelForge-Stage0-Completion.md` — Stage 0 completion report: acceptance
  checklist, delivered-components table, known limitations, Stage 1 entry notes.

**Changed**

- `README.md`: ops section gains `npm run smoke`; a Known limitations section
  (CSP deferred, no icon, devTools-in-dev, experimental upstream `node:sqlite`,
  rotation/backup limits, deferred recovery dialog, audit notes) and Stage 0
  marked complete with S1.1 named as next (awaiting authorization).
- Verified on the final tree: typecheck + build + `npm run check` + 82 tests green;
  clean `rm -rf forge-out && electron-forge make` rebuild; packaged binary
  launched with the full lifecycle, no strays.
- Register: S0.12 marked **Complete**; **Stage 0 is complete**; §11 next task is S1.1.
- `Plan.md`: S0.12 checked off (2026-11-05); Stage 0 marked complete.

### S0.11 — Initial Packaging (2026-11-05) — [`23b7897`](https://github.com/lychgate/PanelForge/commit/23b78973c7492166c2e84cdf4a22ab66d19318b4)

**Added**

- `forge.config.js` — Electron Forge packaging configuration (spec §14): `outDir:
  "forge-out"` (kept separate from the compiled `out/` app, which the packager
  would otherwise exclude), `.deb` maker, zip fallback, `ignore` list plus a
  `packageAfterCopy` cleanup hook that deterministically removes sources, tests,
  docs and probe scripts so the package ships only what the runtime needs.
- `.gitignore`: `forge-out/`.
- `vitest.config.js` — excludes `forge-out/**` and `out/**` from test collection
  (packaged copies of the app otherwise get collected as tests).
- `tests/packaging.test.js` — 5 tests (deb maker, outDir collision guard, scripts,
  no native add-ons, forge-out gitignored).

**Changed**

- `package.json`: `package` and `make` scripts; `@electron-forge/cli`,
  `@electron-forge/maker-deb`, `@electron-forge/maker-zip` devDependencies.
  (Two issues found during packaging and fixed: Forge's default `out/` output
  dir would have excluded the compiled app; the packager `ignore` regexes are
  best-effort here, hence the `packageAfterCopy` cleanup.)
- Verified: runnable package + `.deb`/`.zip` built; packaged binary and the
  extracted `.deb` both launched with the full lifecycle independently of the
  development environment (no native modules — `node:sqlite` is built-in).
- Register: S0.11 marked **Complete**; §11 next task is S0.12.
- `Plan.md`: S0.11 checked off (2026-11-05).

### S0.10 — Keyboard Shortcuts and Navigation Foundation (2026-11-05) — [`70c53e3`](https://github.com/lychgate/PanelForge/commit/70c53e37a475a44d2256a63052c44f849ccb1bb6)

**Added**

- `src/renderer/shortcuts.ts` — DOM-free shortcut registry (`createShortcutRegistry`):
  combo normalization (`Alt+1` → `alt+1`), exact `KeyInput` matching, duplicate
  id/combination rejection. Imported via dynamic `import()` in tests (ESM output).
- `src/renderer/navigation.ts` — DOM-free view manager (`createNavigation`):
  ordered views, single current view, unknown-view rejection.
- Renderer shell: Diagnostics + About views (both rendered from the S0.5 payload),
  named `.js`-suffixed ESM imports; `index.html` gains a labelled `<nav>`,
  `<main>`, and a visible `:focus-visible` outline so core navigation works with
  `Tab` + `Enter`.
- Application menu (main): File → Quit (`CmdOrCtrl+Q`), View → Reload
  (`CmdOrCtrl+R`) — accelerators work even when focus is not in the renderer.
- `Docs/PanelForge-Shortcuts.md` — shortcut documentation (`Alt+1`/`Alt+2`,
  `Tab`, `Ctrl+Q`, `Ctrl+R`).
- `tests/shortcuts.test.js` — 12 tests including a **live probe** that launches
  Electron and dispatches synthetic `Alt+2`/`Alt+1` keydown events against the
  real renderer, asserting the view switches without any mouse interaction.

**Changed**

- Register: S0.10 marked **Complete**; §11 next task is S0.11.

### S0.9 — Application Lifecycle Infrastructure (2026-11-05) — [`aa2d0b1`](https://github.com/lychgate/PanelForge/commit/aa2d0b117f9c6f9b9936cb7b584a2588e59927e0)

**Added**

- `src/core/lifecycle/service.ts` — application lifecycle service
  (`createLifecycleService` / `defaultLifecycleService`): ordered, failure-isolated
  startup steps with summaries; reverse-order, failure-isolated cleanup hooks;
  idempotent `shutdown()`; state machine
  `idle → starting → ready → shutting-down → closed`; broadcast
  `startup:step`/`startup:complete`/`shutdown:step`/`shutdown:complete` events.
  Dependency-free (steps/hooks are callbacks), so it unit-tests in plain Node.
- `tests/lifecycle.test.js` — 10 tests: step order, async steps, failing-step
  isolation, state transitions, event broadcast, reverse-order cleanup,
  failing-hook isolation, idempotent shutdown, main wiring.

**Changed**

- Main: startup rewired through lifecycle steps
  (`ipc → config+logging → database`); `registerCleanup("database")`;
  `before-quit` triggers `shutdown()`; a synchronous
  `PanelForge shutting down` entry is written first so the trace survives exit
  timing, followed by the best-effort `shutdown complete` summary. Window
  creation still happens unconditionally after startup completes (in the
  `whenReady` callback — unchanged behavior).
- Register: S0.9 marked **Complete**; §11 next task is S0.10.

### S0.8 — SQLite Foundation (2026-11-05) — [`c7bbc8c`](https://github.com/lychgate/PanelForge/commit/c7bbc8c689e124ab41149b2c413b5ab2d2aa1f2d)

**Added**

- `src/database/service.ts` — centralized SQLite service (`createDatabaseService` /
  `defaultDatabaseService`) using Node's built-in `node:sqlite` (`DatabaseSync`).
  Database at `<userData>/database/panelforge.db`; no new dependency, no native build;
  D8/Q3 library decision recorded. Verified available in plain Node 22.23.1 and
  Electron 45's bundled Node 24.22.2.
- Required pragmas applied at open: `journal_mode=WAL`, `foreign_keys=ON`,
  `busy_timeout=5000`.
- Migration mechanism: in-code numbered migrations (forward-only) tracked in the
  `schema_migrations` table and auto-run on open; initial migration `001_initial`
  creates `schema_migrations` + a minimal `kv_store` smoke table.
- Serialized writes: Core-Engine-owned write queue (arrival order, one writer at a
  time), `transaction()` with `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`, and busy/locking
  retries (max 3).
- `backupDatabase()` producing a standalone copy under `database/backups/`
  (consistent snapshot; automatic scheduling deferred).
- `tests/database.test.js` — 10 tests: pragmas, migration recording + no re-apply,
  persistence across restarts, 20 concurrent writes → count 20, FK enforcement,
  transaction rollback, readable backup, query-before-init failure, no hardcoded
  paths, main wiring.
- Main: database initialization on startup (ready entry logged) and close on
  `before-quit`. `tsconfig.node.json` include extended to `src/database/**/*.ts`.

**Changed**

- Startup failure handling: a failed database initialization is recorded via
  `logError` and never blocks the window from opening.
- Register: S0.8 marked **Complete**; Q3 (SQLite library) marked Decided
  (`node:sqlite`); §11 next task is S0.9.

### S0.7 — Logging and Error Handling (2026-11-05) — [`38015a1`](https://github.com/lychgate/PanelForge/commit/38015a159ab3e028976473247ee5effe81b899f5)

**Added**

- `src/core/logging/service.ts` — central logging service
  (`createLogService` / `defaultLogService`). JSON-line entries
  `{timestamp, level, message}` at `<userData>/logs/panelforge.log` (mode `0600`).
- Levels `debug`/`info`/`warn`/`error` with minimum-level filtering (default `info`;
  set from the S0.6 config `logLevel` at startup).
- Size-limited rotation: 512 KiB active log rotates into
  `panelforge-1.log` … `panelforge-3.log`; the oldest backup is deleted.
- Redaction as implemented: `token=`/`password=`/secret-like `key=value` patterns are
  replaced with `[REDACTED]`, the home directory path is replaced with `<home>`,
  and entries longer than 1024 characters are truncated. Message content not
  matching these patterns is logged as-is.
- `logError()` records Error name + message in the same entry shape (no stacks).
  Logging never throws.
- `tests/logging.test.js` — 12 tests: entry shape/location, min-level filtering,
  error recording without stacks, rotation within the size limit (test limits),
  redaction, message capping, never-throws, no hardcoded paths, main/registry wiring.

**Changed**

- Main: startup records `PanelForge starting` through the log service; the config
  failure path now routes through `logError` instead of `console.error`.
- IPC registry: handler failures are recorded via `logError`; the renderer
  envelope is unchanged (`HANDLER_ERROR`, no sensitive detail).
- Register: S0.7 marked **Complete**; §11 next task is S0.8.

### S0.6 — Configuration and User Paths (2026-11-05) — [`913d575`](https://github.com/lychgate/PanelForge/commit/913d575b5a94c7dcccd1eb055cd591372ea518cd)

**Added**

- `src/core/config/service.ts` — centralized configuration service
  (`createConfigService` / `defaultConfigService`). Settings at
  `<userData>/config/config.json`; userData via `app.getPath("userData")`
  (`PANELFORGE_USER_DATA_DIR` override for tests, `~/.config/panelforge` fallback
  outside Electron) — never a hardcoded machine-specific path.
- `CONFIG_VERSION=1` with defaults
  `{theme:"system", logLevel:"info", launchAtStartup:false, diagnosticsEnabled:true}`.
- Safe I/O: missing file → defaults; corrupt JSON → timestamped `.bak-` backup +
  defaults; older versions migrated by filling current defaults; atomic writes
  (tmp + rename, `0600`); traversal guard in `getUserDataSubPath()`.
- API: `ensureConfigDir`, `loadConfig`, `saveConfig`, `updateConfig`,
  `resetConfig` (settings file is only created on first save/update/reset;
  startup creates the directory and loads — it does not write defaults).
- `tests/config.test.js` — 12 tests: defaults, settings location, round-trip,
  atomicity, corrupt backup, migration, traversal guard, no hardcoded paths,
  main wiring.

**Changed**

- Main: calls `ensureConfigDir()` + `loadConfig()` in `app.whenReady`
  (try/catch; failures never block the window).
- Register: S0.6 marked **Complete**; §11 next task is S0.7.

### S0.5 — Safe Diagnostic Operation (2026-11-05) — [`95da22b`](https://github.com/lychgate/PanelForge/commit/95da22be0e0da5e791a1ea633558a1000f6dae1e)

**Added**

- `panelforge:diagnostics.get` IPC handler returning
  `{appName, electronVersion, nodeVersion, platform, arch, channel, timestamp}`.
- Preload frozen `diagnostics.get()` wrapping `ipcRenderer.invoke` for the single
  approved channel.
- Renderer: calls the bridge on load and renders `#diagnostic-status`
  (`index.html` switched to `<script type="module">` so ESM loads).

**Changed**

- `tests/ipc.test.js` extended with diagnostics.get cases (7 tests);
  `tests/security.test.js` verifies the bridge diagnostic call.

### S0.4 — IPC Foundation (2026-11-05) — [`8026da3`](https://github.com/lychgate/PanelForge/commit/8026da3416f7619a638faddfd0969c35f8e38de8)

**Added**

- `src/core/ipc/registry.ts` — the only place `ipcMain.handle` is called:
  frozen channel allowlist, argument validation, and the safe
  `IpcResult<T>` envelope (`{ok:true,data}` / `{ok:false,code,message}`).
- `src/shared/types/index.ts` — `SafeErrorCode`, `IpcResult<T>`, `IpcRequest<TArgs>`,
  `DiagnosticsPingArgs/Data`.
- `tests/ipc.test.js` — 6 tests (allowlist, `INVALID_ARGUMENTS`, envelope).

**Changed**

- Main calls `registerIpcHandlers()` at startup; no direct `ipcMain.handle` in main.
- `scripts/check.js` IPC guard: `ipcMain` only in the registry.

### S0.3 — Secure BrowserWindow Configuration (2026-11-05) — [`4c8d10b`](https://github.com/lychgate/PanelForge/commit/4c8d10b5582e67b9317fb1ce2e4e279208d7520e)

**Added**

- `Docs/PanelForge-Security-Baseline.md` — security baseline document.
- `tests/security.test.js` — 12 static checks + live renderer probe
  (`hasRequire:false, hasProcess:false, hasFs:false, hasElectron:false, hasPanelforge:true`).
- Restricted preload bridge: frozen empty `window.panelforge` via `contextBridge`.
- Navigation guards (local file only) and window-open deny handler.

**Changed**

- `devTools: !app.isPackaged` (enabled in dev, disabled in packaged builds).
- `scripts/check.js` guard updated for the bridge (comments stripped before grep).
- CSP intentionally deferred (decided with the UI framework choice).

### S0.2 — Electron Application Launch (2026-11-05) — [`0d73f1a`](https://github.com/lychgate/PanelForge/commit/0d73f1aff014129b089f04b7972e182f501a9e47)

**Added**

- `electron` devDependency (only dependency added by S0.2).
- `src/main/index.ts` — main process; secure BrowserWindow defaults from the first
  launch (Q2): `contextIsolation`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity`, `allowRunningInsecureContent: false`.
- `src/renderer/index.html` + `index.ts` — initial renderer.
- `src/preload/index.ts` — inert stub (no IPC yet; zero-IPC grep verified).
- `scripts/copy-renderer-html.js` (built-in `fs`/`path` only) so the renderer HTML
  is copied by `build`; canonical launch is `electron .` via `package.json`
  `main: out/node/main/index.js`.

**Changed**

- `package.json`: `start: electron .`; `build` appends the HTML copy;
  `npm run dev` remains typecheck + baseline check only, `start` launch-only.
- `tsconfig` `rootDir: src` fixed the renderer output path to
  `out/web/renderer/`.
- Register: S0.2 marked **Complete** (register [`dd38b88`](https://github.com/lychgate/PanelForge/commit/dd38b8878f2964058caff275f6b42b2137c5179f)).

### S0.1 — Repository and Package Baseline (2026-11-05) — [`55853fb`](https://github.com/lychgate/PanelForge/commit/55853fb7de4f7f02a5ea4c725a9f4eb5f9ee25bf)

**Added**

- Git repository root with private `package.json` (`name: panelforge`).
- Split `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`.
- `.gitignore` (node_modules, out, logs, env/secrets, models, temp) and `README.md`.
- `src/` scaffolding (main/preload/renderer/core/engines/modules/database/shared
  placeholders).
- `scripts/check.js`, `scripts/dev-check.js`, and `tests/baseline.test.js`.
- Dependencies: `typescript`, `vitest`, `eslint` only — no database, Electron,
  or AI packages (D8/Q3 deferred to S0.8).

**Changed**

- Register: S0.1 marked **Complete** (register [`e1e14e8`](https://github.com/lychgate/PanelForge/commit/e1e14e86b48442a9fdd4331ce2aac40f53c5d59d)); register v3.1
  corrections recorded (Q2 approved, Q3/Q4/Q5 deferred, S1.5a removed from the
  implementation sequence, one-task-at-a-time promoted to approved protocol).
