# Parent and Guardian Links Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Explicit Families parent linking with safe optional manual fallback and correct Patient Information.

**Architecture:** Reuse Laravel patient updates, `PatientRelationships`, facility access, existing parent foreign keys and audit logs. Use React/shadcn controls with narrowly scoped PATCH and TanStack Query invalidation; no schema changes.

**Tech Stack:** React, Tailwind, shadcn/ui, TanStack Query, Laravel, PostgreSQL; SQLite tests.

**Spec:** `docs/superpowers/specs/2026-10-27-parent-guardian-links-design.md`

## Global Constraints

- Preserve FSN, household membership, manual names, guardian data and audit history.
- Parent linking requires explicit confirmation and existing facility/permission checks.
- No nested registration, automatic relationships, new migrations or dependencies.
- Parent and Guardian Information remains accessible at every age.

## Review Focus

- Stale replacement must not overwrite another staff member's link: test expected parent ID conflict.
- Registration-only staff must not establish existing-patient parent links: permission regression.
- Scoped reads must not expose an inaccessible linked parent's identity: identity-read regression.
- Changing DOB or saving an adult must not clear reported names: payload/render checks.
- Manual reported names must survive link/unlink and guardian saves: backend preservation and frontend display tests.

### Task 1: Backend safety and identity reads

Files: `PatientController.php`, `PatientRequest.php`, `PatientRelationships.php`, `PatientIdentity.php`, new `ParentGuardianWorkflowTest.php`.

Interface: existing PATCH `/patients/{id}`; optional `parent_link_base` maps the changed parent field to its expected old ID. Existing GET returns scoped parent identity.

- [x] Write and run regressions for cycle, inactive, authorization, stale changes, cross-FSN preservation and scoped identity.
- [x] Implement validation under existing facility lock, parent-change permission, audit detail and scoped identity serialization.
- [x] Run new and existing parent/family backend tests.

### Task 2: Families explicit parent workflow

Files: `patientService.js`, new `parentLinks.js`, new `FamilyParentLinks.jsx`, `BhcFamilyConnections.jsx`, utility tests.

Interface: `parentLinkPayload(role, parentId, previousId)` returns only the relevant parent ID and expected base. `updatePatientParent` reuses PATCH without full registration serialization.

- [x] Test narrow payload and reported-value fallback behavior, watch new tests fail.
- [x] Add facility-scoped, paginated patient search, explicit link/replace/remove confirmation and inline errors using existing UI components.
- [x] Invalidate patient/family caches after successful mutation; retain spouse/sibling workflow.

### Task 3: Optional manual entry and all-age display

Files: `RegistrationSections.jsx`, `patientProfile.js`, `AddPatient.jsx`, profile and SSR rendering tests.

Interface: existing registration and inline editor; no parent IDs added to registration payload.

- [x] Test optional minor parent names and linked name priority, no duplicate editable name fields, separate guardian section and adults without family data.
- [x] Remove parent-required rules and DOB-based clearing/hiding; preserve reported values; show Families entry guidance.
- [x] Run related Node regressions, full available suites, build and available UI checks; unavailable checks recorded below.

## Execution ledger

