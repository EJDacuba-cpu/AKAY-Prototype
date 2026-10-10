# BHC General Consultation Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-concern Health Concern and Care Plan UI of the BHC General Consultation with four steps. Follow-up and referral become independent visit-level checkboxes, and Morbidity / Notifiable / Surveillance entries become an optional named list. Legacy records, legacy clients, RHU saves and monitoring stay unchanged.

**Architecture:**
- **Backend:** a BHC-only discriminator (`consultation_workflow: "bhc_general_v2"`) routes a POST through v2 validation and a v2 controller path. Requests without it keep today's code path.
- **Reporting:** v2 `diagnoses[]` entries are reporting-only. One normalizer (`ReportingEntries` in PHP, `reportingEntries.js` in JS) maps `reportIn` to and from the legacy `reportAs` and `includeInSurveillance`.
- **Frontend:** the new logic lives in pure, tested helpers (`nextActions.js`, `draftConversion.js`, `reportingEntries.js`, `consultationWorkflow.js`) and one step component (`NextStepsSection.jsx`). `ConsultationWorkspace.jsx` only orchestrates.

**Tech Stack:** Laravel (PHP 8, PHPUnit, SQLite in tests), React + Vite, `node:test`, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-10-bhc-general-consultation-simplification-design.md` (approved 2026-10-10). Read it in full before any task. Section references below (B3, F2, …) point into it.

## Global Constraints

- No database migration. New keys go only into `monitoring_data` / `diagnoses` (JSON), into request-only `care_plan`, or into the existing `assessment_notes`.
- Discriminator value: exactly `bhc_general_v2`. It is stored as `monitoring_data.consultationWorkflow`. A request without it keeps today's behavior byte for byte.
- `reportIn ⊆ ["morbidity", "notifiable", "surveillance"]`, must not be empty, and is the source of truth for v2. `reportAs` (`notifiable` > `morbidity` > null) and `includeInSurveillance` are written mirrors only.
- v2 entries never carry `carePlan`, `bhcFollowUp`, `addToConditions`, `conditionStatus` or `conditionKey`, and never touch `patient_conditions` / `patient_condition_events`. Names are stored as typed: no `resolveConditionEntries`.
- Follow-up date is always required when Schedule BHC Follow-up is ticked. The H6 reason exemption applies only to service-only or monitoring-only returns, and never to the date.
- One follow-up and one referral per consultation (unchanged).
- Shared-referral acknowledgment is required when `(refer_to_rhu ? 1 : 0) + distinct monitoring_referrals ≥ 2` **or** `referral_multiple_issues === true`. It is audited with "Not a clinical compatibility check."
- UI copy (exact):
  - Step labels: "Patient Interview", "Physical Examination", "Medication, Treatment & Next Steps", "Review & Finalize".
  - Checkboxes: "Schedule BHC Follow-up", "Refer to RHU", "This referral covers more than one health issue".
  - Reporting: section "Reporting (optional)", empty text "Not reported for this visit.", button "+ Add entry", field label "Reported Health Problem / Suspected Case", checkboxes "Morbidity Report", "Notifiable Disease Report", "Community-Based Surveillance".
  - Chief Complaint helper: "Reason for the visit — symptoms or a service, e.g. Initial prenatal checkup."
  - Report column header: "Diagnosis / Suspected Case".
- Design system: Geist; black, red and white; thin borders; compact spacing; no nested cards; works at 1366×768 and at mobile width.
- Backend test command: `php -d memory_limit=2G vendor/bin/phpunit` (from `backend/`). Never use `php artisan test`, which runs out of memory.
- Frontend: `node --test` (from `frontend/`), `npm run lint`, `npm run build`.
- Regressions are judged **by test name** against the Task 0 baseline. A count that stays the same is not evidence.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Approval clarifications (developer, 2026-10-10):**
  - **Mixed visits stay possible.** A General Consultation can combine a health complaint with Maternal Care, FP and/or EPI in the same visit.
  - **Selecting Maternal Care never starts a longitudinal maternal enrollment.** Existing service recording is preserved, and a Maternal Care enrollment lifecycle is out of scope without a separate approved design.
  - **General Consultation, service participation and confirmed-condition monitoring stay distinct.** Neither reporting entries nor service selections ever create RHU-confirmed conditions.
  - **Return dates come only from existing service forms.** Use only the dates those forms actually supply, as verified in Task 0 Step 4b. Never invent dates. H6 is preserved, and a required service return cannot be bypassed.
  - **The 403 test-setup blocker is resolved before any new feature-test result is relied on.**
  - RHU records, legacy consultations and historical drafts stay compatible.
- **Execution gate:** after Task 0, report the baseline, migration findings and blockers to the developer, and wait for approval before Task 1. (Done: on 2026-10-10 the developer approved continuing with Task 0.5, then Task 1 onward.)
- **Return dates (developer decision 2026-10-10, after Task 0):** Schedule BHC Follow-up starts unticked and is ticked only by the worker or by restoring a saved draft.
  - Service-proposed dates (`immunizationNextScheduleDate`, FP `nextAppointmentDate`) are **suggestions only**. They stay in their service records, are never copied into `monitoring_data.followUpDate`, and never create a follow-up task unless the worker ticks the box.
  - A date that differs from a suggestion gets a non-blocking warning.
  - No new mandatory return rule is added.
  - H6 is unchanged, and the date is always required when the box is ticked.

## Review Focus

1. **An EPI next-dose suggestion never creates a follow-up on its own.** For an EPI visit with a proposed next-dose date and Schedule BHC Follow-up unticked, the payload has an empty `followUpDate` and an empty `followUpStatus` (the workspace sends "Completed", and the server derives the same value), and the server creates no follow-up task. Tests are in Task 7 (`nextActionsPayload`) and Task 3 (`test_v2_epi_next_dose_without_follow_up_creates_no_task`).
2. **Unticking Refer to RHU keeps the typed referral values but sends no referral.** The facility and reason are kept in state and in the draft. The payload has no `referral` and `needs_referral: false`. Re-ticking shows the same values. Test is in Task 7 (`nextActionsPayload`).
3. **Duplicate reporting entries are rejected.** Two entries whose names differ only by case or whitespace give an error in the frontend (Task 6) and a 422 on the backend (Task 2, `distinct:ignore_case` on the trimmed name).
4. **RHU users can never use v2.** An RHU user who sends `consultation_workflow`, including one whose working facility is an RHU, gets a 422 and nothing is saved. Test is in Task 2.
5. **The old production frontend keeps working after the backend deploy.** A legacy payload with `diagnoses[].carePlan = 'refer'` and the old `diagnosis` text is processed exactly as before. Test is in Task 5.

---

### Task 0: Baseline, branch check and pending-migration write-up

**Files:**
- Create: `docs/ai/test-baseline-2026-10-10.md`
- Create: `docs/ai/pending-migrations-2026-09-30.md`

- [ ] **Step 1:** Confirm the branch is `bhc-general-consultation-simplification`, with HEAD at the approved-spec commit (`76eeeba`) or later. The spec and plan commits sit on top of it.
- [ ] **Step 2:** From `backend/`, run `php -d memory_limit=2G vendor/bin/phpunit --log-junit ../baseline-junit.xml`. The log goes outside the repository.
  - In `test-baseline-2026-10-10.md`, list every failing or erroring test as `Class::method — cause`. The cause is the first assertion or exception line, grouped where shared (e.g. "403: actingAs user lacks consultations.finalize").
  - Record the totals.
- [ ] **Step 3:** From `frontend/`, run `node --test`, `npm run lint` and `npm run build`. Record the pass/fail counts, failing test names, lint errors and warnings, and build status in the same file.
- [ ] **Step 4: Check that the store() test setup works.** Run `--filter ConsultationWorkflowRevisionTest::test_optional_hpi_and_vitals_do_not_block_finalization` and record whether it passes.
  - The Task 2–5 tests use that setup (`ActionPermissions::PRESETS['clinical']`, BHC `bhw`, Sanctum `akay:access`).
  - **If it fails with 403, stop.** Report the cause to the developer before Task 2. New tests must not be built on a broken setup.
- [ ] **Step 4b: Return-date sources (read-only).** In `frontend/src/pages/bhc/ConsultationWorkspace.jsx`, the service forms and `backend/app/Http/Requests/HealthRecordRequest.php`, find every place that proposes or **requires** a next-return or follow-up date. Examples to check:
  - the EPI next-dose `immunizationNextScheduleDate`;
  - any prenatal next-visit field;
  - any FP next-visit or resupply field;
  - monitoring;
  - server rules that require `followUpDate`.

  For each, record its file and line, whether it is proposed or mandatory, and whether it is enforced on the frontend, backend or both. Add the list to `test-baseline-2026-10-10.md` under "Return-date sources". This list replaces the plan's assumption in Task 7 (`returnRequirement`) where they differ.
- [ ] **Step 5: Write `pending-migrations-2026-09-30.md`.** For each of `2026_09_30_000001_drop_care_pathway_tables`, `2026_09_30_000002_create_condition_monitoring_tables` and `2026_09_30_000003_allow_shared_follow_up_fulfilment`, record:
  - its purpose (read the file);
  - the tables it touches;
  - what it depends on;
  - its down() behavior;
  - its Supabase status ("pending" per `CURRENT.md`; unverified);
  - its risks (data dropped by 000001).
- [ ] **Step 6: Run the migrations against a disposable PostgreSQL** if one is available (`docker run postgres:16` or a local `psql`).
  - Use `DB_CONNECTION=pgsql php artisan migrate --database=<disposable>`, then `migrate:rollback --step=3`, and record the output.
  - If no disposable PostgreSQL is available, write **UNVERIFIED — no disposable PostgreSQL available** and do not deploy.
- [ ] **Step 7:** Commit with `docs: test baseline and pending migration review for consultation simplification`.

---

### Task 0.5: Targeted 403 test-setup sweep (tests only)

**Files (tests only, no application code):**
- Modify: `backend/tests/Feature/HealthRecordIdempotencyTest.php`
- Modify: `backend/tests/Feature/HealthRecordDraftFinalizationTest.php`
- Modify: `backend/tests/Feature/FollowUpConcurrencyTest.php`
- Modify: `backend/tests/Feature/ReferralSubmissionGateTest.php`
- Modify: `backend/tests/Feature/FacilityIsolationSecurityTest.php`
- Modify: `docs/ai/test-baseline-2026-10-10.md` (a new "After Task 0.5" section)

**Why:** these classes cover the `store()` path the v2 work changes, but today their BHW users have `permissions = null`. Such users get the encoder preset (`ActionPermissions.php:26-27`) and are rejected with a 403 (`EnforceActionPermissions.php:40`). Until that's fixed they give no regression coverage.

**Rules:**
- Give each test user the preset its test's intent needs. For a BHW that saves, refers or dispenses, that's `ActionPermissions::PRESETS['clinical']`. A test whose purpose is to check that a permission is *denied* keeps the restricted user. RHU users get the RHU preset that `RhuConditionConfirmationTest` uses.
- **Never change application code.**
- Classify each failure that remains after the setup fix:
  - **(a) Clearly obsolete expectation.** The test asserts behavior that a later, documented change removed, for example a rule now enforced differently. Update the test, and add a one-line comment citing the current rule as file:line. Record the change in the baseline doc.
  - **(b) Anything else.** This includes a possible real bug, any security, facility-isolation, idempotency or concurrency assertion, and any case you're unsure about. Leave the test unchanged, so it keeps failing. Record the name, the failure and your suspicion under "Open after Task 0.5".
- **Never weaken or delete an assertion** about security, facility isolation, idempotency, concurrency or stock.

- [ ] **Step 1:** For each class, read its setUp and user helpers, apply the preset fix, and run `--filter <Class>`. Record the before and after pass counts.
- [ ] **Step 2:** Classify each remaining failure as (a) or (b), as defined above. Apply only (a) fixes.
- [ ] **Step 3:** Run the full backend suite with JUnit (scratch output outside the repo). Diff the failing names against the Task 0 baseline.
  - Expected: no new failing name anywhere.
  - Fewer failing names in the five classes.
  - Every remaining name in those classes is listed under "Open after Task 0.5" with its cause.
- [ ] **Step 4:** Update the baseline doc. The new failing-name list becomes the baseline that later tasks are compared against.
- [ ] **Step 5:** Commit with `test: give store()-path test users real permissions (targeted 403 sweep)`.

---

### Task 1: Backend reporting normalizer

**Files:**
- Create: `backend/app/Services/ReportingEntries.php`
- Modify: `backend/app/Models/HealthRecord.php` (constant and accessor)
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (`normalizeDiagnosisReporting` only)
- Test: `backend/tests/Unit/Services/ReportingEntriesTest.php`

**Interfaces (produces):**
- `HealthRecord::WORKFLOW_BHC_GENERAL_V2 = 'bhc_general_v2'`
- `HealthRecord::isBhcGeneralV2(): bool`. True when `monitoring_data['consultationWorkflow'] === 'bhc_general_v2'`.
- `final class ReportingEntries`:
  - `const DESTINATIONS = ['morbidity', 'notifiable', 'surveillance'];`
  - `static destinations(mixed $entry): array`. Returns a list in DESTINATIONS order.
    - When `reportIn` is an array, it uses it, keeping only known values with no duplicates.
    - Otherwise, legacy: `reportAs` `morbidity` or `notifiable` contributes that value, and `includeInSurveillance === true` contributes `surveillance`.
    - A non-array entry returns `[]`.
  - `static normalizeForSave(array $entry): array`. Returns `['id' => …, 'name' => trim(name), 'reportIn' => destinations, 'reportAs' => 'notifiable'|'morbidity'|null, 'includeInSurveillance' => bool, 'conditionKey' => null]`. Every other key is dropped.
  - `static visitStatus(array $entries): string`. Returns `'notifiable'`, `'morbidity'` or `'not_included'`, using `destinations()` over all entries.

- [ ] **Step 1: Write failing unit tests**, one per name, asserting exact arrays:
  - `test_morbidity_only`: `['reportIn' => ['morbidity']]` → reportAs `morbidity`, includeInSurveillance `false`.
  - `test_notifiable_only` → `notifiable`, `false`.
  - `test_both_reports` with `['notifiable','morbidity']` → reportIn `['morbidity','notifiable']`, reportAs `notifiable`.
  - `test_surveillance_only` → reportAs `null`, includeInSurveillance `true`.
  - `test_all_three`.
  - `test_unknown_and_duplicate_destinations_are_dropped`.
  - `test_client_report_as_and_condition_key_are_ignored`: input carries `reportAs => 'morbidity'`, `conditionKey => 'tuberculosis'`, `carePlan => 'refer'`, `reportIn => ['surveillance']`. Expect reportAs `null`, conditionKey `null`, and no `carePlan` key.
  - `test_name_is_trimmed_not_renamed`: `' PTB '` → `'PTB'`.
  - `test_legacy_entry_destinations`: `['reportAs' => 'notifiable', 'includeInSurveillance' => true]` → `['notifiable','surveillance']`.
  - `test_legacy_null_report_as_has_no_destinations`.
  - `test_visit_status_order`: notifiable beats morbidity, and surveillance alone gives `not_included`.
- [ ] **Step 2:** Run `--filter ReportingEntriesTest`. Expected: FAIL, class not found.
- [ ] **Step 3:** Implement the class, the model constant and `isBhcGeneralV2()`.
- [ ] **Step 4:** In `HealthRecordController::normalizeDiagnosisReporting`, replace the inline status calculation with `ReportingEntries::visitStatus($reported)`. Keep the "only entries that carry `reportAs`" guard, since v2 entries carry it after `normalizeForSave`. The behavior for legacy entries must not change.
- [ ] **Step 5:** Run `--filter "ReportingEntriesTest|DiagnosisReportingTest|SurveillanceRegistryTest"`. Expected: PASS, with no newly failing names compared to Task 0.
- [ ] **Step 6:** Commit with `feat(reporting): central ReportingEntries normalizer for reportIn and legacy mirrors`.

---

### Task 2: v2 request validation

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Test: `backend/tests/Feature/BhcGeneralConsultationV2Test.php` (create)

**Interfaces:**
- Consumes: `HealthRecord::WORKFLOW_BHC_GENERAL_V2` and `ReportingEntries::DESTINATIONS` (Task 1).
- Produces: `HealthRecordRequest::isBhcGeneralV2(): bool`. True when the method is POST and `input('consultation_workflow') === 'bhc_general_v2'`. Task 3 uses it.

**Rules to add:**
- `consultation_workflow`:
  - `nullable` and `Rule::in(['bhc_general_v2'])`;
  - `prohibited` on non-POST;
  - a closure that fails for `$this->user()->isRhuStaff()` with "This consultation workflow is for BHC consultations only."
- When `isBhcGeneralV2()`:
  - `diagnosis` → `prohibited`.
  - `diagnoses.*.name` → add `distinct:ignore_case`.
  - `diagnoses.*.reportIn` → `required|array|min:1`.
  - `diagnoses.*.reportIn.*` → `string|distinct|in:` + DESTINATIONS.
  - `diagnoses.*.{carePlan,bhcFollowUp,addToConditions,conditionStatus,conditionKey}` → `prohibited`.
  - `care_plan.bhc_follow_up`, `care_plan.refer_to_rhu` and `care_plan.referral_multiple_issues` → `nullable|boolean`.
- When **not** v2: those three `care_plan` keys and `diagnoses.*.reportIn` → `prohibited`.

**After-validator:** wrap the existing concern-based checks in `if (! $this->isBhcGeneralV2())`. These are:
- the "BHC Assessment is required…" `diagnosis` rule;
- the concern `needs_referral` rule;
- the concern `shared_referral_acknowledged` count;
- `$needsConcernDate` and the reason and recheck rules;
- `$keptWithReferral`.

All other checks stay shared. Add a v2 block with these exact messages:

| Condition | Error key | Message |
|---|---|---|
| `refer_to_rhu` true and not `$needsReferral` | `needs_referral` | "Refer to RHU is selected, so this visit needs a referral." |
| `$needsReferral`, `refer_to_rhu` not true, and `monitoring_referrals` empty | `care_plan.refer_to_rhu` | "Select Refer to RHU or refer a monitored condition." |
| `bhc_follow_up` true and no follow-up date | `monitoring_data.followUpDate` | "Set the follow-up date." |
| `bhc_follow_up` true, reason blank, and not exempt | `monitoring_data.followUpReason` | "Follow-up reason is required." |
| needs referral, `(count ≥ 2 \|\| referral_multiple_issues)` and not acknowledged | `care_plan.shared_referral_acknowledged` | existing message, unchanged |

- **Exempt** means `monitoring_data.selectedPrograms` is not empty, or `$keepsMonitoring` is true (the existing variable).
- **count** = `(refer_to_rhu ? 1 : 0) + count(array_unique($referredIds))`.

- [ ] **Step 1: Write failing feature tests.** Setup is copied from `ConsultationWorkflowRevisionTest::setUp`. Add a helper `v2(array $extra = [])` that posts `consultation_workflow => 'bhc_general_v2'`, `chief_complaint => 'Cough for 3 days'`, `category => 'General Consultation'` and an Idempotency-Key.
  - `test_v2_without_actions_or_reporting_saves`: `assertCreated()`.
  - `test_rhu_user_cannot_send_v2`: RHU staff user (`role` rhu_staff, `rural_health_unit_id`) → 422 on `consultation_workflow`, and `health_records` count 0.
  - `test_v2_rejects_diagnosis_text` → 422 `diagnosis`.
  - `test_v2_rejects_condition_and_care_plan_keys_on_entries`, using a data provider over the five keys → 422 `diagnoses.0.<key>`.
  - `test_v2_entry_requires_a_destination`: `reportIn => []` → 422 `diagnoses.0.reportIn`.
  - `test_v2_rejects_unknown_destination` → 422 `diagnoses.0.reportIn.0`.
  - `test_v2_rejects_duplicate_entry_names`: `'Suspected dengue'` and `' suspected DENGUE'` → 422 `diagnoses.1.name`.
  - `test_v2_keys_are_prohibited_on_legacy_payloads`: `care_plan.bhc_follow_up` without the discriminator → 422.
  - `test_v2_follow_up_requires_date`.
  - `test_v2_follow_up_requires_reason_for_general_consultation`.
  - `test_v2_service_only_follow_up_reason_exempt_but_date_required`: Maternal selected, follow-up ticked, no reason, date set → 201. Without the date → 422 `monitoring_data.followUpDate`.
  - `test_v2_refer_requires_referral`: `refer_to_rhu` with no `needs_referral` → 422 `needs_referral`.
  - `test_v2_referral_requires_reason`.
  - `test_v2_referral_without_purpose_rejected`: `needs_referral` true, no `refer_to_rhu`, no monitoring referrals → 422 `care_plan.refer_to_rhu`.
  - `test_v2_multiple_issues_requires_acknowledgment`: count 1 plus `referral_multiple_issues` → 422; with the acknowledgment → 201.
  - `test_v2_general_referral_plus_monitoring_referral_requires_acknowledgment`: uses an RHU-confirmed condition plus an active `condition_monitorings` row, built the way `CarePlanFollowedConditionTest` builds them.
  - `test_v2_skips_assessment_rule`: follow-up ticked with date and reason, no diagnosis → 201.
- [ ] **Step 2:** Run `--filter BhcGeneralConsultationV2Test`. Expected: the new tests FAIL. Any test that passes before the change must be rewritten until it fails for the right reason.
- [ ] **Step 3:** Implement the rules and `isBhcGeneralV2()`.
- [ ] **Step 4:** Run `--filter "BhcGeneralConsultationV2Test|CarePlanValidationTest|SharedReferralAcknowledgmentTest|ConsultationWorkflowRevisionTest|CarePlanSaveTest"`. Expected:
  - v2 tests PASS, except the persistence assertions that belong to Task 3 (none in this list);
  - the legacy classes have the same failing names as Task 0.
- [ ] **Step 5:** Commit with `feat(consultation): BHC-only v2 discriminator and visit-level next-action validation`.

---

### Task 3: v2 controller path and follow-up persistence

**Files:**
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (`store`, `auditSharedReferral`, and a new private `applyV2NextActions`)
- Modify: `backend/app/Services/CarePlan.php` (`keepsFollowUpWithReferral`)
- Test: `backend/tests/Feature/BhcGeneralConsultationV2Test.php`, `backend/tests/Unit/Services/CarePlanTest.php`

**Interfaces:**
- Consumes: `HealthRecordRequest::isBhcGeneralV2()` and `ReportingEntries::normalizeForSave()`.
- Produces the stored v2 record shape:
  - `monitoring_data.consultationWorkflow = 'bhc_general_v2'`;
  - `monitoring_data.bhcFollowUp` (bool);
  - when it's true, `followUpStatus` / `follow_up_status = 'Follow-up Required'`;
  - `diagnosis = null`;
  - `diagnoses[]` in normalized form.

**Behavior:**
- **In `store()`, when v2:**
  - map `diagnoses` through `ReportingEntries::normalizeForSave`, and **do not** call `resolveConditionEntries`;
  - skip `castBhcFollowUpFlags`, `normalizeConcernActions`, `applyRecheckReason` and `requireConcernFollowUp`;
  - call `applyV2NextActions($data, $carePlan)` **before** `normalizeReferralDisposition`, which reads `bhcFollowUp`.
- **Legacy path:** unchanged.
- **`CarePlan::keepsFollowUpWithReferral`:** once `$monitoringData` is normalized to an array, return true when `($monitoringData['bhcFollowUp'] ?? null) === true`.
- **`auditSharedReferral`, v2:**
  - the names are "General consultation" (when `refer_to_rhu`) plus the referred monitoring names;
  - log when the count is 2 or more or `referral_multiple_issues` is set, and append " Worker indicated multiple health issues." when the flag is set;
  - the trailing "Not a clinical compatibility check." is kept.

- [ ] **Step 1: Write failing tests.**
  - `CarePlanTest::test_bhc_follow_up_flag_keeps_follow_up_with_referral`: `keepsFollowUpWithReferral([], ['bhcFollowUp' => true])` is true, and `['bhcFollowUp' => 'true']` is false (strict).
  - Feature tests:
    - `test_v2_stores_workflow_and_empty_diagnosis`: the response `data.monitoring_data.consultationWorkflow` and `data.diagnosis` are null.
    - `test_v2_reporting_entry_persists_both_reports_once`: one entry `['morbidity','notifiable','surveillance']`. The stored `diagnoses` has 1 element, with reportAs `notifiable`, includeInSurveillance true, and `monitoring_data.morbidityReportingStatus` `notifiable`.
    - `test_v2_reporting_never_creates_conditions`: entry name `'Tuberculosis'`. Afterwards `patient_conditions` and `patient_condition_events` counts are 0, and the stored name stays `'Tuberculosis'` with `conditionKey` null.
    - `test_v2_reporting_name_is_not_renamed`: `'PTB'` is stored as `'PTB'`.
    - `test_v2_follow_up_only_creates_task_without_condition`: one `follow_up_tasks` row (use the table and columns `FollowUpTaskSchedulingTest` asserts on), and no `condition_monitorings` change.
    - `test_v2_referral_only_has_no_follow_up_task`: a referral with no follow-up. Assert the same follow-up task count that `CarePlanReferralFollowUpTest` asserts for a plain referral.
    - `test_v2_follow_up_and_referral_keep_the_follow_up`: `monitoring_data.followUpDate` stays set and the task exists. Then call `app(FollowUpTaskSyncService::class)->syncEligibleRecordsForUser($this->worker)` and assert the task is still active.
    - `test_v2_epi_next_dose_without_follow_up_creates_no_task`: an EPI service visit with an `immunization_data` next-schedule date and no `bhc_follow_up` creates no follow-up task, and `monitoring_data.followUpDate` is null. If the server derives a task from `immunization_data` by itself, report it as DONE_WITH_CONCERNS. Don't change the legacy derivation.
    - `test_v2_bhc_follow_up_does_not_touch_monitoring`: a continued monitoring plus `bhc_follow_up`. The monitoring row's status and `updated_at` are unchanged apart from what the legacy continuation path writes. Compare with the same payload without `bhc_follow_up`.
    - `test_v2_acknowledgment_is_audited_with_multiple_issues_note`: an `audit_logs.description` LIKE '%Worker indicated multiple health issues.%'.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `--filter "BhcGeneralConsultationV2Test|CarePlanTest|CarePlanReferralFollowUpTest|FollowUpTaskSyncServiceTest|FollowUpTaskSchedulingTest|SharedReferralAcknowledgmentTest|HealthConcernBoundaryTest"`. Expected: v2 PASS, legacy classes match the Task 0 names.
- [ ] **Step 5:** Commit with `feat(consultation): v2 save path with visit-level follow-up and reporting-only entries`.

---

### Task 4: Draft schema for v2 keys

**Files:**
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php` (`SCHEMA`, and the validation rules near `payload.diagnoses.*`)
- Test: `backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php`

