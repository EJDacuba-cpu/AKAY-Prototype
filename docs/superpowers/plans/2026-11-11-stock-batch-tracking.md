# Stock Batch Tracking Implementation Plan

> **For agentic workers:** Inline execution in this session. Do **not** commit, push, merge, or deploy. Do **not** migrate production/shared Supabase.

**Goal:** True stock-batch identity on existing `medicine_expiry_groups` for BHC/RHU inventory.

**Architecture:** Extend expiry groups with optional manufacturer lot + explicit legacy flag; default INSERT on receipt; optional explicit restock target; FEFO by expiry then batch id; facility-scoped catalog duplicate advisory lock.

**Tech Stack:** Laravel, PostgreSQL SQL functions, React/Vite, existing Clinic Ledger UI.

**Spec:** `docs/superpowers/specs/2026-11-11-stock-batch-tracking-design.md`

## Global Constraints

- Preserve historical balances, group IDs, allocations, append-only ledger.
- No automatic legacy split; never invent lots.
- Multiple batches may share same lot+expiry.
- Legacy dated available stock remains FEFO-eligible.
- No DB unique on catalog before duplicate audit.
- Preserve unrelated uncommitted work; no commits.

## Files

- Create: `backend/database/migrations/2026_11_11_000001_stock_batch_tracking.php`
- Modify: `backend/database/sql/medicine_expiry_group_constraints.sql`, `medicine_expiry_group_operations.sql`
- Modify: `MedicineExpiryGroup.php`, `MedicineExpiryStockService.php`, `MedicineStockService.php`, `MedicineController.php`, Restock/Medicine requests
- Modify: FE `medicineExpiryGroups.js`, Details/History/Action/Form modals, related tests
- Modify/extend: `MedicineExpiryGroupsTest.php`, `MedicineExpiryGroupsPostgresTest.php`, FE tests

---

### Task 1: Database migration + constraints

- [ ] Add `manufacturer_lot_number` (nullable string), `is_legacy_batch` (bool default false)
- [ ] Backfill existing rows: `is_legacy_batch = true`
- [ ] Drop `medicine_expiry_group_date_unique` and `medicine_expiry_group_na_unique`
- [ ] Update guard: lot + legacy immutable; include columns in identity check
- [ ] Update create migration helper SQL files for fresh installs

### Task 2: Restock/opening batch logic (PHP + PG)

- [ ] Default: always create new group with optional lot, `is_legacy_batch=false`
- [ ] If `restock_expiry_group_id`: validate medicine ownership, non-legacy, lot match (normalized), expiry/NA match; else reject
- [ ] Pass lot + restock id through RestockMedicineRequest / MedicineStockService / opening create path
- [ ] Serialize new fields in `toAvailabilityArray()`

### Task 3: Catalog duplicate protection

- [ ] Normalize name (trim + collapse space + casefold) + item_type + unit within facility
- [ ] PG: `pg_advisory_xact_lock` on hash of facility+identity; recheck; 409 with existing id/active state
- [ ] SQLite: same check inside create transaction (tests)
- [ ] Do not offer restock for inactive matches; no silent reactivate

### Task 4: Frontend Stock Batches UI

- [ ] Labels: Stock Batches; `Batch {id}` (+ expiry/lot helpers)
- [ ] Form/Restock: lot field; default new; optional add-to-existing when match
- [ ] Details table columns; history allocation text enrichment
- [ ] Duplicate create UX: message + View Details + Restock if active

### Task 5: Tests + verification

- [ ] Replace merge expectation with separate-batch tests; add lot/restock/legacy/FEFO/duplicate cases
- [ ] Run focused FE + Laravel (+ PG if `AKAY_TEST_PG_URL`); lint/build
- [ ] Report Taglish final status; no commit

## Self-review

- Spec §1–5 mapped to Tasks 1–5
- No lot uniqueness constraint (per approval)
- FEFO includes legacy available dated stock
- Commits omitted per user constraint