- Ruling: execute in current checkout to retain the user's ongoing patient-profile changes; no branch/worktree creation or commits. Latest instruction explicitly says proceed with implementation.
- Reused files/APIs and actual gaps were inspected and explained before edits.
- Ruling: independent review reproduced a descendant conflict (A is B's mother, B's spouse C becomes A's mother). Extend the existing validator to inspect affected descendants' spouse/sibling rows. Regression failed with HTTP 200 before the fix and passes with HTTP 422 afterward.

## Files changed and purpose

All application paths below are relative to `backend/` or `frontend/` as indicated. Existing unrelated profile and workspace changes were preserved.

| File | Purpose |
| --- | --- |
| `backend/app/Http/Controllers/Api/PatientController.php` | Locked parent validation, change permission, stale-link conflict, audit details and scoped parent read responses. |
| `backend/app/Http/Requests/PatientRequest.php` | Integer parent IDs and optional expected previous parent IDs. |
| `backend/app/Services/PatientRelationships.php` | Reject parent cycles and spouse/sibling ancestry conflicts affecting descendants; fail safely at the generation bound. |
| `backend/app/Services/PatientIdentity.php` | Facility-scoped parent identity without exposing parent clinical background. |
| `backend/app/Services/PatientDetail.php` | Return only the linked parent's identity columns in clinical profile reads. |
| `backend/tests/Feature/ParentGuardianWorkflowTest.php` | 13 regression cases for linking, permissions, facility scope, preservation, ancestry and audit. |
| `backend/tests/Feature/HouseholdParentLinkTest.php` | Give the self-link validation fixture the family-management duties required for a parent edit. |
| `frontend/src/components/features/families/FamilyParentLinks.jsx` | Scoped search, pagination, explicit link/replace/remove confirmation and inline errors. |
| `frontend/src/pages/bhc/BhcFamilyConnections.jsx` | Mount the parent workflow with existing family and registration permissions for BHC/RHU. |
| `frontend/src/services/patientService.js` | Narrow parent PATCH using the existing patient update endpoint. |
| `frontend/src/utils/parentLinks.js` | Narrow payload and linked-versus-reported presentation helpers. |
| `frontend/src/components/features/patients/profile/RegistrationSections.jsx` | Always-accessible parent and separate guardian sections; linked identity first, reported values retained. |
| `frontend/src/pages/bhc/AddPatient.jsx` | Optional all-age reported parent and guardian entry; preserve names across DOB changes; registration still omits link IDs. |
| `frontend/src/pages/bhc/PatientDetails.jsx` | Add the authorized Families parent-management entry point; preserve ongoing unrelated edits. |
| `frontend/src/pages/rhu/RHUPatientDetails.jsx` | Add the same entry point for owned RHU patients. |
| `frontend/src/utils/patientProfile.js` | Remove mandatory mother-name validation. |
| `frontend/src/utils/patientProfile.test.js` | Verify unknown parents do not block minors. |
| `frontend/src/utils/parentLinks.test.js` | Payload isolation, registered identity priority and reported-data preservation. |
| `frontend/src/components/features/patients/profile/RegistrationSections.test.js` | Real React server-rendered all-age, linked-parent and guardian behavior. |
| `docs/superpowers/specs/2026-10-27-parent-guardian-links-design.md` | Record the user-approved scope and architecture. |
| This plan | Implementation and verification record. |

## Reused connections and final workflow

- `patients.mother_patient_id` / `father_patient_id`, `Patient::mother()` / `father()`; no parent rows are added to `patient_relationships`.
- Existing `GET /api/patients?search=...` uses `FacilityAccessService::scopePatients` and existing patient-read permissions. Search can span FSNs but never expands facility access.
- Existing `GET /api/patients/{id}` and `PATCH /api/patients/{id}`, `PatientRequest`, patient modification authorization, facility transaction lock, `PatientRelationships`, `AuditLogger`, TanStack Query and existing shadcn/modal components.
- Staff open Families > household > member > Edit connections, search a registered Mother/Father, review and confirm. Replace/remove also requires confirmation. Existing FSNs and household membership stay unchanged. A stale correction returns 409 for review/reload.
- Patient Information displays registered identity first, keeps reported information separately, and provides optional reported names when there is no link. Guardians remain independent. Both sections remain accessible for minors and adults.
- An unregistered parent can be registered through the existing separate Add Patient route, followed by explicit Families linking. No nested or automatic parent registration.

## Validation results (2026-10-27)

- Backend targeted regression command: `php vendor/bin/phpunit --filter 'ParentGuardianWorkflowTest|ParentLinkRelationshipConsistencyTest|HouseholdParentLinkTest|FamilyPermissionsTest|HouseholdRelationshipsApiTest|PatientRelationshipsServiceTest|PatientCreationPermissionsTest|RhuHouseholdsTest|BhcHouseholdsTest|ChangeHouseholdCommandTest'` — **103 passed, 771 assertions**.
- Frontend targeted `node --test` on parentLinks, patientProfile, RegistrationSections rendering, patientRegistrationPayload, householdParents, householdData, familyConnections, familyGraph, familyAccess, relationshipLabels, changeHousehold and householdTransfer tests — **78 passed**.
- Full backend `php vendor/bin/phpunit` after the descendant fix — **1,307 tests: 1,283 passed, 23 skipped, 1 failed**. Failure: `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again`, expected 201, received 500. Also reproduced in isolation; consultation draft code was not modified by this task.
- Full frontend `node --test --test-concurrency=2` over all `src` and `config` test files — **1,209 tests: 1,207 passed, 2 failed**. `doctorAvailability.test.js`: expected-return fixture is already in the past, producing Awaiting RHU Update. `draftConversion.test.js`: restored care plan includes an extra `serviceReferrals: []`. Also reproduced in isolation; these modules/tests have no changes from this task.
- Production `npm run build` — passed; existing large-chunk warning remains.
- ESLint on changed JS/JSX files — passed. Laravel Pint on changed PHP files — passed. Focused `git diff --check` — passed.
- Independent read-only review completed; its important descendant-conflict finding is fixed and regression-tested.
- Unexecuted: live browser interaction/responsive screenshot verification (no connected browsers available), and live PostgreSQL concurrency testing. Automated backend tests use isolated SQLite. No database migration or production data operation was performed.

## Remaining limitations

The full-suite failures above remain outside this focused parent workflow. The existing 20-generation traversal bound is retained and now rejects unverifiable changes rather than silently accepting them. Parent linking is available through existing household member pages; legacy patients without a household have no new standalone Families entry point.