**Schema additions** (`sanitizeNode` rejects unknown keys on write and on read):
- top-level `consultationWorkflow`;
- `diagnoses.*.reportIn => ['*' => SCALAR]`;
- `carePlan.bhcFollowUp`, `carePlan.referToRhu` and `carePlan.referralMultipleIssues`.

**Rules:**
- `payload.consultationWorkflow` → `nullable|in:bhc_general_v2`;
- `payload.diagnoses.*.reportIn.*` → `in:` DESTINATIONS;
- the three `carePlan` flags → `nullable|boolean`.

Existing legacy keys stay.

- [ ] **Step 1: Write failing tests.**
  - `test_v2_draft_keys_survive_sanitize_round_trip`: write and read back `consultationWorkflow`, `reportIn` and the three flags, with values equal.
  - `test_legacy_draft_with_care_plan_concerns_still_validates`.
  - `test_unknown_report_in_value_rejected`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `--filter "HealthRecordDraftPayloadServiceTest|HealthRecordDraftTest|HealthRecordDraftFinalizationTest"`. Expected: new tests PASS, legacy names match the baseline.
- [ ] **Step 5:** Commit with `feat(drafts): accept v2 consultation keys in draft payloads`.

---

### Task 5: Backend compatibility, authorization and idempotency coverage, plus full-suite comparison

