# Service Forms After Physical Examination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each selected service form (Prenatal, Family Planning, Child Health / EPI) a regular step after Physical Examination, simplify the services panel to an "Active" badge, and fire the prenatal risk modal on entering the Prenatal form.

**Architecture:** The step model in `utils/consultationSteps.js` (pure, unit-tested) takes the program steps into the form sequence, the progress bar and the error order. `ConsultationWorkspace.jsx` drops its detour bookkeeping and uses the new sequence. `ConsultationProgramPanel.jsx` loses its form button and status.

**Tech Stack:** React 19 + Vite, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-13-service-forms-after-physical-exam-design.md`

## Global Constraints

- Order: Patient Interview → Physical Examination → service forms (primary first, then selection order, from `getProgramFormSteps`) → Medication, Treatment & Next Steps → (Monitoring Details) → Review & Finalize.
- Progress-bar step `{ key: PROGRAMS_STEP, phase: "form", label: "Service Details" }` appears only when at least one service is selected, between Physical Examination and Medication, Treatment & Next Steps.
- A service form never blocks Next. Previous/Next on a service form are plain "Previous"/"Next" (no "Done", no "Back to Patient Interview"/"Back to Review").
- No shortcut: the panel has no button that opens a form.
- Panel badge text for a selected service: "Active"; help text under it: "Form opens after Physical Examination."
- Risk modal: one trigger, entering `programStepKey("Maternal")` via `goToStepKey`. Never on draft restore. Once per flag per consultation (unchanged).
- No draft payload, server or backend change.
- Frontend tests: `cd frontend && npm run test:consultation-steps && npm run test:prenatal-form`; plus `npm run lint -- --quiet && npm run build`.

## Review Focus

- Clicking "Service Details" in the progress bar opens the first service form (via `goToStepKey(PROGRAMS_STEP)`); Task 2 manual check.
- Previous from Medication, Treatment & Next Steps lands on the LAST service form when services are selected (`formSequence[formSequence.length - 1]`); Task 1 unit test + Task 2 manual.
- A save error owned by a service form (e.g. Family Planning method) sends the worker to that form, after Interview/Physical Examination errors; Task 1 `getStepOrder` test.
- Changing the primary service on Interview reorders the service screens; Task 1 test.
- A draft resumed on the Prenatal form does not open the risk modal; entering Prenatal later from Review's Edit opens it only for unacknowledged flags; Task 2 manual.

---

### Task 1: Step model puts service forms after Physical Examination

**Files:**
- Modify: `frontend/src/utils/consultationSteps.js` (header comment, `buildConsultationSteps`, `getFormSequence`, `getStepOrder`; delete `getServiceFormReturnTarget`)
- Modify: `frontend/src/utils/consultationSteps.test.js`

**Interfaces:**
- Produces: `getFormSequence(programSteps = []): string[]` → `[INTERVIEW_STEP, ASSESSMENT_STEP, ...programSteps.map((s) => s.key)]`.
- Produces: `buildConsultationSteps({ programSteps = [], monitoringDetailKeys = [] } = {})` → today's list plus the Service Details step (see Global Constraints) when `programSteps.length > 0`.
- Produces: `getStepOrder(programSteps, monitoringDetailKeys)` → `[INTERVIEW_STEP, ASSESSMENT_STEP, ...program keys, NEXT_STEP, (MONITORING_STEP), REVIEW_STEP]`.
- Removes: `getServiceFormReturnTarget`. `getNextStepKey`, `getPreviousStepKey`, `resolveFormStep`, `getGlobalStepKey`, `resolveStepHeading` are unchanged.

- [ ] **Step 1: Update the tests (failing).** In `consultationSteps.test.js`:
  - `walkForward(programs, primary)` uses `getFormSequence(getProgramFormSteps(programs, primary))`.
  - Replace "SERVICES are a detour" with `SERVICES come after Physical Examination, primary first`: `["Maternal"]` → `[INTERVIEW, ASSESSMENT, MATERNAL, NEXT, REVIEW]`; `(["EPI","Maternal"], "Maternal")` → `[INTERVIEW, ASSESSMENT, MATERNAL, EPI, NEXT, REVIEW]`; `(["EPI","Maternal"], "EPI")` → EPI before MATERNAL.
  - Replace "Service Details is never a global step" with `Service Details is a global step only when a service is selected`: absent for `[]`, present (label "Service Details", phase "form", between ASSESSMENT and NEXT) for `["EPI"]` and `["Maternal","EPI"]` (pass `programSteps: getProgramFormSteps(...)`).
  - Update "the global steps read in the new order" to expect `["Patient Interview", "Physical Examination", "Service Details", "Medication, Treatment & Next Steps", "Review & Finalize"]` for three services; replace "selecting services never changes the global steps" with: one service and three services give the same keys; none lacks only `PROGRAMS_STEP`.
  - BACKWARD test with `["Maternal","EPI"]`: from EPI Previous walks `EPI → MATERNAL → ASSESSMENT → INTERVIEW → EXIT`; and `sequence[sequence.length - 1] === EPI` (where Previous from step 3 lands).
  - Next from the last service form → `NEXT_STEP`; Next from ASSESSMENT with services → first service form.
  - Delete the `getServiceFormReturnTarget` test and import.
  - `getStepOrder` test: `[INTERVIEW, ASSESSMENT, MATERNAL, EPI, NEXT, REVIEW]`.
  - `resolveFormStep` test: build `sequence` with `getFormSequence(programs)`; a selected service form is kept, a deselected one (FP) falls back to INTERVIEW.
- [ ] **Step 2: Run** `cd frontend && npm run test:consultation-steps`. Expected: FAIL on the changed expectations (and the missing export once removed from the import is fine).
- [ ] **Step 3: Implement** the three functions and delete `getServiceFormReturnTarget`. Rewrite the header comment and the `getFormSequence` / `getStepOrder` doc comments to describe service forms as steps after Physical Examination (no "detour", no "hub").
- [ ] **Step 4: Run** `npm run test:consultation-steps`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(consultation): service forms follow Physical Examination in the step model`.

