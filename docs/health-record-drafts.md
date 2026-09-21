# AKAY Secure Health Record Drafts

## Scope and allowlist

Phase 4C supports manual, creator-owned drafts for the direct BHW Add Health
Record workflow. Drafts belong to one active BHW, one active BHC, and one patient
in that BHC. RHU, admin, collaborative, patient-registration, referral-feedback,
record-edit, and routed follow-up drafts are deferred.

Searchable plaintext metadata is limited to owner ID, BHC ID, patient ID,
classification, status, version, and lifecycle timestamps. The encrypted payload
allowlist contains visit date/time, clinical text fields, vitals, morbidity flags,
follow-up and referral decisions, current maternal/EPI/family-planning/HPN-DM
form structures, and medicine ID plus proposed quantity only.

The server rejects unsupported fields. It never stores patient snapshots, medicine
names or stock snapshots, tokens, passwords, QR values, idempotency or operation
keys, browser/UI state, query-cache data, error objects, or official record IDs in
an active draft.

## Database design

Migration `2026_07_21_000003_create_health_record_drafts_table.php` creates:

- internal bigint primary key, never returned by the API
- unique opaque UUID `public_id`
- required owner, BHC, and patient foreign keys
- classification, status, and optimistic `version`
- nullable encrypted payload text
- optional consumed health-record link populated only after official save
- expiry, last-save, and standard timestamps
- owner/status/save, BHC/status, patient/status, and expiry indexes
- PostgreSQL checks for the four lifecycle states, `version >= 1`, and terminal
  ciphertext removal/active-link consistency

Rollback drops only `health_record_drafts`; it does not alter official health
records, medicines, referrals, follow-ups, or audit logs.

Read-only preflight before migration:

```sql
SELECT to_regclass('public.health_record_drafts') AS existing_draft_table;

SELECT COUNT(*) AS invalid_bhw_assignments
FROM users AS u
LEFT JOIN barangay_health_centers AS b
  ON b.id = u.barangay_health_center_id
WHERE u.role = 'bhw'
  AND (
    u.barangay_health_center_id IS NULL
    OR u.rural_health_unit_id IS NOT NULL
    OR b.id IS NULL
    OR b.status <> 'active'
  );

SELECT COUNT(*) AS patients_with_mixed_facility_assignment
FROM patients
WHERE barangay_health_center_id IS NOT NULL
  AND rural_health_unit_id IS NOT NULL;
```

The expected production impact is one new indexed table. No existing row is
rewritten and no clinical table is backfilled.

## Encryption and key custody

`HealthRecordDraftService` encrypts the allowlisted JSON with Laravel `Crypt`,
which uses `APP_KEY`. Ciphertext is never exposed or logged. Individual clinical
fields cannot be queried in PostgreSQL. A decryption failure returns a safe error,
logs metadata and exception class only, and leaves the draft for controlled
investigation.

Backups containing drafts remain dependent on the matching `APP_KEY`. Losing that
key makes encrypted drafts unrecoverable. Copying production ciphertext into an
environment with another key will also fail. Key rotation must use a reviewed,
audited re-encryption procedure that retains the old key until every active draft
and relevant backup has been handled; this phase does not automate rotation.

## Authorization and API

All endpoints run through no-store, Sanctum, active-account, valid-facility, and
BHW-role middleware before loading a draft:

```text
GET    /api/health-record-drafts
POST   /api/health-record-drafts
GET    /api/health-record-drafts/{opaque-id}
PUT    /api/health-record-drafts/{opaque-id}
DELETE /api/health-record-drafts/{opaque-id}
```

Owner and BHC predicates are part of every protected draft lookup. The patient is
reauthorized on resume. Cross-owner, cross-BHC, inactive, consumed, discarded, and
expired drafts return safe not-found or authorization responses. List responses
contain metadata only; detail responses return the decrypted allowlist and current
authorized medicine display information with neutral review warnings.

## Manual save and resume UI

