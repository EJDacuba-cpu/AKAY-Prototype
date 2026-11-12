# Task 3 Report — Workspace draft / review / finalize wiring

Status: **DONE** (code and focused tests). Manual click-through of a live consultation was **not** completed.
Commits: none (forbidden)

## Files

- Modified: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modified: `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`
- Modified: `frontend/src/utils/rhuPrescriptions.js`
- Modified: `frontend/src/utils/rhuPrescriptions.test.js`
- Modified: `frontend/src/utils/consultationSteps.js`
- Modified: `frontend/src/utils/consultationSteps.test.js`
- Modified: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Modified: `backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php`

TB assessment, Form 4B registration intent, and referral walk-in Next Action were left in place. `prescriptionText` is still restored for legacy drafts and still passed into Form 4B as a hint. Structured orders are not written back into it.

The draft service was updated because `sanitizeNode()` rejects unknown payload keys. Sending `prescriptions` without that allow-list would fail every RHU autosave. Physician authority and `HealthRecordRequest` rules remain Task 4.

## What the workspace does

- State is a visit-level `prescriptions` array, passed to `RhuDiagnosisCarePlanSection` with `onPrescriptionsChange`.
- Changes are stored with `normalizePrescriptions`. Draft payload includes `prescriptions` beside `prescriptionText`, so the autosave fingerprint changes with the orders.
- Restore uses `restorePrescriptions`: top-level `prescriptions`, then `monitoringData` / `monitoring_data`. Ids and `diagnosisIds` are kept. Legacy text is not turned into orders.
- Finalize puts `prescriptionsForSave(prescriptions)` on `monitoringData.prescriptions`. `prescriptionText` stays the legacy string only.
- Review lists `formatPrescriptionLine` under each linked diagnosis. One order with two diagnosis ids appears on both. Legacy `prescriptionText` is shown only when there are no structured orders and the text is non-empty.
- `prescriptionErrors` runs on Diagnosis & Care Plan Next and again inside `saveRecord` before the record is created. Those keys route to the diagnosis step.

## TDD evidence

### RED

Command (cwd `frontend`):

`node --test src/utils/rhuPrescriptions.test.js src/pages/rhu/RhuConsultationWorkspace.test.js src/utils/consultationSteps.test.js src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js src/utils/rhuCarePlan.test.js`

Result: **3 failed, 107 passed**.

- `rhuPrescriptions.test.js` could not import `prescriptionReviewGroups`.
- Workspace source had no `restorePrescriptions`, draft `prescriptions`, or finalize `prescriptionsForSave`.
- `getErrorOwnerStepKey("prescriptions", RHU_ITR_STEP_OPTIONS)` was `null`.

Existing TB, referral, and care-plan tests in that run stayed green.

### GREEN

Same command:

```
tests 126
pass 126
fail 0
duration_ms 2476.3837
```

Draft allow-list (cwd `backend`):

`php artisan test --filter=test_structured_prescriptions_keep_ids_and_diagnosis_links_in_drafts`

```
passed 1, assertions 4, duration_ms 5593
```

ESLint on the six frontend files above: exit 0. Six existing `react-hooks/exhaustive-deps` warnings in `RhuConsultationWorkspace.jsx`. No new errors.

## Manual sanity

`npm run dev` is already running in the frontend terminal. This task did not open a consultation, add an order, resume a draft, or finalize. Do not treat the UI path as verified.

## Concerns

- Task 4 still owns physician authorization and request rules for `monitoring_data.prescriptions`. The client now sends the array. `HealthRecordRequest` keeps unvalidated JSON siblings (`excludeUnvalidatedArrayKeys = false`), and the RHU store spreads `monitoring_data`, so the array can be stored before those rules exist. A non-physician who can finalize is not blocked yet.
- Server keys such as `monitoring_data.prescriptions.0.medicineName` are not remapped onto `prescriptions.{id}.{field}`.
- Legacy `prescriptionText` still seeds Form 4B. A new structured order does not update that hint.
