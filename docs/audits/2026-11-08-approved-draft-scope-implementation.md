# Approved draft scope — implemented

Branch: `Eric-Manually-Fixer`. Eric explicitly confirmed both BHC/RHU, **new Patient Registration only**, and activation of this approved scope. Patient Information edits remain excluded. No commit, push, merge, deployment, new migration, rollback, or cleanup deletion of stored drafts/clinical records was performed. Prior unrelated uncommitted changes remain.

## Diagnosis at architecture

Ang dating entry component ay nagpapakita ng loading modal bago ang decision, nagpapalit ng modal title/content sa Resume, at nagpapakita ulit ng checking overlay habang naghahanda ang workspace. Ang generic registry naman ay may 47 enrolled form types kahit Facilities lang ang installed non-clinical UI adapter.

Ginamit pa rin ang existing draft services, coordinator, encryption, identity/version claims, autosave, recovery, and commit bridge. Frontend owns loading, modal decisions, and hydration locks. TanStack Query holds only an ephemeral owner/patient-bound entry handoff and authorized cached reads. Laravel remains the authority for permissions, household/duplicate validation, optimistic versions, transaction identity, and final commit. Existing PostgreSQL constraints/transactions remain; no new stored procedure is justified for this boundary change.

## Active scope

| Workflow | Current behavior |
| --- | --- |
| RHU Consultation | Enabled. Queue and Profile share the same checked entry. RHU visit identity remains authoritative. |
| BHC Consultation | Enabled by the explicitly approved `DRAFTS_ENABLED=true` change. Profile entry restores before routing; the workspace consumes that validated handoff. |
| Patient Background, Maternal, TB, EPI, Family Planning while consulting | Remain inside the parent consultation draft, with existing clinical permissions/finalization. No independent program draft system. |
| New Patient Registration, BHC/RHU | Enabled only for create. Registration actions check before routing; Resume opens the restored shared form. |
| Patient Information edits / already-saved registration | Recovery adapter disabled. Existing ordinary update behavior retained. |
| Facilities, admin/account/invites, inventory, ordinary actions/modals | Excluded from new draft enrollment. `FORM_DRAFTS_ENABLED` remains false. |

## Consultation entry UI

- Start/Open shows spinner + **Checking...** on the clicked RHU queue action or Profile primary button; no Check loading modal. BHC Profile uses the same button-loading pattern.
- Lookup errors remain inline with Retry/Cancel, without starting another consultation.
- Only a found draft opens **Unfinished Consultation**. Resume keeps this same modal and changes its primary button to **Restoring...** with a spinner. Resume, Discard, and X are disabled during the operation. Discard still requires explicit confirmation.
- Resume loads the authenticated server payload, claims the exact loaded revision, and preserves UUID/patient/visit identity. BHC also checks its existing encrypted local copy and keeps explicit source selection for conflicts.
- Normal entry passes the validated draft through a short-lived, owner-bound memory handoff. RHU verifies its fresh authorized visit; BHC has already loaded the authorized patient. The workspaces adopt that context and do not repeat an independent recovery lookup/decision. A brief internal hydration gate is inline, never another checking modal, and exposes no editable blank form.
- Direct URLs and refresh retain their recovery checks. Autosave, sticky status, leave flush, and finalization stay in the existing clinical mechanisms.
- BHC direct-refresh recovery Close returns to Profile, preserving the draft rather than leaving a permanent hydration loader. Direct Discard checks and claims the displayed revision, then returns to Profile for fresh entry.
- The redundant BHC draft banner shortcut is hidden when unified recovery is active, so it cannot bypass the checked entry. A failed background lookup no longer permanently disables the entry button.

Main entry files: `RhuStartConsultationModal.jsx`, `RhuConsultationRecoveryDialog.jsx`, `RhuQueueTable.jsx`, `ProfileQueueAction.jsx`, `RhuPatientsWorkspace.jsx`, `RhuConsultationWorkspace.jsx`, `useRhuConsultationRecovery.js`; BHC `usePatientConsultation.js`, `ConsultationActions.jsx`, `ConsultationWorkspace.jsx`, and `consultationRecoveryEntry.js`. Shared `FormDraftRecoveryDialog` and `UnfinishedConsultationModal` retain confirmation/focus behavior and support primary-button restoration progress.

