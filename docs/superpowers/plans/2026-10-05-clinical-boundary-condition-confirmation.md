# Clinical Boundary & RHU Condition Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BHC consultations record Health Concerns (never diagnoses); only an RHU user sets a condition's clinical status; BHC formally monitors only RHU-confirmed (or legacy) conditions.

**Architecture:** A new `patient_conditions` table (+ append-only `patient_condition_events`) owned by the RHU, written by a `PatientConditions` service from the referral feedback and RHU health record saves. The BHC finalize path loses every condition write (`CurrentConditionsSync`, `applyConditionStatuses`, `addToConditions`); concerns keep `health_records.diagnoses[]` storage with new `carePlan` values. Monitoring starts only from a `patient_condition_id`; the care overview surfaces RHU monitoring recommendations to the existing Start Consultation prompt. The profile groups conditions into Confirmed / Monitored, Under Evaluation, Unverified, Patient-Reported, Past.

**Tech Stack:** Laravel (PHPUnit feature tests, SQLite in-memory; pgsql in prod), React + Vite, TanStack Query, `node --test` for frontend utils.

**Spec:** `docs/superpowers/specs/2026-10-05-clinical-boundary-condition-confirmation-design.md`

## Global Constraints

- Condition statuses (stored): `under_evaluation`, `active`, `controlled`, `resolved`, `ruled_out`. Open = first three. Monitorable = `active`, `controlled`.
- Display labels: "Under Evaluation", "Active", "Controlled", "Resolved", "Ruled Out"; Under Evaluation group copy: "Under RHU evaluation".
- Source types: `rhu_feedback`, `rhu_record`. Legacy monitoring has `patient_condition_id = null` and is labelled **"Legacy BHC Monitoring"** — never "Confirmed by RHU".
- Legacy `currentDiseases` label: **"Unverified — recorded from BHC consultation"**. New patient-reported entries: `source: "Patient-reported"`.
- New BHC concern `carePlan` values: `recheck`, `follow_up`, `refer` (optional per concern). Labels: "Recheck", "Follow-up", "Refer to RHU". No emergency option.
- Recheck task reason: `Recheck: <name>; <name>`.
- Permission: `conditions.confirm` — RHU profile only, and the user's working role must be `rhu_staff` (`User::workflowRole()`).
- Clinical text fields have no suggestions; condition names are typed manually (RHU) and concerns are free text (BHC).
- Health records are immutable after save; background changes stay consultation-only and audited.
- Run backend tests from `backend/`: `php artisan test --filter=<Name>`. Frontend: `node --test src/utils/<file>.test.js` from `frontend/`.
- API JSON is snake_case; frontend mappers (e.g. `utils/careOverview.js` `mapCareOverview`) camelize.

## Review Focus

1. A browser holding an old draft sends `carePlan: "monitor"` / `"none"`, `addToConditions` or `care_plan.monitoring_status_updates` → the save is a 422 naming the field, nothing is written (Task 6 tests).
2. The RHU confirms "HTN" while legacy monitoring is "Hypertension" → same identity, the legacy monitoring is linked, no duplicate row (Task 3 test).
3. The RHU marks a condition Resolved / Ruled Out while BHC monitoring is active → monitoring is NOT auto-stopped; the overview exposes `condition_status` so the BHC worker can stop it with a reason (Task 5 test).
4. The same new condition is confirmed twice (two feedback saves) → the second updates the open row; never a 500 from the unique index (Task 3 test).
5. A recommended condition is resolved/ruled out before the BHC starts monitoring → it leaves the recommendations list and a start attempt is a 422 (Tasks 5 and 7 tests).

---

### Task 1: Condition tables and models

**Files:**
- Create: `backend/database/migrations/2026_10_05_000001_create_patient_conditions_tables.php`
- Create: `backend/app/Models/PatientCondition.php`, `backend/app/Models/PatientConditionEvent.php`
- Modify: `backend/app/Models/ConditionMonitoring.php` (fillable + relation), `backend/app/Models/Patient.php` (relation)
- Test: `backend/tests/Feature/PatientConditionSchemaTest.php`

**Interfaces:**
- Produces: `PatientCondition` constants `STATUS_UNDER_EVALUATION|STATUS_ACTIVE|STATUS_CONTROLLED|STATUS_RESOLVED|STATUS_RULED_OUT`, `STATUSES`, `OPEN_STATUSES`, `MONITORABLE_STATUSES`, `SOURCE_RHU_FEEDBACK = 'rhu_feedback'`, `SOURCE_RHU_RECORD = 'rhu_record'`; relations `patient()`, `events(): HasMany`, `monitorings(): HasMany`, `confirmedBy(): BelongsTo`; scope `scopeOpen($q)`. `PatientConditionEvent` (no `updated_at`). `ConditionMonitoring::patientCondition(): BelongsTo`, `isLegacy(): bool` (`patient_condition_id === null`). `Patient::conditions(): HasMany`.

- [ ] **Step 1: Write the failing tests**

```php
public function test_only_one_open_condition_per_identity(): void
{
    $make = fn (string $status) => PatientCondition::create([
        'patient_id' => $this->patient->id, 'condition_name' => 'Hypertension',
        'condition_identity' => 'hypertension', 'status' => $status,
        'confirmed_by' => $this->rhuUser->id, 'confirmed_at' => now(),
        'source_type' => 'rhu_record', 'source_id' => 1,
    ]);
    $make('resolved');
    $make('active');               // a past row and an open row coexist
    $this->expectException(\Illuminate\Database\QueryException::class);
    $make('under_evaluation');     // a second open row is refused
}

public function test_monitoring_can_link_a_condition_and_legacy_rows_have_none(): void
{
    // create a condition + two monitorings (one with patient_condition_id, one without)
    $this->assertSame($condition->id, $linked->patientCondition->id);
    $this->assertFalse($linked->isLegacy());
    $this->assertTrue($legacy->isLegacy());
}
```

