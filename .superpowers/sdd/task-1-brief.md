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

