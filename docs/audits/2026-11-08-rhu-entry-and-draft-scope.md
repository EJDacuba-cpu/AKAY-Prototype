# RHU consultation entry correction at narrowed draft scope

Follow-up: ang dokumentong ito ay ang unang entry correction at audit. Ang later approved UI simplification, BHC activation, safe cleanup, at create-only registration recovery ay nasa [approved scope implementation](2026-11-08-approved-draft-scope-implementation.md). Superseded na ang hiwalay na Restoring/Check loading modal behavior na nakalarawan rito.

Branch: `Eric-Manually-Fixer`. Walang commit, push, merge, deployment, feature-flag change, o migration change. Preserved ang naunang uncommitted work. Audit-only ang cleanup assessment sa ibaba; walang inalis na draft adapter o stored draft.

## Diagnosis at architecture

Magkahiwalay ang dating queue Start/Resume paths. Ang Resume sa queue at Patient Profile ay dumidiretso sa workspace bago ang recovery decision. Inilipat ang normal entry decision sa shared `RhuStartConsultationModal` habang nananatili ang calling page sa background. Ang `useRhuConsultationRecovery` at existing `rhuDraftResume` module ang iisang recovery implementation para sa queue/profile entry at direct workspace refresh.

May apat na boundary issues na napatunayan:

1. Nasa workspace pa ang recovery decision at may profile shortcut na lumalampas sa selection.
2. Ang dating draft lookup ay tumatanggi sa waiting visits. Read-only lookup lang ang pinaluwag para sa authorized, open patient/visit/RHU combination; writes/finalization still require an in-consultation visit.
3. Hindi kasama sa nested draft allowlist ang RHU diagnosis `nextAction`, `receivingBhcId`, `monitoringRecommendation`, at `tbManagement`. Nagfa-fail ang draft flush bago ang finalization. Explicit fields at types lang ang idinagdag; unknown fields remain rejected.
4. Idempotent Start ignored a new follow-up choice on an already-started empty visit. Explicit `entry_consultation_uuid` now permits selection only for that same identity with no active draft or official record. Uses the existing clinical identity lock, existing eligibility checks, and existing encode permission. Ordinary repeated Start retains its old idempotent behavior.

Frontend/React ang modal, loading, at form gating. TanStack Query holds an ephemeral, owner-bound handoff in memory. Walang clinical payload sa route state or persistent browser storage. Bago ma-enable ang workspace, fresh authorized visit read verifies patient, visit, owner, consultation UUID, and handoff age; draft payload/ID/current claimed revision come from the authenticated draft API. Laravel retains authorization, eligibility, revision claims, identity locks, duplicate-draft protection, and finalization. Walang bagong stored procedure na kailangan.

## Resulting behavior

- Waiting visit: **Start Consultation**; already started visit: **Open Consultation**. Same entry handler, including Patient Profile.
- Checking happens before workspace navigation. Modal mounting and synchronous operation refs prevent duplicate entry/restore/start actions.
- Existing draft: **Unfinished Consultation**, metadata, Resume, confirmed Discard, or X. X leaves the draft unchanged.
- Resume: **Restoring Consultation** and the requested loading message immediately, with actions disabled. Loads payload and claims its exact revision before navigation. Workspace reuses the validated memory handoff rather than looking up/claiming again. Inputs and autosave stay gated by `recoveryReady` until React restoration finishes.
- Failed lookup/restoration: Retry/Cancel; errors never become an empty draft.
- Discard: deletes only the displayed authorized draft at its checked/claimed revision; concurrent changes block deletion. Existing server retirement handles identity rotation on the same queue visit. Returns to the existing Initial/Follow-up selection, with eligibility checked again. Clinical records and queue visits are preserved.
- No draft: existing Initial/Follow-up selection. No workspace navigation until Start succeeds and its draft slot is checked.
- `FormDraftRecoveryDialog`, its confirmation reducer, `ModalShell`, shadcn `Button`, existing Start selection, `FormDraftStatus`, draft APIs, vault, and `useDraftAutosave` are reused. Sticky status, Back to Queue flush, and existing finalization code remain.

## Files changed by this task

Backend:

- `backend/app/Http/Controllers/Api/RhuVisitController.php`
- `backend/app/Services/RhuVisitQueueService.php`
- `backend/app/Services/HealthRecordDraftService.php`
- `backend/app/Services/HealthRecordDraftPayloadService.php`
- `backend/tests/Feature/RhuVisitStartTest.php`
- `backend/tests/Feature/RhuItrConsultationTest.php`
- `backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php`

Frontend:

- `frontend/src/pages/rhu/RhuPatientsWorkspace.jsx`
- `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`
- `frontend/src/components/features/rhu-queue/RhuQueueTable.jsx`
- `frontend/src/components/features/rhu-queue/ProfileQueueAction.jsx`
- `frontend/src/components/features/rhu-queue/RhuStartConsultationModal.jsx`
- `frontend/src/components/features/rhu-queue/RhuConsultationRecoveryDialog.jsx` (new)
- `frontend/src/components/common/drafts/FormDraftRecoveryDialog.jsx`
- `frontend/src/components/common/drafts/FormDraftRecoveryDialog.test.js`
- `frontend/src/hooks/useRhuConsultationRecovery.js` (new)
- `frontend/src/utils/rhuDraftResume.js`
- `frontend/src/utils/rhuConsultationEntry.test.js` (new)
- `frontend/src/utils/rhuQueueView.js`
- `frontend/src/utils/rhuQueueView.test.js`
- `frontend/src/utils/rhuVisitConsultation.js`
- `frontend/src/services/rhuVisitService.js`

This report is the only documentation artifact added by this task. The wider `git status` includes prior work, especially generic draft infrastructure, Facilities integration, and BHC changes; those were not cleanup targets.

## Verification

- Full frontend: `node --test --test-concurrency=4` — **1,780 passed, 0 failed**.
- Focused frontend before the last two claim tests: **98 passed**; both additional claim tests are included in the full 1,780 result.
- Backend scoped to visit start, RHU ITR, health-record drafts/finalization/payload, consultation identity, referral arrival, walk-in check-in, and form-draft commit bridge: **146 passed, 954 assertions, 0 failures**.
- Includes actual RHU draft create → update/flush → read back diagnosis care plan → finalize at current revision → consumed draft and one official record.
- Scoped ESLint: **0 errors, 7 warnings** in `RhuConsultationWorkspace.jsx`. These same seven hook warnings existed in the pre-edit workspace snapshot. The new hook and entry components have no lint findings.
- Frontend production build: passed. Existing large-bundle warning remains; final run also reported plugin timing.
- PHP syntax checks: passed for all four touched application PHP files. `git diff --check`: passed.
- Extra Pint check is **not green**: existing formatter findings in the visit controller, visit service, payload service, and payload unit test. An isolated copy of the committed baseline reproduces those same fixer categories; unrelated formatting was not applied. Payload service additionally has existing mixed line endings in the dirty workspace.
- No full backend-suite claim; the 146 tests above are the executed backend scope.

Browser limitation: Chrome tool has no installed Chrome executable. Isolated headless Edge exits with GPU/sandbox initialization errors. No real browser pass is claimed. Unit/async API-boundary and server-rendered component tests do not substitute for interactive browser verification or PostgreSQL lock scheduling.

Remaining manual browser checks, with test patients:

1. Queue and Patient Profile, both walk-in and referred visits: Start/Open, no-draft Initial/Follow-up, and draft modal over the calling page.
2. Slow network Resume: visible restoration message, double-click prevention, no editable blank interview, correct saved values and wizard position, no second recovery decision.
3. X, Keep Draft, confirmed Discard, follow-up reselection, network failure Retry/Cancel, and another-tab revision conflict.
4. Edit restored input, verify sticky save status, Back to Queue flush, reopen, then Finalize once with the correct permission. Verify one health record and unchanged referral/visit semantics.

## Cleanup assessment — audit only

Evidence: `backend/config/form_drafts.php` and `frontend/src/config/formDraftSchemas.json` contain **47** generic form types. A scoped consumer search finds only `FacilityFormModal.jsx` instantiating `useFormDraft`. `FORM_DRAFTS_ENABLED=false`, `DRAFTS_ENABLED=false`, `RHU_DRAFTS_ENABLED=true`; these flags were not changed. Frontend flags do not prove the backend or older clients never created excluded drafts.