- [ ] **Step 2: Run** `php artisan test --filter=PatientConditionSchemaTest` — Expected: FAIL (class `PatientCondition` not found).

- [ ] **Step 3: Write the migration and models**

`patient_conditions`: columns exactly as the spec's table plus nullable `bhc_monitoring_recommended_at` (timestamp) and `bhc_monitoring_recommended_by` (FK users, nullOnDelete); index `(patient_id, status)`. Partial unique index, raw statement like `2026_09_30_000002_create_condition_monitoring_tables.php`:

```sql
CREATE UNIQUE INDEX patient_conditions_one_open_idx ON patient_conditions (patient_id, condition_identity)
WHERE status IN ('under_evaluation', 'active', 'controlled')
```

`patient_condition_events`: `patient_condition_id` (cascade), `from_status` nullable string(20), `to_status` string(20), `note` nullable string(500), `source_type` string(20), `source_id` unsignedBigInteger, `changed_by` FK users nullOnDelete, `changed_at` timestamp. `condition_monitorings.patient_condition_id` nullable FK nullOnDelete. On pgsql only: CHECK constraints for `status`/`to_status` in `STATUSES`, `source_type` in the two sources, and `ENABLE ROW LEVEL SECURITY` on both new tables. `down()` drops in reverse order.

- [ ] **Step 4: Run** the same filter — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(conditions): add patient_conditions and condition events tables`

---

### Task 2: `conditions.confirm` permission

**Files:**
- Modify: `backend/app/Services/ActionPermissions.php` (`ALL`, `PRESETS['rhu']`), `backend/app/Http/Requests/UserRequest.php:55` (same rhu_staff-only filter as `rhu.manage`)
- Create: `backend/database/migrations/2026_10_05_000002_grant_conditions_confirm_to_rhu_staff.php`
- Modify: `frontend/src/utils/actionPermissions.js` (preset `rhu`), `frontend/src/utils/accountSetup.js` (`compatiblePermissions` excludes `conditions.confirm` unless `role === "rhu_staff"`)
- Test: `backend/tests/Feature/ConditionsConfirmPermissionTest.php`, `frontend/src/utils/accountSetup.test.js` (create if missing)

**Interfaces:**
- Produces: permission string `conditions.confirm`, present in `ActionPermissions::PRESETS['rhu']` and frontend `PERMISSION_PRESETS.rhu.permissions`.

- [ ] **Step 1: Write the failing tests**

```php
public function test_rhu_preset_includes_conditions_confirm_and_clinical_does_not(): void
{
    $this->assertContains('conditions.confirm', ActionPermissions::PRESETS['rhu']);
    $this->assertNotContains('conditions.confirm', ActionPermissions::PRESETS['clinical']);
}

public function test_migration_grants_it_to_users_and_assignments_holding_rhu_manage(): void
{
    // users: one with ['rhu.manage', ...], one clinical BHW; one facility_assignment with rhu.manage
    (require database_path('migrations/2026_10_05_000002_grant_conditions_confirm_to_rhu_staff.php'))->up();
    $this->assertContains('conditions.confirm', $rhuUser->fresh()->permissions);
    $this->assertNotContains('conditions.confirm', $bhw->fresh()->permissions);
    $this->assertContains('conditions.confirm', $assignment->fresh()->permissions);
}
```

```js
test("conditions.confirm is offered only to RHU staff", () => {
  assert.ok(compatiblePermissions("doctor", "rhu_staff").includes("conditions.confirm"));
  assert.ok(!compatiblePermissions("nurse", "bhw").includes("conditions.confirm"));
});
```

- [ ] **Step 2: Run** `php artisan test --filter=ConditionsConfirmPermissionTest` and `node --test src/utils/accountSetup.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** The migration appends the permission (idempotently, no duplicates) to every `users.permissions` and `facility_assignments.permissions` JSON array containing `rhu.manage`; `down()` removes it.
- [ ] **Step 4: Run** both — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(permissions): add conditions.confirm for RHU staff`

---

### Task 3: `PatientConditions` service

**Files:**
- Create: `backend/app/Services/PatientConditions.php`
- Test: `backend/tests/Feature/PatientConditionsServiceTest.php`

**Interfaces:**
- Consumes: Task 1 models; `ClinicalRegistry::matchCondition(?string): ?array`, `ClinicalRegistry::conditionIdentity(?string $key, string $name): string`.
- Produces:
  - `public static function canConfirm(?User $user): bool` — `ActionPermissions::allows($user, 'conditions.confirm') && $user->workflowRole() === User::ROLE_RHU_STAFF`.
  - `public static function rules(string $prefix = 'condition_confirmations'): array` — `$prefix` nullable array max 20; `.*.condition_id` nullable integer; `.*.name` `required_without:{$prefix}.*.condition_id`, string, max 150, `regex:/\S/`; `.*.status` required, `Rule::in(PatientCondition::STATUSES)`; `.*.note` nullable string max 500; `.*.recommend_bhc_monitoring` nullable boolean.
  - `public function apply(Patient $patient, array $confirmations, User $user, string $sourceType, int $sourceId): Collection` — runs inside the caller's transaction; returns the changed `PatientCondition`s.

Behavior of `apply()` (in this order): lock the patient row; resolve each entry's identity (existing row by `condition_id` — must belong to the patient — else `conditionIdentity(match key, trimmed name)`); two entries with one identity → `ValidationException` on `condition_confirmations.{i}.name` ("This condition is listed twice."); `recommend_bhc_monitoring: true` with a non-monitorable status → `ValidationException` on `.recommend_bhc_monitoring` ("Only an Active or Controlled condition can be recommended for BHC monitoring."); an open row with the identity is updated (name kept), else a row is inserted; an event is written when the status changes or a note is given; `confirmed_by/at`, `source_type/id` updated on every status set; recommendation sets `bhc_monitoring_recommended_at/by`; when the new status is monitorable, an active `ConditionMonitoring` with the same identity and `patient_condition_id = null` gets linked.

- [ ] **Step 1: Write the failing tests**

```php
test_confirming_a_new_condition_creates_it_with_an_event()        // status active, event from null → active, source rhu_feedback/42
test_a_second_confirmation_of_the_same_identity_updates_the_open_row() // "Hypertension" then "HTN" controlled → 1 row, status controlled, 2 events
test_a_status_change_by_condition_id_writes_one_event()           // active → resolved with note "BP normal x3"
test_an_unchanged_status_without_a_note_writes_no_event()
test_another_patients_condition_id_is_rejected()                  // ValidationException, nothing written
test_the_same_condition_twice_in_one_request_is_rejected()
test_recommending_monitoring_needs_a_monitorable_status()          // under_evaluation + recommend → ValidationException
test_recommendation_is_stamped_on_the_condition()
test_confirming_links_matching_legacy_monitoring()                // legacy monitoring "Hypertension" (key hypertension), confirm "HTN" active → linked
test_under_evaluation_does_not_link_legacy_monitoring()
test_can_confirm_only_for_rhu_staff_with_the_permission()         // RHU user true; same permissions while working at a BHC false; BHC clinical false
```

- [ ] **Step 2: Run** `php artisan test --filter=PatientConditionsServiceTest` — Expected: FAIL.
- [ ] **Step 3: Implement** `PatientConditions`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(conditions): RHU condition confirmation service`

