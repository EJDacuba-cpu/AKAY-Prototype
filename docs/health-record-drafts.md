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
order. A BHW can resume or discard a draft, and the clinical form exposes a manual
`Save Draft` / `Update Draft` action with the latest server timestamp. Saving does
not move the page, clear fields, or validate official required fields. A failed
request leaves React form state intact.

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