### Task 2: Workspace walks the new sequence; modal on entering Prenatal

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Modify: `docs/superpowers/specs/2026-10-13-service-forms-after-physical-exam-design.md` (one line, Step 6)

**Interfaces:**
- Consumes: Task 1's `getFormSequence(programSteps)`, `buildConsultationSteps({ programSteps, monitoringDetailKeys })`, `getStepOrder` (same signature). Existing `announceRiskFlags`, `programStepKey`, `goToStepKey`.

- [ ] **Step 1: Sequence and progress bar.** Move the `programFormSteps` `useMemo` above `consultationSteps`; `consultationSteps = useMemo(() => buildConsultationSteps({ programSteps: programFormSteps, monitoringDetailKeys }), [programFormSteps, monitoringDetailKeys])`; `formSequence = useMemo(() => getFormSequence(programFormSteps), [programFormSteps])`. Update the nearby comments ("detour opened from Patient Interview") to the new flow.
- [ ] **Step 2: Remove the detour bookkeeping.** Delete `serviceFormOrigin` state, `setServiceFormOrigin(...)` in `goToStepKey`, `serviceFormReturnLabel`, the `getServiceFormReturnTarget` import, and the `if (activeProgramStep) { ... return; }` blocks in `handleFormStepNext` / `handleFormStepPrevious` (rewrite their comments: a service form never blocks Next). Action bar: `previousLabel` is "Back to Patient" on Interview else "Previous"; `continueLabel` drops the `activeProgramStep ? "Done"` branch (form steps say "Next").
- [ ] **Step 3: Gate check.** `checkStepGate` must not block on service steps (it only checks Interview today; confirm nothing else changed).
- [ ] **Step 4: Risk modal trigger.** In `goToStepKey`, replace the "leaving Physical Examination" trigger with `if (target === programStepKey("Maternal")) announceRiskFlags();` (after `target` is resolved, so the progress-bar Service Details click also counts). Remove the call in `handleProgramSelect`. Update the `announceRiskFlags` comment to "entering the Prenatal form".
- [ ] **Step 5: Verify** `cd frontend && npm run test:consultation-steps && npm run test:prenatal-form && npm run lint -- --quiet && npm run build`. Expected: all pass. `grep -n "serviceFormOrigin\|getServiceFormReturnTarget\|Back to Patient Interview" src/pages/bhc/ConsultationWorkspace.jsx` → no matches.
- [ ] **Step 6: Spec line.** In the spec §1, replace "Unselecting a service while its form is the current screen moves the worker to Physical Examination." with "The services panel only shows on Patient Interview, so a service cannot be unselected while its form is open; `resolveFormStep` keeps its existing fallback (first screen)."
- [ ] **Step 7: Commit** `feat(consultation): open service forms after Physical Examination`.

### Task 3: Services panel shows "Active", no form button

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (remove `programStatusByKey` block ~line 4049-4066 and the `statusByProgram` / `onOpenForm` props)
- Modify: `frontend/src/utils/consultationPrograms.js` (delete `PROGRAM_FORM_NAMES`, `programFormActionLabel`)
- Modify: `frontend/src/utils/consultationPrograms.test.js` (delete the two `programFormActionLabel` tests and the import)

- [ ] **Step 1: Delete the label tests and run** `npm run test:consultation-steps` → PASS (nothing else uses the function); then delete `programFormActionLabel` and `PROGRAM_FORM_NAMES` and run again → PASS.
- [ ] **Step 2: Panel.** Remove the `StatusBadge`/`STATUS_STYLES`, the `statusByProgram` and `onOpenForm` props and the form button. For an active program render: an "Active" badge (`bg-[#DCFCE7] text-[#166534]`, same badge shape as today), the existing Primary / Make primary controls, and a line `Form opens after Physical Examination.` (`text-[11px] text-[#6B7280]`). Update the file's header comment and JSDoc.
- [ ] **Step 3: Workspace.** Delete `programStatusByKey` and its comment; drop the two props from `<ConsultationProgramPanel>`. Check `getClinicalValidationErrors` / `getErrorOwnerStepKey` imports are still used elsewhere before removing any import (lint will flag unused ones).
- [ ] **Step 4: Verify** `npm run test:consultation-steps && npm run test:prenatal-form && npm run lint -- --quiet && npm run build`. Expected: pass. Manual browser (`npm run dev`), recorded for the user if not run: tick Maternal → panel shows "Active" + help line, no button; Interview Next → Physical Examination (height 142) → Next opens "Prenatal" with the risk modal once; progress bar shows Service Details; Previous returns to Physical Examination; from Medication, Treatment & Next Steps Previous returns to Prenatal; Review Edit on Prenatal opens it; a draft saved on Prenatal resumes there without a modal.
- [ ] **Step 5: Commit** `feat(consultation): services panel shows Active instead of a form button`.
