# AKAY Stock Batch Tracking — Design

**Status:** Approved for local implementation (2026-11-11)  
**Branch:** `Eric-Manually-Fixer`  
**No commit / push / deploy / production migrate**

## Goal

Upgrade Expiry Groups into true Stock Batch Tracking for BHC and RHU Medicine & Supply Inventory while preserving FEFO, quarantine, dispensing, reconciliation, permissions, and append-only history.

## Section 1 — Database

- Reuse `medicine_expiry_groups`; no warehouse module.
- Add nullable `manufacturer_lot_number` (trim; empty → NULL; never invent).
- Add `is_legacy_batch` boolean; existing rows → `true` + NULL lot.
- Drop same-expiry and NA uniqueness indexes (they force merges).
- **No** partial unique on lot+expiry — multiple batches may share lot+expiry.
- Batch identity = row `id`, displayed as `Batch {id}`.
- Explicit restock requires `restock_expiry_group_id` + ownership + matching lot + matching expiry/NA + non-legacy.
- Default restock/opening = INSERT new batch.
- Extend identity immutability guard for lot + legacy flag.
- Forward-only migration; preserve IDs, balances, allocations, ledger.

## Section 2 — UI

- Section label: **Stock Batches**.
- Add/Restock: optional Manufacturer Lot; Create New Batch default; optional explicit “Add to existing Batch {id}” when non-legacy match (same lot + expiry/NA).
- Details table: Batch ID, Lot, Expiry, Available, Quarantined, Status, actions.
- Clinic Ledger styling; no redesign.
- Catalog duplicate on Add Medicine: exact normalized `name` + `item_type` + `unit` within facility (incl. archived). Message: “This item already exists in your inventory.” Actions: View Details; Restock only if active. No silent reactivate/duplicate. Backend concurrency via transaction-scoped advisory lock (facility + catalog key); recheck inside txn. No DB unique until duplicate audit.

## Section 3 — FEFO & Quarantine

- Per-batch operations; keep `expiry_group_id` compatibility.
- FEFO: available > 0 and (dated not expired OR NA); exclude unassigned/expired/quarantined balances only.
- Legacy dated available stock remains FEFO-eligible.
- Partial quarantine: remaining available may still dispense.
- Order: expiry ASC, `id` ASC; NA last (`NULLS LAST` / sentinel).
- Manual override reason + permissions unchanged.
- Atomic locks, idempotency, shortage/reconciliation, calendar rule unchanged.

## Section 4 — Inventory History

- Show `Batch {id}` and manufacturer lot when available; legacy unknown lot labeled clearly.
- Preserve append-only ledger, actors, reasons, timestamps, discrepancies, before/after.
- Do not rewrite historical identities.

## Section 5 — Testing & Debugging

- Focused BHC/RHU inventory modules only; confirmed bugs before fixes; `systematic-debugging` for reproducible failures.
- Cover batch identity, restock modes, FEFO/tie-break, quarantine, duplicates/advisory lock, facility isolation, consultation/vaccine regression, history.
- Local tests/lint/build only; report unrunnable checks; no production migrate.
