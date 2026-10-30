# ITR Patient History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-section Patient Background with the five-section ITR Patient History (I–V), filled once in a BHC consultation screen or an RHU form section, with prefill / carry-forward / "No changes" automation and no auto-decisions.

**Architecture:** Extend `patients.medical_background` and the existing `PatientBackground` service (new `obstetric` section, structured field shapes, a `reviewed` list that stamps `reviewedAt` without conflict checks). Per-visit `informant` / `similar_illness` go on `health_records`. One controlled `PatientHistoryPanel` component is mounted as a BHC step and an RHU form section; pure utils hold all logic so it is unit-testable.

**Tech Stack:** Laravel + PHPUnit (`php artisan test`), React + Vite, `node --test` for frontend utils (scripts in `frontend/package.json`), ESLint.

**Spec:** `docs/superpowers/specs/2026-10-16-itr-patient-history-design.md`

## Global Constraints

- Staff decide: automation only prefills, carries forward or does arithmetic. No auto-flag, auto-classify ("at risk", "heavy smoker") or hidden-and-unopenable fields.
- Profile Background tab stays read-only; background changes only through a consultation and apply on finalize. Only RHU confirms conditions. Never copy a relative's conditions into Family History.
- Current Conditions = "Confirmed by RHU" (read-only) + "Reported by patient (not confirmed)" (editable). The "Unverified (legacy)" group is removed.
- Server stamps `source: "Patient-reported"` and `firstRecorded` on patient-reported conditions.
- Hospitalizations are patient-reported, never derived from referrals.
- Section V: Female only; expanded at age ≥ 10, collapsed with **Show** below 10. Sexual subsection expanded at age ≥ 15, collapsed with **Show** below 15.
- Obstetric update (edited or reviewed) on a non-Female patient → 422.
- No computed value is stored (age, pack-years, G/P). Pack-years = `sticksPerDay / 20 × years`, number only. G = pregnancies count; P = liveBirth + stillbirth.
- "Mark all reviewed" marks only sections that already hold recorded data. Reviewing is never required to continue or finalize.
- `reviewedAt.{section} = { date, facility, by }`; `reviewed` entries: no conflict check, no revision bump, no change entry.
- Errors: 409 `PATIENT_BACKGROUND_CONFLICT` (stale edited section), 403 without `clinical.history`, 422 invalid input.
- Allergies `noneKnown` and non-empty `items` are mutually exclusive (422); same for hospitalizations `none` and family `noneKnown`.
- Enum/range values: smoking/alcohol status `never|former|current`; sticksPerDay 1–100; years 0–80; alcohol frequency `occasional|weekly|daily`; menarcheAge 6–25; menopauseAge 30–70; intervalDays 10–90; durationDays 1–15; amount `light|moderate|heavy`; regularity `regular|irregular`; menstrualStatus `menstruating|menopause`; pregnancy outcome `liveBirth|miscarriage|stillbirth`; delivery `normal|cesarean|notApplicable`; similar illness answer `Yes|No|Unknown`.
- All UI copy, code and docs in English.

## Review Focus

1. A patient whose `medical_background` is null, empty, or still in the old string shape must render everywhere without crashing (Task 7 normalizer test).
2. Obstetric update for a male patient **and for a patient with no sex recorded** is rejected with 422 (Task 2).
3. Female patient with no birthdate: Section V and Sexual show expanded, nothing throws (Task 6).
4. A section that is both edited and in `reviewed`, a double-submitted `reviewed`, or an unknown section key in `reviewed` — one stamp / 422 respectively, never a 500 (Task 2).
5. A draft (server or on-device) saved before this change with the old `backgroundUpdate` shape must still open, with that staged edit dropped, not fail with 422 (Tasks 3 and 7).

---

### Task 1: Migrations and record columns

**Files:**
- Create: `backend/database/migrations/2026_10_16_000001_add_informant_and_similar_illness_to_health_records.php`
- Create: `backend/database/migrations/2026_10_16_000002_reset_background_for_itr_history.php`
- Modify: `backend/app/Models/HealthRecord.php` (`$fillable` after `'background_changes'`; `$casts`)
- Test: `backend/tests/Feature/ItrHistoryMigrationTest.php`

