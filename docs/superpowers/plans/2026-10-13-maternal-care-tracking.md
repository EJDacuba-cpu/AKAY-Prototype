# Maternal Care Tracking (Spec A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pregnancy becomes a tracked maternal episode (Prenatal → Postpartum → closed by "Complete Maternal Care"); Care & Programs shows only enrolled care with a rich Maternal card; Start Consultation, the services panel and the Prenatal form follow the active episode.

**Architecture:** The backend owns episode boundaries (records + a new `maternal_care_closures` table) and exposes them on the existing care-overview endpoint as `maternal_care`, plus a close endpoint. The frontend groups the records it already loads by those boundaries and derives every card fact in one pure util (`utils/maternalEpisode.js`). UI pieces (card, modal sections, panel, form) only render that util's output.

**Tech Stack:** Laravel 13 + PHPUnit (sqlite in tests), React 19 + Vite, TanStack Query, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-13-maternal-care-tracking-design.md`

## Global Constraints

- One active maternal episode per patient. Episode = the maternal records from its starting record until a closure; a record **created after** a closure's `created_at` starts a new episode.
- Maternal record = health record with `category === 'Maternal'` or `monitoring_data.selectedPrograms` containing `'Maternal'` (filter in PHP; tests run on sqlite).
- Phases: `prenatal`; `postpartum` once any episode record has `maternal_data.deliveryDate`; closed episodes are `completed`.
- Closure reasons exactly: `delivered` ("Delivered / postpartum completed"), `pregnancy_loss` ("Pregnancy loss"), `transferred` ("Transferred / moved out"). `closed_on` required, not after today, not before the episode's first visit date; `note` ≤ 500.
- Close endpoint permission `consultations.finalize`, facility-scoped via `FacilityAccessService::authorizePatient`.
- Care Tracking shows a program only when enrolled (has records; Maternal: an active episode). Empty: "No active care tracking."
- TT/Td: list doses + "Next dose: TTn" / "Series complete"; **no dates computed**. No advice text anywhere (no-clinical-suggestions).
- Trimesters by AOG weeks: 1st < 14, 2nd 14–27, 3rd ≥ 28. Postpartum flag after 42 days.
- Start Consultation: no visit-type radio; sections Ongoing care / Condition monitoring (RHU-confirmed) / Other follow-ups, each only when non-empty; nothing ticked = general.
- Panel: active episode → Maternal read-only "Ongoing", "Included in this visit" / "Not included in this visit", no button.
- Records are never rewritten. UI copy English.
- Commands: backend `cd backend && php -d memory_limit=1G vendor/bin/phpunit --filter=<Name>`; frontend `cd frontend && node --test <files>`, `npm run lint -- --quiet`, `npm run build`. Baseline backend failures (docs/ai/test-baseline-2026-10-10.md) are not regressions.

## Review Focus

- Closing on the same day as the last visit, then a new maternal record the same day: the new record must start a new episode (created_at ordering), not reopen the closed one. Task 1 test.
- A patient with two past episodes and none active: card hidden, Past pregnancies lists both, Enroll available. Tasks 1, 5.
- A pending follow-up from a maternal record must appear only under Ongoing care, never also under Other follow-ups; ticking Maternal continues it. Task 6 test.
- Draft resumed for a patient whose episode was closed meanwhile: panel must not show "Ongoing" from stale data — the workspace reads care-overview fresh. Task 7 manual.
- Postpartum with no LMP recorded (legacy data): card shows delivery facts and no AOG, no crash. Task 4 test.

---

### Task 1: Closures table, episode service, `maternal_care` on care-overview

**Files:**
- Create: `backend/database/migrations/2026_10_13_000001_create_maternal_care_closures_table.php`
- Create: `backend/app/Models/MaternalCareClosure.php`
- Create: `backend/app/Services/MaternalEpisodeService.php`
- Modify: `backend/app/Http/Controllers/Api/CareOverviewController.php` (add `maternal_care` to the response)
- Create: `backend/tests/Feature/MaternalEpisodeTest.php`

**Interfaces:**
- Table: `id`, `patient_id` (fk cascade), `started_health_record_id` (fk, unique), `reason` (string 32), `closed_on` (date), `note` (text null), `closed_by` (fk users null on delete), timestamps.
- `MaternalEpisodeService::episodes(Patient $patient): array` → list of `['record_ids' => int[], 'started_record_id' => int, 'started_on' => 'Y-m-d', 'last_visit_on' => 'Y-m-d', 'phase' => 'prenatal'|'postpartum'|'completed', 'closure' => ?MaternalCareClosure]`, oldest first.
- `MaternalEpisodeService::active(Patient $patient): ?array` → the last episode when it has no closure.
- `MaternalEpisodeService::summary(Patient $patient): array` → `['active' => ?['started_record_id','started_on','last_visit_on','phase','record_ids','pending_follow_up_ids'], 'closures' => [['id','reason','closed_on','note','closed_by_name','started_record_id','record_ids','phase']]]`. `pending_follow_up_ids`: active follow-up tasks (same filter as the controller's `$tasks`) whose `health_record_id` is in the episode.
- care-overview JSON gains `data.maternal_care` = `summary()` with snake_case keys.

- [ ] **Step 1: Failing tests** in `MaternalEpisodeTest` (reuse `CareOverviewTest` setup style): `test_no_maternal_records_means_no_active_episode`; `test_first_maternal_record_opens_a_prenatal_episode` (category Maternal); `test_selected_programs_maternal_counts` (category General, monitoring_data.selectedPrograms ['Maternal']); `test_delivery_date_moves_episode_to_postpartum`; `test_closure_ends_the_episode_and_a_later_record_starts_a_new_one` (close, then create a record afterwards on the same `date_recorded` → two episodes, second active); `test_care_overview_exposes_maternal_care_with_pending_follow_up_ids` (a pending FollowUpTask on an episode record appears in `pending_follow_up_ids`).
- [ ] **Step 2: Run** `php -d memory_limit=1G vendor/bin/phpunit --filter=MaternalEpisodeTest`. Expected: FAIL (missing class/table).
- [ ] **Step 3: Implement** migration, model (`$fillable`, `closed_on` date cast, `patient()`, `closer()` relations), service and the controller addition. Load records once per call (`id, category, date_recorded, created_at, monitoring_data, maternal_data`), filter maternal records in PHP, order by `date_recorded`, `id`.
- [ ] **Step 4: Run** the filter again plus `--filter=CareOverviewTest`. Expected: PASS (CareOverviewTest unchanged).
- [ ] **Step 5: Commit** `feat(maternal): derive maternal episodes and expose them on care-overview`.

### Task 2: Complete Maternal Care endpoint

**Files:**
- Create: `backend/app/Http/Controllers/Api/MaternalCareController.php`
- Modify: `backend/routes/api.php` (inside the `facility.assigned`, `actions.allowed` group, next to care-overview)
- Modify: `backend/app/Http/Middleware/EnforceActionPermissions.php` (add `str_contains($path, '/maternal-care') => 'consultations.finalize'` **above** the `/patients` arm)
- Test: `backend/tests/Feature/MaternalEpisodeTest.php`

**Interfaces:**
- `POST /api/patients/{patient}/maternal-care/close` body `{ reason, closed_on, note? }` → 201 `{ data: <summary()> }`.
- Consumes Task 1 `MaternalEpisodeService::active()` / `summary()`.

- [ ] **Step 1: Failing tests:** `test_closing_the_active_episode` (201, closure row with `closed_by`, response `active` null); `test_closing_without_an_active_episode_is_422`; `test_invalid_reason_or_future_or_too_early_date_is_422` (three cases); `test_other_facility_cannot_close` (403 or 404, matching `authorizePatient`); `test_requires_consultations_finalize` (encoder-only permissions → 403).
- [ ] **Step 2: Run** `--filter=MaternalEpisodeTest`. Expected: the new tests FAIL (404 route).
- [ ] **Step 3: Implement** controller (validate per Global Constraints; `abort_unless(active, 422)` with message "This patient has no active maternal care."), route and middleware arm.
- [ ] **Step 4: Run** `--filter=MaternalEpisodeTest`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(maternal): Complete Maternal Care endpoint`.

