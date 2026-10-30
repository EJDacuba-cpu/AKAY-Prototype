# Medicine expiry groups, FEFO, and quarantine

Status: approved by Eric on 2026-10-28; implementation authorized ("go ahead").

## Purpose and authority

Extend the existing facility-owned medicine inventory rather than introduce a separate warehouse system. One medicine retains its identity, metadata, permissions, consultation references, and append-only inventory history. Expiry groups describe the physical balances underneath that identity.

This is a project workflow decision based on Eric's request and follow-up answers. It is not presented as a pharmacy protocol established by the interview PDFs. Existing technical behavior is evidenced by `MedicineStockService`, `MedicineController`, `HealthRecordRequest`, the inventory SQL/migrations/tests, and `docs/consultation-workflow-revision.md`.

## Confirmed requirements

- Apply expiry-group inventory management consistently to BHC and RHU, preserving facility isolation and existing permissions.
- Merge receipts for the same medicine and expiry date into one group; retain each receipt as its own transaction.
- Track available and quarantined quantities separately within a group. Quarantine may be partial.
- Record automatic FEFO dispensing and manual group overrides as actual group allocations.
- Never dispense expired or quarantined balances.
- Support authorized, reasoned, audited partial release and partial disposal of quarantined stock.
- Preserve confirmed actual dispensing even when eligible recorded stock is insufficient: record the unallocated shortage and retain Reconciliation Required.
- Require expiry dates for medicines. Permit explicit Not Applicable only for health supplies with no manufacturer-defined expiry.
- Partial group corrections retain the medicine-wide Reconciliation Required flag. Clearing it requires complete physical verification of all available and quarantined group balances and any unassigned stock.
- Existing medicines are development data. No automatic deletion, invented groups, or legacy backfill.
- Retain read-only Recorded Stock in Edit Medicine, editable opening balance in Add Medicine, current stock transactions, concurrency protection, idempotency, reconciliation, and audit history.
- Use additive migrations and the existing Laravel / PostgreSQL / TanStack Query / shadcn architecture.

## Approaches

1. **Expiry groups and allocation records under the existing medicine and ledger (recommended).** Preserves medicine IDs, one inventory history, and existing consultation integration. Adds group balances and records the physical effect of each operation.
2. **Separate medicine rows per expiry date.** Rejected: fragments the medicine catalog, stock summaries, and consultation selection; same-date merging would complicate medicine identity.
3. **A separate warehouse/lot subsystem.** Rejected: expands the requested scope and duplicates permissions and ledger responsibilities.

Only the first approach fits the requested minimal architecture change. The choices below are implementation proposals for approval, not additional statements attributed to Eric.

## Item type and expiry policy

- Add an explicit creation-time item type, `medicine` or `health_supply`, rather than infer it from names or broad categories. Existing rows default to `medicine`; no existing stock is allocated or reclassified automatically.
- Medicines and expiring health supplies require an actual expiry date for opening stock and restocks. A health supply may instead explicitly select `expiry_not_applicable` and confirm that no manufacturer-defined expiry exists.
- Date and Not Applicable are mutually exclusive. Blank/unknown expiry is not equivalent to Not Applicable and is not accepted for a new stock group.
- Positive opening stock creates an opening group in the same transaction as the medicine and ledger. Zero opening balance is supported without inventing a positive receipt.
- Retain the existing Asia/Manila calendar rule: an expiry date equal to today is eligible; a date before today is expired. Newly received available stock cannot have a past expiry date.
- Not Applicable groups sort after all eligible dated groups in FEFO, with group ID as a stable final tie-breaker.
- Expiry dates belong to stock groups. Ordinary metadata editing cannot rewrite expiry dates of received stock or convert a medicine to a supply to bypass validation.

## Data model and stock invariants

- Add `medicine_expiry_groups` with medicine ownership, expiry date or explicit Not Applicable, `available_quantity`, `quarantined_quantity`, and timestamps. Both balances are nonnegative bounded integers.
- Enforce one group per medicine/date and one explicit Not Applicable group per medicine, including concurrent receipts. A repeated receipt revives an existing zero-balance group instead of creating a duplicate.
- Add append-only allocation records linked to the existing medicine inventory transaction and expiry group. Store before, delta, and after for both available and quarantined balances. One operation may touch several groups; quarantine transfers have two pool effects in one group allocation.
- Keep the existing ledger as the operation-level authority. Do not change its composite operation-key/medicine uniqueness or rewrite historical rows. Extend its balance constraint narrowly to permit zero-total-delta quarantine/release transactions with mandatory reasons.
- `medicines.quantity` remains recorded on-hand stock, including quarantined and expired stock. Never subtract an unallocated shortage from an expired or quarantined balance.
- For newly tracked medicines, recorded on-hand equals the sum of group available and quarantined balances. For preexisting groupless stock, expose the residual explicitly as unassigned stock; do not manufacture a group or expiry date.
- Dispensing summaries distinguish recorded on-hand, eligible available, quarantined, expired outside quarantine, and unassigned quantities. Do not double-count expired quarantined stock in totals. Details may show its expired status separately.
- Ordinary metadata edits cannot change any group balance, allocation, recorded quantity, or reconciliation flag.

