# Service Manage to BHC Implementation Plan

> **For agentic workers:** Execute task-by-task. **No git commits/pushes** (task constraint). Steps use checkbox syntax for tracking.

**Goal:** Add RHU Selected Health Services “Manage to BHC” Monitoring Requests for Maternal / EPI / Family Planning / Nutrition, reuse existing handoff lifecycle, remove Decline for all handoffs, keep draft compatibility and condition-based Manage to BHC unchanged.

**Architecture:** Extend `monitoring_handoff_requests` with nullable `patient_condition_id`, `handoff_kind`, `service_key`. RHU persists per-service handoffs in `care_plan.service_handoffs` / draft `carePlan.serviceHandoffs`. BHC Accept-only; Start Consultation seeds `selectedPrograms`; `monitoring_active` on first matching BHC program consult finalize.

**Tech Stack:** Laravel (PHP), React (JSX), existing MonitoringHandoffService, NextStepsSection, draft payload service.

## Global Constraints

- Label exactly: **Manage to BHC** (no “Transfer” / service-suffixed labels)
- No fake PatientConditions / programs-as-diseases
- No parallel handoff system
- Soft-gate eligibility; require receiving BHC + recommendation
- Accept only; remove Decline for all monitoring
- Preserve legacy drafts without new fields
- No commits, pushes, merges, deployments, or production DB ops
- Coordinate with uncommitted service-prescription WIP on same files

---

### Task 1: Frontend service next-action + handoff state helpers

**Files:**
- Modify: `frontend/src/utils/serviceNextActions.js`
- Modify: `frontend/src/utils/serviceNextActions.test.js`

- [ ] Add `manage_to_bhc: "Manage to BHC"` to `SERVICE_NEXT_ACTIONS`
- [ ] Add helpers: `serviceHandoff(program, handoffs)`, `applyServiceHandoffAction`, `pruneServiceHandoffs`, `restoreServiceHandoffs`, `serviceNextAction` includes handoffs before schedule/referral
- [ ] Unit tests for all four programs, prune on deselect, switch away clears stale handoff

### Task 2: NextStepsSection RHU Manage to BHC UI

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/NextStepsSection.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx` (pass catchmentBhcs, handoffs, handlers)

- [ ] On RHU (`hideReferToRhu`): options = none, schedule, manage_to_bhc
- [ ] On BHC: keep none, schedule, refer_to_rhu (no manage_to_bhc)
- [ ] Conditional receiving BHC + recommendation fields (reuse diagnosis patterns)

### Task 3: RHU workspace draft/finalize/validation

**Files:**
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Related utils validation if needed

- [ ] State `serviceHandoffs`; wire handlers; draft + finalize payload `carePlan.serviceHandoffs` / `care_plan.service_handoffs`
- [ ] Client validation errors; prune on program deselect
- [ ] Restore legacy drafts safely

### Task 4: DB migration + model

**Files:**
- Create: `backend/database/migrations/2026_11_14_000001_add_service_handoff_columns.php`
- Modify: `backend/app/Models/MonitoringHandoffRequest.php`

- [ ] Nullable `patient_condition_id`; add `handoff_kind` default `condition`; nullable `service_key`
- [ ] Check constraint / app validation: condition rows require condition id; service rows require service_key and null condition id

### Task 5: Backend validation + draft allowlist + create handoffs

**Files:**
- Modify: `HealthRecordRequest.php`, `HealthRecordDraftPayloadService.php`, `MonitoringHandoffService.php`, `HealthRecordController.php`, `ReferralWorkflowService.php` as needed

- [ ] Validate `care_plan.service_handoffs`
- [ ] Draft SCHEMA + rules (max 4, include Nutrition)
- [ ] Create service handoffs on finalize; idempotent; referral return completion
- [ ] Fix draft `serviceReferrals` Nutrition gap while touching allowlist

### Task 6: Remove Decline (all monitoring)

**Files:**
- Backend: controller method/route; service `decline` unused or 410
- Frontend: `MonitoringHandoffReview.jsx`, `monitoringHandoffService.js`
- Tests: update MonitoringHandoffTest decline cases

### Task 7: BHC present + Start Consultation + monitoring_active

**Files:**
- `MonitoringHandoffController::present`, `MonitoringHandoffReview.jsx`, `startConsultation.js`, `ConsultationWorkspace.jsx` / route resolution, `MonitoringHandoffService` mark service active on BHC finalize

### Task 8: Focused tests + local verification

- Backend feature/unit tests for four services, walk-in vs referral return, auth, duplicates, multi-service, accept-only, draft restore, regression condition Manage to BHC
- Frontend unit tests for serviceNextActions / startRoute / review UI where practical
- Run relevant test suites + frontend production build
- Report pass/fail; no commit
