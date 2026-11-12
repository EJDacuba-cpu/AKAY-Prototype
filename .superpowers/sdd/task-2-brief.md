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

