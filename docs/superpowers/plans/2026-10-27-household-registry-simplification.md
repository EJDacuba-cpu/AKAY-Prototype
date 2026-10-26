# FSN Household Registry Simplification

Approved direction: FSN → Household Head → Members → Relationship to Head. Registration saves membership/labels only. Mother/Father names are optional editable text; historical parent links are read-only secondary references and are never copied into reported fields.

## Architecture and scope

Use the existing scoped household API, head/member data, registration command, canvas pan/zoom, member list and transfer modal. Replace genealogical rendering with a flat head-to-members layout whose associations mean household membership only. No new relationship model, migrations, backfills, clinical synchronization or permission expansion.

Retain historical parent IDs, relationship rows and audited backend APIs for compatibility. Remove normal relationship-editing entry points and redirect old connection-page URLs to the scoped household details. Normal registration must explicitly omit `relationship_link`, even if stale draft data carries one; keep the shared serializer's legacy default for API/transfer compatibility.

## Steps

- [x] Add failing member-layout/rendering, registration-payload, editable-parent/reference privacy and backend text-only preservation regressions.
- [x] Remove registration linking controls and normal patient/family edit links. Reuse a compact read-only historical-parent reference component in registration and Patient Information.
- [x] Replace the live BHC/RHU Family Tree with Household Relationships and retain list, head editing, address, registration, transfer and access controls.
- [x] Run focused regressions, build/lint, full available suites and independent review. Report pre-existing failures and unexecuted checks.

## Execution notes

User explicitly approved the workflow and editable-name/read-only-history choice and directed implementation. Preserve all pre-existing work in this checkout; no commit/push or database operation.

## Files changed for this simplification

Paths below are relative to the repository root. Backend product files already modified by earlier work were preserved; this revision needs no backend product changes.

| Files | Purpose |
| --- | --- |
| `frontend/src/components/features/patients/FamilyRegistryField.jsx`, `HouseholdConnectionReview.jsx` | Remove checkbox/connection-confirmation controls; retain relationship-to-head review and head replacement checks; discard stale relationship commands from review. |
| `frontend/src/pages/bhc/BhcPatientRegistration.jsx`, `frontend/src/utils/householdData.js` | Explicitly omit relationship commands on normal BHC/RHU registration, retaining the existing serializer's legacy compatibility default. |
| `frontend/src/services/familyRegistry.js` | Keep historical parent references visible when staging live registration household changes; preserve deferred prototype behavior. |
| `frontend/src/components/features/patients/HistoricalParentLinks.jsx` (new) | Compact read-only historical references using only identities supplied by the existing scoped patient response. |
| `frontend/src/components/features/patients/profile/RegistrationSections.jsx`, `frontend/src/pages/bhc/AddPatient.jsx` | Optional editable manual parent names, primary reported-value display, separate legacy references and Guardian Information. |
| `frontend/src/pages/bhc/PatientDetails.jsx`, `frontend/src/pages/rhu/RHUPatientDetails.jsx` | Remove normal parent-management entry points. |
| `frontend/src/pages/bhc/BhcFamilies.jsx`, `frontend/src/components/features/families/FamilyTreeCanvas.jsx`, `frontend/src/utils/familyTree.js` | Use household members directly; flat head/member associations; Household Relationships terminology; preserve pan/zoom/reset and member navigation. |
| `frontend/src/components/features/families/FamilyMembersList.jsx` | Keep members, labels, patient access and authorized transfers; remove connection editor entry. |
| `frontend/src/pages/bhc/BhcFamilyConnections.jsx` | Redirect protected legacy connection-page bookmarks to household details. |
| `frontend/src/components/features/families/TransferHouseholdModal.jsx` | Correct one preservation message; transfer logic unchanged. |
| `frontend/src/components/features/patients/FamilyRegistryField.test.js`, `frontend/src/components/features/patients/profile/RegistrationSections.test.js`, `frontend/src/utils/householdData.test.js` | Registration, editable-name, historical-reference and stale-command regressions. |
| `frontend/src/components/features/families/HouseholdRegistry.test.js`, `frontend/src/utils/householdRegistryLayout.test.js` (new) | Real React server rendering and member-layout regressions without genealogical inputs. |
| `backend/tests/Feature/ParentGuardianWorkflowTest.php`, `RegistrationRelationshipLinkTest.php` | BHC/RHU manual-name edit/clear preservation and label-only registration regressions. |

## Architecture and preservation

React/shadcn/Tailwind handle presentation; existing TanStack Query keys and invalidation handle scoped cached data. Existing Laravel requests/services and registration transaction remain responsible for authorization, validation, FSN allocation and atomic household/patient persistence. No new PostgreSQL stored procedure, API, migration or backfill is required.

Reported names never copy historical identities into saved fields. Normal registration omits parent IDs through existing `omitParentLinks`; profile editing already omits those IDs. Inaccessible historical parents show a generic unavailable reference. Historical relationship APIs, rows, audit logs and IDs remain intact. Household head editing, FSN allocation, member registration, authorized transfer and clinical Family History remain independent and unchanged.

## Validation results

- Red/green regressions observed for removed controls, primary editable names, stale relationship command omission and the new layout. A real React rendering check also caught and verified correction of a stale layout call during implementation.
- Focused frontend: **60 passed** (registration, parent fields, payloads, household layout, transfer helpers and legacy compatibility). After finding the legacy draft-helper visibility issue, a further **33 helper/prototype tests passed**, including its red/green preservation regression.
- Focused backend: **97 passed**, **826 assertions** (BHC/RHU household registration, permissions, transfer, history preservation and legacy relationship compatibility).
- Latest frontend full suite: **1,233 tests; 1,231 passed; 2 existing unrelated failures**: `doctorAvailability.test.js` uses an expected-return fixture date now in the past; `draftConversion.test.js` expects a care plan without the current `serviceReferrals: []` field.
- Latest backend full suite: **1,320 tests; 1,296 passed; 23 skipped; 1 existing unrelated failure**: `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again`, expected HTTP 201, received 500. A newly extended test initially used the legacy-only label `Grandchild`; corrected its new-registration fixture to supported `Grandson`, reran the 97 focused checks and the full backend suite, and confirmed that failure is resolved without changing label validation.
- Production build passed; existing bundle-size warning remains. Scoped ESLint, PHP Pint and `git diff --check` passed.
- Independent read-only review found no important regression. Corrected its minor transfer-copy finding.
- Live browser interaction/responsive visual QA was not executed because no browser surface was available. Backend checks use isolated SQLite; live PostgreSQL concurrency checks were not executed.
