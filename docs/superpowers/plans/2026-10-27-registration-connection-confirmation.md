# Registration Connection Confirmation

User-approved design: two explicit actions, Household Label Only and Confirm Family Connection, in the existing review and selected-household summary. No extra modal or registration step. Spouse/sibling remain relationship rows; Mother/Father remain patient foreign keys. Labels and FSN membership never infer a connection.

## Approach and boundaries

Reuse the existing `household.relationship_link.type` registration command. `mother` / `father` identify existing parent-link roles, not new database relationship types. Son/Daughter requires explicit selection of the head's parent role. Mother/Father reverses the direction and requires family-management permission plus modification access to the existing head. Reject occupied parent slots; corrections remain in Families. Registration-only parent commands are rejected on household-transfer PATCH, preserving that workflow.

Parent confirmation stays inside `PatientController::store`'s existing transaction and facility lock through `Households::attach`. Reuse and share parent-candidate validation in `PatientRelationships`; no controller-to-controller calls, new APIs, migrations or stored procedures. Keep reported names untouched. Invalid confirmation rolls back registration; the staff may explicitly retry Household Label Only. No silent fallback.

## Tasks

- [x] Backend: failing registration tests for both parent directions, role mismatch, authorization, inactive/conflicting/cyclic links, audit rollback and label-only; extend existing request/household command and parent service; keep transfer cases passing.
- [x] Frontend: failing pure payload/offer and real React rendering tests; shared two-action controls and role selection; replace registration checkboxes; clear confirmation on relationship changes; preserve old transfer behavior via an opt-in registration flag.
- [x] Invalidate the existing head's cached profile after a reverse parent link; run targeted and full suites, build/lint/Pint and a focused independent review.

## Files

| File | Purpose |
| --- | --- |
| `backend/app/Http/Requests/PatientRequest.php` | Accept mother/father role commands through the existing registration link payload. |
| `backend/app/Services/Households.php` | Resolve direction from the head-relative label and confirm atomically during registration; reject parent commands on transfer PATCH. |
| `backend/app/Services/PatientRelationships.php` | Shared parent-candidate validation, permission checks, occupied-slot rejection and audited parent-column update. |
| `backend/app/Http/Controllers/Api/PatientController.php` | Delegate existing parent validation to the shared service so Families and registration use the same safeguards. |
| `backend/tests/Feature/RegistrationRelationshipLinkTest.php` | Add 11 registration tests for both directions, BHC/RHU, permissions, invalid roles, inactive patients, occupied slots, cycles and rollback. |
| `frontend/src/utils/relationshipLink.js` | Registration eligibility and explicit label-only/confirmed draft helpers; existing spouse/sibling mapping remains available. |
| `frontend/src/components/features/patients/HouseholdConnectionReview.jsx` | Shared two-action control and parent-role selector in the existing inline review. |
| `frontend/src/components/features/patients/FamilyRegistryField.jsx` | Reuse the same actions in the selected-household summary; retain non-registration behavior. |
| `frontend/src/pages/bhc/AddPatient.jsx` | Enable the workflow for new live registrations only; also used by RHU. |
| `frontend/src/pages/bhc/BhcPatientRegistration.jsx` | Supply effective family-management permission and refresh cached head profiles after saving. |
| `frontend/src/utils/householdData.js` | Map nested confirmation failures to the inline relationship field. |
| `frontend/src/utils/registrationConnection.test.js` | Eligibility, direction, stale confirmation removal, payload isolation and error mapping. |
| `frontend/src/components/features/patients/FamilyRegistryField.test.js` | Real React rendering checks for actions in both locations and explicit Mother/Father selection. |
| This plan | Approved design, scope and verification record. |

## Execution notes

Work in the existing checkout and preserve all prior changes. No commit/push, migration, global search or cross-facility access change. User explicitly approved the actions and directed implementation.

## Verification

- Backend targeted: **116 passed, 864 assertions**, covering registration links, existing parent safeguards, BHC/RHU household registration, transfer and patient-creation permissions.
- Frontend focused: **32 passed**, covering real rendering plus registration connection helpers, existing spouse/sibling label mapping, household serialization and transfer payloads.
- Production build, ESLint on changed files, Laravel Pint on changed PHP files, and `git diff --check`: **passed**. Existing bundle-size warning remains.
- Full backend: **1,318 tests; 1,294 passed, 23 skipped, 1 failed**. Existing unrelated failure: `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again` (expected 201, got 500).
- Full frontend: **1,224 tests; 1,222 passed, 2 failed**. Existing unrelated failures: `doctorAvailability.test.js` expected-return date fixture; `draftConversion.test.js` restored care plan includes `serviceReferrals: []`.
- Focused independent read-only review: no important/critical findings. Checked direction, occupied-slot protection, reverse-head permissions, transaction rollback, explicit confirmation state and PATCH transfer isolation.
- Not run: live browser interaction and live PostgreSQL concurrency verification. Backend automated tests use isolated SQLite; frontend UI checks use real React server rendering.

## Final behavior and limits

Staff choose Household Label Only or Confirm Family Connection in the existing review/summary, then Save Patient. Son/Daughter must explicitly choose the head's Mother/Father role. Mother/Father links require authority to modify the existing head plus family-management duties. Reported names remain unchanged. Unsupported labels never produce relationship rows or parent links. A failed confirmation rolls back registration; staff may explicitly choose label-only and retry. Existing parent corrections and cross-FSN linking remain in Families.

`mother` and `father` are command roles targeting the existing patient columns; the persisted `patient_relationships` types remain spouse/sibling. No new relationship table, API endpoint or schema change was introduced.