---

### Task 4: Confirm from referral feedback and RHU health records

**Files:**
- Modify: `backend/app/Http/Requests/FeedbackRequest.php` (merge `PatientConditions::rules()`), `backend/app/Http/Controllers/Api/FeedbackController.php:38` (403 when confirmations present and `! canConfirm`), `backend/app/Services/ReferralWorkflowService.php:100-155` (pull `condition_confirmations` out of `$feedbackData` before `Feedback::create`, then `apply($referral->patient, …, SOURCE_RHU_FEEDBACK, $feedback->id)` inside the same transaction)
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (merge rules), `backend/app/Http/Controllers/Api/HealthRecordController.php` (`unset` alongside `background_update`; `abort(403, 'Only RHU staff can confirm a condition.')` when present and `! canConfirm`; `apply(…, SOURCE_RHU_RECORD, $record->id)` right after `HealthRecord::create` inside the transaction)
- Test: `backend/tests/Feature/RhuConditionConfirmationTest.php`

**Interfaces:**
- Consumes: Task 3 `PatientConditions::apply`, `canConfirm`, `rules`.
- Produces: request field `condition_confirmations: [{ condition_id?, name?, status, note?, recommend_bhc_monitoring? }]` on `POST /api/feedback` and `POST /api/health-records`.

- [ ] **Step 1: Write the failing tests**

```php
test_feedback_with_a_confirmation_writes_the_condition_and_event()   // source_type rhu_feedback, source_id = feedback id
test_feedback_without_confirmations_writes_no_condition()            // rhu_diagnosis "Hypertension" alone → PatientCondition::count() === 0
test_a_rejected_feedback_writes_no_condition()                       // referral still Pending → 409, count 0
test_an_rhu_record_with_a_confirmation_writes_the_condition()        // source_type rhu_record, source_id = record id
test_a_bhc_user_sending_confirmations_is_forbidden_and_nothing_saves() // 403, HealthRecord::count() === 0
test_an_rhu_permission_holder_working_at_a_bhc_is_forbidden()
```

- [ ] **Step 2: Run** `php artisan test --filter=RhuConditionConfirmationTest` — Expected: FAIL.
- [ ] **Step 3: Implement** the wiring above.
- [ ] **Step 4: Run** it plus `--filter=Feedback` and `--filter=Referral` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(rhu): confirm conditions from feedback and RHU records`

---

### Task 5: Read API — patient conditions and monitoring recommendations

**Files:**
- Create: `backend/app/Http/Controllers/Api/PatientConditionController.php`
- Modify: `backend/routes/api.php` (inside the `facility.assigned, actions.allowed` group: `Route::get('patients/{patient}/conditions', [PatientConditionController::class, 'index']);`), `backend/app/Http/Middleware/EnforceActionPermissions.php` (add `str_contains($path, '/conditions') => 'clinical.history'` **before** the `/patients` arm), `backend/app/Http/Controllers/Api/CareOverviewController.php`
- Test: `backend/tests/Feature/PatientConditionReadTest.php`

**Interfaces:**
- Produces `GET /api/patients/{patient}/conditions` → `{ data: { conditions: [{ id, condition_name, condition_identity, status, confirmed_at, confirmed_by_name, source_type, source_id, bhc_monitoring_recommended_at, monitoring: { id, started_at } | null, events: [{ from_status, to_status, note, source_type, source_id, changed_by_name, changed_at }] }], legacy_monitorings: [{ id, condition_name, condition_key, condition_identity, started_at }] } }` (conditions newest `confirmed_at` first; events newest first). Authorization like `PatientBackgroundHistoryController` (`authorizePatient` + `clinical.history`).
- Care overview additions: `monitoring_recommendations: [{ condition_id, condition_name, condition_key, status, confirmed_at, recommended_at }]` — recommended, monitorable, no active monitoring with the same identity; and on every monitoring entry (`pending_follow_ups.*.conditions.*` and `monitoring_without_follow_up.*`): `condition_status` (null for legacy) and `legacy` (bool).

- [ ] **Step 1: Write the failing tests**

```php
test_conditions_list_returns_conditions_events_and_legacy_monitoring()
test_conditions_list_needs_clinical_history_and_facility_access()          // encoder → 403; other facility → 403/404 as authorizePatient does
test_overview_lists_a_recommendation_until_monitoring_starts()
test_a_resolved_or_ruled_out_recommendation_leaves_the_overview()
test_resolving_a_monitored_condition_keeps_the_monitoring_and_exposes_its_status() // monitoring status 'active', overview condition_status 'resolved'
test_overview_marks_legacy_monitoring()
```

- [ ] **Step 2: Run** `php artisan test --filter=PatientConditionReadTest` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `--filter=CareOverview` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(conditions): patient conditions endpoint and RHU monitoring recommendations`

