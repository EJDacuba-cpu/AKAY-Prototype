# Shared Form Draft Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover interrupted business-form input across AKAY without duplicate drafts, unauthorized access, offline domain submissions, or unintended changes to official records.

**Architecture:** Explicit adapters share recovery/storage/UI infrastructure. Ordinary forms use owner-and-context-scoped generic server drafts; consultations retain their existing workflow draft APIs. Current authenticated authorization gates server data and device recovery keys; final mutations explicitly consume their matching draft revision transactionally and idempotently.

**Tech Stack:** React, Tailwind/shadcn/ui, TanStack Query, Laravel, PostgreSQL, encrypted IndexedDB/Web Crypto; current Node and Laravel test tooling.

**Spec:** `docs/superpowers/specs/2026-11-07-shared-form-draft-recovery-design.md`

## Global Constraints

- UI action labels: Resume and Discard. Recovery X preserves work; Discard deletes only draft input.
- AKAY remains online-required. No durable offline domain mutation queue or automatic final submission.
- Preserve all current clinical permissions, encoder/reviewer handoff, editor claims and domain confirmation steps.
- Ordinary personal drafts are owner/context scoped; clinical server drafts follow existing authorized facility review access.
- No passwords, credentials, tokens, query caches, fetched datasets or plaintext PHI in persistent browser storage.
- Device default checkpoint: 1.5 seconds; server default debounce: 20 seconds; seven-day device/ordinary-form retention and existing 30-day clinical server retention.
- Same slot updates one draft; same final operation retries return one official result. Database checks are authoritative.
- Tests use isolated databases; no production migration/cleanup, deployment, commit or push. Preserve pre-existing `.claude/settings.local.json`.
- User explicitly requested immediate implementation. Do not ask for repeated design/plan or execution-method approval. Work in current non-main feature checkout because the supplied workspace and writable root are this checkout; .git is read-only.

## Review Focus

- An auth/session-expiry cleanup during a queued checkpoint must not expose data to the next account or erase a protected unsynced recovery envelope.
- A restored request whose original final commit succeeded but response was lost must resolve one result and not recreate its draft.
- A second tab, different patient, different action, or changed facility must not bind a checkpoint or commit to the wrong slot.
- Inline/nested editors and mutation dialogs without a native `<form>` must be covered at their true save boundary.
- Current eligibility (stock, schedule, patient/family access, review state, permission consent) must be revalidated after Resume; stored fields do not authorize a mutation.

## Structure and interfaces

- `docs/audits/2026-11-07-form-draft-coverage.md`: active form/save-boundary manifest; no silent omissions or unsupported paths marked complete.
- Backend additions: `config/form_drafts.php`, `Services/FormDraftRegistry.php`, `Services/FormDraftService.php`, `Http/Controllers/Api/FormDraftController.php`, model/migrations, authenticated recovery-key service, and explicit final-commit integration. Follow established conventions; split helpers if needed.
- Frontend additions: `utils/formDraftRegistry.js`, `services/formDraftService.js`, `services/formDraftVault.js`, `hooks/useFormDraft.js`, and shared recovery decision/status UI. Adapters live with their form/save owners, not DOM wrappers.
- Existing consultation files remain the authority for clinical review state; adapt `useDraftAutosave`, consultation entry and local recovery to the shared storage/lifecycle contract.

Ordinary draft API contract (JSON under `data`, all no-store):

- `GET /form-drafts/lookup?form_type=...&mode=create|edit&context_key=...`: exact authorized slot -> metadata or null; no decrypted payload in lookup.
- `POST /form-drafts`: `{form_type,mode,context_key,transaction_uuid,schema_version,payload,base_revision}` -> `{id,transaction_uuid,version,last_saved_at,expires_at,...slot metadata}`. Active-slot conflict yields 409 and safe matching metadata; never arbitrary overwrite.
- `GET /form-drafts/{id}`: metadata + allowed payload after current owner/context/target authorization.
- `PUT /form-drafts/{id}`: same identity plus expected `version`; 409 on conflict; terminal IDs cannot be resurrected.
- `DELETE /form-drafts/{id}`: expected version; mark terminal and remove payload; match target/owner/context.
- Authenticated device-key endpoint: registered form/scope/subject context + versioned opaque key ID; key material returned only through no-store authenticated response and retained only in client memory. Gate target access and preserve encrypted recovery across session cleanup; legacy persisted keys migrate only for authenticated owner.

