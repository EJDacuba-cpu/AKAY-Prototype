# Consultation & Care Plan Workflow Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Recheck/Follow-up with explicit per-concern actions (No Further BHC Action / Schedule BHC Follow-up / Refer to RHU, plus an opt-in BHC follow-up on a referral). Move the shared follow-up and referral into sections after the concern cards. Enforce the reason and shared-referral rules on the server. Separate legacy monitoring (pending RHU verification, reconciled by the RHU). Make the Start Consultation modal an explicit General / Existing Monitoring choice that can link pending follow-ups.

**Architecture:** An incremental refactor of the existing consultation module with no migrations. The backend ships first (release 1) and accepts both the old and new payloads. The frontend follows. Release 2 removes the transition acceptance once the checks in Task 11 pass.

**Tech Stack:** Laravel (PHPUnit feature/unit tests, `php artisan test`), React 19 + Vite + Tailwind v4, TanStack Query, `node --test` for frontend utils.

**Spec:** `docs/superpowers/specs/2026-10-09-consultation-care-plan-workflow-revision-design.md` (revision 2 + section H final decisions)

## Global Constraints

- No database migrations. JSON keys and existing nullable columns only.
- Deploy order: backend (Tasks 1–3) before any frontend task. Release 2 (Task 11) only after its gate checks.
- Stored values stay readable forever: `none`, `recheck`, `follow_up`, `refer`, `monitor`, `monitor_refer`. **`recheck` always counts as keeping a BHC follow-up** (the background re-sync in `FollowUpTaskSyncService::syncEligibleRecordsForUser` depends on it).
- Labels (exact): `No Further BHC Action`, `Schedule BHC Follow-up`, `Refer to RHU`, historical `Recheck`, refer + flag `Refer to RHU · BHC follow-up`, legacy `Legacy — Pending RHU Verification`.
- Messages (exact, same text front and back):
  - `Set the follow-up date for the concerns that schedule a BHC follow-up.`
  - `Follow-up reason is required.`
  - `Choose a care plan action for this health concern.`
  - `Confirm that all listed concerns can go to this facility with this priority, or change the care plan.`
  - `This monitoring is pending RHU verification and cannot be continued.`
  - Release 2: `Recheck is no longer offered. Choose Schedule BHC Follow-up and describe the purpose in Follow-up Reason.`
- Never write `patient_conditions` from a BHC save. Never auto-create a follow-up or referral from an action other than the one chosen.
- New rules apply to POST (create) only. Records are immutable after save, and PUT and read paths accept every stored value.
- UI: compact white cards with one thin border and no tinted panels except warnings and errors. It must be readable at 1366×768.
- Backend test files follow the passing `HealthConcernBoundaryTest` / `RhuConditionConfirmationTest` setup. The `store()`-seam suites listed in CURRENT.md are pre-existing failures and prove nothing.

## Review Focus

1. **Changing a concern's action away from Refer while the BHC follow-up box is ticked.** The flag must be dropped (a later Refer must not resurrect it) → Task 4 test `withCarePlan drops bhcFollowUp unless refer`.
2. **An old open tab, or a restored draft, still sending `recheck` or a null action after the frontend deploy.** It must save in release 1, and the restored draft must show Schedule BHC Follow-up with a prefilled reason → Task 1 test `test_transition_recheck_post_saves_as_follow_up_with_prefix` and Task 4 test `migrateLegacyConcernPlans maps recheck and prefills the reason`.
3. **A referral covering one concern plus one referred monitored condition.** That is 2 items, so acknowledgment is required. A referral with one item must not require it → Task 2 tests `test_one_item_referral_needs_no_acknowledgment` and `test_concern_plus_monitoring_referral_needs_acknowledgment`.
4. **A Record Visit task whose only linked condition is legacy.** The task must still be continued and fulfilled on save, with the legacy row not continued → Task 7 test `resolveContinuedCare continues a task but skips its legacy conditions`.
5. **The RHU discontinues and confirms the same legacy identity in one submission.** Discontinue runs first, so the stopped row is never linked → Task 3 test `test_discontinue_runs_before_confirm_so_the_row_is_not_linked`.

---

## File Structure

| File | Responsibility (change) |
|---|---|
| `backend/app/Services/CarePlan.php` | Action constants, `schedulesBhcFollowUp`, transition normalization |
| `backend/app/Http/Requests/HealthRecordRequest.php` | Rules: `bhcFollowUp`, reason (H6), shared-referral acknowledgment (H7), legacy discontinuations, release-2 rules |
| `backend/app/Http/Controllers/Api/HealthRecordController.php` | Calls normalization, H7 audit, legacy discontinuations on RHU records |
| `backend/app/Services/ConditionMonitoringService.php` | `lockContinued` rejects legacy |
| `backend/app/Services/LegacyMonitoringReview.php` (**create**) | RHU discontinuation of legacy monitoring and its audit |
| `backend/app/Services/PatientConditions.php` | Audit when a confirmation links a legacy row |
| `backend/app/Http/Requests/FeedbackRequest.php`, `FeedbackController.php`, `Services/ReferralWorkflowService.php` | Feedback path for discontinuations |
| `backend/app/Services/HealthRecordDraftPayloadService.php` | Allow `diagnoses.*.bhcFollowUp` |
| `frontend/src/utils/carePlan.js` | Action model, entry-based helpers, validation, legacy migration |
| `frontend/src/utils/diagnoses.js` | Keep `bhcFollowUp` through normalization |
| `frontend/src/utils/carePlanWorkspace.js` | Coverage, follow-up errors, acknowledgment errors, review rows |
| `frontend/src/utils/recordCarePlan.js` | Read-back labels and heading |
| `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx` | Cards and shared sections |
| `frontend/src/components/features/health-records/wizard/FollowUpVisitLine.jsx` (**create**) | Linked follow-up line with Remove link |
| `frontend/src/pages/bhc/ConsultationWorkspace.jsx` | Wiring: handlers, validation, payload, line |
| `frontend/src/utils/startConsultation.js`, `utils/continuedCare.js`, `services/startConsultationService.js`, `hooks/usePatientConsultation.js` | Modal options, legacy filtering, follow-up ids |
| `frontend/src/components/features/patients/profile/StartConsultationModal.jsx` | Visit type, scheduled follow-ups, pending verification |
| `frontend/src/components/features/patients/MedicalConditionsGroups.jsx` | Legacy label |
| `frontend/src/components/features/conditions/ConfirmConditionsBlock.jsx`, `utils/conditionConfirmations.js`, `services/referrals.js`, `services/healthRecordService.js`, `pages/rhu/FeedbackReturnSlip.jsx`, `pages/rhu/RHUAddHealthRecords.jsx` | RHU legacy review |

