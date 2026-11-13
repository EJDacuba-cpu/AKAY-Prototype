# Remove Laboratory File Attachments Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Skip git commit steps (user constraint). Steps use checkbox syntax.

**Goal:** Retire laboratory file attachment upload/list/view/delete from active AKAY paths while preserving structured laboratory records, sharing, drafts, addenda, and RHU reporting fields.

**Architecture:** Strip attachment UI and APIs; change handoff selection to `{reference, version}` with `attachment_ids: []` on new shares; Option A present() never returns files; keep table/model/files and draft sanitization compatibility.

**Tech Stack:** React (Vite), Laravel/PHP, PHPUnit, Vitest/Jest as configured in repo.

## Global Constraints

- No commits, pushes, merges, deployments
- No destructive DB/storage ops; no drop of `laboratory_attachments`
- Preserve `reportIn` / `reportAs` / `includeInSurveillance`
- Option A for historical shares: never load/return/display attachment metadata or files

---

### Task 1: Frontend attachment UI removal

**Files:**
- Modify: `frontend/src/components/features/health-records/LaboratoryEvidence.jsx`
- Modify: `frontend/src/components/features/health-records/LaboratoryRecordPanel.jsx`
- Modify: `frontend/src/components/features/health-records/LaboratoryHandoffSharingSection.jsx` (if attachment-only)
- Modify: `frontend/src/components/features/patients/profile/PatientLaboratorySection.jsx` (if attachment-only)
- Modify: `frontend/src/services/laboratoryService.js`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modify: `frontend/src/utils/diagnoses.js`
- Modify: `frontend/src/utils/rhuCarePlan.js` (only if attachment-specific)

- [ ] Remove `LaboratoryAttachments` and attachment imports/UI
- [ ] `Remove Test` only filters the test list (no attachment fetch/delete)
- [ ] Evidence picker uses `{ reference, version }`; confirmation copy without attachments
- [ ] Evidence list never renders attachments
- [ ] Drop attachment service helpers
- [ ] Drop RHU `useQueries`, attachment busy gates, `onAttachmentsChange`
- [ ] Diagnoses payload omits `attachmentIds`; legacy drafts strip them and clear uncertain confirmation

### Task 2: Backend handoff + evidence APIs

**Files:**
- Modify: `backend/app/Services/HandoffLaboratoryEvidence.php`
- Modify: `backend/app/Http/Controllers/Api/LaboratoryEvidenceController.php`
- Modify: `backend/app/Services/LaboratoryEvidenceService.php`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`

- [ ] Share without attachment-ID matching; store `attachment_ids: []`
- [ ] `present()` returns structured fields only (no attachments key populated from DB files)
- [ ] Validation accepts `array:reference,version` (ignore/reject attachmentIds on new writes as appropriate)
- [ ] Draft schema still accepts legacy `attachmentIds` for Resume; normalize away for active contract
- [ ] Stop binding uploads_available / attachment lists into active evidence responses where attachment-only

### Task 3: Retire attachment endpoints and prune command

**Files:**
- Modify: `backend/routes/api.php`
- Modify: `backend/routes/console.php`
- Modify: `backend/app/Services/FormDraftRecoveryKeyService.php` (audit attachment cleanup)
- Delete only when unreferenced: `LaboratoryAttachmentController.php`, `LaboratoryAttachmentStorage.php`
- Keep: `LaboratoryAttachment` model + migrations + historical rows

- [ ] Unregister attachment routes
- [ ] Remove prune command + schedule
- [ ] Verify no scheduled reference to deleted classes
- [ ] Leave filesystem disk config if used elsewhere; remove laboratory-attachment-only config only if unused

### Task 4: Tests + verification

**Files:**
- Modify: `backend/tests/Feature/UniversalLaboratoryTest.php`
- Modify: `backend/tests/Unit/Services/LaboratoryStorageConfigurationTest.php` (retire or retarget)
- Modify: `frontend/src/components/features/health-records/LaboratoryEvidence.test.js`
- Modify: `frontend/src/utils/laboratoryTests.test.js` as needed

- [ ] Update attachment tests to expect retired endpoints / structured-only sharing
- [ ] Run focused backend + frontend tests and frontend build
- [ ] Report actual pass/fail counts (no commit)
