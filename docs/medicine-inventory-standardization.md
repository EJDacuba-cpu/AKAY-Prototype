# Medicine inventory standardization and dispensing protection

Implemented on `Eric-Manually-Fixer`. RHU and BHC reuse the existing inventory form, filters, batch allocation controls, and dispensing section; layout, modal shell, colors, permissions, and facility scopes remain in place.

## Options

Both facilities offer these exact new-entry values, in order:

- Category: General Medicines; TB Medicines; Vaccines; Vitamins & Supplements; Family Planning; Maternal Care Supplies; Child Care.
- Item Type: Medicine; Vaccine; Medical Supply. Stored values remain `medicine`, `vaccine`, and `health_supply`, respectively. The existing health_supply storage value preserves supply expiry rules and historical records. Categories never choose item types automatically.
- Unit: tablets; capsules; vials; bottles; pcs; sachets; ampoules; tube.

Item type can now be edited. A supply with existing Not Applicable expiry batches cannot be changed into a medicine or vaccine. Category filters include existing facility categories, including legacy categories, without adding those values to new-item selection. Vaccine details display the correct type.

## Compatibility and migration path

No inventory quantities, records, batches, lot numbers, expiry dates, opening balances, thresholds, pending orders, or historical transactions are migrated or deleted. Historical shortage/reconciliation entries remain readable. Existing FEFO allocation across batches remains supported; manual selection must fully allocate the requested quantity from eligible selected batches.

The repository does not establish that Basic Medicines is equivalent to General Medicines. Therefore no automatic alias or relabeling is applied. Edit forms retain the saved legacy category and unit as disabled selected options, and can save unchanged legacy values. To standardize an old category, have the inventory owner review its meaning, then select the appropriate new category through the existing edit form. This uses the existing audit log and does not alter transaction snapshots. Do not bulk-map categories without verifying their meaning.

A unit cannot be changed after stock, batches, or inventory history exist. The UI retains the selected unit and the API explains this restriction if a different unit is submitted. Use a separate catalog item for different packaging; this patch performs no quantity conversion. Dispensing snapshots always use the inventory item's authoritative unit, ignoring caller-supplied alternate units. Opening balances, receipts, releases, thresholds, and available stock continue using the same catalog stock unit.

The additive migration `2026_11_17_000001_enforce_available_dispensing_stock.php` is necessary for PostgreSQL's item-type constraint and already-installed stock functions. It permits Vaccine and installs the stricter dispensing function. It does not update data. Deploy the migration with the backend before enabling Vaccine creation in the frontend. It has not been run against Supabase or a deployed database. Rollback refuses to remove Vaccine support while vaccine records exist; its frozen previous SQL definition is preserved separately.

## Stock validation and atomicity

React validates positive whole quantities against eligible batch stock, including combined quantities when the same medicine is added twice. It displays the requested dynamic insufficient-stock message near Quantity, disables confirmation, and clears the error after valid input. Manual allocations validate batch balances and exact totals. RHU final confirmation also blocks pending unconfirmed edits; BHC finalization revalidates medicine and confirmed vaccine inventory entries. Existing toast/error patterns handle API failures.

Laravel rejects fractional quantities before casting. Every selected medicine is authorized to the current facility and checked for active status. Medicine rows are locked in ID order, then batch rows in ID order. Eligibility excludes expired, quarantined, unassigned, and other-item/facility stock. Explicit batches cannot substitute another batch when insufficient. The PostgreSQL function independently rejects unallocated remainder before writing movements, and retains its wall-clock Manila expiry check after locking.

The dispensing service wraps deduction, dispensing history, and auditing in a transaction. Existing controller/service transactions continue to include consultation finalization or RHU usage state changes. Failure rolls back the entire multi-item operation. Prescribed quantities and manually entered medicine names are not modified; actual dispensing stays separate. Existing idempotency checks and stock status calculations remain in use. No partial-dispensing or substitution workflow was introduced.