| Classification | Files/dependencies | Assessment and regression risk |
| --- | --- | --- |
| **Keep** | `HealthRecordDraftService`, payload service, controller, pruner, `ClinicalDraftSlotPreflight`, `ClinicalRecoveryBoundary`; consultation workspaces, `useDraftAutosave`, clinical draft services/vault, recovery/status dialogs | Clinical draft identity, encryption, authorization, autosave, conflict handling, and atomic consumption are working and in scope. Maternal/TB/EPI/FP are nested consultation payloads, not independent drafts. |
| **Keep** | `FormDraftRegistry`, `FormDraftRecoveryKeyService`, `formDraftVault`, `formDraftRequest`, `formDraftSession`, `sessionPrivacy`, model/tables/migrations and retention commands | Shared dependencies, not removable Facilities-only code. Clinical vault imports the shared vault; clinical draft service/finalization depend on recovery keys and retirement. Registry authorizes key access. Keep security checks, privacy cleanup, terminal identities, and unique indexes. |
| **Keep for registration** | `useFormDraft`, coordinator/API, `FormDraftService`, `FormDraftCommit`, `FormDraftCommitRoutes`, `CommitFormDraft`, generic registry/payload validation, `patient` schema | Reusable foundation for approved Patient Registration. Keep until registration is implemented and its actual dependency graph is proven. Do not delete generic commit/replay protection just because its current production route mappings are Facilities-only. |
| **Remove candidates, after compatibility proof** | Excluded entries in `backend/config/form_drafts.php` and generated frontend schema: admin/account/invite/staff assignment/reset/profile; medicines/inventory/dispensing; standalone facility/referral/feedback/provider/follow-up/queue/household/background/other quick actions | Registered capability is not the same as an implemented UI adapter. No ordinary-form UI integrations were found outside Facilities, so do not invent work to remove nonexistent adapters. Stop future enrollment/writes only after a deprecation/read-access plan; do not bulk-drop definitions immediately. Preserve nested household/parent fields used inside registration. |
| **Remove candidates, conditional** | Facilities draft-specific lines in `FacilityFormModal.jsx`, `facilityDraft.js` and its adapter-only test; Facilities entries in `form_draft_commits.php` and middleware attachments on BHC/RHU facility resource routes | Out of approved product scope, but not yet proven safe to remove. The form's close, save, status, and commit lifecycle currently reference the draft hook. Existing encrypted drafts and commit receipts may still depend on these definitions/routes. Remove only the adapter after replacement ordinary save/close behavior and compatibility are verified; keep the facility form and CRUD APIs. |
| **Simplify** | `formDraftSchemas.json` generation, registry target authorization branches, `form_draft_commits.php`, existing rollout flags/comments | Narrow future configuration to registration plus consultation-specific key handling. Keep the `consultation` device special case in `FormDraftRegistry::identity`; it is not listed among the 47 generic forms. Regenerate schema from its backend source, retaining limits and patient schema. Keep generic core/replay/security tests; replace Facilities test fixtures with registration fixtures when the latter exist, rather than deleting coverage. Flags need a separate rollout decision; no automatic enabling. |
| **Still needs implementation** | `BhcPatientRegistration.jsx`, shared `RegistrationForm` in `pages/bhc/AddPatient.jsx`, `RhuPatientRegistration.jsx`, patient mutation commit mappings | Patient Registration has schema/backend capability but **no actual shared recovery UI adapter or commit route wiring**. Both roles share `RegistrationForm`. A future scoped adapter must capture raw registration/household connection inputs and preserve household versions, duplicate confirmation, walk-in/check-in identity, and existing validation. No independent clinical program draft systems should be built. BHC clinical rollout also remains disabled by its existing flag. |

### Why removing a registry entry can strand existing drafts

`FormDraftService::find()` reruns `registry->identity()` using the stored form type. Existing read, discard, and commit replay can therefore fail if the definition is simply removed. `FormDraftCommit` also resolves the stored form against the explicit mutation route. A false frontend flag is not sufficient evidence that no encrypted drafts, device keys, or consumed replay receipts exist. This audit did not query or alter live draft data.

### Safest cleanup sequence

1. Keep this RHU correction isolated; complete the manual browser checks above before cleanup rollout.
2. Obtain read-only **counts and terminal/expiry state only** for excluded form types in `form_drafts` and recovery keys. Check old-client compatibility and encrypted device recovery; do not decrypt patient inputs or delete rows for the audit. Database counts alone cannot prove there are no offline browser copies.
3. Design a narrow enrollment/write restriction for excluded types while preserving authorized handling of existing drafts/keys/receipts. Do not remove the registry entries first. This is a future code change requiring its own regression coverage.
4. Remove the Facilities UI adapter and Facilities route mappings together only when its legacy recovery/receipt path is safely retained or no longer needed under the existing retention policy. Test ordinary Add/Edit BHC/RHU saves, errors, close behavior, permissions, and lost-response replay before retiring that compatibility path. Do not roll back migrations or explicitly delete stored drafts.
5. Reduce backend registration definitions and regenerate the frontend schema as one change. Then remove genuinely unreferenced adapter files/authorization branches. Preserve the shared clinical/registration core and privacy guards.
6. Implement Patient Registration recovery as a separate approved task using the retained core, one parent registration draft, and current Laravel domain validation. Do not start another all-forms draft rollout.

Architectural ownership for future registration: React/shadcn handles recovery/inline validation; TanStack Query handles authorized cached reads and invalidation; Laravel owns draft authorization, versioning, atomic registration commit, duplicate/household/walk-in checks; PostgreSQL constraints and existing transactional logic remain authoritative. A new stored procedure is not justified by removing unused adapters.
