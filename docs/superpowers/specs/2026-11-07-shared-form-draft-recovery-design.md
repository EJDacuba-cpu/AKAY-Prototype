# AKAY shared form draft recovery

Date: 2026-11-07
Status: Eric authorized implementation on 2026-11-07 ("go ahead na sa implementation"). Technical defaults below are implementation rulings, subject to the confirmed behavior.
Size: A system-wide feature delivered in bounded phases, with one shared recovery contract.

## Intent and confirmed requirements

Protect unfinished input when a connection drops, the browser closes, or a PC shuts down. AKAY remains online-required: opening a new server-backed workflow and executing its final mutation require authenticated connectivity. Recovery is limited to the last successfully persisted snapshot; zero-character loss during sudden power failure cannot be promised.

Eric confirmed the following during the interview:

- Cover business data-entry forms across Admin, BHC, and RHU, not only consultations.
- Use the action labels **Resume** and **Discard**. Do not label recovery Continue, Continue Draft, or Resume/Continue.
- A modal's X closes it while keeping unfinished input. No redundant Cancel button is needed in the recovery decision dialog.
- Autosave and Resume update the same unfinished transaction, rather than producing duplicate drafts or official records.
- Start Consultation checks the selected patient's unfinished consultation before showing the existing New Consultation / follow-up selection.
- Preserve the existing encoder submission, authorized midwife/clinician review, return-for-correction, and finalization workflow.
- Autosave changes drafts only. Official records change on explicit Save/Submit/Confirm after current authorization and domain validation.
- Keep recoverable work across login sessions; warn truthfully about unsynced work before intentional logout.
- Passwords and authentication details are excluded. Eric accepted this boundary in the requirements playback.
- Eric selected the recommended shared mechanism after considering separate implementations per module.

Technical defaults below are architect recommendations, rather than details Eric independently specified.

## Evidence and current implementation

Sources inspected in this workspace:

| Source | Verified fact | Consequence |
| --- | --- | --- |
| `frontend/src/utils/featureFlags.js` | BHC `DRAFTS_ENABLED` is false; `RHU_DRAFTS_ENABLED` is true. | Enabling BHC alone cannot deliver system-wide recovery. |
| `frontend/src/hooks/useDraftAutosave.js` | Existing server autosave, version conflicts, retries, local snapshot queue, and lifecycle cleanup; server debounce defaults to 20 seconds, local debounce to 1.5 seconds. Some comments differ from executable behavior. | Reuse useful primitives after behavioral tests; do not treat comments as proof. |
| `frontend/src/pages/bhc/ConsultationWorkspace.jsx` | Supplies local vault identity and recovery snapshots; has a late workspace draft decision. | Move the normal entry decision earlier, preserving direct-route protection. |
| `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` | Uses the autosave hook but does not supply its local snapshot options. | Current RHU server drafts do not establish equivalent device recovery. |
| `frontend/src/hooks/usePatientConsultation.js` and `ConsultationActions.jsx` | Existing unfinished-consultation lookup and profile actions. | Consolidate these with the earlier decision, rather than adding competing notices/dialogs. |
| `frontend/src/components/features/health-records/UnfinishedConsultationModal.jsx` | Current actions are Cancel, Discard & Start New, Continue Draft. | Replace recovery copy/actions within scope. |
| `backend/app/Services/HealthRecordDraftService.php` | Facility-scoped draft reads, editor leases, optimistic versions, submit/return transitions, and finalize permissions. | Consultation drafts are workflow records; a generic personal-form store must not replace their authority. |
| `frontend/src/services/localDraftVault.js`, `localDraftCrypto.js`, and `utils/sessionPrivacy.js` | Encrypted IndexedDB with stored CryptoKeys; current cleanup purges vault and keys on logout/account switch/forced invalidation. | Recoverable ciphertext and live decryption access need separate lifecycles. Current storage cannot simply be retained with its keys across account switching. |
| `backend/config/health_record_drafts.php` | Clinical server drafts default to 30-day active expiry and local vault to seven days. | Preserve existing clinical retention; make ordinary-form retention explicit. |
| `frontend/src/App.jsx` and form consumers below | Both full-page and modal forms exist; state is not uniformly owned by the rendered input component. | Use explicit adapters at the actual save boundary, not automatic DOM scraping. |