## Existing records without groups

- Continue to list, view, edit metadata, inspect history, and remove/archive according to existing safeguards. Show a clear No expiry groups recorded / Unassigned stock state; do not present it as verified dispensable stock.
- Do not reset or delete its recorded quantity when a first restock creates a group. The original residual stays unassigned and visible.
- Do not invent a FEFO allocation from unassigned stock. Confirmed actual dispensing without eligible recorded groups follows the approved unallocated-shortage/reconciliation path. Recorded ineligible/unassigned balances are not silently consumed.
- Existing authorized corrections remain available for groupless stock. Group-tracked corrections must identify the affected group/pool; an aggregate correction must not desynchronize group balances.
- When grouped and unassigned stock coexist, permit an explicit `unassigned` correction target as well as a group/pool target. Require existing inventory-management authorization and a reason; enforce a nonnegative residual and post the actual unassigned/aggregate change to the ledger. This is an explicit stock correction, not migration backfill or an automatic assignment of an expiry date. It does not edit old ledger/allocation records or create a fabricated expiry group.

## Operations

### Restock

Choose a required expiry date, or explicit Not Applicable for an eligible health supply, then quantity and reason. Lock the medicine, resolve/lock the matching group, add to its available balance, update recorded on-hand, append one ledger transaction and its allocation, and invalidate the affected facility's caches after success. Same-date receipts merge balances but never merge ledger entries.

### Deduct Stock

Choose an expiry group and quantity with a reason. Deduct only from that group's available balance, including expired available stock when recording its removal. Do not use FEFO silently for this manual inventory action, and do not allow this action to reach quarantined balances. Quarantined disposal uses the explicit disposition action.

### Quarantine

An `inventory.manage` user selects a group, positive quantity not exceeding available balance, and reason. Transfer available to quarantined in the same group; recorded on-hand is unchanged. Permit quarantining expired stock so it can be physically isolated pending disposal.

### Release

An `inventory.manage` user selects a quarantined quantity and reason. Transfer quarantined to available in the same group; recorded on-hand is unchanged. Re-check expiry under lock. Reject release of expired stock; use disposal. A valid dated or explicit Not Applicable group may be partially released.

### Dispose

An `inventory.manage` user selects a quarantined quantity and reason. Reduce only that group's quarantined balance and recorded on-hand, with a distinct disposal ledger entry. Partial disposal leaves the remainder quarantined. Expired stock is eligible for disposal, never dispensing.

### Corrections and reconciliation

Keep backend audited correction and physical-count capabilities. For group-tracked stock, require explicit group/pool context and ensure the group and aggregate effects agree. Reject insufficient or ambiguous group corrections. Metadata edits, restock, quarantine, release, disposal, and partial corrections cannot clear an existing discrepancy.

Eric approved complete physical verification as the only way to clear the medicine-wide flag. An explicit verification request must cover every existing group's available and quarantined counts plus the unassigned count, with an inventory-management permission, reason, and stable operation key. Validate the complete group set under the medicine/group locks, apply any count corrections with ledger/allocation provenance, and clear the flag only after the entire verification succeeds atomically. A group created or changed since the displayed verification snapshot must cause a safe conflict rather than silently verify an incomplete or stale set. Groupless verification explicitly covers its entire unassigned balance; no backfill is created. Retain the existing aggregate correction entry point for groupless stock as an explicit full count of that one pool. Group-tracked partial correction entry points cannot clear the flag.

## FEFO and actual dispensing

- Extend existing actual-dispensing entry points, including vaccine inventory deduction. Preserve current clinical scope: RHU inventory management is supported, but this task does not introduce RHU clinical dispensing where existing requests currently prohibit it.
- Default FEFO considers active medicine groups with positive available balance and eligible date or valid Not Applicable status. Quarantined stock is never eligible.
- Calculate final allocations under database locks at submission time. A frontend FEFO preview is not authoritative or a stock reservation.
- A manual override uses the existing `items.dispense` permission, explicitly selected groups/quantities, and a mandatory reason. Validate group ownership, medicine ownership, expiry, duplicate group IDs, bounded quantities, and allocation totals.
- Manual group allocations cannot exceed the requested actual quantity. A remainder must be explicit in the override UI as unallocated actual dispensing; it becomes a shortage/discrepancy, not an invented group allocation. A stale/overdrawn explicit allocation fails safely and leaves the draft intact; never silently substitute other groups.
- In automatic mode allocate up to the eligible balance and record any remaining actual-given quantity as unallocated shortage. Do not reduce expired, quarantined, or unassigned balances to conceal it.
- For actual requested quantity R, allocated quantity A, and shortage U = R - A: ledger quantity_delta = -R, discrepancy = -U, and recorded on-hand decreases by A. This retains the existing ledger equation `before + quantity_delta = after + discrepancy`.
- Record actual allocations with the dispense ledger transaction and expose them in health-record and inventory history views. Retain group/expiry provenance after balances reach zero.
- Preserve confirmed-versus-planned behavior, duplicate medicine normalization, stock-unit handling for vaccines, and atomic health-record finalization.
- Include manual allocation selections/reasons in normalization and idempotency fingerprints. Sort equivalent allocations deterministically. Replays cannot reallocate against newer stock; a changed override payload must fail the existing payload-mismatch contract.