**Interfaces:**
- Produces: `health_records.informant` (json, nullable) and `health_records.similar_illness` (json, nullable), both fillable and cast to `array` on `HealthRecord`. Same `hasColumn` guard style as `2026_10_03_000001_add_background_changes_to_health_records.php`.

- [ ] **Step 1: Write failing tests** in `ItrHistoryMigrationTest` (`RefreshDatabase`):
  - `test_health_record_round_trips_informant_and_similar_illness`: create a record with `informant => ['relation' => 'Mother', 'name' => 'Juana', 'patientId' => null]` and `similar_illness => ['answer' => 'Yes', 'who' => 'Sibling', 'note' => 'cough']`; fresh model returns the same arrays.
  - `test_cleanup_keeps_only_patient_reported_conditions_and_resets_old_fields`: a patient with `currentDiseases` of one `Patient-reported` and one `Consultation` entry, plus string `allergies`, `hospitalizations`, `surgeries`, `familyHistory`, `personalSocial`, and a record with `background_changes`; run the cleanup migration (`(require $path)->up()`); assert only the patient-reported condition remains, the old keys are absent, `revisions` is untouched, and the record's `background_changes` is null.
- [ ] **Step 2: Run** `cd backend && php artisan test --filter=ItrHistoryMigrationTest` — Expected: FAIL (columns missing).
- [ ] **Step 3: Implement** the two migrations and the model change. The cleanup migration (`up` only; `down` is a documented no-op because the data is test data) walks patients in chunks: keep `currentDiseases` entries with `source === 'Patient-reported'`, unset `allergies`, `hospitalizations`, `surgeries`, `familyHistory`, `personalSocial` and every `updatedAt` key, keep `revisions`; then null `health_records.background_changes`.
- [ ] **Step 4: Run** the test again — Expected: PASS.
- [ ] **Step 5: Commit** `feat(history): record columns and background cleanup migration`.

---

### Task 2: PatientBackground service — new sections, shapes, `reviewed`

**Files:**
- Modify: `backend/app/Services/PatientBackground.php`
- Modify: `backend/tests/Feature/PatientBackgroundConsultationTest.php` (move fixtures and assertions to the new shape; keep its 409/403/log coverage)
- Test: `backend/tests/Feature/PatientHistorySectionsTest.php`
- Modify (grep `medical_background`, `allergies`, `personalSocial`, `familyHistory` in `backend/tests` and `backend/app`): `ApprovedFacilityPermissionsTest`, `ConsultationProgramsTest`, `HealthConcernBoundaryTest`, `HouseholdParentLinkTest`, `ClinicalRegistry.php`, `HealthRecordController.php` where they read the old shape.

**Interfaces:**
- Produces: `PatientBackground::SECTIONS = ['medical' => ['currentDiseases','allergies','hospitalizations'], 'family' => ['familyHistory'], 'social' => ['personalSocial'], 'obstetric' => ['obstetric']]`.
- Produces: `PatientBackground::rules(string $prefix, string $basesKey): array` — same signature; now also validates `{$prefix}.reviewed` (`nullable|array`, each `Rule::in(array_keys(self::SECTIONS))`), every field/enum/range from Global Constraints, and the `noneKnown`/`none` exclusivity.
- Produces: `PatientBackground::apply(Patient $patient, array $update, User $user, string $date): array` — same signature and return (change entries for edited sections only). `$update` may carry `reviewed: string[]`. Stamps `reviewedAt[section] = ['date' => $date, 'facility' => <user's barangayHealthCenter or ruralHealthUnit name>, 'by' => $user->id]` for every edited section and every `reviewed` section (once each). Throws `ValidationException` (key `background_update.sections.obstetric` / `background_update.reviewed`) when the patient's `sex !== 'Female'` and obstetric is edited or reviewed.
- Produces: `PatientBackground::isLegacyUpdate(array $update): bool` — true when any staged slice uses the old string shape (`medical.allergies|hospitalizations|surgeries` is a string, or `family.familyHistory` has `similarIllness`, or `social.personalSocial.diet|smoking|alcohol` is a string). Used by Task 3.

