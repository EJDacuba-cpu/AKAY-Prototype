# RHU Prescription Dispense Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. One connected consult-plus-commodities change; do not split across subagents.

**Goal:** RHU doctors type a prescription textarea; after finalize, RHU staff review/print/dispense from a Health Commodities To dispense tab without opening Patient Details.

**Architecture:** Persist `monitoring_data.prescriptionText` on RHU ITR records. Prohibit consult-time `dispensed_medicines` on RHU ITR store. List eligible records at `GET /api/rhu/to-dispense`. Confirm given through the existing `POST /api/health-records/{id}/dispensed-medicines` one-shot endpoint. RHU Health Commodities adds a second tab with its own patient table, review modal, print slip, and dispense modal.

**Tech Stack:** Laravel/PHPUnit, React, TanStack Query, existing ModalShell and DispensedMedicinesSection, node:test.

**Spec:** `docs/superpowers/specs/2026-10-30-rhu-prescription-dispense-desk-design.md`

## Global Constraints

- English UI. Clinic Ledger tokens.
- Prototype workflow, not a DOH protocol claim.
- Prescription never deducts stock. Only confirm given does.
- Two Health Commodities tables: Inventory (medicines) and To dispense (patients). Never mixed.
- RHU 1 must not see RHU 2 or BHC queue/stock.
- Staff with `items.dispense` and without `clinical.history` can use To dispense.
- Do not change BHC consult dispensing or add a BHC To dispense tab.
- Do not add Confirm given on Patient Details.
- Skip git commits unless the user asks.
- Builder decision: keep the existing one-shot dispense lock (`already been dispensed for this health record`). Given rows still open Review + Print; Dispense is disabled. Adding a second batch is out of this plan.

---

### Task 1: RHU ITR prescription text, no consult dispense, To dispense API

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php`
- Modify: `backend/app/Models/HealthRecord.php`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Modify: `backend/routes/api.php`
- Create: `backend/app/Http/Controllers/Api/RhuToDispenseController.php`
- Modify: `backend/tests/Feature/RhuItrConsultationTest.php`
- Create: `backend/tests/Feature/RhuToDispenseQueueTest.php`

**Interfaces:**
- Store accepts `prescription_text` (nullable string, max 5000) on RHU ITR. Writes `monitoring_data.prescriptionText`. Does not write catalog `prescribedMedicines`.
- RHU ITR `dispensed_medicines` is prohibited on store.
- `HealthRecord::prescriptionDisplayText(): string` — trimmed `prescriptionText`, else joined legacy `prescribedMedicines` lines.
- `GET /api/rhu/to-dispense` returns `{ data: [{ id, patientId, patientName, visitDate, prescriptionText, status }] }` where status is `pending` or `given`. Requires RHU + `items.dispense`. Does not require `clinical.history`.

- [ ] **Step 1: Rewrite failing RHU ITR tests** so walk-in prescribe uses `prescription_text`, consult-time `dispensed_medicines` is unprocessable with no stock change, and add `RhuToDispenseQueueTest` for queue visibility, empty text, other RHU isolation, missing permission, and post-finalize `dispensed-medicines` deduct.

- [ ] **Step 2: Run tests, expect FAIL**

`php artisan test --filter=RhuItrConsultationTest --filter=RhuToDispenseQueueTest` from `backend/`

- [ ] **Step 3: Implement** request/controller/model/draft/route/controller as specified. Remove `assertRhuPrescribedMedicines` from the RHU ITR store path.

- [ ] **Step 4: Re-run the same PHPUnit filters; expect PASS**

---

### Task 2: RHU consult textarea, drop catalog prescribe and consult dispense

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modify: `frontend/src/services/healthRecordService.js`
- Modify: `frontend/src/services/HealthRecordDraftPayloadService` is backend-only; also `frontend` draft payload in the workspace
- Create: `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`

**Interfaces:**
- Wizard state `prescriptionText` string. Draft restore/save that string. Finalize sends `prescription_text`, never `prescribed_medicines` or `dispensed_medicines`.
- `RhuDiagnosisCarePlanSection` mounts `FieldTextarea` label `Prescription`. Drops `PrescribedMedicinesSection`.
- Workspace drops `DispensedMedicinesSection` and does not load the medicine catalog for prescribe/dispense on this page.

- [ ] **Step 1: Write failing source-contract tests** asserting Prescription textarea, no category/search/Add catalog, no Medicines / Supplies Dispensed, `prescription_text` in the submit mapper.

- [ ] **Step 2: Run tests, expect FAIL**

`node --test src/pages/rhu/RhuConsultationWorkspace.test.js` from `frontend/`

- [ ] **Step 3: Implement** textarea, payload, remove catalog/dispense UI and inventory query from the RHU wizard.

- [ ] **Step 4: Re-run the test file; expect PASS**

---

### Task 3: Health Commodities To dispense tab, review, print, dispense

**Files:**
- Modify: `frontend/src/components/features/medicine/MedicineInventoryPage.jsx`
- Modify: `frontend/src/utils/queryKeys.js`
- Modify: `frontend/src/services/healthRecordService.js` or `frontend/src/services/medicineService.js` — add `getRhuToDispense()`
- Create: `frontend/src/components/features/medicine/RhuToDispenseTab.jsx`
- Create: `frontend/src/components/features/medicine/RhuPrescriptionReviewModal.jsx`
- Create: `frontend/src/components/features/medicine/RhuPrescriptionPrintSlip.jsx`
- Create: `frontend/src/components/features/medicine/RhuToDispenseTab.test.js`

**Interfaces:**
- `queryKeys.toDispense("rhu")` → `["to-dispense", "rhu"]`
- `getRhuToDispense()` → `GET /rhu/to-dispense`
- RHU page only: tabs Inventory | To dispense. BHC page unchanged (no tabs).
- To dispense table columns: patient name, visit date, Pending|Given, Review prescription. Search by name.
- Review modal: name, date, prescription text, Print, Dispense. Dispense disabled when status is `given`.
- Print slip: patient name, visit date, facility, prescription text. No inventory fields. Works when Pending.
- Dispense modal: `DispensedMedicinesSection` + `dispenseHealthRecordMedicines`. On success invalidate to-dispense and medicine availability.

- [ ] **Step 1: Write failing source-contract tests** for two tabs, separate tables, Review prescription / Print / Dispense copy, and no Patient Details navigation.

- [ ] **Step 2: Run tests, expect FAIL**

`node --test src/components/features/medicine/RhuToDispenseTab.test.js` from `frontend/`

- [ ] **Step 3: Implement** tab, table, modals, print, post-finalize dispense.

- [ ] **Step 4: Run To dispense tests, `node --test src/pages/rhu/RhuConsultationWorkspace.test.js`, and `npm run build`**
