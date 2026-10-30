# RHU Health Record Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This work is one page swap; do not split across subagents.

**Goal:** Make RHU Health Record Details the same Clinic Ledger visit sheet as BHC, filled only with that RHU record.

**Architecture:** `pages/rhu/RHURecordDetails.jsx` stops rendering the accordion/side-card layout. It loads one record by id (plus its patient by id and optional linked referral) and mounts `BhcHealthRecordWorkspace` plus `BhcHealthRecordPrintDocument`, matching `pages/bhc/HealthRecordDetails.jsx`. Facility data is not shared. Section order stays the BHC order. Diagnosis is not remapped to Health Problems.

**Tech Stack:** React, Vite, TanStack Query, React Router, existing health-record helpers, node:test.

**Spec:** `docs/superpowers/specs/2026-10-30-rhu-health-record-details-design.md`

## Global Constraints

- English UI copy. Clinic Ledger tokens. Pill controls, sheet cards.
- Saved records stay immutable; this page does not add edit.
- RHU-only data: `getHealthRecordById` + `getPatientById`. Never scan `getPatientsByRole` / `getPatientDetailsListByRole`.
- Do not restyle live Start Consultation, Patient Details, or the Patient Background tab.
- Do not hide the Health concerns & care outcomes slot.
- Do not add RHU-only header actions (Record Follow-up Visit, View Referral).
- Skip git commits unless the user explicitly asks.

---

### Task 1: RHU details page mounts the BHC workspace

**Files:**
- Create: `frontend/src/pages/rhu/RHURecordDetails.test.js`
- Modify: `frontend/src/pages/rhu/RHURecordDetails.jsx` (replace accordion page with BHC details page pattern)
- Test: `frontend/src/pages/rhu/RHURecordDetails.test.js`
- Regression: `frontend/src/components/features/health-records/HealthRecordDetailsView.test.js`

**Interfaces:**
- Consumes: `BhcHealthRecordWorkspace`, `BhcHealthRecordPrintDocument`, `getHealthRecordById`, `getPatientById`, `getReferralByHealthRecordId`, `getReferralByTrackingId`, `getPatientRecordReturn(location, patientId, "/rhu")`, `queryKeys.healthRecordDetails("rhu", recordId)`
- Produces: RHU `/rhu/health-records/:recordId` renders the BHC details arrangement with RHU chrome

- [ ] **Step 1: Write the failing source-contract tests**

Create `frontend/src/pages/rhu/RHURecordDetails.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "RHURecordDetails.jsx"),
  "utf8",
);

test("RHU health record details mounts the BHC ledger workspace and print sheet", () => {
  assert.match(source, /BhcHealthRecordWorkspace/);
  assert.match(source, /BhcHealthRecordPrintDocument/);
  assert.match(source, /BHC_HEALTH_RECORD_PRINT_PAGE_STYLES/);
  assert.match(source, /role="rhu"/);
  assert.match(source, /queryKeys\.healthRecordDetails\("rhu"/);
  assert.match(source, /getPatientRecordReturn\([\s\S]*"\/rhu"\)/);
  assert.match(source, /VisitHistorySnapshot|bodyFindingsHistory/);
});

test("RHU health record details loads the record and patient by id, not the facility patient list", () => {
  assert.match(source, /getHealthRecordById/);
  assert.match(source, /getPatientById/);
  assert.doesNotMatch(source, /getPatientDetailsListByRole/);
  assert.doesNotMatch(source, /getPatientsByRole/);
  assert.doesNotMatch(source, /RecordHeaderCard/);
  assert.doesNotMatch(source, /Accordion/);
  assert.doesNotMatch(source, /SideCard/);
  assert.doesNotMatch(source, /anim-fade-up/);
  assert.doesNotMatch(source, /Record Follow-up Visit/);
  assert.doesNotMatch(source, /View Referral/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/pages/rhu/RHURecordDetails.test.js` from `frontend/`

Expected: FAIL — current file still uses `RecordHeaderCard` / `getPatientsByRole` and does not import `BhcHealthRecordWorkspace`.

- [ ] **Step 3: Rewrite `RHURecordDetails.jsx` to match `pages/bhc/HealthRecordDetails.jsx`**

Keep RHU-only differences: `DashboardLayout role="rhu"`, `queryKeys.healthRecordDetails("rhu", recordId)`, `getPatientRecordReturn(location, patientId, "/rhu")`.

Copy the BHC page structure: queryFn loads record by id, optional referral (catch → null), patient by id with embedded fallback; loading `SoftLoadingArea`; non-404 error `ConnectionErrorState`; missing record card; screen workspace + print document; `?print=1` auto-print; `bodyFindingsHistory={<BodyFindingRecordHistory record={record} />}`.

- [ ] **Step 4: Run the new tests and BHC workspace regression**

Run from `frontend/`:

```
node --test src/pages/rhu/RHURecordDetails.test.js
node --test src/components/features/health-records/HealthRecordDetailsView.test.js
```

Expected: PASS

- [ ] **Step 5: Frontend production build**

Run: `npm run build` from `frontend/`

Expected: Vite build succeeds

---