No live production behavior, database concurrency, or browser power-loss recovery has been verified during this design phase. Existing code and product documents provide the evidence; this feature does not invent additional clinical workflow.

## Approaches considered and selected

1. **Shared recovery infrastructure with explicit form adapters — selected.** Share identity, device checkpoints, status, Resume/Discard, and conflict handling. Each form supplies an allowlisted snapshot and uses its existing final mutation. Keep the existing consultation draft backend and clinical transitions. This requires a coverage inventory and adapter work but provides consistent recovery and isolation.
2. **Independent recovery per module.** Each module owns its draft implementation. It can simplify an isolated first delivery but repeats security, conflict, and lifecycle logic and makes consistent behavior harder. Eric chose the shared approach.

Server-only saving cannot cover unsynced input during a connection interruption. Device-only saving cannot provide server-backed recovery on another computer. The selected approach uses both without introducing offline submission or a background transaction queue.

## Goals, non-goals, and failure conditions

Success: a user can reopen the relevant form after reauthentication, choose Resume, see the last persisted input, and intentionally save once. Other users cannot retrieve personal draft content. Consultation handoff follows existing authorization.

Non-goals: offline login/patient search/new consultations, cached patient directories or reports, automatic submissions on reconnect, edits to immutable finalized health records, a new clinical approval policy, and redesigning unrelated forms.

Unacceptable outcomes include: duplicate official records after retry, autosave sending invitations or referrals, unsaved input silently replacing official data, a stale tab recreating a discarded draft, showing another user's personal draft, or claiming server protection when only a device copy exists.

## Coverage and adapter ownership

Every active field-bearing business mutation is in scope. A form with several steps has one draft at its save boundary, not one draft per component or wizard step. A nested form with a truly independent Save has its own contextual identity.

The implementation plan must create a coverage manifest by tracing active routes, modal callers, inputs, and final mutation owners. For each entry record form type, create/edit mode, scope/target, snapshot allowlist, authorization, final endpoint, idempotency, and recovery entry point. Mark a route as redirect/read-only/excluded with evidence; a filename alone is not coverage. The following is the starting map, not permission to omit other active business forms:

| Area | Known owners/entry points | Contract |
| --- | --- | --- |
| Consultations | BHC/RHU workspaces; profile Start Consultation; RHU queue; direct and follow-up routes | One clinical consultation draft; preserve visit UUID, review state, editor lease, and permissions. Embedded history, vitals, programs, prescriptions, and next steps remain in this snapshot. |
| Registration and household work | `AddPatient.jsx`, RHU registration wrappers, `BhcFamilies.jsx`, `BhcFamilyConnections.jsx`, `TransferHouseholdModal.jsx` | Separate new/edit and parent context; keep family selection and registration together where they share a final save. Revalidate FSN, family links, and transfer destinations. |
| Patient background | `PatientBackgroundTab.jsx` owns section-edit state; `PatientBackgroundEditor.jsx` renders fields | Draft at the actual authorized section save boundary; do not change which historical data may be edited or by whom. |
| Referrals and feedback | Active `CreateReferral.jsx` route, referral consumers, `FeedbackReturnSlip.jsx` | Snapshot current user input only; refresh destination availability, referral state, and clinical eligibility before final submission. No QR/referral publication on autosave. |
| Follow-ups and clinical actions | `FollowUpActionModal.jsx`, care-closure forms, `CloseVisitModal.jsx`, any other field-bearing action | Restore intended action, reason/note/date; final confirmation and current-state eligibility remain mandatory. |
| Medicines | `MedicineFormModal.jsx`, inventory action modal, prescription review/dispensing input owners | Snapshot input only; stock changes and dispensing require online confirmation and existing atomic stock logic. |
| Doctor scheduling | `DoctorSchedule.jsx`, `DoctorAvailabilityModal.jsx`, day-absence form owners | Include doctor/date/action context. Refresh roster, overlaps, and eligibility before applying restored dates or status. |
| Accounts and access | `AddUser.jsx`, `EditAccountModal.jsx`, `StaffAssignments.jsx`, active field-bearing invitation/reset-management dialogs | Store approved non-secret fields only. Review checks, permission confirmation, account creation, mail, grants/revokes remain explicit actions. Never persist password fields or confirmation-checkbox consent. |
| Facilities | `FacilityFormModal.jsx` | Separate BHC/RHU and create/edit identity. Keep existing field/payload distinctions. |
| Other active mutations | Shared profile/contact or settings forms, walk-in intake/check-in fields, relationship and correction notes, if present in active callers | Add explicit adapters after tracing their save boundary. A pure selection/search view with no unfinished business mutation is not a draft form. |

