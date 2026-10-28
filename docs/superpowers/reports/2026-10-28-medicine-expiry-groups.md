# Expiry groups implementation and verification

Implemented against Eric's approved design in `../specs/2026-10-28-medicine-expiry-groups-fefo-quarantine-design.md`.

## Implementation

- Additive migration `2026_10_28_000001_create_medicine_expiry_groups.php`: item type, expiry groups, immutable transaction allocations, uniqueness/balance constraints, RLS and browser-role revocations. No backfill or deletion. Rollback refuses posted group history.
- Same-date receipts merge physical balances but keep separate ledger transactions. Explicit Not Applicable is accepted only for health supplies; medicine receipts require expiry.
- PostgreSQL serializes medicine then group locks. FEFO allocates only eligible available balances, and manual selection records the actual groups with a mandatory reason. Missing eligible quantities remain unallocated shortages and retain Reconciliation Required; expired/quarantined/unassigned balances are not consumed.
- Shared BHC/RHU Add, Restock, Deduct, Details and history workflows. Details displays recorded, eligible available, quarantined, expired and unassigned stock. Authorized staff can partially quarantine, release and dispose with reasons. Expired release is rejected.
- Metadata edits retain read-only stock and cannot rewrite group expiry or item type. Backend corrections remain authorized/audited; grouped corrections identify a group and pool, or explicit unassigned residual.
- Complete physical verification is a backend endpoint with an exact group set, both pool counts, unassigned count, snapshot and stable operation key. Partial corrections never clear reconciliation. The read-only Details modal exposes only the requested quarantine/disposition actions, not a new correction editor.
- Clinical medicine and vaccine payloads retain manual allocations through drafts and submissions. Actual allocations, override reason and shortage appear in history. Existing RHU clinical dispensing restrictions remain.
- Facility-scoped responses, query keys and list filtering prevent cross-facility inventory reuse. Calendar-aware caching refreshes expiry eligibility on Manila date changes.

## API additions

- `POST /api/medicines/{medicine}/group-action`: `action` (`quarantine`, `release`, `quarantine_disposal`), `expiry_group_id`, positive `quantity`, `reason`, UUID `idempotency_key`.
- `POST /api/medicines/{medicine}/verify-stock`: `groups` containing every `{id, available_quantity, quarantined_quantity}`, `unassigned_quantity`, `snapshot` from Details `stock_summary`, `reason`, UUID `idempotency_key`.
- Existing create/restock submissions require `expiration_date` or an explicit eligible `expiry_not_applicable`. Creation accepts `item_type` (`medicine` default, `health_supply`). Deduct identifies `expiry_group_id`.
- Existing adjustment accepts `expiry_group_id` + `pool` for grouped corrections, or `target: unassigned`. Aggregate PATCH corrections remain valid for groupless stock only.
- Dispensed items optionally supply `allocations: [{expiry_group_id, quantity}]` and `override_reason`. Omitted allocations means FEFO; explicit `[]` means all actual-given quantity is unallocated. Ambiguous duplicate entries combining manual intent are rejected.

## Tests actually run

| Check | Result |
|---|---|
| Final focused backend: `php artisan test --compact --filter='Medicine|HealthRecordIdempotency|HealthRecordDraftFinalization|HealthRecordPatientMedicines'` | **115 passed**, 937 assertions, **1 PostgreSQL integration test skipped** |
| Full backend suite | **1,351 passed**, **1 existing failure**, **24 skipped**; 1,376 total. Subsequent history-label fix verified by the focused run above. |
| Final frontend `npm.cmd run test:medicine` | **42 passed** |
| All frontend test files with `node --test --test-concurrency=1` | **1,293 passed**, **2 failures in unchanged modules**; 1,295 total |
| Production `npm.cmd run build` | **Passed, exit 0**; existing large-chunk warning |
| Scoped inventory components/services/helpers/pages ESLint | **Passed, exit 0** |
| Broader changed-file ESLint | Existing unused `DatePickerField` import in `ConsultationWorkspace.jsx`; the same unused import exists in HEAD |
| Independent read-only code review | One date-boundary finding fixed; no other substantive blocker reported |

The full backend's existing failure is `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again` (expected 201, received 500), previously reproduced before this feature. The frontend failures are `doctorAvailability.test.js` / `normalizeProvider keeps internal notes off the BHC coordination helpers` and `draftConversion.test.js` / `convertLegacyDraft: the converted care plan restores as the same checkbox state`. These tests and their relevant implementation modules are unchanged by this feature. They were left outside scope.

An initial parallel verification attempt exhausted Windows paging memory. Sequential runs completed; those completed results are reported above. Raw logs are retained locally under `backend/storage/logs/expiry-feature-20261028/`.

## Review fix and remaining verification

The reviewer found that transaction-start `CURRENT_TIMESTAMP` could remain on yesterday while waiting for a lock across Manila midnight. SQL now obtains `clock_timestamp()` **after** acquiring group locks. A static SQL boundary regression test was observed failing, then passing. This static guard is not PostgreSQL runtime proof.

The opt-in PostgreSQL test covers balance/expiry/FEFO/manual/disposition invariants, append-only constraints, legacy mutator guards, duplicate keys, same-date concurrent receipts, competing FEFO dispensing and dispensing versus quarantine/disposal in a randomly named disposable schema. It could not execute because `AKAY_TEST_PG_URL` is unavailable. PostgreSQL runtime and concurrency remain unverified until that isolated test database is supplied.

No migration was applied to the configured application/Supabase database. No backfill, automatic deletion, deployment, commit or push was performed. Browser interaction and visual layout were not verified; the UI tests use server-rendered components and real request serialization.
