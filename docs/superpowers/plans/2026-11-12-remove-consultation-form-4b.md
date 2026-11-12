# Remove Consultation-Integrated Form 4B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove DS-TB Form 4B from RHU consultation Diagnosis, Review, drafts, and finalization while preserving independent post-consultation registration on Health Record Details.

**Architecture:** Option A (FINAL). Consultation no longer accepts or requires `tb_case_registration`. Registration intent UI (`openTreatmentCard` / Review `TbInlineForm4bPanel`) is removed. Independent `GET/POST .../tb-registration` and `TbCaseRegistrationPanel` remain the only Form 4B create path. Existing TB cases, audits, and permissions are untouched.

**Tech Stack:** Laravel (PHPUnit Feature tests), React/Vite frontend (node:test), shared `tbRegistration` / `TbTreatmentCardForm` utilities.

## Global Constraints

- Work only on branch `Eric-Manually-Fixer`; do not switch branches, commit, push, or merge.
- Preserve unrelated uncommitted changes (`formDraftCoordinator*`).
- Do not remove independent TB registration API/UI, existing cases, clinical records, permissions, or audit history.
- Minimal, targeted diffs; no alternative architectures unless a verified blocker.

---

### Task 1: Backend — reject consultation `tb_case_registration` and stop atomic register

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php`
- Modify: `backend/app/Services/TbAssessment.php`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Modify: `backend/tests/Feature/TbAssessmentTest.php`
- Preserve: `backend/app/Services/TbCaseRegistrationService.php` (`registerForSource` kept for POST `/tb-registration`)
- Preserve: `backend/tests/Feature/TbCaseRegistrationTest.php` (independent path)

**Interfaces:**
- Consumes: RHU ITR POST `/api/health-records` diagnose payload
- Produces: Finalize never creates `tb_treatment_cases`; `tb_case_registration` prohibited

- [x] **Step 1: Update failing/contract tests in `TbAssessmentTest`**

Replace atomic registration tests with:
- Finalize with DS-TB assessment (and legacy `openTreatmentCard: true` / `initiate_at_rhu` if still accepted as assessment fields) **without** `tb_case_registration` succeeds and creates **zero** `tb_treatment_cases`.
- POST that includes `tb_case_registration` is rejected (`prohibited` / validation error on `tb_case_registration`).
- Draft sanitize no longer preserves consultation registration blobs; `openTreatmentCard` forced false for DS-TB (no in-consult registration intent).

- [x] **Step 2: Implement backend removals**

1. `HealthRecordRequest`: set `tb_case_registration` => `prohibited`; remove nested rules; remove `validateTbCaseRegistration()` and its `after` call.
2. `HealthRecordController@store`: remove `$tbCaseRegistration` extract and in-transaction `registerForSource` block.
3. `TbAssessment::validate`: remove messages requiring Form 4B for `initiate_at_rhu` / tying `openTreatmentCard` to in-consult registration. Keep DS-TB-only checks for resistance; clear/reject incompatible `openTreatmentCard` on non-DS-TB. For DS-TB: do not require registration; force conceptually that consultation registration is gone — normalize `openTreatmentCard` to false and clear `initiate_at_rhu` on draft normalize so delayed registration stays eligible for new drafts.
4. `HealthRecordDraftPayloadService`: remove `includeForm4b` / `tbCaseRegistration` from SCHEMA and validation rules (legacy draft keys dropped on sanitize).

- [x] **Step 3: Run backend focused tests**

```bash
php artisan test --filter=TbAssessmentTest
php artisan test --filter=TbCaseRegistrationTest
php artisan test --filter=TbClinicalAuthorityTest
```

Expected: PASS. Independent registration suite unchanged in intent.

---

### Task 2: Frontend — remove consultation Form 4B UI/state/finalize

**Files:**
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx`
- Delete: `frontend/src/components/features/health-records/TbInlineForm4bPanel.jsx`
- Modify: `frontend/src/utils/consultationSteps.js`
- Modify: `frontend/src/services/healthRecordService.js`
- Modify: `frontend/src/utils/tbAssessment.js` (stop treating consultation registration intent)
- Modify: related `*.test.js` files
- Preserve: `TbCaseRegistrationPanel.jsx`, `RHURecordDetails.jsx`, `tbCaseService.js`, `tbRegistration.js` payload helpers used by Details

- [x] **Step 1: Update frontend tests first**

- `RhuDiagnosisCarePlanSection.test.js`: assert Form 4B registration CTA / “Complete Form 4B on Review” are **absent**; TB assessment remains.
- `consultationSteps.test.js`: remove/rewrite includeForm4b / tbCaseRegistration Review routing expectations.
- `tbAssessment.test.js` / `tbRegistration.test.js` / `rhuTbCaseManagement.test.js`: drop consultation-registration intent expectations; openTreatmentCard not required for finalize.

- [x] **Step 2: Strip consultation UI/state**

1. Workspace: remove `TbInlineForm4bPanel`, `tbCaseRegistration` state, `includeForm4b`, form4b finalize errors, draft fields, finalize `tbCaseRegistration` payload, FORM_4B_STEP navigation branches (map legacy restore to Diagnosis/Review without registration).
2. Diagnosis section: remove Register Treatment · Form 4B buttons and registration props plumbing.
3. `healthRecordService.js`: omit `tb_case_registration` (always null / remove key).
4. `consultationSteps.js`: remove dead `includeForm4b` / form4b error routing for consultation registration keys (keep `FORM_4B_STEP` constant only if still needed for legacy draft restore mapping, or keep restore remap in workspace only).
5. Delete unused `TbInlineForm4bPanel.jsx`.
6. Keep `canOpenDsTbTreatmentCard` for eligibility messaging if still useful; `shouldOpenDsTbTreatmentCard` / `tbCaseNumberRequired` may become unused — remove if orphaned or keep as no-ops with tests updated.

- [x] **Step 3: Run frontend focused tests + build**

```bash
npm test -- --test-name-pattern="consultationSteps|tbRegistration|tbAssessment|rhuTbCaseManagement|RhuDiagnosisCarePlan"
npm run build
```

Expected: PASS / build succeeds.

---

### Task 3: Diff review and verification report

- [x] Review `git diff` excluding unrelated `formDraftCoordinator*` changes.
- [x] Confirm independent Details registration files untouched except accidental.
- [x] Produce implementation report (files, removals, preserved path, tests, risks).

**Note:** Do not commit. User forbade commit/push/merge.