Excluded: login, password change/reset/setup, invitation redemption credentials/tokens, OTP/CAPTCHA, browser file objects, search/filter/pagination/report-period controls, pure confirmation dialogs with no editable business input, and read-only/retired routes. A business form containing a secret still drafts its allowlisted non-secret fields and requires re-entry of secrets. File selection, if any active form supports it, must show that the file needs reselection unless an existing authorized upload reference can be safely reused.

## Shared contract and identity

Adapters expose: stable form type and schema version, mode, authorized context, normalized current snapshot, initial baseline, serialization/restore/migration, current target revision, current authorization, final mutation, and context-specific entry behavior.

Only changed, meaningful user input starts a draft. Opening a form with defaults does not create one. Temporary invalid/incomplete field values may be drafted within bounded types and size limits; final Save still applies complete domain validation. Do not persist server-loaded datasets, query caches, DOM state, field errors, or fetched patient objects.

**Personal forms:** one active draft slot per authenticated owner + authorization context + registered form type + mode + subject/parent key. Edits use the existing record ID; new forms use a deterministic create slot under the relevant parent context. A new random transaction UUID is allocated only when that slot starts and is persisted immediately. Reopening/two tabs must find the slot first, not mint competing identities. Distinct parents/records/form types may each have a draft.

**Clinical forms:** identify by facility, patient, and existing consultation/visit UUID. For BHC Start Consultation, find the patient's active unfinished consultation before allocating a new one, including consultations under review. For RHU, bind to the actual started queue visit and reuse its UUID; do not create or close a queue visit merely to inspect drafts. Do not apply a private owner-only visibility rule to clinical review records.

Enforce uniqueness in PostgreSQL, not only React. Add the necessary clinical active-slot constraint after an explicit legacy-duplicate preflight; report conflicting legacy drafts for authorized resolution rather than deleting or choosing one arbitrarily. General drafts use a separate `form_drafts` resource; existing `health_record_drafts` remain clinical authority. Non-PHI indexes and metadata may identify slots; clinical contents stay encrypted.

## Persistence, authentication, and privacy

### Device recovery

Checkpoint allowlisted snapshots into encrypted IndexedDB during an already-open authenticated form, whether or not the network is currently reachable. Default debounce: 1.5 seconds. Record the client revision and last confirmed server version, serialize writes, and retain a newer device snapshot until server acknowledgement of that revision or terminal completion. Flush on section changes/intentional close/visibility changes where possible; a pagehide request is best effort and cannot guarantee power-loss recovery.

No PHI in localStorage, sessionStorage, URL/history state, service-worker caches, telemetry, or persisted TanStack Query caches. Storage failures/quota/unavailable secure crypto produce a truthful inline warning; never fall back to plaintext. HTTPS or a supported secure local development origin is required for secure browser crypto.