## Responsibilities and database safeguards

- **Laravel:** request validation, item/expiry policy, current working facility and permissions, trusted actor context, orchestration of stock and health-record writes, audit logging, safe error contracts, response summaries, and cache invalidation.
- **PostgreSQL:** authoritative ordered locking, group resolution/merging, balance validation and mutation, FEFO allocation, quarantine disposition, operation uniqueness, and atomic ledger/allocation writes. No browser role receives function execution or table-write privileges.
- **SQLite:** equivalent observable behavior for the existing automated test path. SQLite success is not proof of PostgreSQL concurrency behavior.
- **TanStack Query:** details/list/history fetching, pending/error states, and invalidation after committed changes. No permission decisions or authoritative stock arithmetic.
- Lock medicines in ascending ID order, then their groups in a consistent order. Check idempotency after acquiring the medicine lock and before mutation. Group constraints plus serialization prevent concurrent duplicate receipts and overdrafts.
- Preserve existing PostgreSQL function signatures for legitimate consumers. New group-aware variants may be added, but old mutators must not bypass group invariants for tracked medicines: route through the protected implementation or reject missing group context with a safe error.
- A multi-medicine operation rolls back all group, ledger, audit, and clinical effects on an invalid medicine, forbidden group, expired explicit selection, or operation conflict.
- Use additive migrations for tables, constraints, and function replacements. Do not edit historical migration behavior or automatically run migrations on the configured application database. Rollback must refuse to erase posted new inventory history.
- Handle new table/function privileges and allocation append-only protection consistently with existing Supabase containment rules. Never log credentials or expose raw PostgreSQL errors.

## Frontend workflow

- Reuse shared BHC/RHU components, current modal shells, shadcn controls, Tailwind tokens, inline validation, and existing permission guards.
- Add Medicine distinguishes medicine versus health supply and collects opening expiry information. Opening quantity remains editable.
- Edit Medicine stays metadata-only with read-only Recorded Stock. Received group expiry changes do not pass through this form.
- Restock collects the target expiry date/explicit Not Applicable. Deduct Stock selects the specific group and shows the pool being reduced.
- Add a shared Medicine Details modal with read-only metadata, stock summary, and expiry-group table. Display expiry, eligible available, quarantined, and state. Group rows expose permission-gated Quarantine, Release, and Dispose actions via deliberate quantity/reason confirmations.
- Inventory tables summarize eligible available and recorded stock clearly and open Details consistently in BHC/RHU. Do not restore the removed BHC RHU-availability tab.
- Actual dispensing defaults to FEFO, shows allocation preview and unallocated shortage, and offers a manual override with explicit group quantities and reason. Preserve this state across consultation drafts and resume flows.
- History identifies group movements, quarantine/release/disposal, dispense allocations, override reasons, and unallocated discrepancies. Add no unrelated dashboard or clinical features.

## Verification and delivery

- Test opening stock and zero balances; date/Not Applicable validation; same-date merge with separate ledger entries; overflow and zero/negative inputs; invalid and cross-facility group IDs; and inactive medicines.
- Test FEFO ordering, today's expiry in Manila, UTC date boundaries, expired exclusion, partial quarantine exclusion, dated versus Not Applicable order, split allocations, complete/partial eligible shortages, and all stock being ineligible.
- Test explicit overrides, malformed/duplicate/overallocated groups, stale balances, reason requirements, changed-payload idempotency, duplicate submissions, and actual versus planned medicines/vaccines.
- Test quarantine/release/disposal quantities, overdraw prevention, release after expiry, partial dispositions, required reasons, permissions, audit/ledger immutability, aggregate consistency, and rollback.
- Test grouped and groupless correction safeguards, preservation of existing records, history, metadata edits, reconciliation, and strict BHC/RHU isolation.
- Extend PostgreSQL integration/concurrency checks for concurrent same-date restocks, competing FEFO dispenses, dispense versus quarantine/disposal, and repeated operation keys. Use an explicitly isolated development test database, following the existing `AKAY_TEST_PG_URL` convention where available; report inability to execute rather than treating static SQL checks as runtime verification.
- Run frontend medicine/consultation regression tests, rendered component/request tests, affected lint checks, production build, inventory/backend tests, and the full backend suite. Report existing failures separately. Do not fix unrelated baseline issues.
- Report migrations/code added, tests actually run, skipped PostgreSQL checks or browser checks, and unresolved issues. Provide focused diffs rather than entire unchanged files.

## Left to the implementer

Exact routes/function names, file decomposition, indexing details, small-screen arrangement, and test fixture organization may follow incumbent project patterns. These choices cannot weaken the invariants or expand the workflow/permission scope above.