- [ ] **Step 1: Write failing tests** in `PatientHistorySectionsTest`, all through `POST /api/health-records` as in the existing test's `finalize()` helper (copy its setup):
  - `test_each_section_applies_in_the_new_shape` — one finalize per section; stored values equal the staged ones; `revisions.{section}` is 1; one `background_changes` entry per edited section; obstetric patient is Female.
  - `test_allergies_none_known_with_items_is_422`, `test_family_none_known_with_items_is_422`.
  - `test_invalid_enum_or_range_is_422` — `smoking.status = 'heavy'`, `obstetric.menarcheAge = 40`, `obstetric.durationDays = 30`.
  - `test_obstetric_update_for_male_is_422` and `test_obstetric_update_for_unrecorded_sex_is_422`; `test_reviewed_obstetric_for_male_is_422`.
  - `test_reviewed_only_stamps_without_revision_bump_or_change_entry` — `reviewed: ['family']` with no `sections`: `reviewedAt.family` has date, facility name and user id; `revisions.family` unchanged; `background_changes` is null.
  - `test_concurrent_reviews_do_not_conflict` — two finalizes reviewing the same section with the same (old) state both return 201.
  - `test_section_both_edited_and_reviewed_stamps_once_and_bumps_once`, `test_unknown_reviewed_section_is_422`.
  - `test_stale_edited_section_still_returns_409` and `test_user_without_clinical_history_gets_403` (adapted from existing).
  - `test_patient_reported_condition_keeps_first_recorded_and_ignores_client_source` — client sends `source: 'Rhu-confirmed'`; stored `source` is `Patient-reported`.
  - `test_is_legacy_update_detects_old_shapes` (unit of `isLegacyUpdate`).
- [ ] **Step 2: Run** `php artisan test --filter=PatientHistorySectionsTest` — Expected: FAIL.
- [ ] **Step 3: Implement** in `PatientBackground`: replace `SECTIONS`/`NESTED_FIELDS`; add a per-key whitelist so `normalize()` keeps only known fields recursively and drops empty values before the `before`/`after` comparison (so "" and null still mean not recorded); remove the legacy branch from `conditionEntries()` (every submitted entry becomes patient-reported with `yearDiagnosed`, `diagnosedWhere`, `note`); add `reviewed` handling and the Female gate at the top of `apply()` (an update with neither `sections` nor `reviewed` still returns `[]`); `array:` rule on `$prefix` allows `sections`, `reviewed` and the bases key.
- [ ] **Step 4: Update the other tests/code** listed in Files to the new shape; then run `php artisan test` (whole backend suite) — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(history): five-section background with reviewed stamps`.

---

### Task 3: Record and draft wiring (BHC and RHU share it)

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (near line 364 and 408)
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php` (`SCHEMA` near lines 47 and 388; `rules()` near 565; `sanitize()` at 447)
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (nothing new for background; `informant`/`similar_illness` flow through `$data`)
- Test: `backend/tests/Feature/PatientHistoryRecordTest.php`

**Interfaces:**
- Produces: request fields `informant: { relation: Patient|Mother|Father|Spouse|Guardian|Grandparent|Sibling|Other, name (max 150, nullable), patientId (nullable, exists:patients,id) }` and `similar_illness: { answer: Yes|No|Unknown, who (max 150), note (max 500) }`, both nullable. Draft payload keys (camelCase): `informant`, `similarIllness`, and `backgroundUpdate.reviewed: string[]` plus the Task 2 section shapes.
- Consumes: `PatientBackground::rules`, `PatientBackground::isLegacyUpdate`.