### Task 3: Accept delivery date and place

**Files:**
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php` (`maternalData`: add top-level `deliveryDate`, `deliveryPlace` SCALAR)
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (near line 146: `maternal_data.deliveryDate` nullable date before_or_equal:today; `maternal_data.deliveryPlace` nullable string max:200)
- Test: `backend/tests/Feature/PrenatalFormFieldsTest.php`

- [ ] **Step 1: Failing tests:** `test_draft_keeps_delivery_date_and_place` (save + read back); `test_official_record_rejects_a_future_delivery_date` — note the `saveRecord` helper hits the documented 403 baseline; if so, assert validation through the draft path only and record a Ruling.
- [ ] **Step 2: Run** `--filter=PrenatalFormFieldsTest`. Expected: new draft test FAIL (422 unsupported field).
- [ ] **Step 3: Implement** the two whitelist keys and two rules.
- [ ] **Step 4: Run** again. Expected: new tests PASS; the two baseline 403 tests unchanged.
- [ ] **Step 5: Commit** `feat(maternal): accept delivery date and place`.

### Task 4: Frontend episode util and overview mapping

**Files:**
- Create: `frontend/src/utils/maternalEpisode.js`, `frontend/src/utils/maternalEpisode.test.js`
- Modify: `frontend/src/utils/careOverview.js` (map `maternal_care`)
- Modify: `frontend/package.json` (script `"test:maternal-care": "node --test src/utils/maternalEpisode.test.js src/utils/careTracking.test.js"`)

**Interfaces:**
- `mapCareOverview(...)` adds `maternalCare: { active: null | { startedRecordId, startedOn, lastVisitOn, phase, recordIds: number[], pendingFollowUpIds: number[] }, closures: [{ id, reason, closedOn, note, closedByName, startedRecordId, recordIds, phase }] }` (empty `closures`, `active: null` when absent).
- `episodeRecords(records, recordIds): record[]` — records whose `id` is in `recordIds`, oldest first.
- `carriedPregnancyValues(episodeRecs): { lmp, expectedDeliveryDate, gravida, para, term, preterm, abortion, living, obstetricRisks: {grandMultipara, previousCs, recurrentMiscarriageOrStillbirth, postpartumHemorrhage, previousPregnancyComplications}, previousFpMethodUsed, previousFpMethodOther, recordedOn }` — each value from the latest record that has it (`maternalData` first, then top-level).
- `lifetimeTetanusDoses(allMaternalRecords): { tt: [{dose:'TT1', date}], td: [...], nextTt: 'TT3'|null, nextTd: string|null, ttComplete: bool, tdComplete: bool }` — union of `tetanusToxoidStatus` / `tetanusDiphtheriaStatus` across records (first non-empty date per dose); `nextTt` = dose after the highest recorded, null when none recorded or complete.
- `summarizeMaternalEpisode({ records, allMaternalRecords, today, nextFollowUp }): { phase, aogWeeks, aogDays, trimester, edc, weeksToEdc, gravida, para, tpal, deliveryDate, daysSinceDelivery, visitsByTrimester: {first, second, third}, postpartumVisits, lastVisit, nextFollowUp, risk: {ageRisk, heightRisk, obstetric: string[]}, labs: [{key,label,result,date}], tetanus: <lifetimeTetanusDoses>, medicines: [{name, quantity, unit, date}], flags: string[] }`. Reuse `MATERNAL_LAB_TESTS` (prenatalForm.js) and `calculateAgeInYears`-style local-date parsing. Visits before the delivery date count as prenatal by AOG at visit date; visits after count as postpartum. Medicines: `dispensedMedicines` with `confirmedGiven` true. Flags: "Past EDC — delivery not recorded", "Postpartum period ended — close maternal care".

- [ ] **Step 1: Failing tests** (fixed `today`): AOG 16w2d and 2nd trimester for LMP 2026-07-19 at 2026-11-10; weeksToEdc; visitsByTrimester counts; postpartum switch + daysSinceDelivery + postpartumVisits; labs latest-per-test across two records; TT union TT1 (record A) + TT2 (record B) → `nextTt` 'TT3'; TT1–TT5 → `ttComplete`; carried values take the latest correction; Past-EDC and 42-day flags; no LMP → aog fields null and no throw; `mapCareOverview` maps `maternal_care` and defaults when missing.
- [ ] **Step 2: Run** `node --test src/utils/maternalEpisode.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:maternal-care`. Expected: PASS (existing careTracking tests still pass).
- [ ] **Step 5: Commit** `feat(maternal): episode summary util`.

### Task 5: Care & Programs tab

**Files:**
- Modify: `frontend/src/utils/careTracking.js` (+ `careTracking.test.js`)
- Create: `frontend/src/components/features/patients/profile/MaternalCareCard.jsx`, `PastPregnancies.jsx`, `CompleteMaternalCareModal.jsx`
- Create: `frontend/src/services/maternalCareService.js` (`closeMaternalCare(patientId, { reason, closedOn, note })` → POST, returns mapped `maternalCare`)
- Modify: `frontend/src/components/features/patients/profile/CareAndProgramsTab.jsx`

**Interfaces:**
- `getCareTracking(patient, records, today, { maternalCare } = {})`: Family Planning and EPI entries only when they have records (drop the eligibility-only "Not started" card); the Maternal entry only when `maternalCare.active`, as `{ key: 'maternal', label: 'Maternal Care', summary: summarizeMaternalEpisode(...) }`; TB unchanged.
- Tab reads `useQuery({ queryKey: queryKeys.careOverview(patientId), queryFn: () => getCareOverview(patientId) })`; after a successful close, invalidate that key and the patient records query.
- `nextFollowUp` passed to `summarizeMaternalEpisode` = the earliest-due `overview.pendingFollowUps` entry whose id is in `maternalCare.active.pendingFollowUpIds` (`{ dueDate, isOverdue }`), else null.

- [ ] **Step 1: Update `careTracking.test.js` (failing):** eligible woman with no records → no entries; FP entry only with FP records; maternal entry absent without `maternalCare.active`, present with it (uses its `recordIds`). Adjust existing maternal tests that relied on the old derivation to pass `maternalCare`.
- [ ] **Step 2: Run** `npm run test:maternal-care`. Expected: FAIL.
- [ ] **Step 3: Implement** the rule, then the UI: Maternal card sections (Pregnancy, Visits, Risk & Labs, TT/Td, Medicines, flags) rendering the summary; "Complete Maternal Care" opens the modal (reason radio with the three labels, date default today `max=today`, note textarea ≤500, confirm copy from the spec); empty state "No active care tracking."; Past pregnancies collapsed list built from `maternalCare.closures` + `summarizeMaternalEpisode` per closure (hidden when none); Community Programs unchanged below.
- [ ] **Step 4: Verify** `npm run test:maternal-care && npm run lint -- --quiet && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat(maternal): Care & Programs shows enrolled care and the maternal card`.

### Task 6: Start Consultation without a visit-type radio

**Files:**
- Modify: `frontend/src/utils/startConsultation.js` (+ `startConsultation.test.js`)
- Modify: `frontend/src/utils/consultationRoute.js` (+ its test if present)
- Modify: `frontend/src/components/features/patients/profile/StartConsultationModal.jsx`

**Interfaces:**
- `ongoingCareOptions(overview): [{ key: 'maternal', title: 'Maternal Care — Prenatal'|'… — Postpartum', lines: string[], followUpIds: number[] }]` from `overview.maternalCare.active` (lines: AOG when known, "Follow-up due …").
- `scheduledFollowUpOptions(overview)` additionally excludes ids in `overview.maternalCare.active.pendingFollowUpIds`.
- `hasStartChoices(overview)` is also true when `overview.maternalCare.active`.
- `startRoute({ patientId, monitoringIds, startConditionIds, followUpIds, careMaternal }, basePath)`: when `careMaternal` the route is the continue route with `care=maternal` and the maternal follow-up ids merged into `followUpIds`; nothing ticked → `buildPatientConsultationPath`.
- `resolveBhcConsultationRoute` returns `careMaternal: boolean` on `new`/`continue` kinds (`care=maternal`), and a continue route is valid with only `careMaternal`.

- [ ] **Step 1: Failing tests:** ongoing option built from an active episode with AOG + follow-up line; maternal follow-up excluded from other follow-ups; `hasStartChoices` true for an active episode alone; `startRoute` with only `careMaternal` → `mode=continue&care=maternal&followUpIds=<ids>`; route parser returns `careMaternal: true`.
- [ ] **Step 2: Run** `npm run test:start-consultation` (add `consultationRoute` test file if it exists). Expected: FAIL.
- [ ] **Step 3: Implement** helpers, then the modal: delete the radio, `chooseVisitType`, `MONITORING_HINT` and `needsMonitoringTick`; render the three sections (headings "Ongoing care", "Condition monitoring (RHU-confirmed)" holding today's monitoring + recommended rows, "Other follow-ups"), a footer note "Nothing ticked starts a general consultation."; keep `checkContinuedStart` handling for monitoring/follow-ups.
- [ ] **Step 4: Verify** `npm run test:start-consultation && npm run lint -- --quiet && npm run build`.
- [ ] **Step 5: Commit** `feat(consultation): Start Consultation lists ongoing care without a visit-type choice`.

### Task 7: Workspace knows the active episode; panel shows "Ongoing"

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx`