---

### Task 6: BHC finalize boundary — Health Concerns

**Files:**
- Modify: `backend/app/Services/CarePlan.php`, `backend/app/Http/Requests/HealthRecordRequest.php:291-333,425-480`, `backend/app/Http/Controllers/Api/HealthRecordController.php:90-262`, `backend/app/Services/PatientBackground.php` (delete `applyConditionStatuses`), `backend/app/Services/HealthRecordDraftPayloadService.php` (drop `addToConditions`, `conditionStatus`, `carePlan.monitoringStatuses`; add `carePlan.startConditionIds => ['*' => SCALAR]`)
- Delete: `backend/app/Services/CurrentConditionsSync.php`, `backend/tests/Feature/CurrentConditionsSyncTest.php`
- Test: create `backend/tests/Feature/HealthConcernBoundaryTest.php`; update `CarePlanValidationTest`, `CarePlanReferralFollowUpTest`, `CarePlanFollowedConditionTest`, `PatientBackgroundConsultationTest`, `ConsultationProgramsTest:300-361`, `DiagnosisReportingTest`, `tests/Unit/Services/CarePlanTest.php`

**Interfaces:**
- Produces in `CarePlan`: `RECHECK = 'recheck'`, `FOLLOW_UP = 'follow_up'`, `REFER = 'refer'`; legacy `NONE`, `MONITOR`, `MONITOR_REFER` stay in `VALUES` for reading; `SELECTABLE = [RECHECK, FOLLOW_UP, REFER]`; `keepsBhcFollowUp(?string): bool` (recheck|follow_up); `keepsFollowUpWithReferral(array $diagnoses, mixed $monitoringData): bool` = any concern `keepsBhcFollowUp` or (selected programs + follow-up date, unchanged); `recheckReason(array $diagnoses): ?string` → `"Recheck: A; B"` or null. Remove `CONDITION_STATUSES`, `monitors`, `monitorsAny`.
- Request on POST: `diagnoses.*.carePlan` nullable, `Rule::in(CarePlan::SELECTABLE)`; `diagnoses.*.addToConditions`, `diagnoses.*.conditionStatus`, `care_plan.monitoring_status_updates` → `prohibited`; when any concern is recheck/follow_up, `monitoring_data.followUpDate` is required with message "Set the follow-up date for the concerns marked Recheck or Follow-up."
- Controller: no `CurrentConditionsSync`, no status updates; when `recheckReason()` is non-null, `monitoring_data.followUpReason` = that reason, followed by `" — {typed reason}"` when the worker typed one.

- [ ] **Step 1: Write the failing tests** (`HealthConcernBoundaryTest`)

```php
test_finalizing_concerns_never_creates_or_changes_a_condition()
// concerns "Hypertension" (refer, with referral), "TB" (recheck), "Elevated BP" (null)
// → PatientCondition::count() === 0, ConditionMonitoring::count() === 0,
//   patient medical_background unchanged, record background_changes null
test_add_to_conditions_is_rejected()                     // 422 on diagnoses.0.addToConditions
test_a_condition_status_on_a_concern_is_rejected()        // 422 on diagnoses.0.conditionStatus
test_monitoring_status_updates_are_rejected()             // 422 on care_plan.monitoring_status_updates
test_old_monitor_and_none_values_are_rejected_on_a_new_save() // 'monitor', 'none', 'monitor_refer' → 422
test_a_concern_may_have_no_next_action()
test_recheck_and_follow_up_need_the_follow_up_date()
test_recheck_reason_lists_the_concerns()                  // task reason in care overview === "Recheck: Elevated BP — bring BP log"
test_reporting_flags_on_concerns_still_drive_the_visit_report() // reportAs notifiable → same assertion as DiagnosisReportingTest
```

- [ ] **Step 2: Run** `php artisan test --filter=HealthConcernBoundaryTest` — Expected: FAIL.
- [ ] **Step 3: Implement** the changes listed under Files/Interfaces.
- [ ] **Step 4: Update the existing tests** that pin removed behavior:
  - `CarePlanFollowedConditionTest`: delete the five `test_a_status_update_*` / `test_no_status_update_*` / `test_a_status_must_*` / `test_changing_a_documented_status_*` tests; keep the referral ones.
  - `PatientBackgroundConsultationTest`: delete `test_diagnosis_sync_builds_on_the_edited_medical_section` and `test_a_diagnosis_sync_bumps_the_medical_revision_for_later_conflicts`.
  - `CarePlanValidationTest`: `test_the_retired_monitor_and_refer_value_is_rejected_on_a_new_save` also covers `monitor`/`none`; `test_a_refer_care_plan_with_a_referral_or_a_monitor_only_plan_saves` → `…_or_a_recheck_only_plan_saves`; `test_care_plan_round_trips_through_a_draft` uses `recheck` and `startConditionIds`; TB tests move to Task 7.
  - `CarePlanReferralFollowUpTest`: the two "monitored diagnosis" tests use a `recheck` concern.
  - `ConsultationProgramsTest:300-361`: drop `addToConditions`/`conditionStatus` from the draft payload and assertions.
  - `Unit/Services/CarePlanTest`: predicates for `keepsBhcFollowUp`, `refers`, `recheckReason`, `keepsFollowUpWithReferral`.