Commands (run from `backend/` or `frontend/`):
- Backend: `php artisan test --filter=<Class>`
- Frontend util: `node --test src/utils/<file>.test.js`
- Frontend gate: `npx eslint .` (1 known warning in `RHUAddHealthRecords.jsx`) and `npx vite build`

---

### Task 0: Baseline

**Files:** none changed except the commit of pending work.

- [ ] **Step 1: Settle uncommitted work.** `git status` shows the 2026-10-09 compact-card changes (`CarePlanSection.jsx`, `ReferralFacilityField.jsx`) and WIP (`DiagnosisListField.jsx`, `DiagnosisReportingField.jsx`, `ConsultationWorkspace.jsx`, `carePlanWorkspace.js(+test)`, `concernRows.js(+test)`, `package.json`). **Ask the developer** whether to commit them as-is before starting. Do not discard anything.
- [ ] **Step 2: Record the frontend baseline.** Run `node --test src/utils/*.test.js`, then `npx eslint .`, then `npx vite build`. Write the pass counts into the task log.
- [ ] **Step 3: Record the backend baseline.** Run `php artisan test` and save the failing test names to `.superpowers/sdd/2026-10-10-care-plan-revision/baseline-failures.txt`. The expected count is about 194. Later tasks must add **0 new failing names**.
- [ ] **Step 4: Create the branch.** `git switch -c care-plan-workflow-revision` from the current branch.

---

### Task 1: Backend action values, H5 flag, H6 reason, transition (release 1)