## Safe cleanup

- Active generic configuration and generated frontend schema now contain only `patient` enrollment for **create**, restricted to BHC/RHU. Standalone ordinary-form drafts and Patient Information edit drafts cannot be newly created or issued new device keys.
- Removed the draft hook, recovery/status UI, and draft commit options from `FacilityFormModal.jsx`. Removed `facilityDraft.js` and its adapter-only test. Ordinary Add/Edit BHC/RHU facility save, close, and validation still render and work through the existing CRUD APIs.
- Original definitions are isolated in `backend/config/form_draft_legacy.php`, exposed internally as compatibility metadata. Existing encrypted drafts/keys can still be authorized, read, or explicitly discarded. Existing facility commits and lost-response receipts retain their compatibility route mappings. These definitions cannot enroll new drafts.
- Shared registry, vault, recovery keys, privacy/logout handling, clinical identity tombstones, unique-slot guards, commit/replay infrastructure, retention commands, and migrations were retained.
- Live aggregate inventory could not run because the Supabase connection is blocked in this environment. No empty-database assumption was made, and no stored rows were deleted to simplify configuration. Database counts alone would not prove that old encrypted browser copies are absent.

Backend cleanup files: `config/form_drafts.php`, new `config/form_draft_legacy.php`, `config/form_draft_commits.php`, `FormDraftRegistry.php`, `FormDraftService.php`, `FormDraftRecoveryKeyService.php`, `FormDraftCommit.php`, `FormDraftCommitRoutes.php`. Facilities middleware remains as a compatibility guard for already-issued metadata; headerless ordinary CRUD bypasses it.

## New registration recovery

- Uses the shared `RegistrationForm` in `pages/bhc/AddPatient.jsx`; the RHU wrapper already delegates to this same form/source. No separate RHU draft engine.
- Normal BHC/RHU actions now follow **Register Patient → Checking on the clicked action → Unfinished Registration over the current page → Resume → restored form**. No draft opens the blank form; lookup errors offer Retry/Cancel. Confirmed Discard removes only unfinished registration input and opens fresh registration; X keeps the draft and current page.
- `PatientRegistrationEntryProvider` uses the existing coordinator, API, and encrypted vault before routing. Directory desktop/mobile/empty-state links, dashboard shortcuts, Register Member, reported-parent registration links, and RHU Walk-in Check-in use `PatientRegistrationEntryLink`. Other destinations retain ordinary router Link behavior.
- Resume transfers the same loaded coordinator through a short-lived, owner/destination-bound memory handoff, preserving its transaction UUID, draft ID/revision, encrypted device revision and hydration gate. The form adopts it without a second init/lookup or recovery decision. Unconsumed handoffs expire and are closed. No payload/key is placed in URLs or route state. StrictMode effect replay does not close and reinitialize an adopted session. Direct URL/refresh still uses the original in-form recovery guard; fresh blank entry revalidates at the form boundary.
- Checkpoints explicitly selected raw registration fields, proposed household connection/head replacement, original household revision, and RHU walk-in return key. It excludes fetched patient/family records, secrets, clinical background, and duplicate-confirmation approvals. Hidden/partial input remains recoverable instead of being filtered through the final patient serializer.
- Uses the existing `useFormDraft` / coordinator / encrypted vault. Initial checking locks the form without a loading modal. Existing work uses **Unfinished Registration**, Resume/confirmed Discard/X, and shared status/retry feedback.
- Resume restores into React state before editing is enabled. An optional adapter normalizer makes compatible old registration snapshots canonical before hydration acknowledgement; raw payload allowlist validation runs before normalization. Stale parent renders cannot replace restored input. The coordinator rejects competing Resume/Discard calls synchronously.
- Recovered household lookup keeps the form mounted; it cannot destroy restored state by switching to a parent loading screen. Its stored household version is preserved for the final server check, not silently replaced with a freshly fetched revision.
- Save Patient uses `prepareCommit()` options through `patientService` and a **store-only** patient commit middleware. Domain errors preserve the draft. Successful registration atomically consumes it. A lost-response replay returns the same saved patient, not another patient or household. Duplicate confirmation is requested again, never restored as preapproved. Registration does not itself create an RHU queue visit.
- Success closes local recovery; Register Another starts a fresh registration identity/baseline. Navigation flushes via the existing coordinator. Logout preflight also recognizes an active registration coordinator while the all-forms flag remains off.

