# RHU Diagnosis-Linked Prescription & Dispensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RHU ITR free-text prescriptions with diagnosis-linked structured `monitoring_data.prescriptions[]`, physician-authorize them server-side, and dispense via the existing RHU To Dispense path with prescription-linked history once the additive migration is applied.

**Architecture:** Canonical prescriptions live in `monitoring_data` (draft + finalized). Physician gate mirrors `TbClinicalAuthority`. To Dispense reuses `RhuToDispenseController` + `MedicineStockService`. Additive migration adds `prescription_id` / idempotency on `health_record_medicines` (file only). Until migrated, structured Confirm Given is explicitly disabled.

**Tech Stack:** React/Vite frontend, Laravel API, PHPUnit feature/unit tests, Node assert tests, existing Clinic Ledger UI components.

## Global Constraints

- Branch: `Eric-Manually-Fixer`; preserve all uncommitted TB / Form 4B / referral / consultation fixes.
- Spec: `docs/superpowers/specs/2026-11-11-rhu-diagnosis-linked-prescription-dispense-design.md`
- Create migration file only; **do not** run `php artisan migrate` without explicit owner approval.
- Until migration applied: structured per-prescription Confirm Given returns clear error; legacy one-shot Confirm Given unchanged.
- Never write new Rx into editable `prescriptionText`; never delete/rewrite historical prescriptions.
- No BHC dispensing changes; no commit / push / merge / deploy unless the owner asks.
- Do not invent authorized totals from free-text instructions.
- AKAY design system only; match Supporting Laboratory Tests density.

---

## File map

| Path | Responsibility |
|---|---|
| `frontend/src/utils/rhuPrescriptions.js` | Create/normalize/validate/reconcile prescriptions; formatters |
| `frontend/src/utils/rhuPrescriptions.test.js` | Unit tests for contract |
| `frontend/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx` | Compact Add/Edit/List UI inside diagnosis cards |
| `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx` | Mount prescriptions; remove new-consult textarea |
| `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` | State, draft, finalize, review rows |
| `frontend/src/components/features/medicine/RhuToDispenseTab.jsx` | Structured review grouping + status |
| `frontend/src/components/features/medicine/RhuPrescriptionReviewModal.jsx` | Structured + legacy display |
| `frontend/src/components/features/medicine/RhuPrescriptionPrintSlip.jsx` | Structured print lines |
| `backend/app/Services/PrescriptionClinicalAuthority.php` | Physician gate + attestation |
| `backend/app/Services/RhuPrescriptionService.php` | Normalize, eligibility, fulfillment status, TB ref resolve |
| `backend/app/Models/HealthRecord.php` | `prescriptionDisplayText`, structured helpers |
| `backend/app/Http/Requests/HealthRecordRequest.php` | Validate `monitoring_data.prescriptions` |
| `backend/app/Services/HealthRecordDraftPayloadService.php` | Draft schema for prescriptions |
| `backend/app/Http/Controllers/Api/RhuToDispenseController.php` | Queue payload + statuses |
| `backend/app/Http/Controllers/Api/HealthRecordController.php` | Confirm Given prescription-aware path |
| `backend/app/Services/MedicineStockService.php` | Per-Rx remaining + idempotency (migration-on) |
| `backend/app/Support/SchemaFeatures.php` (or existing helper) | `hasPrescriptionDispenseLink()` |
| `backend/database/migrations/2026_11_11_000001_add_prescription_link_to_health_record_medicines.php` | Additive columns only |
| Focused `*.test.js` / PHPUnit feature tests | Spec QA matrix |

---

### Task 1: Frontend prescription contract utilities

**Files:**
- Create: `frontend/src/utils/rhuPrescriptions.js`
- Create: `frontend/src/utils/rhuPrescriptions.test.js`

**Interfaces:**
- Produces: `createPrescriptionId()`, `emptyPrescription(partial)`, `normalizePrescriptions(list)`, `prescriptionsForSave(list)`, `prescriptionErrors(list, diagnoses)`, `reconcilePrescriptionsForDiagnosisRemoval(prescriptions, diagnosisId)`, `formatPrescriptionLine(rx)`, `prescriptionsForDiagnosis(list, diagnosisId)`, `visitPrescriptionStatus(orders, releases)`

- [ ] **Step 1: Write failing tests** for UUID stability, multi-diagnosis single order, required fields, authorized qty pair, diagnosis removal reconciliation (block/relink), no silent drop.