The direct BHW Add Health Record setup screen lists active drafts in last-saved
order. Saved Drafts shows server drafts and encrypted on-device drafts in one
list: a device copy and a server draft are the same consultation when they share
the consultation identity, else the draft id, and — for legacy drafts where
neither side has an identity — the patient (see *Consultation identity* below).
The newer of the two decides what Continue reopens. A device copy that is ahead is marked *On this device / Not yet
synced* and is never displaced by an older server copy; an older device copy is
still attached to the row so discarding removes both. A server failure is a
notice above the list rather than a replacement for it, so on-device drafts stay
reachable offline, and Retry is offered only when the server could actually
answer. Reconnecting refetches server drafts, merges, and pushes eligible device
copies up on its own — no manual Retry is needed to see drafts again.

A BHW can resume or discard a draft, and the clinical form exposes a manual
`Save Draft` / `Update Draft` action with the latest server timestamp. Saving does
not move the page, clear fields, or validate official required fields. A failed
request leaves React form state intact. Offline, that action updates the
encrypted device copy instead and never reports a server save.

The New Consultation wizard runs:

```text
Setup → Interview & Vital Signs → Clinical Assessment
      → Program / Service Details (only when a program is selected)
      → Treatment & Management → Next Care Decision → Review & Save
```

Interview and Vital Signs share the first step: two cards on one screen, with no
Next between them. Next from that step proceeds only when both cards satisfy the
existing validation, including blood pressure when Hypertension / Diabetes is
selected.

Setup answers only which patient and what type of visit. Programs and services
are chosen at the end of Clinical Assessment, grouped as *Services* (Maternal,
Family Planning, EPI) and *Condition Monitoring / Evaluation* (TB,
Hypertension, Diabetes). Selecting none is a general consultation, and Program /
Service Details is skipped. With several, their existing forms follow one at a
time, primary first, headed "Program 1 of N · <name>". Previous reverses the
exact forward order.

Interview is the first step, not a dead end: its left action is
`Back to Setup`, which returns to the setup screen — and so to Saved Drafts —
with the patient, visit type, programs, field values, server draft identity, and
device draft identity all intact. It flushes pending edits into the same draft
first, since autosave pauses on setup. Re-entering the same patient's
consultation is not a new consultation and does not re-run the unfinished-draft
conflict check.

History of Present Illness remains required for a general consultation only.
Because Interview now precedes the program decision, that requirement is
enforced when Clinical Assessment is left, returning the encoder to Interview if
it is missing. Chief Complaint is required on leaving Interview, as before.

A draft reopens on the screen it was saved on, including Next Care Decision.
Drafts from the previous wizard's Current Visit screen, and from the brief
standalone Vital Signs screen, reopen on the first step.

Resume fetches one detail response, restores known fields only, and rebuilds
medicine labels and availability from the authorized server response. A stale,
archived, expired, unavailable, or cross-facility medicine is never silently
trusted for official submission. Version conflicts show a reload-latest action.
No per-keystroke autosave or browser persistence is used.

## Concurrency, official save, and side effects

Updates require the last known version. One guarded SQL update includes owner,
BHC, active status, expiry, and version predicates and increments `version` in the
database. A stale writer receives HTTP 409 with `DRAFT_VERSION_CONFLICT` and cannot
overwrite the newer payload.

Draft writes never create health records, referrals, follow-ups, notifications,
ledger rows, stock mutations, cache invalidations, or official idempotency keys.
Official submission sends the opaque draft ID in a dedicated header. Laravel
checks committed idempotent replay first. A new finalization transaction locks the
owner/BHC-scoped draft row, reauthorizes its patient and classification, executes
the existing stock, referral, follow-up, notification, and audit work, then marks
the draft consumed and removes ciphertext before the single commit. Any failure
rolls back both official effects and the draft transition.

## Lifecycle and operations

Active drafts expire 30 days after their latest manual save. Expiration immediately
removes ciphertext. Consumed, discarded, and expired rows retain metadata for seven
days and are then deleted. `health-record-drafts:prune` runs daily at 02:45 with the
existing scheduler mutex convention; `--dry-run` reports counts without changes.

