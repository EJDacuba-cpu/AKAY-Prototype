# Nutrition Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Nutrition Health Service for BHC and RHU with persistent Not Enrolled / Active / Closed enrollment, PE-derived measurement history on Care & Programs, and age-appropriate BMI display — without a nutrition assessment form or Nutrition Reports changes.

**Architecture:** Mirror prenatal enroll/continue intent on `monitoring_data.nutritionIntent`, but add an explicit `nutrition_care_closures` table (maternal today auto-completes; Nutrition must close with reason). Backend `NutritionEnrollment` derives Active/Closed from Nutrition-tagged finalized records + closures and exposes `nutrition_care` on care-overview. Frontend panel copy + Care Tracking reuse PE `weight`/`height` and existing BMI helpers. No `nutrition_data` column and no Nutrition wizard form step.

**Tech Stack:** Laravel + PHPUnit (sqlite in tests), React 19 + Vite, TanStack Query, `node:test`. Existing AKAY UI (`Button`, `Card`, dialogs) — project has no shadcn `components.json` registry; do not run `shadcn add`.

**Spec:** `docs/superpowers/specs/2026-11-05-nutrition-program-design.md`

## Global Constraints

- Program key exactly `Nutrition`; category exactly `Nutrition`. Keep FE `PROGRAM_CLASSIFICATIONS` and BE `ConsultationPrograms::CLASSIFICATIONS` in sync.
- Status copy exactly: `Not Enrolled`, `Active`, `Closed`.
- Enrollment activates **only** after successful official finalize (drafts never enroll).
- While Active, new Nutrition visits must `continue` — reject second `enroll` (422).
- Close requires permission `consultations.finalize`, facility-scoped via `FacilityAccessService::authorizePatient`.
- Close reasons exactly: `goals_met`, `transferred`, `lost_to_follow_up`, `other`. `closed_on` ≤ today and ≥ enrollment start; `note` ≤ 500.
- No Nutrition assessment form; `getProgramFormSteps` must **skip** Nutrition (no `program:Nutrition` step).
- No `nutrition_data` JSON column. Measurements come only from existing PE vitals (`weight` / `height` / `vital_signs`).
- BMI: show value when computable; adult WHO category only for age ≥ 18; no pediatric growth calculations.
- Nutrition available for all ages (do **not** add to `INFANT_HIDDEN_PROGRAMS`).
- Do **not** modify Nutrition Reports module. Do not refactor unrelated Maternal/FP/EPI enrollment.
- UI English. Reuse existing Care Tracking card patterns.
- Commands: backend `cd backend && php -d memory_limit=1G vendor/bin/phpunit --filter=<Name>`; frontend `cd frontend && node --test <files>`, `npm run lint -- --quiet`. Baseline backend failures in `docs/ai/test-baseline-2026-10-10.md` are not regressions.
- Commits: create local commits per task (user pushes themselves). Do not push.

## Review Focus

- Draft with Nutrition selected → Care & Programs still Not Enrolled / no Active card until finalize.
- Active patient: panel shows Continue; second enroll intent → 422.
- Closed then re-enroll → new Active episode; prior closure preserved in history.
- Finalize a general (non-Nutrition) visit with weight/height while Active → measurement history updates without duplicate rows for the same record id.
- Age 5 with BMI value → category blank; age 25 → category present.
- BHC and RHU both show Nutrition in Health Services.

---

### Task 1: Closures table, NutritionEnrollment service, care-overview payload

**Files:**
- Create: `backend/database/migrations/2026_11_05_000001_create_nutrition_care_closures_table.php`
- Create: `backend/app/Models/NutritionCareClosure.php`
- Create: `backend/app/Services/NutritionEnrollment.php`
- Modify: `backend/app/Http/Controllers/Api/CareOverviewController.php` (add `nutrition_care` to JSON)
- Create: `backend/tests/Feature/NutritionEnrollmentTest.php`