To retain unsynced recovery safely across logout/session expiry, change the current persisted-key model: retain ciphertext but obtain decryption capability only after authenticated online re-entry into the same authorized context. Architect choice: a versioned random recovery key per user and authorization scope, encrypted at rest on the server, issued through an authenticated no-store TLS endpoint and imported as a non-extractable in-memory CryptoKey. Persist no usable decryption key, account password, or bearer credential beside the device ciphertext. Clear live keys, plaintext, and query data on logout/account/context switch. Another signed-in account cannot request the previous account's key. Facility/role access changes must be rechecked before releasing a key or recovering any snapshot.

Ordinary personal scopes use user + role + facility context; the Admin context is explicit rather than an empty-facility wildcard. Clinical device copies are still owned by the account that checkpointed them; other authorized clinical staff can access server workflow drafts through existing permissions, not another account's unsynced device contents.

Do not weaken the current purge behavior before the replacement envelope and authenticated key gating work. Migrate legacy vault contents only while their owner is authenticated and authorized; retain existing keys only for that migration operation, then remove persisted legacy keys. Never manufacture recoverability for already-purged data.

The builder may choose table/endpoint names and implementation of key rotation, but must preserve these constraints. No key material or request/response payloads in logs. A compromised same-origin script or unlocked OS session remains outside what browser encryption alone can solve.

### Server drafts

Ordinary personal drafts are authenticated owner-and-context scoped and encrypted at rest. Use metadata-only lookups, explicit detail reads, registered form schemas, bounded payloads, optimistic versions, and configured per-user write limits. A client-supplied form name/target never authorizes access. Consultation drafts continue through existing clinical APIs and authorization.

Default server debounce remains 20 seconds unless backend throttles are deliberately adjusted together; changes arriving during an in-flight save coalesce to the newest revision. Reconnect retries draft synchronization only, with bounded backoff/jitter and no automatic official mutation. API failures and unreadable storage are not equivalent to an empty result.

Defaults: device recovery expires after seven days; ordinary server drafts expire after seven days since the last successful changed save; preserve existing clinical server expiry (currently 30 days). Reads/retries/no-op writes do not extend retention. Timestamp checks apply on every read, and existing scheduled pruning infrastructure should remove expired data without introducing unnecessary services. Mark retained terminal metadata separately from payload deletion; do not retain PHI in audit notes.

### Logout, expiry, and switching

- Intentional logout: attempt a bounded flush, then distinguish server-saved, device-only, and unavailable recovery. If device-only, explain that Resume requires this browser and a later online login. Offer leaving versus returning to the form; never silently claim the unsynced input reached the server.
- Clear live keys/plaintext and stop writes before another account can initialize. Retain only the new protected ciphertext envelope within expiry. Forced expiry/logout must still clear live access and preserve protected recovery when possible; it cannot wait indefinitely for a network save.
- On later authenticated re-entry, reopen only authorized snapshots. Revoked/deactivated accounts cannot unlock them. Context changes do not transfer personal drafts to another facility/account; leave inaccessible ciphertext to expire and explain only that recovery is unavailable.
- Browser deletion, private-mode storage loss, disk failure, expired retention, or clearing site data can destroy device-only work. Another computer sees only the last server-confirmed snapshot. UI must make this distinction without exposing technical details unnecessarily.

## Entry and interaction behavior

Operate mode; preserve AKAY's existing Inter/navy/red/white identity and current form layouts. Use shadcn/ui primitives with Tailwind and existing tokens for the new shared recovery decision/status surfaces. Do not restyle every form or replace all existing modal infrastructure as a side effect.

Consultation entry sequence:

1. User clicks Start Consultation for a selected patient.
2. Check current authorized server draft and this account/context's device recovery metadata. Show checking feedback. Use an exact patient/visit lookup rather than searching only the first paginated draft page.
3. Existing draft: show one decision dialog titled **Unfinished Consultation**, safe context, saved timestamp, primary **Resume**, secondary **Discard**, and accessible X. Do not stack it above the start selection dialog.
4. Resume acquires/revalidates existing edit authority and restores the same consultation, its New/follow-up intent, and the last valid workspace step. It does not open the selection modal again or complete a scheduled follow-up.
5. Discard requires a focused confirmation naming the selected draft; success discards all matched recovery representations, then opens the existing selection modal. Failure keeps the decision visible with an inline Retry/error. No field values enter audit text.
6. No draft: open the unchanged existing selection modal. X/Escape/backdrop dismissal closes the decision without deleting work or automatically opening another modal.
7. Lookup failure: show a retryable local error and do not offer a potentially duplicate fresh start. Keep equivalent guards on direct URLs, queue routes, and Record Visit/follow-up entry points; do not depend solely on the profile button.

Other forms use the same entry decision before editing: Resume restores the snapshot; confirmed Discard removes the draft and opens a fresh form with current defaults/official data; X returns to the opener. Full-page Back/navigation preserves a draft and attempts a checkpoint without changing an existing domain confirmation policy. A successful durable checkpoint allows closing; if neither device nor server can persist the newest input, warn and offer an explicit leave decision. Final submission remains disabled while offline; do not open a supported offline workflow from a fresh page.

Use compact, non-blocking status near the form actions: **Saving draft…**, **Draft saved**, **Saved on this device**, **Draft not saved**, and **Connection lost**. Show server-saved time separately from a newer device-only snapshot. Use `aria-live="polite"` for meaningful status changes, not per keystroke. Recovery dialogs trap focus, have an accessible close label, restore focus to their opener, and fit narrow screens. Busy destructive actions prevent double clicks; errors remain inside the dialog or near affected fields. Do not auto-focus Discard. Existing successful domain-save toasts remain; do not toast every autosave.

## Conflicts, terminal actions, and final submission

Never choose between divergent snapshots by timestamps alone. A device snapshot includes the server base version and local revision. Safe descendant changes can sync against the same base; an advanced server version produces a conflict with a safe review choice. Preserve unsynced local content while the user chooses. Newer official records/changed eligibility require current data and validation before any final mutation; do not silently merge stale edits. Do not add an overwrite-authority loophole for fields the current user cannot edit.

Consultations retain their existing editor claims/leases, takeover reason, review restrictions, version handling, and audit events. Ordinary forms need version checks and coordinated local writes; a second tab must not overwrite a newer checkpoint from the first tab. Use transactional local revision checks and opaque cross-tab lifecycle messages, not clinical payload broadcasts.

Discard/consume stop timers, wait for queued writes, terminalize the matching server identity, remove its device representation, and notify other tabs. Use server terminal identities and local terminal markers so a stale reconnect cannot recreate the transaction. Offline server discard is not silently queued; keep the draft until an online authoritative result. Deleting a personal draft never deletes or mutates its official target.

Final Save uses a stable operation/submission identity persisted with the draft. Disable duplicate clicks, but also enforce server idempotency: same identity/same payload returns the original authorized result, and same identity/different payload conflicts. A lost response after commit must be recoverable by retry/status lookup, not by submitting with a new identity. Account/facility authorization still applies to replayed results.

For each final endpoint, consume the exact submitted draft revision and commit the domain mutation in one database transaction, using existing stored procedures where applicable. Enforce version checks when input changes after the submitted snapshot; do not consume or delete a newer unsent revision. Preserve existing audit, notification, invitation-mail, inventory, referral and clinical-finalization rules; draft CRUD never triggers those business side effects. Reuse existing idempotency implementations where present; add narrowly scoped commit receipts/replay support where absent. The implementation plan must trace each final endpoint's transaction boundary; frontend-only cleanup is insufficient.

## Architecture responsibilities