**Files:**
- Modify: `backend/app/Services/CarePlan.php`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (`diagnoses.*` rules ~293–318; concern-date block ~481–503)
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (`store` ~162–173; `requireConcernFollowUp` ~735)
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php:45-51`
- Test: `backend/tests/Unit/Services/CarePlanTest.php`, `backend/tests/Feature/HealthConcernBoundaryTest.php`, `backend/tests/Feature/CarePlanValidationTest.php`, `backend/tests/Feature/CarePlanReferralFollowUpTest.php`

**Interfaces:**
- Produces (PHP, `App\Services\CarePlan`):
  - `SELECTABLE = [NONE, FOLLOW_UP, REFER]`
  - `TRANSITION_ACCEPTED = [RECHECK]`
  - `VALUES` unchanged
  - `keepsBhcFollowUp(?string $value): bool` stays value-based (`follow_up|recheck`)
  - **new** `schedulesBhcFollowUp(mixed $diagnosis): bool` = `keepsBhcFollowUp(carePlan)` OR (`refers(carePlan)` AND `bhcFollowUp === true`)
  - **new** `normalizeTransitionValues(array $diagnoses): array` maps `recheck` → `follow_up` and keeps every other key
  - `keepsFollowUpWithReferral` uses `schedulesBhcFollowUp` (plus `monitors`, as today)
- Produces (API): `diagnoses.*.bhcFollowUp` (nullable boolean, kept only with `refer`; stripped otherwise in the controller). Reason rule on POST.

- [ ] **Step 1: Write failing unit tests in `CarePlanTest`.**
  - `test_selectable_actions_are_none_follow_up_refer`: `assertSame(['none','follow_up','refer'], CarePlan::SELECTABLE)`.
  - `test_recheck_still_keeps_a_bhc_follow_up_for_stored_records`: `assertTrue(CarePlan::keepsBhcFollowUp('recheck'))`.
  - `test_schedules_bhc_follow_up_for_follow_up_and_flagged_refer_only`:
    - true for `['carePlan'=>'follow_up']`, `['carePlan'=>'refer','bhcFollowUp'=>true]` and `['carePlan'=>'recheck']`;
    - false for `['carePlan'=>'refer']`, `['carePlan'=>'none']`, `['carePlan'=>'none','bhcFollowUp'=>true]` and `'junk'`.
  - `test_normalize_transition_values_maps_recheck_and_keeps_keys`: `[['id'=>'d1','name'=>'BP','carePlan'=>'recheck','reportAs'=>'morbidity']]` becomes the same entry with `carePlan` `follow_up`.
  - `test_flagged_referral_keeps_the_follow_up`: `keepsFollowUpWithReferral([['name'=>'Cough','carePlan'=>'refer','bhcFollowUp'=>true]], [])` is true; without the flag, false.

- [ ] **Step 2: Run** `php artisan test --filter=CarePlanTest`. Expected: FAIL (SELECTABLE mismatch, undefined methods).

- [ ] **Step 3: Implement the `CarePlan` changes** listed under Interfaces. Update the class docblock to point at the new spec.

- [ ] **Step 4: Run** `php artisan test --filter=CarePlanTest`. Expected: PASS.

- [ ] **Step 5: Write failing feature tests in `HealthConcernBoundaryTest`.** Reuse its `save` / `followUp` / `referral` helpers.
  - `test_none_action_saves_with_no_task_and_no_referral`: `save([['id'=>'d1','name'=>'Cough','carePlan'=>'none']])` returns 201. Stored `diagnoses.0.carePlan === 'none'`. `FollowUpTask::count() === 0` and `Referral::count() === 0`.
  - `test_follow_up_requires_a_reason`: `save([[...'carePlan'=>'follow_up']], followUp())` returns 422 with `monitoring_data.followUpReason => ['Follow-up reason is required.']`. With `followUp(['followUpReason'=>'Reassess wound'])` it returns 201 and creates one task.
  - `test_flagged_referral_keeps_its_follow_up_and_needs_date_and_reason`: `[['id'=>'d1','name'=>'Cough','carePlan'=>'refer','bhcFollowUp'=>true]]` with `referral()`:
    - no date → 422 `monitoring_data.followUpDate => ['Set the follow-up date for the concerns that schedule a BHC follow-up.']`;
    - with date and reason → 201, one referral, one pending task, stored `diagnoses.0.bhcFollowUp === true`.
  - `test_unflagged_referral_clears_the_follow_up`: refer without the flag and with a date → 201, stored `monitoring_data.followUpDate === null`, 0 tasks.
  - `test_bhc_follow_up_flag_is_dropped_unless_refer`: `[['carePlan'=>'none','bhcFollowUp'=>true]]` → 201 and the stored entry has no `bhcFollowUp` key.
  - `test_transition_recheck_post_saves_as_follow_up_with_prefix`: `[['name'=>'Elevated BP','carePlan'=>'recheck']]` with `followUp()` and no typed reason → 201. Stored `carePlan === 'follow_up'`, and the pending follow-up reason is `'Recheck: Elevated BP'`. The prefix satisfies H6.
  - `test_service_visit_follow_up_stays_exempt_from_the_reason`: no concern actions, `monitoring_data.selectedPrograms=['Immunization']` plus a date and no reason → 201.
  - Update the existing tests that assert the old message text or `recheck` round-trips (`test_recheck_and_follow_up_need_the_follow_up_date`, `test_recheck_reason_*`, the `CarePlanValidationTest` and `CarePlanReferralFollowUpTest` `recheck` cases). They should now expect the new message and the stored `follow_up`, and send a reason where H6 requires one.

- [ ] **Step 6: Run** `php artisan test --filter="HealthConcernBoundaryTest|CarePlanValidationTest|CarePlanReferralFollowUpTest"`. Expected: the new tests FAIL.

- [ ] **Step 7: Implement the request rules.**
  - The `diagnoses.*.carePlan` POST list is `[...SELECTABLE, ...TRANSITION_ACCEPTED]`.
  - Add `'diagnoses.*.bhcFollowUp' => ['nullable','boolean']`.
  - The concern-date check uses `CarePlan::schedulesBhcFollowUp` and the new date message.
  - Add the H6 check on POST: some entry schedules a BHC follow-up, AND `trim(monitoring_data.followUpReason) === ''`, AND no entry has `carePlan === 'recheck'` → error `monitoring_data.followUpReason` `Follow-up reason is required.`
  - The service-visit path is untouched.

- [ ] **Step 8: Implement the controller changes.**
  - In `store`, after `applyRecheckReason($data)`, call `$data['diagnoses'] = CarePlan::normalizeTransitionValues(...)`.
  - In the same pass, strip `bhcFollowUp` from entries whose `carePlan` is not `refer` (use `Arr::except`).
  - `requireConcernFollowUp` uses `schedulesBhcFollowUp`.
  - Order matters: `isReferralDisposition` / `requireConcernFollowUp` read `recheck` as follow-up-keeping, so normalization may come after them.

- [ ] **Step 9: Draft schema.** Add `'bhcFollowUp' => self::SCALAR` to the `diagnoses` schema in `HealthRecordDraftPayloadService`. Add a test to the existing draft payload test class (find it with `grep -l "sanitize" tests`): `test_draft_keeps_bhc_follow_up_flag`, which round-trips `diagnoses.0.bhcFollowUp === true`.

- [ ] **Step 10: Run** the three feature classes, `CarePlanTest` and the draft test class. Expected: PASS. Then run the full `php artisan test` and diff the failing names against the baseline. Expected: 0 new.

- [ ] **Step 11: Commit** `feat(care-plan): explicit actions, referral BHC follow-up flag, required reason (release 1)`.

---

### Task 2: Server-enforced shared-referral acknowledgment (H7) and legacy continue guard (H3)

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (`care_plan.*` rules; referral after-validation block ~470–480)
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (after the referral is created or held, ~286–307)
- Modify: `backend/app/Services/ConditionMonitoringService.php:43-51` (`lockContinued`)
- Test: `backend/tests/Feature/SharedReferralAcknowledgmentTest.php` (**create**, setup copied from `HealthConcernBoundaryTest`), `backend/tests/Feature/MonitoringStartTest.php`

**Interfaces:**
- Produces (API): `care_plan.shared_referral_acknowledged` (nullable boolean, POST).
- Produces (PHP): `CarePlan::referralItemCount(array $diagnoses, array $monitoringReferralIds): int` = the count of `refers()` entries + `count(array_unique($monitoringReferralIds))`.
- Audit row: `action='acknowledged'`, `module='referrals'`, description `Shared referral acknowledged for health record {id}: {n} items ({names joined "; "}). Not a clinical compatibility check.`

- [ ] **Step 1: Write failing tests** in `SharedReferralAcknowledgmentTest`:
  - `test_one_item_referral_needs_no_acknowledgment`: one Refer concern + referral → 201 and no `acknowledged` audit row.
  - `test_two_referred_concerns_need_acknowledgment`: two Refer concerns without the flag → 422 `care_plan.shared_referral_acknowledged => ['Confirm that all listed concerns can go to this facility with this priority, or change the care plan.']`. With `care_plan.shared_referral_acknowledged=true` → 201, exactly one referral, and one `AuditLog` row with `module='referrals'`, `action='acknowledged'`, a description containing both names, and `user_id` set to the BHW.
  - `test_concern_plus_monitoring_referral_needs_acknowledgment`: one Refer concern + `care_plan.continued_monitoring_ids=[m]` + `care_plan.monitoring_referrals=[m]` (an RHU-confirmed monitoring created as in `MonitoringStartTest`) → 422 without the acknowledgment.
  - `test_blocked_referral_hold_is_still_audited`: two Refer concerns, acknowledged, no provider available (set up as in `ReferralSubmissionGate` tests) → 201 with a hold and the audit row present.
- [ ] **Step 2: Write a failing test** in `MonitoringStartTest`: `test_legacy_monitoring_cannot_be_continued`. A `ConditionMonitoring` with `patient_condition_id = null` and `status = active`, sent in `care_plan.continued_monitoring_ids` → 422 `care_plan.continued_monitoring_ids.0 => ['This monitoring is pending RHU verification and cannot be continued.']`. The same save without that id, but with a referral → 201 (General Consultation and referral are not blocked).
- [ ] **Step 3: Run** `php artisan test --filter="SharedReferralAcknowledgmentTest|MonitoringStartTest"`. Expected: FAIL.
- [ ] **Step 4: Implement** `CarePlan::referralItemCount`; the request rule plus the after-validation check (only when the visit needs a referral and the count is ≥ 2); the controller audit via the injected `AuditLogger` once the referral or hold exists; and the `lockContinued` legacy check (`$monitoring->isLegacy()`) with the exact message.
- [ ] **Step 5: Run** the same filter. Expected: PASS. Run the full suite. Expected: 0 new failing names.
- [ ] **Step 6: Commit** `feat(care-plan): server-enforced shared referral acknowledgment; legacy monitoring cannot be continued`.

---

### Task 3: RHU legacy monitoring review (H3 backend)

**Files:**
- Create: `backend/app/Services/LegacyMonitoringReview.php`
- Modify: `backend/app/Services/PatientConditions.php` (constructor, `apply` signature, `set` lines 159–165)
- Modify: `backend/app/Http/Requests/FeedbackRequest.php`, `backend/app/Http/Controllers/Api/FeedbackController.php:42-46`, `backend/app/Services/ReferralWorkflowService.php:106-151`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (next to `PatientConditions::rules()` ~329), `backend/app/Http/Controllers/Api/HealthRecordController.php` (~119–123, ~254–262)
- Test: `backend/tests/Feature/LegacyMonitoringReviewTest.php` (**create**, setup copied from `RhuConditionConfirmationTest`)

**Interfaces:**
- Produces (PHP, `App\Services\LegacyMonitoringReview`):
  - `public static function rules(string $prefix = 'legacy_monitoring_discontinuations'): array` → `[$prefix => ['nullable','array','max:20'], "$prefix.*.monitoring_id" => ['required','integer','distinct'], "$prefix.*.reason" => ['required','string','max:500','regex:/\S/']]`
  - `public function discontinue(Request $request, Patient $patient, array $items, string $sourceType, int $sourceId, ?int $healthRecordId, string $prefix = 'legacy_monitoring_discontinuations'): Collection`. It locks the rows in id order and requires each to be same patient, active, and `isLegacy()`, else a `ValidationException` on `"$prefix.$i.monitoring_id"` with `This monitoring is not a legacy monitoring pending RHU verification for this patient.` It then sets `status=stopped`, `stopped_at=now()`, `stop_reason="RHU review: {reason}"`, `updated_by`, and `stopped_health_record_id=$healthRecordId`. It writes a `condition_monitoring_visits` row (`action=stopped`) **only when** `$healthRecordId !== null`. It writes one audit row per item with `action='discontinued'`, `module='condition_monitorings'` and description `Legacy BHC monitoring {id} ({condition_name}) discontinued by RHU review. Status: active (Legacy — Pending RHU Verification) -> stopped. Reason: {reason}. Source: {sourceType} #{sourceId}.`