- [ ] **Step 5: Run** `php artisan test` — Expected: everything passes except `CarePlanSaveTest` cases owned by Task 7 (list them in the commit message if any remain red; Task 7 makes them green).
- [ ] **Step 6: Commit** — `feat(consultation): BHC records health concerns and never writes conditions`

---

### Task 7: Monitoring starts only from a confirmed condition

**Files:**
- Modify: `backend/app/Services/ConditionMonitoringService.php`, `backend/app/Http/Requests/HealthRecordRequest.php` (`care_plan.start_monitoring_condition_ids` nullable array max 20, `.*` integer distinct; monitoring-details keys come from continued-not-stopped monitorings' `condition_key` plus starting conditions' registry key), `backend/app/Http/Controllers/Api/HealthRecordController.php` (lock and pass starting conditions)
- Test: create `backend/tests/Feature/MonitoringStartTest.php`; rewrite `backend/tests/Feature/CarePlanSaveTest.php`

**Interfaces:**
- Consumes: Task 1 models, Task 5 overview, Task 6 `CarePlan`.
- Produces:
  - `lockStarting(Patient $patient, array $conditionIds): Collection<int, PatientCondition>` — locks in id order; 422 on `care_plan.start_monitoring_condition_ids.{i}` with "This condition is not confirmed as Active or Controlled for this patient." (missing, other patient, non-monitorable) or "This condition is already monitored at BHC." (active monitoring with the same identity).
  - `apply(Patient $patient, HealthRecord $record, Collection $continued, Collection $starting, array $stops, User $user, array $referredIds = []): Collection` — creates one monitoring per starting condition (`patient_condition_id`, `condition_name`, `condition_identity` from the condition, `condition_key` from the registry match) with a `started` visit; each continued row is stopped (reason given) or continued (`referred` from `$referredIds`). No diagnosis input; delete `assertEndedConditionsAreStopped` and `isReferred`.

- [ ] **Step 1: Write the failing tests** (`MonitoringStartTest`)

```php
test_starting_monitoring_links_the_confirmed_condition()
test_start_is_rejected_for_under_evaluation_resolved_ruled_out_or_another_patients_condition() // 422, nothing saved
test_an_already_monitored_condition_cannot_be_started_again()
test_a_started_recommendation_leaves_the_overview()
test_starting_tb_requires_its_monitoring_details()
test_legacy_monitoring_continues_refers_and_stops_as_before()
```

- [ ] **Step 2: Run** `php artisan test --filter=MonitoringStartTest` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Rewrite `CarePlanSaveTest`:** delete the diagnosis-driven tests (`test_monitor_starts_one_record_per_condition`, `test_same_condition_twice_in_one_visit_makes_one_record`, `test_a_later_monitor_of_an_active_condition_continues_it`, `test_a_continued_condition_marked_none_must_be_stopped_with_a_reason`, `test_a_continued_condition_ended_in_the_diagnosis_is_stopped_when_a_reason_is_given`, `test_a_re_diagnosed_continued_condition_without_a_care_plan_is_continued`); seed continued monitoring directly (legacy rows) in the rest; `test_a_concurrent_start_of_the_same_monitoring_is_a_409_and_nothing_saves` starts from a confirmed condition.
- [ ] **Step 5: Run** `php artisan test` — Expected: all PASS.
- [ ] **Step 6: Commit** — `feat(monitoring): start BHC monitoring only for RHU-confirmed conditions`

---

### Task 8: Patient-reported previous conditions in the background

**Files:**
- Modify: `backend/app/Services/PatientBackground.php` (`DISEASE_FIELDS` + `note`; rules `currentDiseases.*.note` nullable string max 500; `normalize()` for `currentDiseases`; drop the `ClinicalRegistry` dependency if nothing else uses it)
- Test: `backend/tests/Feature/PatientBackgroundConsultationTest.php`

**Interfaces:**
- Produces: `normalize()` keeps every stored entry whose `source` is not `"Patient-reported"` exactly as stored (the client cannot change or remove it); client entries become `{ name, note, source: "Patient-reported", firstRecorded: <record date for new names, else stored value>, status: null, conditionKey: null }`.

- [ ] **Step 1: Write the failing tests**

```php
test_new_condition_entries_are_saved_as_patient_reported()          // client sends status Active, source Consultation → stored source Patient-reported, status null
test_legacy_entries_cannot_be_changed_or_removed_through_a_background_update()
test_a_patient_reported_entry_can_be_removed()
```

- [ ] **Step 2: Run** `php artisan test --filter=PatientBackgroundConsultationTest` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `php artisan test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(background): conditions added in consultation are patient-reported`

---

### Task 9: Frontend care-plan rules for concerns and monitoring

**Files:**
- Modify: `frontend/src/utils/carePlan.js`, `frontend/src/utils/diagnoses.js`, `frontend/src/utils/recordCarePlan.js`, `frontend/src/utils/carePlanWorkspace.js`
- Test: `frontend/src/utils/carePlan.test.js`, `diagnoses.test.js`, `recordCarePlan.test.js`, `carePlanWorkspace.test.js` (update existing)

