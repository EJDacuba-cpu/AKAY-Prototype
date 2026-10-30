# BHC FSN Backend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent work packages below, then review the integrated result. Track execution in claude-mem work_state list `families-registration-backend`.

**Goal:** Persist BHC households/patient membership with automatic annual FSNs and manual correction, replacing in-scope mock behavior.

**Architecture:** PostgreSQL allocates serials inside Laravel transactions. Laravel scopes every operation by the authorized BHC. TanStack Query serves facility-scoped registration and Families screens.

**Tech Stack:** Laravel 13, PostgreSQL, React, TanStack Query, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-10-16-bhc-fsn-backend-design.md`

## Global constraints

- BHC only; one BHC per barangay. RHU prototype stays separate.
- `FSN-YYYY-NNNN`, minimum four digits; Manila numbering year; manual override.
- Unique normalized serial per BHC, including archived households; permanent household ID.
- No inferred household grouping by address/surname; no trusted browser-only permissions.
- Preserve existing code changes and persisted legacy patients; never import mock fixtures.
- User explicitly authorized execution; proceed through implementation without another planning approval.

## Review focus

1. Simultaneous saves and manual counter jumps: PostgreSQL integration verification.
2. Patient-ID/household-ID facility spoofing: backend forbidden/not-found tests.
3. Registration-only staff: identity response supports edit without clinical disclosure.
4. Facility changes during fetch/save: separate query keys and fresh component state.
5. Shared RHU components/deferred graph routes: never mix real BHC IDs with mock writes.

## Shared API contract

- `GET /bhc/households`: `{data: Household[], meta: {current_page,last_page,total}}`, search/page/per_page (bounded).
- `GET /bhc/households/lookup`: same result; allowed to patient registrars without directory permission.
- `GET /bhc/households/{id}`: `{data: Household}`; directory readers or registrars.
- `POST /bhc/households`: `{head_patient_id,serial_mode,serial_number?,address}`; `{data: Household}`, HTTP 201.
- `PATCH /bhc/households/{id}`: `{version,serial_number,address,head_patient_id,relationships}`; `{data: Household}`.
- Household: `id,barangay_health_center_id,serial_number,address:{streetAddress,purokArea,barangay,municipality},head_patient_id,archived_at,version,members:PatientIdentity[]`.
- PatientIdentity includes existing identity fields plus `municipality,household_id,family_serial_number,relationship_to_household_head`; patient detail/save includes `household` summary for editing.
- Patient API adds `household:{kind:"existing",household_id,relationship,version?}` or `{kind:"new",serial_mode:"auto"|"manual",serial_number?,address}` and optional `head_replacement:{household_id,head_patient_id,relationships,version}`.
- Errors: 422 standard Laravel field errors, 409 stale version, 404 foreign household.

## Task 1 — Household persistence and patient save (backend implementer)

Files: new household migration/model/controller/service/allocator and backend tests; modify PatientRequest/PatientController/Patient/PatientIdentity/HouseholdEnvironment/routes.

- [x] Write API/service tests for allocation, override, isolation, membership, correction and rollback. Run and observe failure.
- [x] Add schema with per-BHC uniqueness, member-facility constraints, counter table, PostgreSQL allocation function and SQLite test fallback.
- [x] Implement contract above, legacy collision checks, audit, version conflicts, head departure and archive rules.
- [x] Integrate optional structured household payload into patient transaction; preserve legacy/RHU requests and clinical field protections.
- [x] Run new tests and related patient/environment/isolation suites. Supply PostgreSQL verification script/test without touching real patient data.

## Task 2 — Real Families grants (access implementer)

Files: ActionPermissions, StaffRoles, permissions/account/assignment validation where needed; frontend mockFamilyAccess/auth/AddUser/accessPolicy/permission copy and focused tests.

- [x] Add failing tests showing BHC Families grants persist on server and browser storage cannot grant BHC access.
- [x] Add `families.view` and `families.manage` to BHC availability; manage requires view. Keep explicit existing grants intact; admin assigns new grants.
- [x] Update account editing and auth adapters to send/trust real BHC grants; preserve deferred RHU prototype behavior separately.
- [x] Run permission/account/assignment regression tests and frontend permission tests.

## Task 3 — Real BHC frontend (primary implementer)

Files: new household service/hooks/pure helpers/BHC Families screens; modify shared page role adapters, BHC registration, FamilyRegistryField and review components, query keys/routes.

- [x] Add failing tests for payload mapping, auto/manual selection, normalized IDs/errors, facility keys and BHC graph-route boundaries.
- [x] Add API/query layer following shared contract; paginated household directory and explicit lookup.
- [x] Switch BHC registration to real patient fetch/save and household lookup; show auto-on-save/manual override; preserve inline validation and draft on error.
- [x] Connect BHC Families list/detail/basic editor/create to server; member-add uses registration with household; deferred graph routes show unavailable/back state.
- [x] Extract pure reusable helpers so live BHC paths do not depend on seeded mock snapshot modules. Leave deferred RHU prototype intact.
- [x] Run tests, lint and production build; inspect available browser surface.

## Task 4 — Integration and review (primary + independent reviewer)

- [x] Run integrated backend/frontend suites, PostgreSQL concurrency checks where available, and diff checks.
- [x] Review whole diff for privacy, lost updates, mock contamination, API mismatches and migration safety; fix material findings and rerun affected checks.
- [x] Record actual verification and environment limits; deliver focused Git-diff examples and deployment instructions. Do not run production migrations without explicit deployment authorization.

## Execution rulings and interface scan

- Execution authorized by Eric's “go ahead execution time”; no repeated approval gate.
- Use current non-main feature branch/workspace so the shared running project receives the implementation; no reset/stash of user files.
- Tasks 1/2 share no implementation files except their separate permission boundary: controller enforces grants; Task 2 defines grants. Task 2 does not edit routes or patient code.
- Tasks 1/3 share only the API contract above; all snake/camel mapping belongs to frontend service.
- Tasks 2/3 share auth behavior, not files: Task 2 owns auth/AddUser/mockFamilyAccess and accessPolicy; Task 3 consumes current authenticated user's server grants.
- Task 4 consumes all outputs. Each task's tests target the same documented interfaces; no conflicting ownership identified.

## Verification limits

Product code is implemented and focused tests pass. PostgreSQL concurrency test is supplied but skipped without a disposable test URL; connected browser inventory was empty. Broad backend failures were compared to isolated HEAD (all 131 shared failing/error cases reproduced); unrelated baseline failures were not changed. Application database migration was not run. See docs/bhc-fsn-backend.md.