- Modifies: `PatientConditions::apply(..., string $prefix = 'condition_confirmations', ?Request $auditRequest = null)`. When `set()` links legacy rows, each linked row is audited with `action='verified'`, `module='condition_monitorings'` and description `Legacy BHC monitoring {id} ({condition_name}) verified by RHU: linked to condition {cid}. Condition status: {from ?? 'none'} -> {to}.`
- API: `legacy_monitoring_discontinuations` on `POST /api/feedback` and on `POST /api/health-records`. BHC users get 403, the same guard as confirmations (`PatientConditions::canConfirm`).
- **Order inside each transaction:** discontinuations **before** confirmations.

- [ ] **Step 1: Write failing tests** in `LegacyMonitoringReviewTest`:
  - `test_feedback_discontinues_a_legacy_monitoring_with_audit`: the stopped row has `stop_reason` starting `RHU review:` and `stopped_health_record_id === null`. No visit row. One `discontinued` audit row by the RHU user whose description contains the name, `active`, `stopped` and the reason.
  - `test_rhu_record_discontinuation_writes_a_visit_row`: `stopped_health_record_id` is the new record id, and one `condition_monitoring_visits` row has `action='stopped'`.
  - `test_confirm_same_identity_links_and_audits_verification`: confirmation `Hypertension` `active` → the legacy row gets `patient_condition_id` and one `verified` audit row is written.
  - `test_discontinue_runs_before_confirm_so_the_row_is_not_linked`: the same row is discontinued and its identity confirmed in one payload → the row is stopped, `patient_condition_id` is null, and the condition is created.
  - `test_discontinuation_needs_a_reason`: a blank reason → 422 `legacy_monitoring_discontinuations.0.reason`.
  - `test_verified_or_other_patients_monitoring_is_rejected`: 422 on `.monitoring_id`.
  - `test_bhc_user_cannot_discontinue`: 403 and the row is unchanged.
  - `test_history_is_kept`: after discontinuing, `started_health_record_id` and earlier visit rows are unchanged, and the row is not deleted.
- [ ] **Step 2: Run** `php artisan test --filter=LegacyMonitoringReviewTest`. Expected: FAIL.
- [ ] **Step 3: Implement** the service, the `PatientConditions` audit hook, the request rules (HealthRecordRequest: POST only, otherwise `prohibited`), the controller guards (403 when the payload is non-empty and `! PatientConditions::canConfirm`), and the wiring in `ReferralWorkflowService::completeWithFeedback` (source `PatientCondition::SOURCE_RHU_FEEDBACK`, feedback id, null record) and `HealthRecordController::store` (source `SOURCE_RHU_RECORD`, record id, record id).
- [ ] **Step 4: Run** `LegacyMonitoringReviewTest` and `RhuConditionConfirmationTest`. Expected: PASS. Run the full suite. Expected: 0 new failing names.
- [ ] **Step 5: Commit** `feat(conditions): RHU review discontinues or verifies legacy monitoring with audit`.