**Interfaces:**
- Produces in `carePlan.js`:
  - `CARE_PLAN = { RECHECK, FOLLOW_UP, REFER, NONE, MONITOR, MONITOR_REFER }` (last three legacy, read-only); `CARE_PLAN_OPTIONS` = Recheck / Follow-up / Refer to RHU; `CARE_PLAN_LABELS` covers all values.
  - `NO_CONCERN_MESSAGE = "No health concern was recorded for this visit."` (replaces `NO_CONDITION_MESSAGE`).
  - `carePlanFor(concern): string|null` — a selectable value, else null (legacy values from an old draft come back null, so the worker must choose again).
  - `keepsBhcFollowUp(value): boolean`, `refers(value): boolean`, `recheckReason(concerns): string`.
  - `stopsRequired(continuedMonitorings, stops): Record<id, true>`; `referredContinuingRows(continuedMonitorings, stops, referrals)`; `buildReferralReason(concerns, continuedMonitorings, referrals)`; `monitoredConditionKeys(continuedMonitorings, startingConditions, stops, registry)`.
  - `deriveDisposition({ concerns, continuedMonitorings, startingConditions, stops, referrals, serviceNeedsNextVisit })` → `{ needsReferral, showsFollowUp, monitorsAny, keepsFollowUpWithReferral }`.
  - `validateCarePlan({ continuedMonitorings, stops })` (stop reasons only).
  - `buildCarePlanPayload({ continuedFollowUpTaskIds, continuedMonitorings, startingConditions, stops, referrals })` → `{ continued_follow_up_task_ids, continued_monitoring_ids, start_monitoring_condition_ids, monitoring_stops, monitoring_referrals }` (no `monitoring_status_updates`).
- `diagnoses.js`: remove `CONDITION_STATUSES`, `findCurrentCondition`, `toggleDiagnosisCondition`; `addDiagnosis`/`normalizeDiagnoses` never emit `addToConditions`/`conditionStatus`.
- `carePlanWorkspace.js`: `carePlanFollowUpErrors` requires the follow-up date when `keepsBhcFollowUp` holds for any concern, with the backend's message.

- [ ] **Step 1: Rewrite the tests** for the signatures above, including:

```js
test("a legacy monitor value from an old draft needs a new choice", () => {
  assert.equal(carePlanFor({ name: "HTN", carePlan: "monitor" }), null);
});
test("recheck reason lists rechecked concerns only", () => {
  assert.equal(recheckReason([{ name: "Elevated BP", carePlan: "recheck" }, { name: "Cough", carePlan: "refer" }]), "Recheck: Elevated BP");
});
test("payload carries starting conditions and no status updates", () => {
  const payload = buildCarePlanPayload({ startingConditions: [{ id: 7 }] });
  assert.deepEqual(payload.start_monitoring_condition_ids, [7]);
  assert.ok(!("monitoring_status_updates" in payload));
});
test("no emergency option is offered", () => {
  assert.deepEqual(CARE_PLAN_OPTIONS.map((o) => o.value), ["recheck", "follow_up", "refer"]);
});
```

- [ ] **Step 2: Run** `node --test src/utils/carePlan.test.js src/utils/diagnoses.test.js src/utils/recordCarePlan.test.js src/utils/carePlanWorkspace.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(consultation): care-plan rules for health concerns`

---

### Task 10: Frontend data — conditions grouping, overview and start selection

**Files:**
- Create: `frontend/src/utils/medicalConditions.js`, `frontend/src/utils/medicalConditions.test.js`, `frontend/src/services/patientConditionService.js`
- Modify: `frontend/src/utils/queryKeys.js` (`patientConditions(patientId)`), `frontend/src/utils/careOverview.js` (map `monitoring_recommendations`, `condition_status`, `legacy`), `frontend/src/utils/startConsultation.js`, `frontend/src/utils/continuedCare.js`, `frontend/src/utils/consultationRoute.js`, `frontend/src/services/startConsultationService.js`
- Test: `medicalConditions.test.js` (new); update `careOverview.test.js`, `startConsultation.test.js`, `continuedCare.test.js`, `consultationRoute.test.js`

**Interfaces:**
- Produces:
  - `getPatientConditions(patientId)` → camelized `{ conditions, legacyMonitorings }`.
  - `groupMedicalConditions({ conditions = [], legacyMonitorings = [], currentDiseases = [], registry = {} })` → `{ confirmed, underEvaluation, unverified, patientReported, past }`. `confirmed` = active/controlled conditions (`kind: "rhu"`) + legacy monitorings (`kind: "legacy-monitoring"`); `unverified` = `currentDiseases` with `source !== "Patient-reported"` whose `conditionIdentity(name, registry)` matches no condition or legacy monitoring; `patientReported` = `source === "Patient-reported"`.
  - `alertConditionNames(groups): string[]` — names from `confirmed` only.
  - `monitoringRecommendationOptions(overview)` → `[{ conditionId, conditionName, status, confirmedAt, recommendedAt }]`, alphabetical.
  - `hasStartChoices(overview)` (replaces `hasMonitoredConditions`): monitoring options or recommendations exist.
  - `startRoute({ patientId, monitoringIds, startConditionIds }, basePath)`; `selectionToRoute` adds `startConditionIds`; `resolveBhcConsultationRoute` returns `startConditionIds`.
  - `resolveContinuedCare(overview, { …, startConditionIds })` also returns `startingConditions` and `droppedConditionIds`; `checkContinuedStart(overview, monitoringIds, startConditionIds)` → `{ ok, droppedMonitoringIds, droppedConditionIds }`; `ContinuedStartError` carries `droppedConditionIds`; `prepareContinuedStart(queryClient, patientId, monitoringIds, startConditionIds)`.