Audit events are metadata-only: `draft_created`, `draft_updated`, `draft_resumed`,
`draft_discarded`, `draft_consumed`, `draft_expired`, and
`expired_drafts_pruned`. Descriptions never contain patient names, clinical text,
medicine quantities, or decrypted payloads.

Draft APIs are excluded from `AkayCacheService`, browser storage, persisted TanStack
Query storage, service-worker persistence, and URL clinical values. Authenticated
responses retain `Cache-Control: no-store, private`, `Pragma: no-cache`, and
`Vary: Authorization`.

The initial operational limits are 20 active drafts per BHW, 256 KiB of serialized
allowlisted payload, 10,000 characters per text field, 50 medicine selections,
30 pregnancy or vaccine entries, 15 metadata rows per API page, and 30
create/update requests per minute. The frontend follows all metadata pages so
every allowed active draft remains reachable.

## Offline Resilience Design Rationale

BHWs encode records at barangay health centers on connections that drop mid-form.
Manual-only saving meant a failed request lost everything typed since the last
save. The `useDraftAutosave` hook (`frontend/src/hooks/useDraftAutosave.js`) keeps
unsaved input alive and retries automatically when the link returns. The encoder
is told once, by the Connection Lost dialog, and then left alone: there is no
persistent offline banner. A confirmed server sync shows a short `Draft synced`
toast. The dialog reappears only after a confirmed save has proven the link is
back and it drops again, so a single outage never interrupts twice.

AKAY remains online-first. Only a consultation that is already open is protected;
patient search, patient registration, inventory, referrals, reports, and every
other server-backed module stay unavailable while offline and claim nothing else.

### Where an unsaved draft lives

While the server is reachable, unsaved clinical input is held only in React state
and refs — the queued payload lives in an in-memory `pendingSaveRef` — and the
single durable copy is the server-side ciphertext encrypted under `APP_KEY`.
Nothing clinical is ever written to `localStorage`, `sessionStorage`, a
service-worker cache, or persisted TanStack Query storage.

When the connection drops, the same snapshot is additionally sealed into an
encrypted IndexedDB vault (`frontend/src/services/localDraftVault.js`) so the
consultation survives a refresh, a tab close, or a PC restart. The vault:

- encrypts with AES-GCM 256 and a fresh 12-byte IV per write, using a key
  generated `extractable: false`, so page script can encrypt and decrypt but can
  never read the raw key bytes back out;
- binds the record key in as additional authenticated data, so ciphertext cannot
  be moved between slots or between users;
- stores only SHA-256 tags, a timestamp, the IV, and the ciphertext in the clear —
  no patient id, no classification, no account id;
- keeps exactly one snapshot per (user, consultation) and overwrites it in place;
- sweeps anything older than seven days on the next open;
- is destroyed — rows *and* keys — by `clearSensitiveSessionState` on logout,
  account switch, changed identity, forced invalidation, and cross-tab clear. The
  one preserved case is the same account re-authenticating on the same device
  (`reason: "login-initialized"`), which is what makes restart recovery work.

The local copy is removed only after the server confirms the draft was stored. A
failed request never deletes unsynced clinical data.

If the browser context cannot encrypt — `crypto.subtle` is undefined on an
insecure origin — the vault reports itself unavailable and the UI says so. It
never falls back to plaintext storage.

### What this covers

Intermittent connectivity during active encoding: request timeouts, transient
network loss, `navigator.onLine` transitions, `502/503/504` responses, and server
rate-limiting (`429`). While the tab stays open, typed input survives these and is
flushed to the server automatically — debounced at 20s (at most three writes per
minute, well under the 30/min limit), immediately on step/section change, with
exponential backoff (5s, 10s, 30s, 60s cap) and an immediate flush on the `online`
event. Version conflicts (`409 DRAFT_VERSION_CONFLICT`) stop the retry loop and
prompt a non-destructive reload-or-keep choice; the newer server draft is never
silently overwritten. Payload rejections (`422`) stop retrying and surface the
field errors.