**Interfaces:**
- Workspace: `useQuery({ queryKey: queryKeys.careOverview(selectedPatientId), queryFn: () => getCareOverview(selectedPatientId), enabled: Boolean(selectedPatientId) })` → `maternalCare`. `maternalActive = Boolean(maternalCare?.active)`.
- Panel prop `ongoing: string[]` (program keys with an active episode, i.e. `['Maternal']`). For an ongoing key: badge "Ongoing", line "Included in this visit" when selected else "Not included in this visit", no button.
- `handleProgramSelect` returns early for an ongoing key.
- New consultation with `routeContext.careMaternal` starts with `selectedPrograms` `['Maternal']` / primary `'Maternal'` (draft restore keeps its own programs).

- [ ] **Step 1:** Implement the query, the `ongoing` prop, the select guard and the route preselect. (UI wiring; no unit seam beyond Task 6's parser.)
- [ ] **Step 2: Verify** `npm run lint -- --quiet && npm run build && npm run test:consultation-steps`.
- [ ] **Step 3: Commit** `feat(maternal): ongoing maternal care in the services panel`.

### Task 8: Prenatal form follow-up mode and Delivery block

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Modify: `frontend/src/utils/prenatalForm.js` (+ test) — `MATERNAL_DELIVERY_KEYS = ['deliveryDate','deliveryPlace']`

**Interfaces:**
- Consumes Task 4 `carriedPregnancyValues`, `episodeRecords`; Task 7 `maternalCare`.
- `maternalFollowUp = maternalActive && isMaternal`.

- [ ] **Step 1: Failing test** (`prenatalForm.test.js`): `MATERNAL_DELIVERY_KEYS` exact list; a pure `mergeCarriedPregnancy(maternalData, carried)` (add to `prenatalForm.js`) fills only empty pregnancy fields and the obstetric risk keys, never overwriting typed values.
- [ ] **Step 2: Run** `npm run test:prenatal-form`. Expected: FAIL.
- [ ] **Step 3: Implement** `mergeCarriedPregnancy`; in the workspace, when `maternalFollowUp` first becomes true for a non-draft consultation, seed `maternalData` with it (and `expectedDeliveryDate`). Render: read-only Pregnancy Information ("Recorded <recordedOn> · [Correct]"; Correct switches the existing inputs on for this visit); hide Obstetric Risk Factors and OB History sections; show a Delivery block only when the episode phase is `prenatal` ("Delivered?" toggle → Date of delivery (required when toggled, max today, min LMP) + Place of delivery); add `deliveryDate`, `deliveryPlace` to the draft field list and `EMPTY_MATERNAL_DATA`. First visit (no active episode) renders exactly as today.
- [ ] **Step 4: Verify** `npm run test:prenatal-form && npm run test:maternal-care && npm run lint -- --quiet && npm run build`. Then the spec's manual browser flow (record what was not run).
- [ ] **Step 5: Commit** `feat(maternal): follow-up prenatal form carries the pregnancy and records delivery`.
