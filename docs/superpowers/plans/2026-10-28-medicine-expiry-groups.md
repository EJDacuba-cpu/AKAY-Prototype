# Medicine expiry groups implementation plan

> **For agentic workers:** Use executing-plans for integration and dispatching-parallel-agents for isolated SQL/frontend work against the contracts below. Track completion here.

**Goal:** Facility-isolated expiry groups, FEFO, partial quarantine/disposition and audited reconciliation in existing inventory.
**Architecture:** Existing medicine and transaction identities remain authoritative. PostgreSQL performs atomic group mutations; Laravel validates permissions and orchestrates clinical transactions. Shared React workflows display summaries and submit explicit intent.
**Tech Stack:** Laravel, PostgreSQL, React, TanStack Query, shadcn/Tailwind.
**Spec:** `docs/superpowers/specs/2026-10-28-medicine-expiry-groups-fefo-quarantine-design.md`

## Global constraints
- No backfill, deletion, historical migration edits, deployment or application-database migration execution.
- Expiry today is eligible in Asia/Manila; expired/quarantined/unassigned stock cannot be dispensed.
- Preserve shortage ledger equation, permissions, strict facility ownership, immutable history and operation uniqueness.
- Partial corrections never clear reconciliation; complete snapshot-checked verification does.
- Opening stock editable; ordinary metadata updates do not change stock/type/group expiry.

## Shared contracts
- Tables: `medicine_expiry_groups` (id, medicine_id, expiration_date nullable date, expiry_not_applicable boolean, available_quantity integer, quarantined_quantity integer, timestamps); `medicine_inventory_allocations` (id, transaction_id, expiry_group_id, available_before/delta/after, quarantined_before/delta/after, created_at). Add medicines.item_type default medicine.
- API medicine responses include `item_type`, `expiry_groups` and `stock_summary` with recorded, available, quarantined, expired, unassigned integer keys. Groups include id, expiration_date, expiry_not_applicable, available_quantity, quarantined_quantity, is_expired. Details GET existing `/medicines/{id}`.
- Create/restock: `expiration_date` or `expiry_not_applicable: true` (only health_supply). Create includes `item_type` (default medicine). Deduct adds `expiry_group_id`.
- POST `/medicines/{id}/group-action`: action quarantine|release|quarantine_disposal, expiry_group_id, quantity, reason, idempotency_key.
- Adjust extends existing fields with expiry_group_id, pool available|quarantined OR target unassigned. Aggregate PATCH quantity rejected when groups exist. Full verification POST `/medicines/{id}/verify-stock`: groups [{id,available_quantity,quarantined_quantity}], unassigned_quantity, snapshot (server hash), reason, idempotency_key. Details stock_summary includes snapshot.
- Dispensed items optional `allocations: [{expiry_group_id,quantity}]` and `override_reason`. Missing allocations = FEFO; present [] = explicit unallocated override. Actual requested minus allocated becomes shortage. Duplicate medicine entries with manual intent rejected as ambiguous; ordinary duplicate FEFO items remain merged.
- SQL `akay_inventory_group_operation(p_medicine_id bigint,p_actor bigint,p_facility_type text,p_facility_id bigint,p_action text,p_quantity integer,p_reason text,p_operation_key text,p_options jsonb) RETURNS jsonb`. Options contain expiration_date/expiry_not_applicable, expiry_group_id/pool/target/direction, groups/unassigned_quantity/snapshot. Result transaction_id, medicine_id, quantity_before/after/delta, discrepancy, transaction_type. Full verification options use expected balances (Laravel snapshot checked under lock) for SQL concurrency validation.
- Existing `akay_inventory_dispense_batch` signature/return preserved, accepts allocations/override_reason in items. Old single mutator signatures preserved but reject tracked or contextless receipt operations, preventing bypass.

## Review focus
- Manila midnight changes eligibility without stock writes (include calendar date in cache identity).
- Mixed old unassigned stock plus a new group never silently consumes residual.
- Explicit empty manual allocation survives JSON normalization and draft restore.
- Repeated group receipts/disposition keys never mutate twice; changed clinical allocation payload mismatches idempotency.
- Full verification rejects group set or balances changed since snapshot.

## Tasks
### 1. Storage and PostgreSQL operations
- [x] Add behavior tests for schema constraints, FEFO, partial disposition, unsafe legacy calls and concurrency using isolated PostgreSQL test DB only.
- [x] Run tests and capture initial failure/skip evidence.
- [x] Add migration/tables/constraints/append-only protection and SQL operations per shared contract; ordered medicine/group locks, actor helper, reason validation, bounded quantities and operation uniqueness.
- [x] Preserve old signatures without allowing bypass; safe rollback refuses posted history.
- [x] Run available SQL integration tests; distinguish unavailable PostgreSQL runtime from passing static checks.

### 2. Laravel integration and behavioral tests
- [x] Add API behavior tests for same-date merge, FEFO/shortage, partial quarantine/release/disposal, expiry/NA, permissions/facility, correction and complete verification.
- [x] Observe failing tests before implementation.
- [x] Add group/allocation models and focused group stock service (SQLite behavioral equivalent + PostgreSQL invocation); connect MedicineStockService and clinical normalization.
- [x] Extend request validation, response summaries/history, routes and calendar cache key. Ordinary edits reject group changes; correction paths stay audited.
- [x] Run targeted backend suites; update old fixtures to explicitly represent grouped stock when testing actual dispensing, retain dedicated groupless tests.

### 3. Shared frontend inventory and dispensing
- [x] Add behavioral helper/render/request tests for expiry policy, readonly edit, group actions and manual allocation serialization.
- [x] Implement Add/Restock/Deduct fields, shared Details modal and BHC/RHU entrypoints; history shows allocations and shortage.
- [x] Implement FEFO preview/manual overrides in actual dispensing, including draft and vaccine payload preservation. Keep current RHU clinical scope.
- [x] Run medicine/consultation tests, scoped lint and production build.

### 4. Integration verification and review
- [x] Run complete backend suite and relevant frontend suites/build; separate existing baseline failures.
- [x] Fresh read-only review for stock integrity, facility isolation, idempotency, stale verification and UI payloads; fix substantive findings and rerun affected checks.
- [x] Report exact executed tests, migrations not applied, unavailable PostgreSQL/browser verification and remaining issues.

## Execution ledger
- Authorization: Eric approved design and implementation; proceed in current feature checkout `itr-patient-history`, preserve unrelated `.claude/settings.local.json`; no extra approval round for routine execution choices.
- Baseline from preceding tasks: frontend medicine 32 passed; inventory backend 24 passed; full backend 1336 passed/23 skipped/1 known ConsultationIdentityTest failure. Existing React ref lint and chunk warning recorded in previous task.
- Contract scan: SQL/backend share exact table fields/function signature above; frontend/backend share snake_case request keys and summary fields. No intentional overlapping file ownership.

- Completion: storage, Laravel integration, shared frontend and regression updates implemented. Detailed evidence and limitations: ../reports/2026-10-28-medicine-expiry-groups.md.
- Ruling: retain native execution in the current feature checkout and use independent SQL/frontend helpers against fixed contracts; authorized implementation already established. No commits or worktree churn needed.
- Review fix: use PostgreSQL wall clock after locks across Manila midnight; static regression RED to GREEN. Runtime PostgreSQL tests remain skipped without AKAY_TEST_PG_URL.
- Verification: final focused backend 115 passed/1 PG skipped; frontend medicine42 passed; build and scoped inventory lint passed. Full-suite baseline issues remain documented.