> **Deploy checkpoint A:** backend release 1 (Tasks 1–3) can deploy alone. The old frontend keeps working: it sends `recheck` / `follow_up` / `refer` / `null`, and it never continues legacy rows unless ticked. A ticked legacy row now gets a clear 422 instead of being continued; that is accepted per H3.

---

### Task 4: Frontend action model

**Files:**
- Modify: `frontend/src/utils/carePlan.js`, `frontend/src/utils/diagnoses.js:88-101`, `frontend/src/utils/recordCarePlan.js`, `frontend/src/utils/concernRows.js` (only if `hasCarePlanChoice` needs the flag)
- Test: `frontend/src/utils/carePlan.test.js`, `diagnoses.test.js`, `recordCarePlan.test.js`, `concernRows.test.js`

**Interfaces:**
- Produces (`utils/carePlan.js`):
  - `CARE_PLAN_OPTIONS` = `[{none,'No Further BHC Action'},{follow_up,'Schedule BHC Follow-up'},{refer,'Refer to RHU'}]`
  - `CARE_PLAN_LABELS` adds `none:'No Further BHC Action'`; keeps `recheck:'Recheck'` and the retired labels
  - `carePlanFor(concern)` returns a selectable value or null (`recheck` → null)
  - `schedulesBhcFollowUp(concern): boolean`, mirroring the PHP helper without `recheck`
  - `withCarePlan(concern, value): concern` sets the action and drops `bhcFollowUp` unless `refer`
  - `withBhcFollowUp(concern, checked): concern` (no-op unless `refer`)
  - `validateConcernActions(concerns): { ['carePlanAction.<id>']: 'Choose a care plan action for this health concern.' }`
  - `migrateLegacyConcernPlans(diagnoses, followUpReason): { diagnoses, followUpReason }` maps `recheck`→`follow_up` and, when the reason is empty, sets `Recheck: <names joined "; ">`
  - **remove** `keepsBhcFollowUp` and `recheckReason`; callers move to `schedulesBhcFollowUp`
  - `deriveDisposition().keepsFollowUpWithReferral` uses `schedulesBhcFollowUp`
- Produces: `normalizeDiagnoses` keeps `bhcFollowUp: true` only when `carePlan === 'refer'`.
- Produces (`recordCarePlan.js`): plan label `Refer to RHU · BHC follow-up` for flagged refer. `diagnosisCarePlanHeading` treats only `monitor` / `monitor_refer` as retired.

- [ ] **Step 1: Write failing tests.**
  - `carePlan.test.js`:
    - options are labelled `["No Further BHC Action","Schedule BHC Follow-up","Refer to RHU"]` with values `["none","follow_up","refer"]`;
    - `schedulesBhcFollowUp` truth table (follow_up true, refer+flag true, refer false, none false, recheck false);
    - `withCarePlan drops bhcFollowUp unless refer` (`withCarePlan({carePlan:'refer',bhcFollowUp:true},'none')` has no `bhcFollowUp`, and switching back to `refer` does not restore it);
    - `validateConcernActions` flags a concern with null and with `recheck`;
    - `migrateLegacyConcernPlans maps recheck and prefills the reason` (`[{name:'Elevated BP',carePlan:'recheck'}]` with `''` → `follow_up` and `'Recheck: Elevated BP'`; a typed reason is kept unchanged).
  - `diagnoses.test.js`: `bhcFollowUp` survives on refer and is dropped on follow_up.
  - `recordCarePlan.test.js`:
    - a flagged refer item reads `Refer to RHU · BHC follow-up`;
    - a historical `recheck` reads `Recheck`;
    - a record with `none` only gets the heading `Health Concerns`;
    - a record holding `monitor` gets `Care Plan`.
  - Update the existing assertions that reference Recheck options, `keepsBhcFollowUp` or `recheckReason`.
- [ ] **Step 2: Run** `node --test src/utils/carePlan.test.js src/utils/diagnoses.test.js src/utils/recordCarePlan.test.js src/utils/concernRows.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** the same command. Expected: PASS. (`carePlanWorkspace.test.js` may now fail; Task 5 fixes it.)
- [ ] **Step 5: Commit** `feat(care-plan): explicit concern actions and referral BHC follow-up in the frontend model`.

---

### Task 5: Care Plan shared sections, acknowledgments and workspace wiring

**Files:**
- Modify: `frontend/src/utils/carePlanWorkspace.js` (replace `carePlanFormHosts`; update `carePlanFollowUpErrors`, `FOLLOW_UP_DATE_MESSAGE`, `carePlanReviewRows`)
- Modify: `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (CarePlanSection props ~3734; Continue validation for the Care Plan step; payload ~3137–3212; draft restore ~1718)
- Modify: `frontend/src/utils/carePlan.js` `buildCarePlanPayload` (adds the acknowledgment)
- Test: `frontend/src/utils/carePlanWorkspace.test.js`, `carePlan.test.js`

**Interfaces:**
- Consumes: Task 4 helpers.
- Produces (`carePlanWorkspace.js`):
  - `carePlanCoverage({ concerns, continuedMonitorings, stops, referrals, serviceNextVisitLabel }) → { followUpCovers: string[], referralCovers: string[] }`. Concern entries read `Concern {n} — {name}`. Monitored conditions read `{name} monitoring` for the follow-up and `{name}` for the referral. The service label (e.g. `Prenatal next visit`) is appended when given.
  - `sharedAcknowledgmentErrors({ followUpCovers, referralCovers, followUpAcknowledged, referralAcknowledged })`. It returns `followUpAcknowledged` / `referralAcknowledged` errors only when the matching covers length is ≥ 2 and the box is unticked. The text is the D4 blocked-state copy from the spec.
  - `FOLLOW_UP_DATE_MESSAGE = "Set the follow-up date for the concerns that schedule a BHC follow-up."`
  - `carePlanReviewRows` concern values use `CARE_PLAN_LABELS` + ` · BHC follow-up`.
- Produces (`buildCarePlanPayload`): adds `shared_referral_acknowledged: boolean`.
- `CarePlanSection` props (new or changed):
  - `onBhcFollowUpChange(id, checked)`, `coverage`, `followUpAcknowledged`, `referralAcknowledged`, `onAcknowledgeChange(kind, checked)`
  - **removed**: the in-card hosting