Frontend core interface:

`useFormDraft({formType,mode,contextKey,value,initialValue,onRestore,enabled,baseRevision})` returns `{ready,decision,status,error,hasPendingChanges,lastSavedAt,deviceSavedAt,resume,discard,dismiss,flush,prepareCommit,complete,entryProps,statusProps}`. Value is explicit adapter-allowlisted state, not arbitrary component state. An adapter can override snapshot/restore mapping but not authorization.

`prepareCommit()` flushes current revision online, rejects offline/conflicting/unsaved state, and returns explicit request options `draftCommit` (opaque draft ID, expected revision, stable transaction UUID). Each final service accepts/forwards these options directly; no ambient global request context or request-body scraping. Final endpoint validates form type/target/action against the registered draft and atomically handles idempotency + domain save + matching revision consumption. `complete()` runs only after authoritative success; it stops pending writes and cleans the exact local identity. Existing clinical final endpoints keep their draft ID/version/idempotency protocol.

## Task 1: Coverage manifest and backend recovery contract

**Files:** Create backend core/registry/key/commit files above, additive migrations and `backend/tests/Feature/FormDraftTest.php`; modify `routes/api.php`, appropriate middleware/registration and existing session/draft contracts only when required. Create coverage manifest by tracing active form callers and payload/service shapes.

**Produces:** Server API/key protocol, registry exact form names/context formats/field allowlists, commit metadata transport and helper contract, manifest of every active save boundary. Document all exact signatures in the manifest for the frontend task.

- [ ] Trace all active business forms and final endpoints, including input-bearing action dialogs; record explicit exclusions and required field mapping.
- [ ] Write feature tests first: authorization on lookup/detail/key, other owner/facility/target denial, secrets/unknown fields rejected, incomplete input allowed, one active slot, optimistic conflicts, terminal resurrection, seven-day expiry, safe key reacquisition after logout, no key issuance after access revocation.
- [ ] Run tests before implementation and record the meaningful RED output.
- [ ] Implement bounded encrypted server drafts/metadata, registered form schemas/context policies, authenticated device recovery-key access, and explicit final-commit helper/transport. Test PostgreSQL constraints with a safe configured isolated test database if available; otherwise do not claim actual concurrent PostgreSQL verification.
- [ ] Add tests that wrap representative existing final endpoints: same identity/same payload replay, different payload conflict, transaction rollback leaves draft, successful mutation consumes matching revision, domain permission/middleware still enforced.
- [ ] Run `php artisan test --filter=FormDraft` and scoped Pint; report exact results and unresolved integration requirements. No migration against a live non-test database.

## Task 2: Shared frontend engine, secure vault, and UI

**Consumes:** Task 1 registry/API/key/commit protocol.
**Files:** Create frontend core files above and behavioral tests; modify `utils/sessionPrivacy.js`, auth/session integration, and key/vault helpers for safe migration. New dialog/status use shadcn/ui and Tailwind with current AKAY tokens.
**Produces:** `useFormDraft` contract above, explicit service commit options, reusable entry/status components; no DOM scraping and no global mutable API request binding.