| Layer | Responsibility |
| --- | --- |
| React shared hook/coordinator and form adapters | In-memory form state, allowlisted snapshots, device checkpoint scheduling, safe hydration, identity, status, entry dialogs, close handling. |
| TanStack Query | Authenticated/context-aware draft metadata/detail queries and mutations, invalidation after save/discard/consume, current eligibility refresh. Keep caches in memory and clear across sessions; not a durable draft store or offline mutation queue. |
| Laravel controllers, requests, policies and services | Authentication/authorization, registered form schemas, encrypted payload and key access, version/lease transitions, limits, idempotent final endpoints and draft consumption inside the domain transaction. Controllers stay thin. |
| PostgreSQL / existing Supabase stored procedures | Unique active slots, version/transaction locks, constraints, receipts, and existing atomic domain operations such as stock and FSN allocation. Do not move generic draft CRUD into a new stored procedure without a demonstrated need. Never give the frontend direct draft-table access that bypasses Laravel policies. |

## Rollout and compatibility

One feature, phased delivery: (1) coverage manifest and core identity/storage/security/API contract, (2) BHC/RHU recovery plus entry/handoff integration, (3) registration/households/referrals/clinical action forms, (4) inventory/scheduling/accounts/facilities and every remaining manifest entry, (5) full verification and rollout decision. These are implementation ordering choices; the accepted scope remains all business forms.

Do not flip existing draft flags until the relevant paths, permissions, migrations, and recovery tests pass. Preserve legacy clinical payload conversion; unknown schema versions cannot be loaded as an empty editable form. Existing duplicate drafts and encryption migration need explicit preflight reports and a non-destructive rollout. Release gates must identify any not-yet-enabled adapter; do not label the whole feature complete while forms are silently uncovered. No deployment, production data cleanup, commit, or push is included in this design-writing task.

## Verification required by the implementation plan

- One draft and one official result for double-clicks, two tabs, retries, request timeouts, and a response lost after a committed mutation; PostgreSQL tests for actual unique-slot and concurrent-transaction behavior.
- Server and device recovery after a page/browser restart; app reload requires connectivity; same-account reauthentication unlocks recovery, other account/facility/revoked access cannot. Test session expiry and cross-tab logout as well as intentional logout.
- Power-loss simulation after confirmed device checkpoint, and explicit loss-window verification before checkpoint; never assert guaranteed recovery of an unpersisted keystroke.
- Late checkpoint/save after Discard or successful Save cannot resurrect a draft. Advanced local revision is not deleted by an older save response. A consumed server draft cannot be reintroduced by a stale device.
- No-draft, exact draft beyond list pagination, lookup failure, empty/new form, invalid partial values, schema changes, quota/crypto failures, network flapping, 401/403, 409, validation and 5xx errors.
- Consultations: selected patient/visit identity, New/follow-up intent, direct/follow-up/queue routes, encoder submit and authorized finalization, Return for Correction, edit lease/takeover and concurrent reviewer behavior.
- Every manifest entry: round-trip its complete allowed input, skip secrets, require current authorization/eligibility, no official changes from autosave, and leave exactly one result after final save. Check currently selected dates, stock, household IDs and assignment consent rather than blindly restoring eligibility.
- Representative real-browser desktop/mobile checks for the shared dialog, focus, X/escape, status wording, close with failed persistence, and nested form entry. Unit/feature tests do not establish visual quality or real IndexedDB behavior alone.
- Scoped lint, relevant frontend/backend suites, production build, migration/preflight verification, and final diff review. Do not claim live browser or PostgreSQL verification if those environments are unavailable.

## Builder discretion and approval boundary

The builder chooses internal names, exact component decomposition, safe retry jitter, and test organization. It must finish the coverage manifest and inspect each final transaction boundary before touching that adapter. Changes to clinical roles/handoff, global offline behavior, silently dropping forms, or storing secrets are outside this design.

Open user decisions: none. The fresh builder check found no material missing decisions. Eric then explicitly requested implementation and later resumed it after a usage interruption; proceed under the companion implementation plan without repeating the interview or requesting another approval.