- [ ] **Step 1: Write failing tests** in `PatientHistoryRecordTest`:
  - `test_finalize_saves_informant_and_similar_illness`.
  - `test_bad_informant_relation_is_422`.
  - `test_draft_round_trips_informant_similar_illness_and_new_background_update` (draft create → show).
  - `test_draft_with_legacy_background_update_opens_with_the_update_dropped` — call `HealthRecordDraftPayloadService::sanitize()` with a payload whose `backgroundUpdate.sections.medical.allergies` is a string: returns without `backgroundUpdate`, no exception.
  - `test_rhu_user_can_update_background_through_health_records` — an RHU user with `clinical.history` posts `background_update` (`family` edited, `social` reviewed) for a patient first filled by BHC; 201, `family` revision bumps, `reviewedAt.social.facility` is the RHU name.
- [ ] **Step 2: Run** `php artisan test --filter=PatientHistoryRecordTest` — Expected: FAIL.
- [ ] **Step 3: Implement** the request rules, the `SCHEMA` entries (the sanitizer rejects unknown keys, so every new key must be listed) and the legacy drop at the start of `sanitize()`.
- [ ] **Step 4: Run** `php artisan test` (whole suite) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(history): informant, similar illness and reviewed in records and drafts`.

---

### Task 4: Household environment prefill

**Files:**
- Create: `backend/app/Services/HouseholdEnvironment.php`
- Modify: `backend/app/Http/Controllers/Api/PatientController.php` (`show`, before the final `return response()->json(['data' => $patient])`)
- Test: `backend/tests/Feature/HouseholdEnvironmentTest.php`

**Interfaces:**
- Produces: `HouseholdEnvironment::latestFor(Patient $patient, Collection $others): ?array` returning `['environment' => array, 'patientId' => int, 'patientName' => string, 'date' => 'Y-m-d']` — the most recently `updatedAt.social` record among `$others` (patients with the same non-empty `family_serial_number`, excluding `$patient`) that has `personalSocial.environment`; null otherwise.
- Produces: `GET /patients/{id}` data gains `household_environment` (this key; the frontend maps it to `householdEnvironment`), only on the clinical-history path.

- [ ] **Step 1: Write failing tests:** `test_returns_latest_same_fsn_environment`, `test_excludes_the_patient_themselves`, `test_null_without_a_matching_household`, `test_null_when_fsn_is_empty`, `test_other_facility_patients_are_not_leaked` (others come from the facility-scoped `scopePatients` query).
- [ ] **Step 2: Run** `php artisan test --filter=HouseholdEnvironmentTest` — Expected: FAIL.
- [ ] **Step 3: Implement** the service and attach `household_environment` via `$patient->setAttribute(...)` in `show`, building `$others` with `$this->facilityAccess->scopePatients(Patient::query(), $user)`.
- [ ] **Step 4: Run** the test and the full suite — Expected: PASS.
- [ ] **Step 5: Commit** `feat(history): same-household environment prefill`.

---

### Task 5: Display formatters

**Files:**
- Create: `frontend/src/utils/backgroundFormat.js`
- Test: `frontend/src/utils/backgroundFormat.test.js`
- Modify: `frontend/package.json` (new script `test:patient-history`: `node --test src/utils/backgroundFormat.test.js src/utils/patientHistory.test.js src/utils/backgroundUpdate.test.js`)

**Interfaces:**
- Produces (all return `""` when nothing is recorded, never throw on `null`/old string shapes): `formatAllergies(allergies)`, `formatHospitalizations(value)`, `formatFamilyHistory(value)`, `formatEducation(value)`, `formatSmoking(value)` (appends `· N pack-yrs` via Task 6's `packYears` result passed in, not imported), `formatAlcohol`, `formatDiet`, `formatSexual`, `formatEnvironment`, `formatCycle(obstetric)`, `formatSymptoms`, `formatPregnancies(list)` (e.g. `G3 P2: 2019 live birth (normal), 2021 miscarriage`), `formatPatientReported(diseases)`.

- [ ] **Step 1: Write failing tests** with the spec's exact values: `formatAllergies({ noneKnown: true, items: [] })` is `"No known allergies"`; `{ items: [{ allergen: 'Penicillin', reaction: 'Rash' }] }` is `"Penicillin (Rash)"`; `formatSmoking({ status: 'current', sticksPerDay: 5, years: 8 })` contains `"5 sticks/day"`; `formatPregnancies([{year:2019,outcome:'liveBirth',delivery:'normal'},{year:2021,outcome:'miscarriage'}])` starts with `"G2 P1"`; every formatter returns `""` for `null` and for a legacy string input.
- [ ] **Step 2: Run** `cd frontend && node --test src/utils/backgroundFormat.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the formatters (pure, no React).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(history): background display formatters`.

---

### Task 6: Patient-history logic utils

**Files:**
- Create: `frontend/src/utils/patientHistory.js`
- Test: `frontend/src/utils/patientHistory.test.js`

**Interfaces:**
- Produces: option constants `INFORMANT_RELATIONS`, `FAMILY_RELATIONS`, `EDUCATION_LEVELS`, `WATER_SOURCES`, `TOILET_TYPES`, `EXPOSURES`, `MENSTRUAL_SYMPTOMS`, `PREGNANCY_OUTCOMES`, `DELIVERY_TYPES` (values exactly as the spec tables).
- Produces: `packYears({ sticksPerDay, years }): number | null` (one decimal); `gravidaPara(pregnancies): { gravida: number, para: number }`.
- Produces: `defaultInformant(patient: { birthdate, motherPatientId, motherName, guardianName }, today: string): { relation, name, patientId } | null` — age ≥ 18 → `Patient`; under 18 with mother → `Mother`; else with guardian → `Guardian`; else null. Reuse the existing age helper (grep `calculateAgeInYears`); add one in this file only if none is importable.
- Produces: `sectionVisibility(patient: { sex, birthdate }, today): { obstetric: 'hidden'|'open'|'collapsed', sexual: 'open'|'collapsed' }`. Female only for obstetric; unknown age counts as open.
- Produces: `hasRecordedData(background, section): boolean`.
- Produces: `sectionStatus({ background, update, section, today }): { kind: 'notRecorded'|'lastReviewed'|'reviewedToday'|'updatedToday', date?, facility? }` (General Data is rendered as "From registration" by the caller, not here). `lastReviewed` uses `reviewedAt[section]`, falling back to `updatedAt[section]`.
- Produces: `summarizeAllergies(allergies): { status: 'unrecorded'|'none'|'recorded', text }`.
- Produces: `reviewGroups({ background, update }): { updated: string[], reviewed: string[], notReviewed: string[] }` over the four editable section keys (`notReviewed` excludes a hidden obstetric section — caller passes the visible keys as `sections`).

- [ ] **Step 1: Write failing tests:** `packYears({sticksPerDay: 20, years: 10}) === 10`, `packYears({sticksPerDay: 5, years: 8}) === 2`, missing input → null; `gravidaPara` with 2 live, 1 stillbirth, 1 miscarriage → `{ gravida: 4, para: 3 }`; `defaultInformant` at ages 17 / 18 (birthdate relative to `today`), minor with mother link, minor with guardian only, minor with neither → null; `sectionVisibility` at ages 9 / 10 / 14 / 15, male → obstetric `hidden`, **Female with no birthdate → obstetric `open`, sexual `open`**; `sectionStatus` for each kind; `summarizeAllergies(null)` → `unrecorded`, `{noneKnown:true}` → `none`.
- [ ] **Step 2: Run** `node --test src/utils/patientHistory.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the helpers (pure).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(history): patient history logic utils`.

---

### Task 7: Staged update util and patient normalizer

**Files:**
- Modify: `frontend/src/utils/backgroundUpdate.js`
- Modify: `frontend/src/utils/backgroundUpdate.test.js`
- Modify: `frontend/src/services/patientService.js` (`EMPTY_MEDICAL_BACKGROUND`, `normalizeMedicalBackground`, patient normalizer around line 218)
- Modify: `frontend/src/utils/backgroundSummary.js` and `backgroundSummary.test.js`

**Interfaces:**
- Produces from `backgroundUpdate.js`: `BACKGROUND_SECTION_KEYS = ['medical','family','social','obstetric']`; `BACKGROUND_SECTION_LABELS` (`obstetric: 'Obstetric & Menstrual History'`); `BACKGROUND_SECTION_FIELDS[section]` as `{ key, label, read(slice): string }` built on Task 5 formatters; update shape `{ sections, baseRevisions, reviewed: string[] }`.
- Produces: `buildBackgroundUpdate(loaded, edited, previous = null)` (keeps `previous.reviewed`; returns null when no section edited and nothing reviewed); `markReviewed(update, sectionKeys): update`; `unmarkReviewed(update, sectionKey): update | null`; `reviewedSectionKeys(update): string[]`; `editedSectionKeys(update)` (unchanged name); `toRecordBackgroundUpdate(update)` → `{ sections, base_revisions, reviewed }` or `undefined` when empty; `restoreBackgroundUpdate(raw): update | null` (returns null for the old string shapes, per `isLegacyUpdate` logic); `backgroundChangeRows`, `resolveBackgroundConflicts`, `readBackgroundConflicts`, `allConflictsResolved` keep their names and behavior.
- Produces from `patientService.js`: `normalizeMedicalBackground(source)` returns the full new shape (all four sections plus `revisions`, `updatedAt`, `reviewedAt` with defaults) for `null`, `{}`, and old-string-shaped input; patient gets `householdEnvironment` from `household_environment`.

- [ ] **Step 1: Write failing tests:** for each section, `sliceBackground` returns the API shape; `buildBackgroundUpdate` keeps an edited section's first base revision; `markReviewed` + `toRecordBackgroundUpdate` produce `reviewed` only (no `sections`) — `base_revisions` absent/empty; `restoreBackgroundUpdate` returns null for `{ sections: { medical: { allergies: 'Dust' } } }` and keeps a new-shape one; `normalizeMedicalBackground(null)`, `({ allergies: 'Dust' })` and `({ familyHistory: { similarIllness: 'x' } })` all return arrays/objects with no throw and `allergies.items` an array (**Review Focus 1, 5**); `summarizeBackground` lines use the new shapes.
- [ ] **Step 2: Run** `node --test src/utils/backgroundUpdate.test.js src/utils/backgroundSummary.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run** `npm run test:patient-history && npm run test:patient-overview` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(history): staged update and normalizer for the new shapes`.

---

### Task 8: History section components

**Files (create under `frontend/src/components/features/patients/history/`):**
- `ListEditor.jsx`, `SectionNav.jsx`, `GeneralDataSection.jsx`, `PastMedicalSection.jsx`, `FamilySection.jsx`, `PersonalSocialSection.jsx`, `ObstetricSection.jsx`

**Interfaces:**
- Consumes: Task 6 constants/helpers, Task 5 formatters, `BackgroundTextField` styles from the existing `patients/background/BackgroundFields.jsx` (copy the control classes; that file is deleted in Task 9).
- Produces (all controlled, no save logic): `ListEditor({ label, items, onChange, columns, newItem, noneLabel, noneChecked, onNoneChange })` where `columns` is `[{ key, label, type: 'text'|'number'|'select', options? }]`; `SectionNav({ sections: [{ key, label, status, visible }], active, onSelect })`; `GeneralDataSection({ patient, informant, onInformantChange, editLink })`; `PastMedicalSection({ value, onChange, conditionGroups })` where `value` is the `medical` slice; `FamilySection({ value, onChange, similarIllness, onSimilarIllnessChange, relatives })` (`relatives` = linked family members for the optional `relativePatientId`); `PersonalSocialSection({ value, onChange, patient, householdEnvironment, today })`; `ObstetricSection({ value, onChange })` showing derived G/P read-only.
- Behavior from the spec: `PastMedicalSection` shows "Confirmed by RHU" (read-only, lock icon) and "Reported by patient (not confirmed)" groups, no unverified group; the Sexual block and Section V collapsed state use `sectionVisibility` with a **Show** button; `environment` prefill shows "From {patientName}'s record · {date}" and is applied only to empty fields, always editable; smoking pack-years shows as a plain number.

- [ ] **Step 1: Implement** the components following the spec's field tables (no automated component tests exist in this repo; logic is already covered by Tasks 5–7).
- [ ] **Step 2: Run** `cd frontend && npx eslint src/components/features/patients/history` — Expected: no errors.
- [ ] **Step 3: Commit** `feat(history): history section components`.

---

### Task 9: Panel, review block, and the BHC consultation step

**Files:**
- Create: `frontend/src/components/features/patients/history/PatientHistoryPanel.jsx`, `PatientHistoryReview.jsx`
- Modify: `frontend/src/utils/consultationSteps.js` and `consultationSteps.test.js`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (state near 1177–1183, draft payload 1576 and 1764, finalize 3281, Review rows 4118, edit-link 4315, conflict panel 4319, Interview render 4339–4366)
- Modify: `frontend/src/components/features/health-records/wizard/BackgroundConflictPanel.jsx` (works for four sections; no API change)
- Delete: `frontend/src/components/features/health-records/wizard/ConsultationBackgroundCard.jsx`, `frontend/src/components/features/patients/background/BackgroundEditor.jsx`, `BackgroundFields.jsx`

**Interfaces:**
- Produces: `PatientHistoryPanel({ patient, background, update, onUpdateChange, informant, onInformantChange, similarIllness, onSimilarIllnessChange, householdEnvironment, today, layout: 'screen' | 'section', locked })` — left `SectionNav` + active section (screen) or stacked sections (section); each editable section has **No changes** (calls `markReviewed`) and **Update**; footer **Mark all reviewed** marks only sections with `hasRecordedData`; a locked state like the old card when `locked`.
- Produces: `PatientHistoryReview({ background, update, visibleSections })` with the three groups from `reviewGroups` (Updated shows `backgroundChangeRows` before → after); informational only.
- Produces: `HISTORY_STEP = 'history'` in `consultationSteps.js`, listed after `INTERVIEW_STEP` in `buildConsultationSteps` (label `Patient History`), `getFormSequence` and `getStepOrder`.

- [ ] **Step 1: Update tests** in `consultationSteps.test.js` first: the sequence is `[interview, history, assessment, ...]`, `getNextStepKey(seq, 'interview') === 'history'`, `getPreviousStepKey(seq, 'history') === 'interview'`, `resolveRestoredPosition` still opens a draft saved on `interview`. Run `npm run test:consultation-steps` — Expected: FAIL.
- [ ] **Step 2: Implement** `consultationSteps.js` changes; test passes.
- [ ] **Step 3: Implement** the panel and review components, then wire the workspace: render the panel when `activeFormStep === HISTORY_STEP`; add `informant` and `similarIllness` state (initial `informant` = `defaultInformant(...)` once the patient loads, unless restored from a draft), include both and `backgroundUpdate` in the draft payload (`restoreBackgroundUpdate` on resume), send `informant`, `similar_illness` and `toRecordBackgroundUpdate(backgroundUpdate)` on finalize, add the `PatientHistoryReview` block to Review (the existing `patient-background` edit link now goes to `HISTORY_STEP`), keep the 409 conflict flow, and show allergy chips from `summarizeAllergies` in the workspace patient header. Remove the Interview-screen background section and delete the files listed.
- [ ] **Step 4: Run** `npm run test:consultation-steps && npm run test:patient-history && npx eslint src` — Expected: PASS, no lint errors.
- [ ] **Step 5: Commit** `feat(history): patient history step in the BHC consultation`.

---

### Task 10: RHU form section

**Files:**
- Modify: `frontend/src/pages/rhu/RHUAddHealthRecords.jsx` (state near 452; `FormSection` after Consultation Information near 2422; payload near 1475–1522; `handleSave` error handling near 1640)

**Interfaces:**
- Consumes: `PatientHistoryPanel layout="section"`, `PatientHistoryReview`, `BackgroundConflictPanel`, `readBackgroundConflicts`, `resolveBackgroundConflicts`, `toRecordBackgroundUpdate`, `defaultInformant`.

- [ ] **Step 1: Implement:** for every non-follow-up record type, mount a "Patient History" `FormSection` (gated by the same clinical-history permission check the BHC workspace uses, via `can` from `utils/actionPermissions`) once a patient is selected; load that patient's full details with the same query the profile uses (`queryKeys.patientDetails('rhu', id)`) because the list payload may omit `medicalBackground`; keep `backgroundUpdate`, `informant`, `similarIllness` in form state (RHU has no drafts); add `background_update`, `informant`, `similar_illness` to the submission payload; show the review block before submit; on 409 `PATIENT_BACKGROUND_CONFLICT` show `BackgroundConflictPanel` and retry with the new idempotency key as the existing 409 flow does.
- [ ] **Step 2: Run** `cd frontend && npx eslint src/pages/rhu` — Expected: no errors.
- [ ] **Step 3: Commit** `feat(history): patient history section in the RHU record form`.

---

### Task 11: Profile tab and consumers

**Files:**
- Modify: `frontend/src/components/features/patients/PatientBackgroundTab.jsx`
- Modify: `frontend/src/components/features/patients/PatientAlertChips.jsx`, `profile/PatientClinicalControls.jsx`, `profile/LifestyleRow.jsx`, `profile/AnatomyFindingsPanel.jsx`, `PatientSummaryPanel.jsx`, `pages/bhc/PatientDetails.jsx`
- Modify: `frontend/src/components/features/patients/MedicalConditionsGroups.jsx`, `frontend/src/utils/backgroundConditions.js` (+ their tests if present) — remove the unverified group and `UNVERIFIED_LABEL`
- Delete: `frontend/src/utils/allergies.js`, `allergies.test.js`; update the `test:patient-profile` script in `frontend/package.json`

**Interfaces:**
- Consumes: `summarizeAllergies`, the Task 5 formatters, `sectionStatus`, `sectionVisibility`.

- [ ] **Step 1: Implement:** `PatientBackgroundTab` becomes read-only over the four sections (obstetric only when `sectionVisibility` is not `hidden`), each meta line `Last reviewed {date} · {facility}` or `Not yet recorded`, values via `BACKGROUND_SECTION_FIELDS[...].read`, Changes log unchanged (the history endpoint already returns obstetric entries). Replace every direct read of `background.allergies` / `personalSocial.*` strings with `summarizeAllergies` and the formatters. Grep `unverified|UNVERIFIED_LABEL|isNoAllergyText` and remove all remaining uses.
- [ ] **Step 2: Run** `npm run test:patient-profile && npm run test:patient-overview && npm run test:current-conditions && npx eslint src` — Expected: PASS, no lint errors.
- [ ] **Step 3: Commit** `feat(history): read-only profile tab for the five-section history`.

---

### Task 12: Verification and spec follow-up

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-itr-patient-history-design.md` (amend: API key is `household_environment`; drafts saved before the change drop a legacy `backgroundUpdate` instead of failing)

- [ ] **Step 1: Run the whole suites:** `cd backend && php artisan test`; `cd frontend && npm run lint` and every `npm run test:*` script that exists — Expected: all PASS.
- [ ] **Step 2: Manual browser check** (run the app per the `run` skill): (1) BHC, new female patient: fill I–V, finalize, open the profile tab; (2) RHU, same patient: answers present, **Mark all reviewed**, submit, profile shows `Last reviewed … RHU`; (3) male patient has no V; child shows informant = Mother and Sexual collapsed; (4) a second member of the same FSN gets the environment prefill; (5) a draft started before the change still opens.
- [ ] **Step 3: Update memory** `itr-patient-history.md` (status: implemented, spec/plan commits) and commit the spec amendment: `docs: itr patient history spec follow-up`.
