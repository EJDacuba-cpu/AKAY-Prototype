# Task 4 Report — Backend validation + physician authority

Status: **DONE** (focused PHPUnit). No browser check; this task is request/store validation.
Commits: none (forbidden). Migration: not run.

## Files

- Created: `backend/app/Services/PrescriptionClinicalAuthority.php`
- Created: `backend/tests/Unit/Services/PrescriptionClinicalAuthorityTest.php`
- Modified: `backend/app/Http/Requests/HealthRecordRequest.php` (prescription rules only; TB/Form 4B rules left in place)
- Modified: `backend/app/Http/Controllers/Api/HealthRecordController.php` (RHU ITR store gate + attestation)
- Not modified: `backend/app/Http/Requests/TbCaseRegistrationRequest.php` (still dirty from earlier TB work)
- Not modified: `backend/app/Services/HealthRecordDraftPayloadService.php` (Task 3 allow-list already matches the contract fields)

`TbCaseRegistrationRequest.php` was not edited. `HealthRecordDraftPayloadService.php` stays permissive so an in-progress row can still autosave.

## Behavior

- `canAuthorize` is RHU + `staff_role === 'doctor'` + `conditions.confirm`. Nurse, finalize-only doctor, BHC doctor, and null fail. `ensureCanAuthorize` returns 403 and then checks the facility assignment.
- RHU ITR `monitoring_data.prescriptions` (max 50): required id, non-empty `diagnosisIds`, medicine/strength/dose/route/frequency/duration, `source` of `itr` or `tb_form4b_ref`, `tbCaseId` when the source is a Form 4B reference. `authorizedQuantity` must be an integer ≥ 1 and requires `authorizedUnit`. Diagnosis ids must be entry ids on this visit.
- A non-empty list on RHU ITR finalize/store requires that gate. Each order gets `authorization`, and `monitoring_data.prescriptionAuthorization` stores the same attestation. The hash is SHA-256 over fixed clinical slots (order, diagnosis-id order, and medicine fields). Key order and a client `authorization` do not change it.
- Attestation is applied after the idempotency hash, same idea as `tb_assessment_authority`, so a retry does not miss because `authorizedAt` changed.
- Empty or omitted `prescriptions`, including legacy `prescriptionText`, still finalize under the existing permission. A client `prescriptionAuthorization` is removed and is not stored.
- TB `authorizeRecord` / `validateTbCaseRegistration` are unchanged. `TbClinicalAuthorityTest` stayed green.

## TDD evidence

### RED

`php artisan test --filter=PrescriptionClinicalAuthorityTest` (cwd `backend`)

9 tests: 1 passed, 4 failed, 4 errors.

- Class `PrescriptionClinicalAuthority` was missing (authority, hash, doctor finalize).
- Nurse with `consultations.finalize` stored a structured order (201, expected 403).
- Unknown diagnosis ids, quantity without unit, and a Form 4B reference without `tbCaseId` were stored (201, expected 422).
- Empty prescriptions already finalized. That case stayed green.

### GREEN

Same filter: **9 passed, 65 assertions**.

`php artisan test --filter="HealthRecordDraftPayloadServiceTest|RhuItrConsultationTest"`

**43 passed, 314 assertions.**

`php artisan test --filter="PrescriptionClinicalAuthorityTest|TbClinicalAuthorityTest"`

**26 passed, 139 assertions.**

## Concerns

- API errors use `monitoring_data.prescriptions.{index}.{field}`. The workspace uses `prescriptions.{id}.{field}`. Nothing remaps those keys.
- Drafts still accept incomplete orders, including a non-integer quantity. Finalize is the strict boundary. `authorization` is not on the draft allow-list, so a forged attestation is dropped on autosave.
- Other workflows still keep unvalidated `monitoring_data` siblings. This gate runs only for RHU ITR post.
- The hash covers the whole ordered list. Editing one order changes every order's `authorization.prescriptionHash`.
- Dispense eligibility is Task 6. This task only writes the attestation.

## Review fixes

Status: **DONE**. No commit. `HealthRecordController` and TB/Form 4B request files were not edited.

- Finalize now stores only the hashed clinical slots: `id`, `diagnosisIds`, medicine name, strength, dose, route, frequency, duration, instructions, and `source`, plus `authorizedQuantity` / `authorizedUnit` when present and `tbCaseId` when the source is `tb_form4b_ref` or a case id is set. The server `authorization` object is added after that reduction. `medicineId`, `status`, other client extras, and an empty unused `tbCaseId` are not stored.
- `attestation` returns null unless `canAuthorize` passes. `applyToMonitoringData` does not stamp for that user and drops a client `authorization` / `prescriptionAuthorization`. The controller `ensureCanAuthorize` call is unchanged.

### TDD evidence

RED, before the writer change, `php artisan test --filter="test_finalize_persists_only_hashed_clinical_fields|test_unauthorized_writer_cannot_mint_attestation"`: **2 failed**.

- Finalize stored `clientNote`, `medicineId`, `status`, and an empty `tbCaseId` beside the clinical slots.
- A nurse's `attestation()` returned a physician stamp and hash.

GREEN: `php artisan test --filter="PrescriptionClinicalAuthorityTest|HealthRecordDraftPayloadServiceTest|RhuItrConsultationTest"`

**54 passed, 399 assertions.**