```js
import assert from "node:assert/strict";
import {
  createPrescriptionId,
  emptyPrescription,
  normalizePrescriptions,
  prescriptionErrors,
  reconcilePrescriptionsForDiagnosisRemoval,
} from "./rhuPrescriptions.js";

const d1 = "diag-1";
const d2 = "diag-2";

{
  const id = createPrescriptionId();
  assert.match(id, /^[0-9a-f-]{36}$/i);
  const rx = emptyPrescription({
    id,
    diagnosisIds: [d1, d2],
    medicineName: "Losartan",
    strength: "50mg",
    dose: "1 tablet",
    route: "PO",
    frequency: "Once daily",
    duration: "30 days",
    authorizedQuantity: 30,
    authorizedUnit: "tablet",
  });
  const saved = normalizePrescriptions([rx]);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].diagnosisIds, [d1, d2]);
  assert.equal(saved[0].id, id);
}

{
  const rx = emptyPrescription({
    id: createPrescriptionId(),
    diagnosisIds: [d1],
    medicineName: "Metformin",
    strength: "500mg",
    dose: "1 tablet",
    route: "PO",
    frequency: "BID",
    duration: "30 days",
  });
  const result = reconcilePrescriptionsForDiagnosisRemoval([rx], d1);
  assert.equal(result.blocked, true);
  assert.ok(result.error);
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --test frontend/src/utils/rhuPrescriptions.test.js`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement minimal `rhuPrescriptions.js`**

Use `crypto.randomUUID` like `createDiagnosisId`. Validate with field-path errors keyed as `prescriptions.{id}.{field}`. `source` default `itr`. Never invent qty from instructions.

- [ ] **Step 4: Run test — expect PASS**

Run: `node --test frontend/src/utils/rhuPrescriptions.test.js`  
Expected: PASS

- [ ] **Step 5: Do not commit** (owner constraint)

---

### Task 2: Doctor UI — prescriptions on diagnosis cards

**Files:**
- Create: `frontend/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js` (stop asserting free-text-only Prescription textarea for new flow)

**Interfaces:**
- Consumes: utils from Task 1; visit-level `prescriptions` + `onPrescriptionsChange`
- Produces: compact list filtered by diagnosis; modal/inline form matching Supporting Laboratory Tests density