- [ ] **Step 1: Write failing tests** in `carePlanWorkspace.test.js`:
  - `carePlanCoverage lists follow-up and referral items` (wound follow_up + cough refer+flag + HTN continued → `followUpCovers` = `["Concern 1 — Wound","Concern 2 — Cough","Hypertension monitoring"]`, `referralCovers` = `["Concern 2 — Cough"]`);
  - `acknowledgment is required only for two or more covered items`;
  - `follow-up date and reason errors use the new messages and count flagged referrals`;
  - `review rows label a flagged referral`.
  - Remove the `carePlanFormHosts` tests.
  - In `carePlan.test.js`: the payload carries `shared_referral_acknowledged`.
- [ ] **Step 2: Run** `node --test src/utils/carePlanWorkspace.test.js src/utils/carePlan.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the utils.**
- [ ] **Step 4: Implement `CarePlanSection`.**
  - Each card: header, then **Care Plan Action** radios (no default; error under the group from `errors['carePlanAction.<id>']`).
  - Under Refer: a checkbox `Also schedule a BHC follow-up for this concern`.
  - A pointer line: `Covered by BHC Follow-up Details below` / `Included in RHU Referral Details below`.
  - Then **Reporting Classification** (`DiagnosisReportingField`, unchanged).
  - After the cards and the Condition Monitoring list: **BHC Follow-up Details** (`followUpPlan.shows`) with `Covers:`, date / time / reason (`FollowUpFields` in card mode), the different-date notice, and the acknowledgment checkbox `One follow-up date is clinically appropriate for all listed concerns.` when covers ≥ 2.
  - Then **RHU Referral Details** (`needsReferral`) with `Covers:`, the existing `ReferralFields` (facility with the availability summary and warning, priority, reason), and the checkbox `All listed concerns can go to this facility with this priority.` when covers ≥ 2.
  - Then Additional Clinical Notes.
  - Both sections use the existing flat `ClinicalFieldGroup`.
- [ ] **Step 5: Wire `ConsultationWorkspace`.**
  - `onCarePlanChange` uses `withCarePlan`; `onBhcFollowUpChange` uses `withBhcFollowUp`.
  - Acknowledgment state is two booleans, reset to false whenever the matching covers list changes.
  - Continue on Care Plan merges `validateConcernActions`, `carePlanFollowUpErrors` and `sharedAcknowledgmentErrors`, and focuses the first error **without clearing any state**.
  - The payload sends `care_plan.shared_referral_acknowledged`.
  - Draft restore runs `migrateLegacyConcernPlans` on the restored diagnoses and follow-up reason.
- [ ] **Step 6: Run** all frontend util tests, `npx eslint .` and `npx vite build`. Expected: PASS, with only the 1 known lint warning.
- [ ] **Step 7: Manual check** at 1366×768 (the harness from the 2026-10-09 session, or the real page):
  - mixed wound / cough;
  - two refers with the box unticked (blocked, data intact) and then ticked;
  - a flagged refer showing both sections;
  - changing a flagged Refer to None hides the follow-up.
- [ ] **Step 8: Commit** `feat(care-plan): shared follow-up and referral sections with explicit acknowledgments`.

---

### Task 6: Follow-up visit line (return-visit context)

**Files:**
- Create: `frontend/src/components/features/health-records/wizard/FollowUpVisitLine.jsx`
- Modify: `frontend/src/utils/continuedCare.js` (`resolveContinuedCare` `continuedFollowUps` mapping ~165)
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (render above `CarePlanSection`; Review rows)
- Modify: `frontend/src/utils/carePlanWorkspace.js` (`carePlanReviewRows` gains `continuedFollowUps`)
- Test: `frontend/src/utils/continuedCare.test.js`, `carePlanWorkspace.test.js`

**Interfaces:**
- Produces: `continuedFollowUps` items `{ id, sourceHealthRecordId, reason, dueDate, sourceDate }` (from `pending_follow_ups.reason / due_date / source_date`).
- Produces: `removeContinuedFollowUp(state, id) → { continuedFollowUpTaskIds, continuedFollowUps }` in `continuedCare.js`. Pure; it also removes monitorings that were continued only through that task (`fromSelectedFollowUps`).
- `FollowUpVisitLine` props: `{ followUps, onRemove(id), disabled }`. Each line reads `Follow-up visit · FU-{id} · {reason || 'No reason recorded'} · due {date} · from {sourceDate} visit` plus a `Remove link` text button.
- Review row: `{ label: 'Completes follow-up', value: 'FU-12' }` per task.

- [ ] **Step 1: Write failing tests.**
  - `resolveContinuedCare carries reason, due date and source date`.
  - `removeContinuedFollowUp drops the task and its task-only monitorings but keeps ticked ones`.
  - `review rows list completed follow-ups`.
- [ ] **Step 2: Run** `node --test src/utils/continuedCare.test.js src/utils/carePlanWorkspace.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the utils and the component. Render the line at the top of Care Plan & Next Steps, and its rows on Review. Opening the workspace changes nothing on the server; completion happens only on a successful save, which is the existing behavior.
- [ ] **Step 4: Run** the tests, lint and build. Expected: PASS.
- [ ] **Step 5: Commit** `feat(consultation): show and unlink the follow-up a visit completes`.

---

### Task 7: Legacy monitoring separation (BHC side)