**Interfaces:**
- Table `nutrition_care_closures`: `id`, `patient_id` (fk cascade), `started_health_record_id` (fk, unique), `reason` (string 32), `closed_on` (date), `note` (text null), `closed_by` (fk users nullOnDelete), timestamps.
- `NutritionEnrollment::INTENT_ENROLL = 'enroll'`, `INTENT_CONTINUE = 'continue'`.
- `NutritionEnrollment::STATUS_NOT_ENROLLED = 'Not Enrolled'`, `STATUS_ACTIVE = 'Active'`, `STATUS_CLOSED = 'Closed'`.
- `NutritionEnrollment::CLOSE_REASONS = ['goals_met','transferred','lost_to_follow_up','other']`.
- `isNutritionRecord(HealthRecord $record): bool` — `selectedPrograms` contains `'Nutrition'` OR category equals `'Nutrition'`.
- `nutritionRecordsFor(int $patientId): Collection` ordered by `date_recorded`, `id`.
- `episodes(Patient|int $patient): array` oldest-first; each episode: `started_record_id`, `started_on` (`Y-m-d`), `record_ids` (Nutrition-tagged records in window), `status` (`Active`|`Closed`), `closure` (?model).
- Episode split: Nutrition records after a closure's `created_at` start a new episode (same-day re-enroll after close is a new episode).
- `active($patient): ?array` — last episode when status Active.
- `stateFor($patientId): array{status: string, enrolled: bool, latest: ?HealthRecord, active: ?array, episodes: array}`.
- `validateIntent(Validator $validator, int $patientId, mixed $intent): void` — require enroll|continue; enroll while enrolled → error on `monitoring_data.nutritionIntent`; continue while not enrolled → error.
- `summary($patient): array` → `{ status, enrolled, enrolled_on, latest_weight_kg, latest_height_cm, latest_bmi, latest_bmi_category, measurement_history: [{ health_record_id, date_recorded, weight_kg, height_cm, bmi }], closures: [{ id, reason, closed_on, note, closed_by_name, started_health_record_id, enrolled_on }] }`.
- Measurement history: finalized patient records with usable weight and/or height whose `date_recorded` is ≥ episode `started_on` and (if closed) ≤ `closed_on`; while Active use the active episode window only; include Open Active episode measurements in summary; values from `vital_signs` then top-level; BMI computed server-side same as client (`kg / (m^2)`); `latest_bmi_category` only when patient age ≥ 18 (birthdate → years); under 18 leave category `null`.
- care-overview `data.nutrition_care` = `summary()`.

- [ ] **Step 1: Write failing tests** in `NutritionEnrollmentTest.php` (mirror setup style from `BhcPrenatalEnrollmentTest` / `CareOverviewTest`):
  - `test_no_nutrition_records_means_not_enrolled`
  - `test_finalized_nutrition_record_activates_enrollment`
  - `test_care_overview_exposes_nutrition_care`
  - `test_measurements_from_later_general_visit_appear_in_history` (Active after Nutrition visit; later General Consultation with vitals appears in `measurement_history` once)
  - `test_closure_ends_active_and_later_nutrition_record_starts_new_episode`

- [ ] **Step 2: Run** `cd backend && php -d memory_limit=1G vendor/bin/phpunit --filter=NutritionEnrollmentTest`  
  Expected: FAIL (missing class/table).

- [ ] **Step 3: Implement** migration, model (`$fillable`, `closed_on` date cast, `patient()`, `starter()`, `closer()`), service, and CareOverviewController addition. Load records once per call.

```php
// CareOverviewController::show — inside the success payload:
'nutrition_care' => \App\Services\NutritionEnrollment::summary($patient),
```

- [ ] **Step 4: Run** `--filter=NutritionEnrollmentTest` plus `--filter=CareOverviewTest`. Expected: PASS (CareOverviewTest still green).

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_11_05_000001_create_nutrition_care_closures_table.php backend/app/Models/NutritionCareClosure.php backend/app/Services/NutritionEnrollment.php backend/app/Http/Controllers/Api/CareOverviewController.php backend/tests/Feature/NutritionEnrollmentTest.php
git commit -m "$(cat <<'EOF'
feat(nutrition): derive enrollment episodes and expose nutrition_care

EOF
)"
```

---

### Task 2: Close Nutrition Care endpoint

**Files:**
- Create: `backend/app/Http/Controllers/Api/NutritionCareController.php`
- Modify: `backend/routes/api.php` (next to care-overview inside `facility.assigned` / `actions.allowed` group)
- Modify: `backend/app/Http/Middleware/EnforceActionPermissions.php` — add **above** the `/patients` arm:

```php
str_contains($path, '/nutrition-care') => 'consultations.finalize',
```

- Extend: `backend/tests/Feature/NutritionEnrollmentTest.php`
- Extend: `backend/app/Services/NutritionEnrollment.php` with `close(Patient $patient, User $actor, array $input): array` returning `summary()`.

**Interfaces:**
- `POST /api/patients/{patient}/nutrition-care/close` body `{ reason, closed_on, note? }` → 201 `{ data: <summary()> }`.
- Messages: no active → 422 `"This patient has no active Nutrition Care."`

- [ ] **Step 1: Failing tests:** `test_closing_the_active_enrollment`; `test_closing_without_active_is_422`; `test_invalid_reason_or_dates_is_422`; `test_other_facility_cannot_close`; `test_requires_consultations_finalize`.

- [ ] **Step 2: Run** `--filter=NutritionEnrollmentTest`. Expected: new tests FAIL (404).

- [ ] **Step 3: Implement** controller, `close()`, route, middleware arm.

- [ ] **Step 4: Run** `--filter=NutritionEnrollmentTest`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Api/NutritionCareController.php backend/routes/api.php backend/app/Http/Middleware/EnforceActionPermissions.php backend/app/Services/NutritionEnrollment.php backend/tests/Feature/NutritionEnrollmentTest.php
git commit -m "$(cat <<'EOF'
feat(nutrition): authorized close endpoint for Nutrition Care

EOF
)"
```

