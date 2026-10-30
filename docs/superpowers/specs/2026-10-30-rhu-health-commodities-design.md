# RHU Health Commodities parity

Approved conversational scope: reuse the existing BHC inventory and dispensing behavior for RHU, with each facility owning its own stocks. User explicitly confirmed RHU consultation dispensing on 2026-10-30. No product code has been changed during planning.

## Intent and constraints

- Match BHC medicine creation, fields, buttons, stock actions, details, and dispensing; rename RHU Medicine Availability to Health Commodities.
- RHU 1 must not read or mutate RHU 2 or BHC inventory. Enforce ownership server-side, including direct IDs and transaction history.
- Preserve MHO-selected permissions: inventory management and items.dispense remain distinct. Do not redesign staff assignments or introduce facility switching.
- Reuse existing shadcn/ui and Tailwind controls, inline validation, and toast conventions.
- Prescription alone does not deduct stock. Only explicitly confirmed dispensing does, following the BHC behavior.
- Preserve expiry allocation, quarantine, reconciliation, audit, idempotency, and transactional rollback behavior.
- No production migration execution or claims of legal compliance are included.

## Approaches

1. Shared implementation with facility-aware authorization and data: selected by Eric. Avoids drift and duplicate maintenance.
2. Separate copied RHU implementation: rejected because future corrections would have to be maintained twice.

## Architecture

React shares inventory and dispensing controls. TanStack Query scopes caches by user and facility; it is not an authorization boundary. Laravel validates MHO permissions, actor/record/medicine facility ownership and request data. Existing PostgreSQL functions enforce atomic stock allocation and ledger mutations; extend them for RHU rather than introduce a parallel stock engine.

The existing RHU consultation supports prescriptions but currently prohibits dispensing. MedicineStockService and PostgreSQL functions explicitly restrict dispensing to BHC. Dispensing snapshots currently have only a BHC facility column. These restrictions must be updated together, preserving existing BHC behavior. Additive migrations must update existing installations, not merely fresh databases.

## Acceptance

RHU staff with the relevant permissions can create and manage their own medicines and confirm dispensing during an RHU consultation. Confirmed quantities appear in the patient record and stock history with actor and correct facility. Unauthorized, cross-facility, expired or quarantined allocations fail without partial writes. Retries cannot double-deduct. Prescribing or saving a draft does not deduct. Existing BHC tests continue to pass.

## Builder decisions

Keep existing routes for compatibility. Use an RHU foreign key on dispensing snapshots alongside the existing BHC field and populate only the applicable owner. Test with disposable databases; PostgreSQL execution is required to substantiate concurrency guarantees. Broader staff assignment behavior remains deferred.