### What this does NOT cover

It is not offline authoring. Only the consultation already open is protected: a
new one cannot be started offline, because patient lookup and classification both
need the server.

The vault raises the ceiling from "as long as this tab stays open" to "as long as
you stay signed in on this device", but it is not unconditional. Logging out,
switching accounts, or a forced session invalidation destroys the vault keys and
therefore any work that has not yet synced. Clearing browser site data does the
same. Encoders should reconnect and let the draft sync before signing out.

### Residual risk

The ciphertext and its key both live in the same browser profile, which is what
lets the draft survive a restart without a server round trip. That defends against
inspection of the profile on disk, a copied backup, and casual DevTools browsing
of storage values. It does not defend against code executing on the AKAY origin in
that signed-in profile, nor against a forensic extraction of the browser's own key
store. A server-issued, per-session derived key would narrow this further at the
cost of making restart recovery impossible; the trade was made deliberately in
favour of recovery, bounded by the seven-day sweep and the session-clear purge.

## Consultation identity (`consultation_uuid`)

One consultation carries one stable identity from setup to the official record:

```text
Setup → Interview → server draft → encrypted device copy → reconnect → health record
```

It is **not** `idempotency_key`, which is unchanged. The two answer different
questions:

| Field | Identifies | Minted | Lifetime |
|---|---|---|---|
| `consultation_uuid` | one **consultation** | client, once, when setup hands over to Interview | the whole consultation |
| `idempotency_key` | one final-save **attempt** | client, at final save | one submission, bound to one payload via `idempotency_hash` |

`consultation_uuid` is excluded from `idempotency_hash`, alongside
`idempotency_key` and `draft_public_id`, so the fingerprint is byte-identical to
what it was before the column existed.

**Lifecycle.** Minted by `ensureConsultationUuid()` only when there is none, so
Next, Previous, Back to Setup, autosave, manual save, program changes, and
reconnect all keep it. Resume and recovery use `adoptConsultationUuid()`, which
always takes the draft's own identity; only a legacy draft with none is given
one, and the server adopts it once on the next save and never reassigns it. It
is cleared only when the consultation ends — saved, discarded, abandoned for a
different patient, or on session clear.

**Where it lives.** `health_record_drafts.consultation_uuid` (a real column),
`payload.consultationUuid` inside the encrypted draft (so the device copy
carries it), and `health_records.consultation_uuid`. It is hidden on the
`HealthRecord` model like the idempotency fields and is never an authorization
input — every lookup keeps its owner and BHC predicates.

**Uniqueness.**

- Drafts: unique on `(owner_user_id, consultation_uuid)` for **active** rows
  only (partial index). Per owner because the value is client-supplied and only
  meaningful within one user's drafts; active-only so a consumed draft can share
  the value with its record and a discarded or expired row never blocks a
  resume. Creating a draft for an identity that already has an active draft
  returns `409 DRAFT_CONSULTATION_EXISTS` with that draft's `draft_id` and
  `version`, and neither splits the consultation nor overwrites the server copy.
- Records: globally unique, nullable. One consultation becomes at most one
  record, even across a reload that mints a fresh idempotency key — that returns
  `409 CONSULTATION_ALREADY_RECORDED`. The caller's own record id is returned;
  anyone else's is never identified.

**Device copies** are keyed `consultation:<uuid>`, scoped to the owner. There is
no patient-keyed form for a new slot, so two consultations for one patient are
two slots. Slots written before this change (`patient:<id>`) remain readable.

**Saved Drafts matching**, in strict priority: consultation identity, then
server draft id, then patient — the last only when **neither** side has an
identity. Empty identities never match each other. A device copy with no server
id that matches a server draft is reopened bound to that draft's id and current
version, so autosave updates it under the normal version check rather than
creating a duplicate.

Existing rows keep `consultation_uuid = NULL` and are not backfilled.