---

### Task 3: Register Nutrition program + nutritionIntent on drafts/finalize

**Files:**
- Modify: `backend/app/Services/ConsultationPrograms.php` — add `'Nutrition' => 'Nutrition'`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php` — allowlist `'nutritionIntent' => self::SCALAR`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` — `monitoring_data.nutritionIntent` nullable `in:enroll,continue`; when Nutrition in selectedPrograms call `NutritionEnrollment::validateIntent` for workflows that already call prenatal validation (`bhc_general_v2`, `rhu_itr_v1`)
- Modify: `frontend/src/utils/consultationPrograms.js` — add `Nutrition: "Nutrition"`; enroll labels `"Enroll to Nutrition"` / continue via `programEnrollLabel` when `enrolled === true` → `"Continue Nutrition Care"`
- Modify: `frontend/src/utils/consultationSteps.js` — do **not** add PROGRAM_STEP_DETAILS for Nutrition; skip Nutrition in `getProgramFormSteps`:

```js
const PROGRAMS_WITHOUT_FORMS = new Set(["Nutrition"]);
// inside loop:
if (PROGRAMS_WITHOUT_FORMS.has(program)) continue;
```

- Modify: `frontend/src/utils/serviceNextActions.js` — `CARE_PLAN_SERVICE_LABELS.Nutrition = "Nutrition"`; `defaultServicePurpose("Nutrition")` → `"Nutrition follow-up"`
- Modify: `frontend/src/utils/healthRecordPrograms.js` — `isNutritionRecord`, map `Nutrition` → `"nutrition"` in specialized program keys / `getSpecializedRecordPrograms`
- Tests: extend `backend/tests/Feature/ConsultationProgramsTest.php`; `frontend/src/utils/consultationPrograms.test.js`; `frontend/src/utils/consultationSteps.test.js` (Nutrition selected → form sequence unchanged except no Nutrition step)

- [ ] **Step 1: Failing tests** asserting Nutrition is a valid selectedPrograms value; draft stores `nutritionIntent`; finalize enroll while already Active → 422; `getProgramFormSteps(["Nutrition"], "Nutrition")` returns `[]` program steps (or only other programs when mixed).

- [ ] **Step 2: Run** relevant phpunit + `node --test` filters. Expected: FAIL.

- [ ] **Step 3: Implement** registry + validation + FE skips.

- [ ] **Step 4: Re-run**. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(nutrition): register Nutrition program and enroll/continue intent

EOF
)"
```

---

### Task 4: Frontend nutritionEnrollment + careTracking entry + careOverview map

**Files:**
- Create: `frontend/src/utils/nutritionEnrollment.js`
- Create: `frontend/src/utils/nutritionEnrollment.test.js`
- Create: `frontend/src/utils/nutritionCare.js` (measurement helpers used by care tracking + card)
- Create: `frontend/src/utils/nutritionCare.test.js`
- Modify: `frontend/src/utils/careTracking.js` — `buildNutritionEntry`; append in `getCareTracking`
- Modify: `frontend/src/utils/careTracking.test.js`
- Modify: `frontend/src/utils/careOverview.js` — map `nutrition_care` → `nutritionCare`
- Modify: `frontend/src/utils/careOverview.test.js`
- Create: `frontend/src/services/nutritionCareService.js` — `closeNutritionCare(patientId, { reason, closedOn, note })`

**Interfaces:**
- `getNutritionEnrollment(patient, records, today, nutritionCareFromApi?)` → `{ enrolled, status, intent, enrolledOn, latestRecord, visitCount }` preferring API summary when provided; else derive from records + local closures if absent (records-only Active when Nutrition records exist and no close — API is source of truth once wired).
- `nutritionProgramCopy({ enrolled, included, status })` — parallel prenatal copy; Closed treated as not enrolled for button (`Enroll to Nutrition`); Active → Continue.
- `buildNutritionEntry(patient, records, today, { nutritionCare } = {})` → entry `{ key: 'nutrition', label: 'Nutrition Care', status, statusTone, facts: [Enrollment Date, Latest Weight, Latest Height/Length, Latest BMI], lastVisit, nextVisit: '', flags, action: enrolled ? { type: 'close-nutrition-care', label: 'Close Nutrition Care' } : null, records, measurementHistory }`.
- Prefer `nutritionCare` API fields for facts/history when present; else build history via `nutritionMeasurementHistory(records, { startedOn, closedOn, today })` using `calculateBmi` / age gate from `bmi.js`.
- `mapCareOverview` adds `nutritionCare` object (null-safe defaults: status `Not Enrolled`, empty history).

- [ ] **Step 1: Write failing unit tests** for copy labels, Active/Closed derivation, BMI category withheld under 18, history dedupe by record id, `mapCareOverview` mapping.

- [ ] **Step 2: Run** `cd frontend && node --test src/utils/nutritionEnrollment.test.js src/utils/nutritionCare.test.js src/utils/careTracking.test.js src/utils/careOverview.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement**.

