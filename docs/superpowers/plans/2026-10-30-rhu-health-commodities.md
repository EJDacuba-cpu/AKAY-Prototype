# RHU Health Commodities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match BHC inventory and confirmed dispensing in RHU while keeping facility data isolated.

**Architecture:** Reuse shared React controls, Laravel permission and ownership checks, and PostgreSQL stock functions. Keep existing BHC behavior and MHO configuration. Make schema and SQL updates additive.

**Tech Stack:** React, Tailwind, shadcn/ui, TanStack Query, Laravel, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-30-rhu-health-commodities-design.md`

## Global Constraints

- No staff-assignment redesign or facility switching.
- Preserve MHO-selected permissions; prescription alone never deducts stock.
- No production migrations during implementation.
- Notify Eric before product code editing starts.

## Review Focus

- Cross-facility IDs and missing home facility must fail closed (Task 1).
- Concurrent retries must not double-deduct or leave partial ledger entries (Task 2).
- Prescribed but unconfirmed medicine and draft saves must not deduct (Task 3).
- User changes must not reveal cached inventory from a previous session (Task 3).
- Expired/quarantined groups and BHC regressions must retain current protections (Tasks 2 and 4).

### Task 1: Facility-aware dispensing authorization and snapshots

**Files:** `backend/app/Services/MedicineStockService.php`, `backend/app/Http/Controllers/Api/HealthRecordController.php`, `backend/app/Http/Requests/HealthRecordRequest.php`, `backend/app/Models/HealthRecordMedicine.php`, `backend/app/Http/Controllers/Api/MedicineController.php`; new `backend/database/migrations/2026_10_30_000001_add_rhu_to_health_record_medicines.php`; tests in `backend/tests/Feature/MedicineInventoryWorkflowTest.php` and `HealthRecordPatientMedicinesTest.php`.

**Interfaces:** Preserve `dispense(Request $request, HealthRecord $record, array $requestedItems): void` and the existing dispensed_medicines payload. Snapshot gains nullable `rural_health_unit_id`; BHC snapshots keep their existing owner.

- [ ] Replace the RHU-rejection test with authorized RHU success assertions: stock reduced once, snapshot RHU equals record RHU, snapshot BHC null, audit actor correct.
- [ ] Add tests rejecting RHU 2 medicine/record IDs for an RHU 1 actor, BHC medicine IDs, missing facility and missing items.dispense; assert no stock, snapshot or ledger changes.
- [ ] Run `php artisan test --filter=MedicineInventoryWorkflowTest` in backend; confirm new cases expose current BHC-only rejection.
- [ ] Add snapshot migration/model field and extend ownership checks to either facility type; preserve existing access services and permissions. Allow validated RHU dispensing payloads and correct facility-specific cache invalidation. Reject client attempts to override ownership.
- [ ] Run workflow and patient-medicine feature tests; inspect resulting owner columns.

### Task 2: PostgreSQL RHU dispensing

**Files:** `backend/database/sql/medicine_expiry_group_operations.sql`, new `backend/database/migrations/2026_10_30_000002_enable_rhu_inventory_dispensing.php`, `backend/app/Services/MedicineExpiryStockService.php` only where parity requires it; tests in `backend/tests/Feature/MedicineExpiryGroupsPostgresTest.php`, `MedicineInventoryStoredProcedureTest.php`, `MedicineStockConcurrencyTest.php`.

**Interfaces:** Keep existing `akay_inventory_dispense_batch` and `akay_inventory_group_operation` signatures, accepting facility type bhc or rhu and verifying the corresponding health-record owner.

- [ ] Add RHU batch cases for own-facility success, other-facility failure, invalid source record, expired/quarantined allocation, insufficient stock, duplicate operation key and rollback of an entire multi-item batch.
- [ ] Execute new cases against isolated PostgreSQL and confirm current RHU rejection.
- [ ] Extend SQL source-record checks and install changed functions through an additive migration. Preserve locks, permission checks, allocation rules, grants and operation keys. Do not simply edit an already-run migration.
- [ ] Run `php artisan test --filter='MedicineExpiryGroupsPostgresTest|MedicineInventoryStoredProcedureTest|MedicineStockConcurrencyTest'`; verify tests executed rather than skipped. Test competing requests for stock 5 requesting 4 each: one success, final stock 1, one successful ledger set.

### Task 3: Shared RHU controls and consultation integration

**Files:** `frontend/src/components/features/medicine/MedicineInventoryPage.jsx`, `DispensedMedicinesSection.jsx` in the same directory, `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`, `frontend/src/components/layout/sidebar/sidebarData.js`, `frontend/src/pages/rhu/RHUDashboard.jsx`, `frontend/src/services/medicineService.js`, `frontend/src/utils/queryKeys.js`; inspect consultation payload serialization before changing it. New test `frontend/src/utils/rhuDispensing.test.js` for any extracted payload helper.

**Interfaces:** Reuse shared dispensing props and existing `dispensed_medicines` structure, including confirmed_given, allocations and override_reason. Keep prescription fields separate from actual stock issuance.

- [ ] Verify current RHU draft restoration and submit serialization; add behavioral tests asserting draft/prescription-only input never produces confirmed stock deductions, while confirmed items retain medicine ID, quantity and allocations.
- [ ] Reuse BHC dispensing controls in RHU consultation with items.dispense gating. Restore draft selections without executing a mutation; submit confirmed items through the existing transactional health-record path.
- [ ] Use facility/user-scoped queries for RHU inventory; remove reliance on a potentially stale global catalog for dispensing selection. Verify account change cannot retain another facility's inventory.
- [ ] Apply shared BHC inventory layout/pagination behavior to RHU and rename visible RHU inventory labels to Health Commodities; preserve routes.
- [ ] Run `npm run test:medicine`, `npm run test:access`, `node --test src/utils/rhuDispensing.test.js`, and `npm run build` in frontend.

### Task 4: End-to-end verification and documentation

**Files:** `docs/medicine-inventory-postgresql-verification.md`, relevant tests from prior tasks.

- [ ] Exercise RHU medicine creation, restock, details, confirmed consultation dispensing, patient record and ledger in a disposable environment; compare fields and controls against BHC.
- [ ] Verify direct foreign medicine/history requests fail server-side and a no-dispense-permission account cannot issue stock.
- [ ] Verify resubmission deducts once, prescription-only save leaves stocks unchanged, and BHC dispensing still works.
- [ ] Run `php artisan test --filter='Medicine|HealthRecordPatientMedicines'` in backend and frontend checks from Task 3. Report unavailable PostgreSQL/browser verification explicitly.
- [ ] Update obsolete BHC-only verification documentation. Review diff for unrelated changes and retain pre-existing `.claude/settings.local.json` untouched.
- [ ] Report concise diagnosis, architecture, focused diffs and actual verification results to Eric.

## Planning self-review

Scope includes both inventory parity and confirmed RHU consultation dispensing. Authorization, snapshots, additive SQL deployment, caches, rollback and existing BHC behavior have explicit owners above. Runtime dependencies and actual migration execution remain to be checked in an isolated implementation environment; no security guarantee is inferred from static inspection alone.