- [ ] **Step 1: Write the failing tests**, including:

```js
test("legacy consultation entries are unverified, never patient-reported", () => {
  const g = groupMedicalConditions({ currentDiseases: [{ name: "Asthma", source: "Consultation", status: "Active" }] });
  assert.equal(g.unverified.length, 1);
  assert.equal(g.patientReported.length, 0);
  assert.equal(g.confirmed.length, 0);
});
test("legacy monitoring is confirmed/monitored but labelled legacy", () => {
  const g = groupMedicalConditions({ legacyMonitorings: [{ id: 1, conditionName: "Hypertension" }] });
  assert.equal(g.confirmed[0].kind, "legacy-monitoring");
});
test("an unverified entry matching a confirmed condition is not listed twice", () => { /* HTN entry + active Hypertension condition */ });
test("under evaluation and past are separate and never alert", () => { /* alertConditionNames excludes them */ });
test("a dropped recommendation is reported, not silently removed", () => {
  assert.deepEqual(checkContinuedStart({ monitoringRecommendations: [] }, [], [9]).droppedConditionIds, [9]);
});
```

- [ ] **Step 2: Run** `node --test src/utils/medicalConditions.test.js src/utils/careOverview.test.js src/utils/startConsultation.test.js src/utils/continuedCare.test.js src/utils/consultationRoute.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(conditions): frontend grouping, recommendations and start selection`

---