- [ ] **Step 4: Re-run**. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(nutrition): care tracking and enrollment helpers for Nutrition Care

EOF
)"
```

---

### Task 5: Care & Programs UI — card detail, measurement history, close modal

**Files:**
- Create: `frontend/src/components/features/patients/profile/NutritionTrackingPanel.jsx`
- Create: `frontend/src/components/features/patients/profile/CloseNutritionCareModal.jsx`
- Modify: `frontend/src/components/features/patients/profile/CareAndProgramsTab.jsx` — load care-overview query when available; pass `nutritionCare`; render Nutrition panel; handle `close-nutrition-care` action; invalidate queries after close
- Modify: `frontend/src/components/features/patients/profile/CareTrackingCard.jsx` only if Nutrition needs Active tone (prefer handling in entry `statusTone`)

**UI requirements:**
- Card facts: Current status, Latest Weight (kg), Latest Height/Length (cm), Latest BMI (value + category when applicable).
- Detail panel: Measurement History table/list — consultation date, weight, height/length, BMI (or em dash when not applicable); empty state “No measurements recorded yet.”
- Close modal: reason radios with labels from spec, `closed_on` date (default today, max today), note ≤500, confirm disabled until reason+date valid.
- Preserve Community Programs / other cards unchanged.

- [ ] **Step 1: Implement panel + modal wired to `nutritionCareService.closeNutritionCare`; use existing Dialog/Modal patterns from Complete Maternal if present, else FP-style modal in CareAndProgramsTab.**

- [ ] **Step 2: Manual/visual check via existing Patient Details Care & Programs tab (BHC + RHU).**

- [ ] **Step 3: `npm run lint -- --quiet` on touched files / project.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(nutrition): Care & Programs Nutrition card, history, and close modal

EOF
)"
```

---

### Task 6: BHC + RHU Health Services panel enrollment UX

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` — Nutrition branch in `wizardPrograms` using `nutritionProgramCopy` / enrollment from records + care-overview; set `nutritionIntent` on payload when Nutrition selected (`enroll` vs `continue`); do not open a Nutrition form step
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` — same panel parity (`heading` already “Health Services”)
- Extend tests if present: `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`, workspace program tests

**Behavior:**
- Not enrolled + not selected → “Not included” / Enroll to Nutrition; description: Active only after finalize.
- Selected before finalize → “Included this visit”.
- Active + not selected → status Active; Enroll label Continue Nutrition Care.
- Active + selected → “Continuing this visit”.
- Closed → same as not enrolled (may enroll again).
- Draft resume restores `nutritionIntent` from draft payload.
- Do not change PE weight/height capture.

- [ ] **Step 1: Wire enrollment state + intent into both workspaces.**

- [ ] **Step 2: Run** frontend program/workspace tests that exist + lint.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(nutrition): Nutrition service on BHC and RHU consultation panels

EOF
)"
```

---

### Task 7: Verification matrix

**Files:** none new (run commands; fix only regressions found).

- [ ] **Step 1: Backend** `php -d memory_limit=1G vendor/bin/phpunit --filter=NutritionEnrollmentTest` and `--filter=ConsultationProgramsTest`
- [ ] **Step 2: Frontend** `node --test src/utils/nutritionEnrollment.test.js src/utils/nutritionCare.test.js src/utils/careTracking.test.js src/utils/careOverview.test.js src/utils/consultationPrograms.test.js src/utils/consultationSteps.test.js src/utils/bmi.test.js`
- [ ] **Step 3: Confirm** Nutrition Reports paths untouched (`git diff --name-only` has no reports nutrition module files).
- [ ] **Step 4: Record actual pass/fail counts in the PR/summary notes (do not claim pass without command output).
- [ ] **Step 5: Commit only if fixes were needed; otherwise stop.

---

## Spec coverage checklist

| Spec / GOAL item | Task |
|------------------|------|
| Nutrition in BHC/RHU Health Services | 3, 6 |
| Not Enrolled / Active / Closed + close reason/history | 1, 2, 5 |
| Active only after finalize; continue no duplicate | 1, 3, 6 |
| Care Tracking measurements + BMI age gate | 4, 5 |
| Auto history from finalized PE vitals | 1, 4 |
| No nutrition forms / no reports changes | 3, 7 |
| All ages | 3 (infant visibility unchanged) |
