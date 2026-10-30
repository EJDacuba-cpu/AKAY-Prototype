# RHU Patient Overview and Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. One page composition change; do not split across subagents.

**Goal:** Make RHU Patient Details Overview match BHC’s anatomy workspace and add a read-only Patient Background tab, without changing Today’s Queue check-in.

**Architecture:** Compose existing BHC overview/background components inside `RHUPatientDetails.jsx`. Add RHU follow-up tasks to profile queries only so Overview’s right column can show the same follow-up preview. Do not change BHC files or `ProfileQueueAction`.

**Tech Stack:** React, TanStack Query, existing profile components, node:test.

**Spec:** `docs/superpowers/specs/2026-10-30-rhu-patient-overview-background-design.md`

## Global Constraints

- English UI. Clinic Ledger tokens.
- RHU data only. Query keys stay `"rhu"`.
- Do not restyle ProfileQueueAction or the Start Consultation wizard.
- Patient Background is `canEdit={false}`, `basePath="/rhu"`.
- Skip git commits unless the user asks.

---

### Task 1: RHU Overview + Patient Background

**Files:**
- Create: `frontend/src/pages/rhu/RHUPatientDetails.test.js`
- Modify: `frontend/src/services/patientProfileQueries.js`
- Modify: `frontend/src/pages/rhu/RHUPatientDetails.jsx`

- [ ] **Step 1: Write failing source-contract tests** in `RHUPatientDetails.test.js` asserting: `patient-overview.css`, `anatomyWorkspace`, `PatientBackgroundTab`, `PatientHistoryReference`, `canEdit={false}`, `basePath={BASE_PATH}` or `"/rhu"`, tab key `"background"` after `"patient-info"`, still `ProfileQueueAction`, vitals passed into `AnatomyFindingsPanel`, no `left={<VitalsTiles`.

- [ ] **Step 2: Run tests, expect FAIL**

`node --test src/pages/rhu/RHUPatientDetails.test.js` from `frontend/`

- [ ] **Step 3: Implement**

Add `followUps` to `getRhuPatientProfileQueries` (`queryKeys.followUpTasks("rhu")`, `getPatientFollowUpTasks`). Include it in RHU prefetch secondary.

In `RHUPatientDetails.jsx`: import overview CSS, Background tab, History reference, `orderFollowUps`; `patient-profile-content` on shell; `patient-profile-panels` on the panels wrapper; tab `background` after patient-info; Overview `anatomyWorkspace` with vitals inside anatomy; History as tabs `aside`; Background panel; follow-up query + `activeFollowUps` on `ClinicalOverviewColumn`; keep `ProfileQueueAction`.

- [ ] **Step 4: Run tests + `npm run build`**