### Task 11: BHC consultation UI — concerns, Condition Monitoring, Start prompt

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/DiagnosisListField.jsx` (Health Concerns: label "Health Concerns", placeholder "Type a health concern…", no combobox / `carePathways` suggestions, no Add-to-Current-Conditions toggle, props `canAddToConditions` and `currentConditions` removed)
- Modify: `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx` (per-concern next action radio from `CARE_PLAN_OPTIONS` + `DiagnosisReportingField`; heading "This visit's health concerns"; separate "Condition Monitoring" block: continued rows → Continue Monitoring / Refer back to RHU / Stop BHC Monitoring (+ `StopReason`) and, when `conditionStatus` is resolved/ruled out, a note "RHU marked this condition <Status>"; starting rows → "Start BHC Monitoring — confirmed by RHU <date>"; legacy rows show "Legacy BHC Monitoring"; no status control; props `statuses`, `documentedStatuses`, `onStatusChange` removed, `startingConditions` added)
- Modify: `frontend/src/components/features/health-records/wizard/MonitoredConditionsNote.jsx` (delete if it only served the Assessment note)
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (Assessment subtitle "Record the health concerns found in this visit."; remove `documentedStatuses`, monitoring statuses state and `canAddToConditions`; load `startingConditions` from the route via Task 10 helpers; pass Task 9 signatures; draft save/restore `carePlan.startConditionIds`; drop `monitoringStatuses` from drafts; error copy "A health concern is required for follow-up or referral.")
- Modify: `frontend/src/components/features/patients/profile/StartConsultationModal.jsx`, `ConsultationActions.jsx`, `frontend/src/hooks/usePatientConsultation.js` (use `hasStartChoices`; second list "Recommended by RHU — start BHC monitoring" rendering `monitoringRecommendationOptions`; `onStart({ monitoringIds, startConditionIds })`; dropped-condition message "<name> is no longer recommended for BHC monitoring and was unticked."; services stay out of the modal)
- Modify: `frontend/src/components/features/health-records/HealthRecordClinicalDetails.jsx` (read-back labels via `CARE_PLAN_LABELS`, heading "Health Concerns" for records with new values)

**Interfaces:**
- Consumes: Task 9 `carePlan.js`, Task 10 start/overview helpers.

- [ ] **Step 1: Verify the util tests from Tasks 9–10 still pass** — `node --test src/utils/*.test.js` — Expected: PASS.
- [ ] **Step 2: Implement the component changes above.**
- [ ] **Step 3: Run** `npm run lint` and `npm run build` in `frontend/` — Expected: no errors.
- [ ] **Step 4: Manual check with the run skill:** start a BHC consultation for a patient with (a) legacy monitoring and (b) an RHU recommendation; confirm the modal lists both, the workspace shows Health Concerns with Recheck/Follow-up/Refer only, the Condition Monitoring block has no status control, and finalizing with a "Hypertension" concern creates no condition (check the Background tab).
- [ ] **Step 5: Commit** — `feat(consultation): health concerns and condition monitoring UI`

---

### Task 12: Profile display and patient-reported editor

**Files:**
- Create: `frontend/src/components/features/patients/MedicalConditionsGroups.jsx` (renders the five groups; Confirmed rows "Confirmed by RHU · <date>" or "Legacy BHC Monitoring", plus "Monitored at BHC since <date>"; Under Evaluation "Under RHU evaluation"; Unverified label exactly as Global Constraints; Past collapsed as "Past (n)" with each condition's events: status change, who, when, source "RHU feedback" / "RHU record")
- Modify: `frontend/src/components/features/patients/PatientBackgroundTab.jsx` (replace the Monitored/Other `DiseaseGroupView`s with `MedicalConditionsGroups`), `frontend/src/components/features/patients/profile/PatientFactsSections.jsx` (Current Conditions section → "Medical Conditions", count = confirmed + underEvaluation), `frontend/src/components/features/patients/PatientAlertChips.jsx` (chips from `alertConditionNames`; new prop `conditionGroups`), their callers in `frontend/src/pages/bhc/PatientDetails.jsx` and `frontend/src/pages/rhu/RHUPatientDetails.jsx` (query `queryKeys.patientConditions(id)` with `getPatientConditions`, enabled with `clinical.history`)
- Modify: `frontend/src/components/features/patients/background/BackgroundEditor.jsx`, `BackgroundFields.jsx`, `frontend/src/utils/backgroundUpdate.js`, `frontend/src/utils/backgroundConditions.js`, `frontend/src/components/features/health-records/wizard/ConsultationBackgroundCard.jsx` (editor section "Patient-Reported Previous Conditions": name + optional note, no status; legacy entries shown read-only under the Unverified label; `DISEASE_FIELDS` gains `note`)
- Delete: `frontend/src/utils/currentConditions.js` and its test if no caller remains
- Test: `frontend/src/utils/backgroundUpdate.test.js`, `backgroundConditions.test.js` (update)

**Interfaces:**
- Consumes: Task 10 `groupMedicalConditions`, `alertConditionNames`, `getPatientConditions`.

- [ ] **Step 1: Update the tests** — `backgroundUpdate.test.js`: a new disease entry is built as `{ name, note, source: "Patient-reported" }` with no status; legacy entries are passed through unchanged; `backgroundConditions.test.js`: groups come from `groupMedicalConditions`.
- [ ] **Step 2: Run** `node --test src/utils/backgroundUpdate.test.js src/utils/backgroundConditions.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, `npm run lint`, `npm run build` — Expected: PASS / no errors.
- [ ] **Step 5: Commit** — `feat(profile): medical conditions grouped by clinical source`

---

### Task 13: RHU Confirm Conditions block

**Files:**
- Create: `frontend/src/components/features/conditions/ConfirmConditionsBlock.jsx`, `frontend/src/utils/conditionConfirmations.js`, `frontend/src/utils/conditionConfirmations.test.js`
- Modify: `frontend/src/pages/rhu/FeedbackReturnSlip.jsx` (block below the RHU diagnosis field; context = the referral's health concerns + `getPatientConditions`), `frontend/src/services/referrals.js:358` (`submitReturnSlip` sends `condition_confirmations`), `frontend/src/pages/rhu/RHUAddHealthRecords.jsx` (block next to "Updated Diagnosis"; payload `condition_confirmations`); invalidate `queryKeys.patientConditions(patientId)` and `queryKeys.careOverview(patientId)` after a successful save
- Test: `frontend/src/utils/conditionConfirmations.test.js`

**Interfaces:**
- Produces:
  - `CONDITION_STATUS_OPTIONS = [{ value: "under_evaluation", label: "Under Evaluation" }, { value: "active", label: "Active" }, { value: "controlled", label: "Controlled" }, { value: "resolved", label: "Resolved" }, { value: "ruled_out", label: "Ruled Out" }]`.
  - `buildConditionConfirmations(rows)` → only rows with `setOnRecord === true`, mapped to `{ condition_id?, name?, status, note?, recommend_bhc_monitoring }`; `recommend_bhc_monitoring` forced false unless status is active/controlled.
  - `validateConditionConfirmations(rows)` → errors keyed `conditionConfirmations.<index>.<field>`: name required for new rows, status required, duplicate names (case/space-insensitive) rejected.
- Block UI: "+ Confirm condition" adds a row (name input — plain text, no suggestions; status select; note; "Set on patient's record" checkbox; "Recommend BHC monitoring" checkbox enabled only for Active/Controlled); existing open conditions listed with a status select + note + "Set on patient's record". Render only when `can(user, "conditions.confirm")`.

- [ ] **Step 1: Write the failing tests**

```js
test("unticked rows are never sent", () => {
  assert.deepEqual(buildConditionConfirmations([{ name: "Hypertension", status: "active", setOnRecord: false }]), []);
});
test("recommendation is dropped for non-monitorable statuses", () => {
  const [row] = buildConditionConfirmations([{ name: "Asthma", status: "under_evaluation", setOnRecord: true, recommend: true }]);
  assert.equal(row.recommend_bhc_monitoring, false);
});
test("duplicate names are rejected", () => { /* "HTN " and "htn" */ });
```

- [ ] **Step 2: Run** `node --test src/utils/conditionConfirmations.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the util, the block and the two form integrations.
- [ ] **Step 4: Run** the test, `npm run lint`, `npm run build` — Expected: PASS / no errors. Manual check with the run skill: submit RHU feedback confirming "Hypertension" Active with "Recommend BHC monitoring", then confirm the BHC Start Consultation prompt lists it and the profile shows it under Confirmed / Monitored as "Confirmed by RHU".
- [ ] **Step 5: Commit** — `feat(rhu): confirm conditions on feedback and RHU records`

---

### Task 14: Whole-suite verification and docs

**Files:**
- Modify: `docs/ai/CURRENT.md` (one paragraph: the clinical boundary, where confirmation happens, the new tables; link the spec)

- [ ] **Step 1: Run** `php artisan test` (backend) and `node --test src/utils/*.test.js`, `npm run lint`, `npm run build` (frontend) — Expected: all pass.
- [ ] **Step 2: Grep for leftovers:** `CurrentConditionsSync|applyConditionStatuses|addToConditions|monitoring_status_updates|monitoringStatuses|NO_CONDITION_MESSAGE|Suspected Case` across `backend/app`, `frontend/src` — Expected: no matches (the `HealthRecordRequest` `prohibited` rules and legacy read-back labels are the only allowed hits).
- [ ] **Step 3: Update `docs/ai/CURRENT.md`** and commit — `docs: record the clinical boundary in CURRENT.md`
