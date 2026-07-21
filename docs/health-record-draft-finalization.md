# AKAY Draft Finalization Atomicity

## Transaction contract

For a new official submission, request validation and BHW/patient authorization
run before the controller transaction. The transaction then locks the owner- and
BHC-scoped draft UUID with `FOR UPDATE`, verifies active/unexpired state and exact
patient/classification binding, and runs the existing health-record, inventory,
follow-up, referral, notification, and audit database work. The locked draft is
marked consumed, linked to the official record, and stripped of ciphertext before
the single commit.

Any exception during those steps rolls back the official record, stock and ledger
changes, referral/follow-up/notification work, audit rows, and draft transition.
No authoritative draft transition uses `DB::afterCommit`.

The existing official idempotency lookup intentionally occurs before draft-state
validation. A committed same-key/same-payload retry replays the existing result;
a changed payload receives the existing mismatch conflict. A new key reaches the
draft lock and receives `DRAFT_ALREADY_CONSUMED` after another request wins.

## PostgreSQL two-session verification

Run only against an isolated development PostgreSQL database after the pending
draft migration is reviewed and applied. Prepare one active draft with a medicine
selection and obtain a short-lived BHW bearer token outside shell history. Use the
same JSON body and draft UUID in both sessions, but different idempotency UUIDs.

Set both terminals to submit at the same future instant. Example PowerShell for
Session A and Session B, changing only `Idempotency-Key`:

```powershell
$headers = @{
  Authorization = "Bearer <short-lived-dev-token>"
  Accept = "application/json"
  "Content-Type" = "application/json"
  "Idempotency-Key" = "<unique-session-key>"
  "X-Health-Record-Draft-ID" = "<draft-uuid>"
}
$body = Get-Content -Raw .\isolated-finalization-payload.json
Start-Sleep -Milliseconds ([Math]::Max(0, (<shared-start-utc> - [DateTime]::UtcNow).TotalMilliseconds))
Invoke-WebRequest -Method Post -Uri "<dev-api>/api/health-records" -Headers $headers -Body $body
```

Expected: one request returns 201; the other returns 409 with
`DRAFT_ALREADY_CONSUMED`. A same-key retry returns 200 with
`idempotent_replay=true`.

Verify with read-only SQL in `psql`:

```sql
SELECT public_id, status, consumed_health_record_id,
       encrypted_payload IS NULL AS payload_erased
FROM public.health_record_drafts
WHERE public_id = '<draft-uuid>'::uuid;

SELECT id, idempotency_key, patient_id, category
FROM public.health_records
WHERE id = (
    SELECT consumed_health_record_id
    FROM public.health_record_drafts
    WHERE public_id = '<draft-uuid>'::uuid
);

SELECT medicine_id, COUNT(*) AS ledger_rows, SUM(quantity_delta) AS total_delta
FROM public.medicine_inventory_transactions
WHERE source_type = 'health_record'
  AND source_id = (
      SELECT consumed_health_record_id
      FROM public.health_record_drafts
      WHERE public_id = '<draft-uuid>'::uuid
  )
GROUP BY medicine_id;
```

Confirm one consumed draft, one official record, one ledger row per selected
medicine, and one deduction. Repeat with referral/follow-up payloads and confirm no
duplicate related rows.

## Deployment header path

Laravel CORS permits the exact `X-Health-Record-Draft-ID` header for configured
origins; origins and headers remain non-wildcard. The UUID remains in a request
header and never enters a URL. AKAY contains no repository-managed reverse-proxy
configuration, so staging must verify that its proxy forwards `Authorization`,
`Idempotency-Key`, and `X-Health-Record-Draft-ID` unchanged and does not log request
bodies or authorization headers.

## Cache test count review

Commit `84c3d09` added `SecureServerCacheTest.php` with exactly 11 test methods.
There is no current diff for that file, and `--filter=SecureServerCache --list-tests`
lists the same 11 methods. The prior 12 tests / 215 assertions statement cannot be
reproduced from Git and was a reporting mismatch; no cache test was removed or
renamed for Phase 4C.