**Files:**
- Test: `backend/tests/Feature/BhcGeneralConsultationV2Test.php`

- [ ] **Step 1: Add the tests.**
  - `test_legacy_refer_concern_payload_unchanged`: the old frontend shape (`diagnosis` text, `diagnoses[0].carePlan = 'refer'`, `needs_referral`, referral). Expect 201, the stored `carePlan` stays `'refer'`, and there is no `consultationWorkflow` key.
  - `test_rhu_health_record_save_unaffected`: an RHU user posting the RHU record shape that `RhuConditionConfirmationTest` uses → 201.
  - `test_v2_replay_with_same_idempotency_key_returns_same_record`: the second response is 200 with the same id. There is one health record, at most one follow-up task and at most one referral or hold.
  - `test_v2_dispense_requires_items_dispense`: a worker without `items.dispense` → 403, as in `test_finalization_does_not_grant_referral_or_dispensing_permission`, but with the v2 payload.
  - `test_v2_follow_up_task_completes_only_on_save`: a pending task plus `monitoring_data.followUpTaskId` and `visit_type follow_up_visit`. Before the POST the task is pending. After a 201 it is completed. After a 422 POST, for example with a missing follow-up reason, it is still pending.
  - `test_v2_draft_finalize_consumes_draft`: the `HealthRecordDraftFinalizationTest` pattern with a v2 payload.
