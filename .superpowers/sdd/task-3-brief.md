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