**Files:**
- Modify: `frontend/src/utils/startConsultation.js` (`monitoredConditionOptions`)
- Modify: `frontend/src/utils/continuedCare.js` (`activeMonitoringsFromOverview` consumers, `resolveContinuedCare`)
- Modify: `frontend/src/components/features/patients/MedicalConditionsGroups.jsx` (legacy label)
- Modify: `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx` (remove the now-unreachable `monitoring.legacy` line)
- Modify: `frontend/src/components/features/health-records/wizard/FollowUpVisitLine.jsx` (new `legacyConditionNames` prop), `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (keep `legacyConditionNames` from `loadContinuedCare` in state and pass it to the line)
- Test: `frontend/src/utils/startConsultation.test.js`, `continuedCare.test.js`

**Interfaces:**
- Produces: `monitoredConditionOptions(overview)` → verified only (`legacy !== true`).
- Produces: `legacyMonitoringOptions(overview) → [{ monitoringId, conditionName, startedAt }]`.
- Produces: `resolveContinuedCare(...)` result gains `legacyConditionNames: string[]`. Legacy conditions are never placed in `continuedMonitorings`. Their task is still in `continuedFollowUpTaskIds`.
- `FollowUpVisitLine` (Task 6) shows `{name} (Legacy — Pending RHU Verification) is not continued as monitoring.` for `legacyConditionNames`.

- [ ] **Step 1: Write failing tests.**
  - `monitoredConditionOptions excludes legacy rows`.
  - `legacyMonitoringOptions lists only legacy rows`.
  - `resolveContinuedCare continues a task but skips its legacy conditions` (a task whose only condition is legacy → task id kept, `continuedMonitorings` empty, `legacyConditionNames` = `['Hypertension']`).
  - `a legacy monitoringId passed directly is dropped and reported`.
- [ ] **Step 2: Run** `node --test src/utils/startConsultation.test.js src/utils/continuedCare.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, plus the profile label `Legacy — Pending RHU Verification` in `MedicalConditionsGroups`.
- [ ] **Step 4: Run** the tests, lint and build. Expected: PASS.
- [ ] **Step 5: Commit** `feat(monitoring): legacy monitoring is pending RHU verification, not selectable`.

---

### Task 8: Start Consultation modal: visit type and scheduled follow-ups

**Files:**
- Modify: `frontend/src/utils/startConsultation.js` (`hasStartChoices`, `startRoute`, `checkContinuedStart`; new `scheduledFollowUpOptions`)
- Modify: `frontend/src/services/startConsultationService.js` (`prepareContinuedStart` signature, `ContinuedStartError.droppedFollowUpIds`)
- Modify: `frontend/src/hooks/usePatientConsultation.js:96` (`start`)
- Modify: `frontend/src/components/features/patients/profile/StartConsultationModal.jsx`
- Test: `frontend/src/utils/startConsultation.test.js`

**Interfaces:**
- Produces:
  - `scheduledFollowUpOptions(overview) → [{ followUpId, reason, dueDate, isOverdue, sourceDate }]`: pending tasks with no **verified** active condition. Tasks linked to verified monitoring stay with that monitoring, as today.
  - `hasStartChoices(overview)` = verified monitoring OR recommendations OR scheduled follow-ups OR legacy rows.
  - `startRoute({ patientId, monitoringIds, startConditionIds, followUpIds })` → `selectionToRoute` when any id list is non-empty.
  - `checkContinuedStart(overview, monitoringIds, startConditionIds, followUpIds) → { ok, droppedMonitoringIds, droppedConditionIds, droppedFollowUpIds }`.
  - `prepareContinuedStart(queryClient, patientId, monitoringIds, startConditionIds, followUpIds)`.
  - Hook: `start({ monitoringIds, startConditionIds, followUpIds })`.
- Modal state: `visitType: 'general' | 'monitoring'` (default `general`), `monitoringIds`, `followUpIds`, `startConditionIds`. Choosing `monitoring` with nothing ticked disables Start, with the hint `Tick at least one monitored condition.`

- [ ] **Step 1: Write failing tests.**
  - `scheduledFollowUpOptions lists concern follow-ups and legacy-only follow-ups, not verified-monitoring ones`.
  - `hasStartChoices is true for a pending concern follow-up alone`.
  - `hasStartChoices is false for a first-visit patient`.
  - `startRoute carries followUpIds`.
  - `checkContinuedStart reports a fulfilled follow-up as dropped`.
- [ ] **Step 2: Run** `node --test src/utils/startConsultation.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the utils, service and hook.**
- [ ] **Step 4: Implement the modal.**
  - Visit type radio. `Follow-up Existing Monitoring` is rendered only when `monitoredConditionOptions` is non-empty; it reveals the existing checklist.
  - Section `Scheduled follow-ups (optional)` with nothing preselected, under either type.
  - `Recommended by RHU — start BHC monitoring` unchanged.
  - Read-only `Pending RHU verification` list with the hint `Refer to RHU for verification if care is needed. It cannot be continued as monitoring until verified.`
  - The dropped-item problem message also names dropped follow-ups.
  - Record Visit routes are unchanged (they skip the modal with the task preselected).
- [ ] **Step 5: Run** the tests, lint and build. Then a manual pass in the browser for Patients A, B, C and D (spec §C), including starting Patient B from the header with the follow-up both unticked and ticked.
- [ ] **Step 6: Commit** `feat(start-consultation): explicit visit type and optional scheduled follow-ups`.

---

### Task 9: RHU legacy review UI

**Files:**
- Modify: `frontend/src/components/features/conditions/ConfirmConditionsBlock.jsx:174-191`
- Modify: `frontend/src/utils/conditionConfirmations.js`
- Modify: `frontend/src/services/referrals.js:~376`, `frontend/src/services/healthRecordService.js:~817, ~1001`
- Modify: `frontend/src/pages/rhu/FeedbackReturnSlip.jsx`, `frontend/src/pages/rhu/RHUAddHealthRecords.jsx` (state plus invalidation of `queryKeys.patientConditions`, `queryKeys.careOverview`)
- Test: `frontend/src/utils/conditionConfirmations.test.js`

**Interfaces:**
- Consumes: the Task 3 API `legacy_monitoring_discontinuations: [{ monitoring_id, reason }]`.
- Produces (`conditionConfirmations.js`):
  - `legacyDecisionRow(monitoring) → { monitoringId, conditionName, decision: '' | 'confirm' | 'correct' | 'discontinue', correctedName: '', reason: '' }`
  - `applyLegacyDecision(rows, legacyRows, monitoringId, patch) → { rows, legacyRows }`:
    - `confirm` adds a condition row prefilled with the legacy name;
    - `correct` adds a condition row with `correctedName` and sets `reason` to `Corrected by RHU to {correctedName}`;
    - `discontinue` needs a typed reason.
  - `buildLegacyDiscontinuations(legacyRows) → [{ monitoring_id, reason }]` for `correct` and `discontinue`.
  - `validateLegacyDecisions(legacyRows) → errors` (a reason is required for discontinue; a corrected name for correct).
- Block props add `legacyRows`, `onLegacyChange`. Payload keys: `legacyMonitoringDiscontinuations` in the form state map to `legacy_monitoring_discontinuations`.

- [ ] **Step 1: Write failing tests.**
  - `confirm adds a prefilled condition row and no discontinuation`.
  - `correct discontinues with the corrected reason and adds the corrected condition row`.
  - `discontinue requires a reason`.
  - `undecided legacy rows send nothing`.
- [ ] **Step 2: Run** `node --test src/utils/conditionConfirmations.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the utils, the block UI (per legacy row: label `Legacy — Pending RHU Verification — {name}, since {date}`, a decision radio Confirm / Correct / Discontinue / No decision, and the inputs it needs; flat list, no nested cards), the services pass-through, and both RHU pages (send the payload; invalidate the patient conditions and care overview queries on success; map server errors on `legacy_monitoring_discontinuations.*`).
- [ ] **Step 4: Run** the tests, lint and build. Then a manual pass as RHU staff: confirm, correct and discontinue on a referral feedback and on an RHU record. Check `audit_logs` rows in the database.
- [ ] **Step 5: Commit** `feat(rhu): review legacy BHC monitoring in Confirm Conditions`.