- [ ] **Step 2:** Run `--filter BhcGeneralConsultationV2Test`. Expected: every test PASSES when run alone.
- [ ] **Step 3: Run the full backend suite with junit output.** Diff the failing names against Task 0.
  - Expected: no new failing name.
  - List baseline names that now pass under "noted, not credited" in `test-baseline-2026-10-10.md`.
- [ ] **Step 4:** Commit with `test(consultation): v2 compatibility, authorization and idempotency coverage`.

---

### Task 6: Frontend reporting normalizer and readers

**Files:**
- Create: `frontend/src/utils/consultationWorkflow.js` and `frontend/src/utils/consultationWorkflow.test.js`
- Create: `frontend/src/utils/reportingEntries.js` and `frontend/src/utils/reportingEntries.test.js`
- Modify: `frontend/src/utils/diagnosisReporting.js` (`usesDiagnosisReporting`, `deriveReportingStatus`, `getReportedDiagnoses`)
- Modify: `frontend/src/utils/surveillance.js` (`getSurveillanceDiagnoses`)
- Modify: `frontend/src/utils/diagnoses.js` (`normalizeDiagnoses` keeps `reportIn`)
- Modify: `frontend/src/pages/bhc/BHCReports.jsx` (Morbidity/Notifiable column header)
- Modify: `frontend/package.json` (add the new test files to `test:diagnosis-reporting`)