- [ ] **Step 1: Update section tests** to require Prescriptions near Supporting Laboratory Tests, Add Prescription, and absence of standalone `label="Prescription"` FieldTextarea for new consults. Keep Actions Taken / Treatment textarea.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`

- [ ] **Step 3: Implement `RhuPrescriptionsSection`** and wire into `DiagnosisCard` after laboratory picker. Lift prescriptions to section/workspace props (visit-level). Remove standalone Prescription textarea from `treatmentSlot`.

- [ ] **Step 4: On diagnosis remove**, call reconciliation helper; surface error / require explicit prescription removal before allowing remove or finalize.

- [ ] **Step 5: Re-run tests — expect PASS**

- [ ] **Step 6: Do not commit**

---

### Task 3: Workspace draft / review / finalize wiring

**Files:**
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modify: related draft restore helpers if needed in `frontend/src/utils/rhuCarePlan.js` (only if prescriptions restore belongs there — prefer `rhuPrescriptions.js`)

**Interfaces:**
- State: `prescriptions` array
- Draft payload includes `prescriptions`
- Review section lists structured lines; do not copy into `prescriptionText`
- Keep existing `prescriptionText` state only for restoring/displaying legacy drafts/records; new writes leave it empty/unused as authoritative source

- [ ] **Step 1: Add/adjust workspace tests** for draft round-trip of prescriptions IDs and multi-diagnosis links (string/source assertions acceptable where component tests are source-read based).

- [ ] **Step 2: Wire state** — initialize/restore/normalize on draft load; include in autosave fingerprint and finalize payload under `monitoring_data.prescriptions` (follow existing monitoring_data merge pattern in workspace).

- [ ] **Step 3: Update review rows** to show structured prescriptions; legacy text only when structured empty and text present.

- [ ] **Step 4: Manual sanity** against running `npm run dev` if available — do not claim complete.

- [ ] **Step 5: Do not commit**

---

### Task 4: Backend validation + physician authority

**Files:**
- Create: `backend/app/Services/PrescriptionClinicalAuthority.php`
- Create: `backend/tests/Unit/Services/PrescriptionClinicalAuthorityTest.php`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Modify: finalize path that persists `monitoring_data` (draft finalize / store — same places `prescriptionText` is accepted today)

**Interfaces:**
- `PrescriptionClinicalAuthority::canAuthorize(?User): bool` — RHU + `staff_role === 'doctor'` + `conditions.confirm`
- `ensureCanAuthorize(User)`
- `attestation(User, array $prescriptions): array` with hash over ordered clinical fields
- Request rules for `monitoring_data.prescriptions.*` matching the spec contract
- When prescriptions non-empty on RHU ITR finalize: require authority; attach attestation; reject non-physician finalizers

- [ ] **Step 1: Write PHPUnit tests** — doctor with `conditions.confirm` OK; nurse/finalize-only rejected; empty prescriptions still allow existing finalize rules; invalid diagnosisIds rejected; authorizedQuantity without unit rejected.

- [ ] **Step 2: Run — expect FAIL**

Run: `php artisan test --filter=PrescriptionClinicalAuthorityTest`

- [ ] **Step 3: Implement authority + request/draft rules**; hook authorize into RHU ITR finalize/store validation (alongside existing TB authority patterns, without weakening them).

- [ ] **Step 4: Run focused HealthRecord draft/finalize tests plus new tests — expect PASS for touched filters. Fix regressions without discarding uncommitted TB fixes.

- [ ] **Step 5: Do not commit**

---

### Task 5: Additive migration file (do not run)

**Files:**
- Create: `backend/database/migrations/2026_11_11_000001_add_prescription_link_to_health_record_medicines.php`
- Create: `backend/app/Support/SchemaFeatures.php` (or extend an existing schema helper if one exists)
- Modify: `backend/app/Models/HealthRecordMedicine.php` fillable/casts as needed

**Migration up (additive only):**

```php
Schema::table('health_record_medicines', function (Blueprint $table): void {
    $table->uuid('prescription_id')->nullable()->after('health_record_id')->index();
    $table->string('idempotency_key', 64)->nullable()->unique();
});
```

**down:** drop those columns.

- [ ] **Step 1: Add migration file and `SchemaFeatures::hasPrescriptionDispenseLink(): bool`** using `Schema::hasColumn('health_record_medicines', 'prescription_id')`.

- [ ] **Step 2: Unit-test the feature helper** with Schema fake or integration assertion that helper returns bool without migrating in CI if column absent.

- [ ] **Step 3: Explicitly do NOT run migrate**

- [ ] **Step 4: Do not commit**

---

### Task 6: Display text, queue, print

**Files:**
- Modify: `backend/app/Models/HealthRecord.php` (`prescriptionDisplayText`)
- Create/Modify: `backend/app/Services/RhuPrescriptionService.php` — eligibility, TB case resolve without mutating ITR, status roll-up
- Modify: `backend/app/Http/Controllers/Api/RhuToDispenseController.php`
- Modify: `backend/tests/Feature/RhuToDispenseQueueTest.php`
- Modify: `frontend/src/components/features/medicine/RhuPrescriptionReviewModal.jsx`
- Modify: `frontend/src/components/features/medicine/RhuPrescriptionPrintSlip.jsx`
- Modify: `frontend/src/components/features/medicine/RhuToDispenseTab.jsx` (+ tests)

**Interfaces:**
- Queue row adds: `prescriptions` (staff-safe summary), `status` in `pending|partial|dispensed|unavailable|given` (map carefully for legacy `given`), `structured: bool`, `structuredDispenseEnabled: bool`
- TB: join `tbTreatmentCase` when present; include ref summary only if authorized/registered eligible; never write back into health record monitoring_data

- [ ] **Step 1: Extend queue tests** for structured eligibility, legacy fallback, physician-unauthorized structured excluded, TB delayed registration visible via case join without ITR mutation.

- [ ] **Step 2: Implement display + controller + FE review/print grouping by diagnosis.**

- [ ] **Step 3: Run** `php artisan test --filter=RhuToDispenseQueueTest` and FE dispense tab tests.

- [ ] **Step 4: Do not commit**

---

### Task 7: Prescription-linked Confirm Given (migration-aware)

**Files:**
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` `dispenseMedicines`
- Modify: `backend/app/Services/MedicineStockService.php`
- Create: `backend/tests/Feature/RhuStructuredPrescriptionDispenseTest.php`
- Modify: frontend dispense draft payload to send `prescription_id`, `idempotency_key`, quantities; Unavailable action without stock call

**Behavior:**