- [ ] Write Node behavioral tests first for identity, allowed snapshot fields, dirty/default detection, duplicate create convergence, saved revision ordering, optimistic conflict, terminal writes, expiry, same-account key unlock and account-switch denial.
- [ ] Run and record RED. Add necessary IndexedDB/browser tests using installed tooling; do not pretend an in-memory fake proves real browser persistence.
- [ ] Implement explicit adapter registry from Task 1, encrypted revisioned device vault with no persisted usable key, owner/target authorization gating, serialized snapshots and session generations, generic hook/coordinator, and safe session-clear behavior.
- [ ] Implement entry decision, Discard confirmation, focus/close semantics, status/retry and offline final-save guard. Keep domain validation separate from partial draft validation.
- [ ] Run focused tests/lint and production build; export exact adapter usage for remaining tasks.

## Task 3: Consultation integration and duplicate-safe entry

**Consumes:** Shared storage/session/status primitives; existing clinical APIs remain authoritative.
**Files:** `hooks/useDraftAutosave.js`, `hooks/usePatientConsultation.js`, `services/healthRecordDraftService.js`, `pages/bhc/ConsultationWorkspace.jsx`, `pages/rhu/RhuConsultationWorkspace.jsx`, profile consultation actions, RHU queue/start entry, unfinished modal and supporting clinical backend files/tests.

- [ ] Write RED tests for earlier selected-patient draft decision, Resume same UUID/type/follow-up, exact lookup beyond pagination, failure blocks duplicate fresh start, RHU visit context surviving update, and encoder/reviewer permissions.
- [ ] Implement one coherent early decision and direct-route safeguards; wire RHU device snapshots, fix request context propagation, preserve schema conversion and review transitions, use Resume/Discard labels and X.
- [ ] Test competing first creates/claim/lease/reconnect; add non-destructive legacy duplicate preflight and database guard for active clinical slots. Respect existing clinical finalization idempotency/consumption.
- [ ] Enable clinical flags only after targeted tests pass; run relevant backend draft/finalization/RHU and frontend consultation/history/draft suites plus lint.

## Task 4: Integrate every ordinary business-form adapter

**Consumes:** Task 1 manifest, Task 2 hook/UI, explicit final service options and backend atomic commit helper.
**Files:** Exact manifest save owners across registration/households/background, referrals/feedback/follow-ups/clinical actions, medicines/dispensing, scheduling, accounts/access and facilities; their final services/controllers as required. Update manifest with per-entry verification evidence.

- [ ] For each manifest group, add meaningful RED round-trip and final-save tests covering its actual payload mapping, non-secret allowlist, contextual identity and mutation boundary.
- [ ] Integrate recovery at the true save owner (including inline editors and non-form dialogs), preserve existing field errors/review prompts, pass draft commit options explicitly through services, and consume atomically in backend final mutations.
- [ ] Check all owned fields and domain-dependent options restore safely; require fresh permission confirmation, stock/FSN/schedule/target checks. Do not restore consent or take irreversible domain action from autosave.
- [ ] Test X/back preserving input, successful Save cleaning matching revision, failed Save retaining it, repeated requests producing one official result, and Discard touching no official data.
- [ ] Reconcile all manifest entries; no entry may be labeled complete solely from hook presence or filename. Run relevant frontend/backend suites and scoped lint after each group.

## Task 5: Full-story verification and independent review

**Files:** Verification report in `docs/audits/2026-11-07-form-draft-verification.md`; fixes scoped to demonstrated failures.

- [ ] Run full frontend tests, full backend tests, production build, scoped lint/Pint and `git diff --check`; capture totals/failures and existing warnings.
- [ ] Verify real browser persistence/focus/X/Resume/Discard/expiry and representative desktop/mobile forms if an installed browser is available. Verify safe PostgreSQL races if an isolated PostgreSQL test target is available. State unavailable environments explicitly.
- [ ] Fresh reviewer checks whole implementation against spec, plan, manifest and five Review Focus cases. Reproduce material findings RED, fix, and reverify bounded scope.
- [ ] Final manifest and report distinguish implemented/tested, environment-unverified, and any genuinely blocked work. Do not mark complete with missing adapters. Leave changes reviewable in workspace; do not commit/push/deploy.