> **Deploy checkpoint B:** frontend release 1 (Tasks 4–9), after backend checkpoint A is live.

---

### Task 10: Documentation

**Files:**
- Modify: `docs/ai/CURRENT.md`, `docs/superpowers/specs/2026-10-05-clinical-boundary-condition-confirmation-design.md` (a one-line "superseded for actions" note pointing at the 2026-10-09 spec)

- [ ] **Step 1: Update `CURRENT.md`.**
  - The decisions (H1–H7 final).
  - The unsupported workflows list from the spec.
  - Deploy order: backend release 1 → frontend release 1 → release-2 gate.
  - The release-2 gate checklist (Task 11 Step 1).
  - Test results with real numbers from Tasks 0–9.
  - Items still marked [Validate with RHU/MHO].
- [ ] **Step 2: Commit** `docs: care plan workflow revision state and release-2 gate`.

---

### Task 11: Release 2 (only after the gate)

**Files:**
- Modify: `backend/app/Services/CarePlan.php` (`TRANSITION_ACCEPTED = []`)
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (the `carePlan` rule; BHC action-required check)
- Test: `backend/tests/Feature/HealthConcernBoundaryTest.php`, `backend/tests/Feature/RhuConditionConfirmationTest.php`

**Interfaces:**
- On POST, `carePlan === 'recheck'` → 422 `diagnoses.N.carePlan` with the release-2 message (a closure rule, before `Rule::in`).
- On POST by a BHC user (`$this->user()->isBhw()`), each `diagnoses.*` entry without `carePlan` → 422 `diagnoses.N.carePlan` `Choose a care plan action for this health concern.`

- [ ] **Step 1: Check the gate** and record the results in `CURRENT.md`:
  - (a) Frontend release 1 has been deployed for one full cycle.
  - (b) A database check returns 0 rows for active drafts holding `recheck`. Run it once from a tinker session: decrypt each active `health_record_drafts` payload through `HealthRecordDraftService` and count diagnoses with `carePlan === 'recheck'`.
  - (c) Server logs and the audit log show no `recheck` POST since the frontend deploy. If no log exists, state that.
  - (d) An RHU health-record save in staging passes.
- [ ] **Step 2: Write failing tests.**
  - `test_release_two_rejects_recheck` (422 with the exact message).
  - `test_release_two_requires_a_bhc_concern_action` (BHC null → 422).
  - In `RhuConditionConfirmationTest`: `test_rhu_record_without_concern_actions_still_saves` (RHU user, `diagnoses` null or entries without `carePlan` → 201).
  - Remove `test_transition_recheck_post_saves_as_follow_up_with_prefix`. **Keep** `test_recheck_still_keeps_a_bhc_follow_up_for_stored_records` and add `test_resync_keeps_a_historical_referred_recheck_task`: insert a record directly with `needs_referral=true`, `diagnoses=[{carePlan:'recheck'}]` and a follow-up date; run `FollowUpTaskSyncService::syncRecord`; the task stays pending.
- [ ] **Step 3: Run** `php artisan test --filter="HealthConcernBoundaryTest|RhuConditionConfirmationTest|CarePlanTest"`. Expected: FAIL on the new tests.
- [ ] **Step 4: Implement the two rules.** `applyRecheckReason` and `normalizeTransitionValues` stay; they are now unreachable for POST and harmless.
- [ ] **Step 5: Run** the filter, then the full suite. Expected: PASS, and 0 new failing names against the baseline.
- [ ] **Step 6: Commit** `feat(care-plan): release 2 rejects recheck and requires a BHC concern action`. Deploy the backend only; the frontend is unchanged.

---

## Test-scenario coverage (spec §G → task)

| Spec G# | Task |
|---|---|
| 1 First visit / none | 1, 4 |
| 2 Concern follow-up + reason | 1, 5 |
| 3 Record Visit return | 6 |
| 4 Header return | 8 |
| 5 Verified monitoring | 7, 8 |
| 6 Legacy at BHC | 2, 7 |
| 7 RHU legacy review | 3, 9 |
| 8 Maternal | 8 (manual), 1 (service exemption) |
| 9 Mixed actions | 5 |
| 10 Refer + BHC follow-up | 1, 4, 5 |
| 11 Shared referral | 2, 5 |
| 12 Shared follow-up | 5 |
| 13 Historical Recheck | 1, 4, 11 |
| 14 Explicit action | 4, 5, 11 |
| 15 No-doctor hold | 2 |
| 16 Permissions | 3 (and existing tests) |
| 17 Drafts | 1, 4, 5 |
| 18 Browser QA | 5, 8, 9 (manual) |