## Executed verification

- Backend: `php vendor/bin/phpunit --filter='Medicine|RhuToDispenseQueue|RhuServiceUsage' --no-progress`: 119 tests, 117 passed, 2 skipped, 1,061 assertions.
- Frontend: `npm.cmd run test:medicine`: 71 passed, including interactive edit restoration and invalid/valid dispensing checks for RHU and BHC.
- Frontend: `node --test src/components/features/medicine/RhuToDispenseTab.test.js src/components/features/medicine/RhuToDispenseLoading.test.js`: 7 passed.
- Production Vite build passed; it retains the large-chunk warning.
- Targeted ESLint checks passed for the shared form, dispensing section, allocation utilities, RHU dispensing/usage controls, filters, and new interactive test.
- PHP syntax checks passed for the migration and both stock services. `git diff --check` passed.

Coverage includes specified dropdown values and order, saving all categories/units/types in both facilities, legacy preservation, receiving, less-than/exact/excessive dispensing, zero/negative/fractional quantities, zero/expired/unassigned stock, manual overdraw, wrong facility/batch, multi-item rollback, duplicate requests, low/out-of-stock status, audit history, permissions, and RHU prescription/service usage regression. Existing tests that expected successful shortages were changed to expect rejection. Two stale assertions were aligned with the already-existing duplicate-catalog protection and RHU empty-state wording; those production behaviors were not changed.

The two skipped tests require `AKAY_TEST_PG_URL`. The PostgreSQL concurrency test now asserts exactly one successful concurrent dispense, one insufficient-stock failure, and no negative balance or discrepancy. Runtime PostgreSQL/concurrency verification remains outstanding because no isolated PostgreSQL test database is configured. Authenticated browser visual QA was not performed; interactive component tests and the production build were executed. No tests or migrations were run against production/Supabase.

## Modified and added files

- `backend/app/Http/Controllers/Api/MedicineController.php`
- `backend/app/Http/Requests/MedicineRequest.php`
- `backend/app/Services/MedicineExpiryStockService.php`
- `backend/app/Services/MedicineStockService.php`
- `backend/database/migrations/2026_11_17_000001_enforce_available_dispensing_stock.php`
- `backend/database/sql/medicine_expiry_group_operations.sql`
- `backend/database/sql/medicine_expiry_group_operations_before_strict_dispense.sql`
- `backend/tests/Feature/MedicineCreateIdempotencyTest.php`
- `backend/tests/Feature/MedicineExpiryEligibilityTest.php`
- `backend/tests/Feature/MedicineExpiryGroupsPostgresTest.php`
- `backend/tests/Feature/MedicineExpiryGroupsTest.php`
- `backend/tests/Feature/MedicineStockConcurrencyTest.php`
- `docs/medicine-inventory-standardization.md`
- `frontend/package.json`
- `frontend/src/components/features/medicine/DispensedMedicinesSection.jsx`
- `frontend/src/components/features/medicine/MedicineAllocationFields.jsx`
- `frontend/src/components/features/medicine/MedicineFormModal.jsx`
- `frontend/src/components/features/medicine/MedicineFormModal.test.js`
- `frontend/src/components/features/medicine/MedicineInventoryFilters.jsx`
- `frontend/src/components/features/medicine/MedicineInventoryPage.jsx`
- `frontend/src/components/features/medicine/MedicineStockValidation.test.js`
- `frontend/src/components/features/medicine/RhuServiceUsageReviewModal.jsx`
- `frontend/src/components/features/medicine/RhuToDispenseLoading.test.js`
- `frontend/src/components/features/medicine/RhuToDispenseTab.jsx`
- `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- `frontend/src/pages/shared/MedicineDetailsPage.jsx`
- `frontend/src/services/medicineService.js`
- `frontend/src/utils/medicineExpiryGroups.js`
- `frontend/src/utils/medicineExpiryGroups.test.js`