Main registration files: `AddPatient.jsx`, `BhcPatientRegistration.jsx`, new `PatientRegistrationEntry.jsx`, `patientRegistrationEntry.js` / test, shared `patientRegistrationDefaults.js`, `patientRegistrationPayload.js`, `patientService.js`, `useFormDraft.js`, `formDraftCoordinator.js` / test, `formDraftSession.js`, `DashboardLayout.jsx`, and the backend patient store mapping in `routes/api.php` / `config/form_draft_commits.php`. Entry-link wiring also touches `PatientsModule.jsx`, `BHCDashboard.jsx`, `BhcFamilies.jsx`, `WorkflowPanel.jsx`, `FamilyParentLinks.jsx`, and `RhuWalkInCheckIn.jsx`. No draft middleware was added to ordinary patient updates.

## Actual verification

- Final full frontend: **1,798 passed, 0 failed** (`node --test --test-concurrency=4`).
- Full backend: **1,652 total: 1,628 passed, 24 skipped, 0 failed; 9,802 assertions** (`php artisan test --compact`).
- Focused render checks verify queue inline checking, BHC button loading/retry, ordinary Facilities without draft dependencies, and locked initial BHC/RHU registration without a loading modal.
- New backend scope tests verify excluded enrollment/key rejection, create-only registration, existing legacy read/discard/key access, and retained real facility receipt replay. Registration tests verify both-role atomic consumption/replay, validation/permission failures, duplicate reconfirmation, and no implicit queue visit.
- Coordinator regressions verify legacy snapshot normalization, form hydration readiness, competing-operation prevention, no late overwrite, encrypted offline checkpoints, optimistic conflicts, terminal identities, and leave flush.
- Registration entry regressions verify allowed destinations, actor/destination/expiry rejection, one-time adoption, expired/replaced-session cleanup, and real coordinator hydration with the original draft ID/revision and no new lookup/creation on handoff.
- Scoped ESLint: **0 errors**. Broad touched-file check still reports the same **7 inherited RHU workspace hook warnings**; final checks on newly changed registration/coordinator files are clean.
- Production frontend build: passed; existing large-bundle warning remains.
- PHP syntax checks for touched configuration/services/routes: passed. Client/server draft schema generation matches exactly; active generic form list is `patient`. `git diff --check`: passed.
- No claim of a clean repository-wide Pint baseline; its earlier committed-baseline formatter findings are documented in the preceding audit and unrelated formatting was left alone.

## Remaining manual browser checks

No interactive browser pass is claimed. Chrome is unavailable to the browser tool; isolated Edge failed/hung during GPU initialization and was stopped. Backend tests use the test database, not a live Supabase concurrency run.

1. Both roles: Start/Open → button Checking → one draft decision or existing Initial/Follow-up selection; Resume → same-modal Restoring → correct saved workspace with no second decision.
2. RHU queue/Profile, both walk-in and referred visits: double clicks, X, confirmed Discard, Retry/Cancel, slow network, and another-tab revision conflict.
3. BHC/RHU new registration: start from directory/dashboard/household/walk-in, verify the existing page remains behind the recovery decision, then Resume into the saved form without another decision. Also test no draft, partial input, X, failed lookup/restore Retry/Cancel, confirmed Discard, slow/double clicks, stale household revisions, and Register Another. Verify Patient Information edits have no draft integration.
4. Both clinical workspaces: Patient Background/program values survive, sticky autosave status updates, leave flush works, and Finalize creates one official record with unchanged permissions. Registration save/retry creates one patient; RHU check-in remains a separate action.