**Interfaces (produces):**
- `consultationWorkflow.js`:
  - `BHC_GENERAL_V2 = "bhc_general_v2"`.
  - `isBhcGeneralV2(record): boolean`. Reads `monitoring_data` or `monitoringData` → `consultationWorkflow`.
  - `visitAssessmentDisplay(record): { label: "Diagnosis" | "Chief Complaint", value: string } | null`.
    - A v2 record with a blank `diagnosis` → Chief Complaint (`chief_complaint` or `chiefComplaint`).
    - Any other record with a non-blank `diagnosis` → Diagnosis.
    - Otherwise → null.
    - A legacy record with a blank diagnosis is **never** given the Chief Complaint fallback.
- `reportingEntries.js`:
  - `REPORT_DESTINATIONS = ["morbidity", "notifiable", "surveillance"]`.
  - `entryDestinations(entry): string[]`. Same rules as PHP `ReportingEntries::destinations`.
  - `newReportingEntry(): { id, name: "", reportIn: [] }`. The id comes from `createDiagnosisId`.
  - `toggleDestination(entry, destination, checked): entry`.
  - `reportingEntryPayload(entries): Array<{ id, name, reportIn }>`. Trims names and drops entries whose name is blank and that have no destination.
  - `reportingEntryErrors(entries): Record<string, string>`. Keys and exact messages:
    - `reportingEntry.<id>.name`: "Enter the reported health problem.";
    - `reportingEntry.<id>.reportIn`: "Choose at least one report.";
    - `reportingEntry.<id>.duplicate`: "This health problem is already listed." (case- and whitespace-insensitive, via `normalizeNameKey`).
  - `formatEntryDestinations(entry): string`. For example "Morbidity · Notifiable · Surveillance".

- [ ] **Step 1: Write failing tests.**
  - `reportingEntries.test.js`:
    - destinations for v2 entries, legacy morbidity, legacy notifiable plus surveillance, and legacy null;
    - unknown values are dropped;
    - `reportingEntryPayload` drops blank entries;
    - the three error messages, including the duplicate `"Dengue"` / `" dengue "`.
  - Extend `diagnosisReporting.test.js`:
    - a record with one v2 entry `reportIn: ["morbidity","notifiable"]` → `getReportedDiagnoses(record,"morbidity")` and `getReportedDiagnoses(record,"notifiable")` each return `["X"]` exactly once;
    - a v2 entry with only `["surveillance"]` gives `[]` for both;
    - the existing legacy tests are unchanged.
  - Extend `surveillance.test.js`:
    - a v2 entry with `surveillance` appears once;
    - legacy HFMD tags still give one "Hand, Foot and Mouth Disease" row.
  - `consultationWorkflow.test.js`:
    - v2 with an empty diagnosis → `{label:"Chief Complaint", value:"Cough"}`;
    - legacy with an empty diagnosis → null;
    - legacy with a diagnosis → `{label:"Diagnosis"}`.
  - Extend `diagnoses.test.js`: `normalizeDiagnoses` keeps `reportIn`.