```
if structured request and !SchemaFeatures::hasPrescriptionDispenseLink():
  422 "Structured prescription dispensing requires the prescription link migration."
if legacy text-only record:
  keep existing one-shot exists() gate
if structured + migration on:
  validate prescription_id ∈ authorized prescriptions
  sum prior releases for id; refuse if qty > remaining when authorizedQuantity set
  unique idempotency_key short-circuits success without second deduction
  Unavailable endpoint/flag writes non-stock event (monitoring_data.prescriptionDispenseEvents or dedicated response field) with no MedicineStockService::dispense call
```

- [ ] **Step 1: Write feature tests** covering migration-off disable, migration-on partial, over-release, unavailable no stock change, idempotent retry, cross-RHU 403. Use `Schema::table` in test setup only inside that test class when asserting migration-on behavior (or SQLite test migrate for that file) — do not migrate developer databases as part of the default agent workflow.

- [ ] **Step 2: Implement controller/service changes** without weakening facility checks.

- [ ] **Step 3: Update FE Confirm Given** to pass prescription links when `structuredDispenseEnabled`; otherwise show disabled messaging for structured rows.

- [ ] **Step 4: Run focused dispense tests**

- [ ] **Step 5: Do not commit**

---

### Task 8: TB Form 4B reference integration (no ITR mutation)

**Files:**
- Modify: `frontend` TB summary display in care plan / review as needed (`TbInlineForm4bPanel.jsx` only if required for linked summary — preserve uncommitted regimen work)
- Modify: `RhuPrescriptionService` eligibility join
- Tests: extend Form 4B / consultation tests to assert no duplicate ITR TB medicine orders and no post-hoc ITR monitoring_data write on delayed registration

- [ ] **Step 1: Failing tests** for: authorized registered case appears as `tb_form4b_ref` eligibility; unregistered/unauthorized absent; delayed registration does not change finalized ITR prescriptions JSON; conflict with overlapping ITR TB medicine order surfaces reconciliation error (422 or field error) rather than merge.

- [ ] **Step 2: Implement resolve-on-read eligibility.**

- [ ] **Step 3: Run TB + prescription focused tests; preserve existing Form 4B suites.**

- [ ] **Step 4: Do not commit**

---

### Task 9: Verification suite + migration-ready checklist

**Files:** none required beyond test fixes

- [ ] **Step 1: Run focused backend filters**

```
php artisan test --filter=PrescriptionClinicalAuthorityTest
php artisan test --filter=RhuToDispenseQueueTest
php artisan test --filter=RhuStructuredPrescriptionDispenseTest
php artisan test --filter=TbCase
```

(Adjust filter names to actual class names created.)

- [ ] **Step 2: Run focused frontend tests**

```
node --test frontend/src/utils/rhuPrescriptions.test.js
node --test frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js
node --test frontend/src/pages/rhu/RhuConsultationWorkspace.test.js
node --test frontend/src/components/features/medicine/RhuToDispenseTab.test.js
```

- [ ] **Step 3: ESLint + build**

```
npm run lint
npm run build
```

(from `AKAY-Prototype/frontend` as repo scripts dictate)

- [ ] **Step 4: Fill migration-ready checklist** in the agent final report (from spec § Migration-ready verification checklist). State clearly: migration **not** executed.

- [ ] **Step 5: Manual browser QA checklist** (report only; do not claim complete unless verified):

1. Add HTN Rx → draft leave/resume → finalize  
2. Multi-Rx diabetes + multi-diagnosis single Rx  
3. TB Form 4B authorized ref without duplicate  
4. Diagnosis remove reconciliation  
5. To Dispense review grouping  
6. Legacy text visit still printable / dispensable historically  
7. Structured Confirm Given shows migration-required error until migrate approved  
8. BHC consult dispense unchanged smoke  

- [ ] **Step 6: Do not commit / push / migrate**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `monitoring_data.prescriptions[]` UUID + multi diagnosisIds | 1–4 |
| Authorized qty required for remaining tracking; no free-text guessing | 1, 7 |
| Physician auth server-side ≠ generic finalize | 4 |
| Form 4B canonical; delayed reg no ITR mutation; no duplicate | 8 |
| Existing To Dispense + MedicineStockService; per-Rx history; partial; unavailable; idempotency | 6–7 |
| Migration create-only; disable structured Confirm Given until applied | 5, 7 |
| Legacy readable/printable; no historical rewrite | 6–7 |
| Preserve Form 4B/TB/referral/BHC; no BHC dispense | Global + 8–9 |
| UI match existing; print/draft/review/QA | 2–3, 6, 9 |

No TBD placeholders. Commit steps intentionally omitted per owner constraint.
