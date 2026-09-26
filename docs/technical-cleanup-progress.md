# Technical cleanup progress

Source checklist: `D:\Documents\AKAY_TECHNICAL_TODO.md` (source file unchanged).

## 2026-09-26 — Item 1: Patient creation permission gap

Status: implemented and verified locally; not deployed.

- [x] Review `PatientController::store`, `PatientRequest`, and `PatientIdentity`.
- [x] Strip unauthorized `medical_background` before creation using the existing
  `clinical.history` permission and existing admin patient-management exception.
- [x] Suppress clinical background in the creation response for restricted users.
- [x] Return only `PatientIdentity` fields for the linked mother when restricted.
- [x] Preserve registration fields and mother linkage in the new patient's response.
- [x] Test admin, BHC clinical staff, registration-only encoder, and RHU staff.
- [x] Test an encoder granted history and a midwife denied history: assigned
  permissions determine access, not professional designation.
- [x] Test snake_case and camelCase history input aliases.
- [x] Test that history permission alone cannot authorize patient registration.

`PatientRequest` already normalizes both history aliases before validation; no
validation changes were necessary. Unauthorized valid history is ignored while
registration succeeds, consistent with the existing update filtering behavior.
No new stored procedure, frontend cache behavior, or schema migration is needed.

Validation:

- `php artisan test --compact --filter='PatientCreationPermissionsTest|test_epi_infant_patient_creation|test_patient_creation'`
  passed: 11 tests, 148 assertions (SQLite).
- PHP syntax checks and `git diff --check` passed.
- Frontend ESLint: zero errors, one existing `selectPatient` dependency warning
  in `RHUAddHealthRecords.jsx:773` (separate checklist item).
- The separately run existing `ApprovedFacilityPermissionsTest` has three 401
  failures with its `access` token ability (middleware expects `akay:access`),
  and one duplicate `Home` facility fixture error. It was not changed in this batch.
  The new creation tests use the expected token ability.

## Next

Item 2: Database containment / Supabase verification. Not yet implemented or verified.

## Decisions retained for the later permission/workflow batch

- Suggested permission checkboxes based on Midwife, Nurse, Encoder, and RHU Staff
  designations; admin can customize actual permissions.
- Separate Save Draft, Submit for Review, and Review & Finalize permissions.
- Submitted records are locked for the encoder; reviewers can edit or return them
  for correction, after which the encoder can edit and resubmit.
- Facility display labels: BHC Facility and RHU Facility where applicable.
- These broader changes are not included in item 1.