- [ ] **Step 2:** Run `node --test src/utils/reportingEntries.test.js src/utils/diagnosisReporting.test.js src/utils/surveillance.test.js src/utils/consultationWorkflow.test.js src/utils/diagnoses.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - `usesDiagnosisReporting` is also true when any entry has a `reportIn` key.
  - `getReportedDiagnoses` and `getSurveillanceDiagnoses` filter with `entryDestinations(entry).includes(type)`.
  - `deriveReportingStatus` uses the same function.
  - Change the BHCReports Morbidity/Notifiable "Diagnosis" column header to "Diagnosis / Suspected Case".
- [ ] **Step 4:** Run the same command, then `node --test`. Expected: PASS, with no new failing names compared to Task 0.
- [ ] **Step 5:** Commit with `feat(reporting): frontend reporting normalizer with reportIn and legacy readers`.

---

### Task 7: Next-actions helpers

**Files:**
- Create: `frontend/src/utils/nextActions.js` and `frontend/src/utils/nextActions.test.js`
- Modify: `frontend/package.json` (add it to `test:consultation-steps`)

**Interfaces (produces):**
- State shape: `{ bhcFollowUp: boolean, referToRhu: boolean, referralMultipleIssues: boolean }`.
- `initialNextActions(): State`. Everything false. Nothing in this module ever ticks `bhcFollowUp` except `setFollowUpChecked` and `restoreNextActions`.
- `setFollowUpChecked(state, checked): State`.
- `setReferChecked(state, checked): State`. Unticking also clears `referralMultipleIssues`.
- `followUpReasonExempt({ selectedPrograms, monitorsAny }): boolean`. `selectedPrograms.length > 0 || monitorsAny` (H6).
- `serviceDateSuggestions({ immunizationNextDate, familyPlanningNextDate }): Array<{ source: "EPI next dose" | "FP next appointment", date: string }>`. Only non-blank dates, in that order.
- `followUpDateWarnings(enteredDate, suggestions): string[]`. For each suggestion whose date differs from a non-blank `enteredDate`, returns `` `The follow-up date differs from the ${source} (${date}).` ``. These are warnings: never blocking, never merged into errors.
- `referralItemCount({ referToRhu, monitoringReferralIds }): number`.
- `referralNeedsAcknowledgment({ count, multipleIssues }): boolean`. `count >= 2 || multipleIssues === true`.
- `nextActionErrors({ state, followUp: { date, reason }, referral: { reason }, reasonExempt, acknowledged, count, multipleIssues }): Record<string, string>`. Keys and exact messages:

| Key | Message |
|---|---|
| `followUpDate` | "Set the follow-up date." |
| `followUpReason` | "Follow-up reason is required." (not when `reasonExempt`) |
| `reasonForReferral` | "Reason for referral is required." |
| `referralAcknowledged` | the existing acknowledgment message from `sharedAcknowledgmentErrors` |

- `nextActionsPayload(state, { followUp, monitoringReferralIds }): { needs_referral: boolean, care_plan: { bhc_follow_up, refer_to_rhu, referral_multiple_issues }, monitoring_data: { followUpStatus, followUpDate, followUpTime, followUpReason } }`.
  - `needs_referral = referToRhu || monitoringReferralIds.length > 0`.
  - With the follow-up unticked, the follow-up fields are `""` and `followUpStatus` is `""`, so the workspace keeps its existing default.
  - The caller never sends `referral` when `needs_referral` is false.
- `nextActionsDraft(state): { bhcFollowUp, referToRhu, referralMultipleIssues }`.
- `restoreNextActions(draftCarePlan): State`. Restores the three booleans; any missing or non-boolean value becomes false.
- `nextStepsReviewRows({ state, followUp, referral, coverage, entries, continuedLink }): Array<{ label, value }>`. Omits empty rows.
  - Labels: "BHC Follow-up", "RHU Referral", "Covers", "Reporting", "Completes follow-up".
  - "Reporting" has one value line per entry: `name — formatEntryDestinations`.

- [ ] **Step 1: Write failing tests.** Each assertion uses the exact values above:
  - `initialNextActions()` is all false;
  - an EPI visit with suggestion `"2026-11-07"` and the follow-up unticked → the payload `monitoring_data.followUpDate === ""` and `followUpStatus === ""` (Review Focus 1);
  - `restoreNextActions({bhcFollowUp:true})` → ticked; `restoreNextActions({})` → all false;
  - `serviceDateSuggestions` drops blanks and keeps the order;
  - `followUpDateWarnings("2026-10-20", [{source:"EPI next dose", date:"2026-11-07"}])` → `["The follow-up date differs from the EPI next dose (2026-11-07)."]`; equal date → `[]`; blank entered date → `[]`;
  - `nextActionErrors` never contains a warning key;
  - H6: Maternal selected, ticked, no reason → no `followUpReason` error but a `followUpDate` error when blank;
  - general visit, ticked, no reason → `followUpReason` error;
  - count and acknowledgment: refer only → 1, false; refer + 1 monitoring → 2, true; refer + multipleIssues → true;
  - payload with Refer unticked → `needs_referral:false` and `refer_to_rhu:false`, while the state still holds `referToRhu` history (Review Focus 2);
  - both ticked → the payload has `bhc_follow_up:true` and `needs_referral:true`;
  - review rows omit unticked sections.
- [ ] **Step 2:** Run `node --test src/utils/nextActions.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Pure functions only, with no React imports.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(consultation): next-actions state helpers for independent follow-up and referral`.

---

### Task 8: Four-step UI and step 3 component

**Files:**
- Move: `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx` → `NextStepsSection.jsx` (`git mv`, then edit)
- Create: `frontend/src/components/features/health-records/wizard/ReportingEntriesField.jsx`
- Modify: `frontend/src/utils/consultationSteps.js` and its test (labels and doc comment)
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Delete only if no importer remains after this task (check with grep): `DiagnosisListField.jsx`, `DiagnosisReportingField.jsx`, `utils/concernRows.js` and its test. Legacy readers in `carePlan.js` and `recordCarePlan.js` stay.

**Interfaces:**
- Consumes: Task 6 (`reportingEntries`) and Task 7 (`nextActions`).
- `ReportingEntriesField({ entries, errors, disabled, onChange(entries) })`. Renders the Reporting section with the exact copy from the Global Constraints.
- `NextStepsSection` props:
  - Kept from CarePlanSection: `continuedMonitorings`, `startingConditions`, `stops`, `referralFacilityField`, `errors`, `disabled`, the monitoring callbacks, and `monitoringNotes` with `onMonitoringNotesChange`.
  - New: `nextActions`, `onFollowUpCheckedChange(checked)`, `onReferCheckedChange(checked)`, `onMultipleIssuesChange(checked)`, `followUp {date,time,reason}`, `onFollowUpChange`, `followUpHint`, `suggestions` (from `serviceDateSuggestions`), `onUseSuggestedDate(date)` (fills the date only), `warnings` (from `followUpDateWarnings`, shown non-blocking), `referral {reason, urgencyLevel}`, `onReferralChange`, `coverage`, `acknowledgmentRequired`, `referralAcknowledged`, `onAcknowledgeChange(checked)`, `treatmentSlot` (ReactNode: Actions Taken + FP supplies + dispensed medicines, rendered by the workspace), and `reportingSlot` (ReactNode).
  - Removed: `concerns`, `onCarePlanChange`, `onBhcFollowUpChange`, `followUpAcknowledged`, and the concern rows.
  - Internal `ReferralFields`, `FollowUpFields`, `Covers`, `Acknowledgment` and `StopReason` are reused.

**Section order** (spec C3): Existing monitoring (only when `continuedMonitorings` or `startingConditions` is non-empty, with Additional Clinical Notes inside it) → Actions Taken / Treatment slot → Next Actions → Reporting slot. Sections are separated by thin rules, and each sub-form is indented with a left border (`border-l border-[#E5E7EB] pl-3`). There are no nested cards.

**Workspace changes:**
- **Steps:** `buildConsultationSteps` labels become "Physical Examination", "Medication, Treatment & Next Steps" and "Review & Finalize". The keys are unchanged.
- **Interview:** the Chief Complaint helper text; HPI is labeled "(optional)".
- **Physical Examination step:** remove the Assessment `FormSection`. Move the Actions Taken, FP Medicines and Dispensed `FormSection` contents into `treatmentSlot`, with the same handlers and the same `items.dispense` gate.
- **State:**
  - `reportingEntries` (array) replaces `diagnoses`, `concernRows` and `assessmentNotes` for input.
  - `nextActions` state comes from `initialNextActions()`.
  - The `assessmentNotes` state is kept read-only, for the converted-draft text.
  - Remove the per-concern acknowledgment state.
- **No auto-tick:** nothing ticks `bhcFollowUp` except the checkbox and draft restore.
  - For v2, remove the effect that forces `followUpStatus` from `followUpDate` (around `ConsultationWorkspace.jsx:1303-1306`). The status now comes from `nextActionsPayload`.
  - The v2 payload must not use the legacy `followUpDate || immunizationNextScheduleDate` fallback. Service dates stay in `immunization_data` and `family_planning_data` only.
- **Referral reason:** call `buildReferralReason([], continuedMonitorings, monitoringReferrals)` together with `shouldRegenerateReferralReason`, so only a monitoring referral prefills. A general referral is never prefilled from the Chief Complaint or HPI.
- **Validation:** replace the concern and duplicate checks for the next step with `nextActionErrors(...)` merged with `reportingEntryErrors(...)`. Remove the frontend "A health concern is required…" rule.
- **Payload (`handleSubmit`):**
  - add `consultation_workflow: BHC_GENERAL_V2`;
  - `diagnoses: reportingEntryPayload(reportingEntries)`;
  - omit `diagnosis`;
  - merge `nextActionsPayload(...)` into `needs_referral`, `care_plan` (alongside `buildCarePlanPayload`, with `shared_referral_acknowledged`) and `monitoring_data`;
  - `referral` only when `needs_referral`;
  - `assessment_notes` = the converted-draft text, if any.
- **Draft payload:** `consultationWorkflow`, `diagnoses` (reporting entries with `reportIn`), and `carePlan: { ...carePlanDraftPayload(...), ...nextActionsDraft(nextActions) }`. Hidden follow-up and referral values stay in the draft.

- [ ] **Step 1:** Update `consultationSteps.test.js` with the new labels. Run `npm run test:consultation-steps` → FAIL.
- [ ] **Step 2:** Implement the step-label change → PASS.
- [ ] **Step 3:** `git mv` and edit `NextStepsSection`, and create `ReportingEntriesField`.
- [ ] **Step 4:** Make the workspace changes listed above.
- [ ] **Step 5:** Grep for importers of `DiagnosisListField`, `DiagnosisReportingField` and `concernRows`, and delete only those files with no importers. Remove their tests from `package.json` scripts.
- [ ] **Step 6:** Run `node --test`, `npm run lint` and `npm run build`. Expected: PASS, with lint errors 0 (only the one pre-existing warning) and no new failing names compared to Task 0.
- [ ] **Step 7:** Commit with `feat(consultation): four-step BHC General Consultation with Medication, Treatment & Next Steps`.

---

### Task 9: Legacy draft conversion

**Files:**
- Create: `frontend/src/utils/draftConversion.js` and `frontend/src/utils/draftConversion.test.js`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (the restore path near the current `restoreDiagnoses` / `applyLegacyReportingStatus` calls)
- Modify: `frontend/package.json` (add it to `test:saved-drafts`)

**Interfaces (produces):**
- `isLegacyDraftPayload(payload): boolean`. True when `payload.consultationWorkflow !== "bhc_general_v2"`.
- `convertLegacyDraft(payload): payload`. Returns a v2 payload:
  - `consultationWorkflow: "bhc_general_v2"`.
  - `diagnoses`: legacy entries that have a destination (`entryDestinations` of a legacy entry, after `applyLegacyReportingStatus` with the draft's `morbidityReportingStatus`) become `{ id, name, reportIn }`. They have no `carePlan` or `bhcFollowUp`.
  - `assessmentNotes`: built from up to three parts, joined with `"\n"`, or `""` when all are empty:
    - `"Earlier draft — Health concerns: " + names.join("; ")`, for concerns with no destination;
    - the old `assessmentNotes`;
    - when there was no continued or starting monitoring in `carePlan`, `"Earlier draft — Additional clinical notes: " + monitoringNotes`. In that case `monitoringNotes` becomes `""`.
  - `carePlan`: the existing monitoring keys are kept, plus:
    - `bhcFollowUp`: any concern with `follow_up` or `recheck`, any refer concern with `bhcFollowUp === true`, or a non-empty `followUpDate`;
    - `referToRhu`: any concern with `refer` or `monitor_refer`, or `needsReferral === true`;
    - `referralMultipleIssues`: false.
  - `diagnosis: ""`. The visit text is never sent in v2. The names are already preserved in `assessmentNotes` or in the entries.
  - Every other key is unchanged, including the referral form, `followUpDate`, `followUpTime` and `followUpReason`.
- The converted text is shown read-only under "Earlier draft notes" in step 3 and in Review. It is not editable, and it is sent as `assessment_notes`.

- [ ] **Step 1: Write failing tests.**
  - A legacy draft with concerns `[{name:"Cough", carePlan:"refer", reportAs:null}, {name:"Dengue", carePlan:"none", reportAs:"notifiable", includeInSurveillance:true}]`, plus `assessmentNotes: "Looks pale"`, plus a referral form. Expect:
    - `diagnoses` equals `[{id, name:"Dengue", reportIn:["notifiable","surveillance"]}]`;
    - `assessmentNotes === "Earlier draft — Health concerns: Cough\nLooks pale"`;
    - `carePlan.referToRhu === true`;
    - the referral form is unchanged;
    - no `carePlan` key on any entry;
    - `consultationWorkflow === "bhc_general_v2"`.
  - `recheck` → `bhcFollowUp: true`.
  - `monitoringNotes` without monitoring is moved into `assessmentNotes`.
  - `monitoringNotes` with monitoring is kept.
  - A v2 payload is returned unchanged (same reference) and `isLegacyDraftPayload` is false.
  - A pre-per-diagnosis draft with `morbidityReportingStatus: "morbidity"` and diagnoses with no `reportAs` → each named entry gets `reportIn:["morbidity"]`.
- [ ] **Step 2:** Run `node --test src/utils/draftConversion.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. In the workspace restore path, call `convertLegacyDraft` first, then `restoreNextActions(payload.carePlan)`, then set the state.
- [ ] **Step 4:** Run `node --test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(drafts): convert legacy consultation drafts to the v2 model without losing entered text`.

---

### Task 10: Review & Finalize

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (review section builder near the current `carePlanReviewRows` usage)

- [ ] **Step 1:** Add a `nextStepsReviewRows` test case to `nextActions.test.js` for a converted draft: an "Earlier draft notes" row appears when `assessmentNotes` is non-empty. Extend the signature with `earlierDraftNotes`. Run it → FAIL, implement, → PASS.
- [ ] **Step 2: Rebuild the review groups.**
  - **Patient Interview:** CC, HPI, Background updates, services.
  - **Physical Examination:** vitals, findings, body map.
  - **Medication, Treatment & Next Steps:** Actions Taken, supplies and medicines, monitoring with notes, then `nextStepsReviewRows(...)`.
  - Remove the per-concern and `carePlanReviewRows` concern rows for v2. Rows with no value are omitted.
- [ ] **Step 3:** Run `node --test`, `npm run lint` and `npm run build`. Expected: PASS.
- [ ] **Step 4:** Commit with `feat(consultation): compact v2 Review & Finalize`.

---

### Task 11: History views

**Files:**
- Modify: `frontend/src/components/features/health-records/HealthRecordClinicalDetails.jsx`
- Modify: `frontend/src/components/features/health-records/BhcConsultationDetails.jsx`
- Modify: `frontend/src/pages/rhu/RHUHealthRecords.jsx`
- Modify: `frontend/src/components/features/health-records/FollowUpEpisodePanel.jsx`
- Modify: `frontend/src/pages/bhc/CreateReferral.jsx`

**Interfaces:** consumes `isBhcGeneralV2`, `visitAssessmentDisplay`, `entryDestinations` and `formatEntryDestinations` (Task 6).

- [ ] **Step 1: Branch each view.**
  - Every place that renders the visit `diagnosis` uses `visitAssessmentDisplay(record)`, so its label comes from the helper.
  - When `isBhcGeneralV2(record)`:
    - render a "Reporting" block (name — destinations) in place of "Health Concerns" and the per-concern actions;
    - show the follow-up and referral from `monitoring_data` and `referral_data` as today.
  - Legacy records render exactly as before, including `diagnosisCarePlanItems` and Assessment Notes.
  - The ITR / CreateReferral prefill uses `visitAssessmentDisplay`. A v2 referral is labeled "Chief Complaint".
- [ ] **Step 2:** Add a `consultationWorkflow.test.js` case for a record that holds both an RHU diagnosis and the v2 marker: `visitAssessmentDisplay` returns the stored diagnosis under "Diagnosis". An RHU-entered diagnosis is never replaced.
- [ ] **Step 3:** Run `node --test`, `npm run lint` and `npm run build`. Expected: PASS.
- [ ] **Step 4:** Commit with `feat(records): v2 history views with Reporting block and Chief Complaint fallback`.

---

### Task 12: Full verification and responsive check

- [ ] **Step 1: Backend.** Run the full suite with junit and diff the failing names against Task 0. Expected: no new name. Record the result in `test-baseline-2026-10-10.md` under "After".
- [ ] **Step 2: Frontend.** Run `node --test`, `npm run lint` and `npm run build`, and record the counts.
- [ ] **Step 3: Responsive check.** Run `npm run dev` with a throwaway harness route or stubbed data, as the revision branch did. Take screenshots of step 3 with nothing ticked, with follow-up ticked, with both ticked plus two reporting entries, and of Review, at 1366×768 and 390×844.
  - Check: no horizontal scroll, the services sidebar on the right at 1366, stacked on mobile, and no nested cards.
  - Label these results **harness only**.
- [ ] **Step 4:** Commit with `docs: post-implementation test results for consultation simplification`.

---

### Task 13: Manual QA, compatibility checks, handoff

- [ ] **Step 1: Manual QA** of the 15 scenarios in spec F4, at 1366×768 and on mobile, with dedicated BHC and RHU **test** accounts and synthetic patients. If no authenticated session is available, mark every scenario **UNVERIFIED**.
- [ ] **Step 2: Staging compatibility checks** (spec G3):
  - old frontend → new backend (legacy payload);
  - new frontend → new backend (v2);
  - resuming a legacy draft and a v2 draft;
  - an RHU record save;
  - the re-sync over v2 records with follow-up, with referral and with both;
  - the report readers over v2, legacy and HFMD records.
- [ ] **Step 3: Rollback evidence.** If staging is available, run the `care-plan-workflow-revision` backend against a copy of the staging database that holds v2 test records. Record whether the re-sync cancels the follow-up tasks of v2 records with both a follow-up and a referral, and how v2 entries are displayed. Without staging, record **UNVERIFIED** and leave backend rollback documented as **unsafe** once v2 records exist.
- [ ] **Step 4: Update `docs/ai/CURRENT.md`.**
  - Last task, changes made, tests by name, and baseline.
  - The deploy order (G2), rollback and recovery (G3), and the B7 retirement checklist. B7 replaces the old release-2 section; mark that one superseded.
  - Open risks, and the remaining **[Validate with RHU/MHO]** questions:
    - the referral multiple-issues wording;
    - whether a Maternal or FP visit should auto-require a return;
    - the Signs & Symptoms rule (spec H).
- [ ] **Step 5:** Write the final delivery report (spec I) in chat. It covers files changed, new and updated tests, results by name, baseline failures, migration verification, manual QA (with UNVERIFIED marked), limitations and clinical questions.
- [ ] **Step 6:** Commit with `docs: handoff for BHC general consultation simplification`.
