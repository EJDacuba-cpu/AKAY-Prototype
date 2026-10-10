# AKAY Current State / Handoff

**Status date:** 2026-10-10

## Current Phase

**Documentation foundation before repository cleanup/audit**

The immediate goal is to establish a small canonical knowledge base for Claude Code before allowing broad cleanup or refactoring.

---

## Completed

- Confirmed that an existing AKAY system is already implemented.
- Confirmed that the repository contains separate `frontend/` and `backend/` areas.
- Confirmed that the existing `docs/` folder contains many older Markdown/SQL/project artifacts that must not automatically be treated as current.
- Established a plan-first workflow for Claude Code.
- Established interview/transcript evidence as the primary source for real BHC/RHU workflow.
- Established the current repository as the primary source for technical implementation.
- Limited use of the capstone paper to project context, scope/limitations, and Agile/methodology unless later approved otherwise.
- Created the first canonical AI-facing documentation set under `docs/ai/`.
- Clinical boundary (2026-10-09, spec: `docs/superpowers/specs/2026-10-05-clinical-boundary-condition-confirmation-design.md`): BHC records Health Concerns, each with an optional Recheck / Follow-up / Refer, and never writes a condition. Only RHU staff (`conditions.confirm`) confirm a condition or set its status, through the Confirm Conditions block on referral feedback and on RHU health records. Conditions live in `patient_conditions` with their history in `patient_condition_events`. BHC formal monitoring starts only from an RHU-confirmed Active/Controlled condition (RHU "Recommend BHC monitoring"). Data from before the change is shown as "Unverified — recorded from BHC consultation" or "Legacy BHC Monitoring".
- Consultation & Care Plan workflow revision (2026-10-10, spec: `docs/superpowers/specs/2026-10-09-consultation-care-plan-workflow-revision-design.md`, branch `care-plan-workflow-revision`, Tasks 0-9 implemented and reviewed, NOT merged, NOT deployed). Each Health Concern now has one explicit Care Plan Action (No Further BHC Action / Schedule BHC Follow-up / Refer to RHU, optionally with a BHC follow-up). Recheck is retired for new input. Referral and BHC follow-up are shared sections with explicit acknowledgments. Start Consultation has an explicit Visit type and optional scheduled follow-ups. Legacy BHC monitoring is "Legacy — Pending RHU Verification": not continuable, reviewed by RHU (Confirm / Correct / Discontinue). Release 2 (reject `recheck`, require a BHC action) is deliberately not done; see the handoff below. Per-concern actions in the 2026-10-05 spec are superseded.

---

## Next Recommended Task

### Repository Audit — READ ONLY

Claude Code should inspect the local repository and produce an audit report **without editing or deleting anything**.

The first audit should cover:

1. repository/folder structure;
2. frontend architecture;
3. backend architecture;
4. database/migrations;
5. API/data flow;
6. authentication and authorization structure;
7. tests/build/lint status;
8. existing documentation inventory;
9. temporary/generated artifacts;
10. likely dead/duplicate/outdated code;
11. obvious configuration risks;
12. areas that require deeper security review.

The report should distinguish:

- confirmed current;
- likely current;
- historical;
- generated/temporary;
- duplicate;
- suspicious;
- unknown.

No cleanup should happen until the developer approves a cleanup batch.

---

## Planned Workstreams After Audit

These are directional, not yet approved implementation tasks.

### 1. Documentation and repository cleanup

Goal:
- remove or archive approved obsolete artifacts;
- reduce conflicting documentation;
- identify dead/duplicate code;
- create a clean technical baseline.

### 2. UI consistency

Goal:
- define a minimalist AKAY design system first;
- standardize borders, radius, spacing, typography, cards, forms, tables, buttons, modal patterns, and statuses;
- then apply shared components consistently.

Do not redesign screens independently before the design system is approved.

### 3. Backend/data-flow cleanup

Goal:
- understand React -> API -> Laravel -> database flow;
- simplify unnecessary complexity;
- remove approved dead/duplicate paths;
- improve validation/error handling;
- make important code understandable to the developer.

### 4. Security/privacy review

Goal:
- authentication/session/token behavior;
- authorization/RBAC;
- facility isolation;
- patient-data visibility;
- API permissions;
- validation;
- CORS/CSRF/security headers;
- secrets/configuration;
- auditability;
- sensitive-response handling.

Security changes must be threat/requirement driven, not "add middleware until it looks secure."

### 5. Stabilization and testing

Goal:
- critical workflow tests;
- regression checks;
- build/lint cleanup;
- final documentation synchronization;
- controlled feature freeze before defense/deployment.

---

## Current Non-Negotiable Working Rule

For implementation tasks:

**Inspect -> Explain -> Plan -> Developer Approval -> Edit -> Test -> Document**

Do not skip the approval gate.

---

## Session Handoff Template

At the end of a substantial Claude Code session, update this section.

### Last task
Consultation & Care Plan workflow revision (spec: `docs/superpowers/specs/2026-10-09-consultation-care-plan-workflow-revision-design.md`; plan: `docs/superpowers/plans/2026-10-10-consultation-care-plan-workflow-revision.md`). Tasks 0-9 plus this documentation task are done on branch `care-plan-workflow-revision` (commits `f2504e1..306bee6`, not merged, not deployed). Task 11 (release 2) is NOT done: it is gated, see Next action. Before that: Care Plan & Next Steps (2026-09-30), whose Supabase migrations are still pending (see Open risks).

### Changes made
- Final decisions H1-H7 (approved 2026-10-10; spec section H):
  - **H1 recheck:** one transition release accepts a legacy `recheck` POST as Schedule BHC Follow-up (the "Recheck: ..." reason prefix is still written). The next release (release 2) rejects it with a 422. Stored `recheck` stays readable and **permanently** counts as follow-up-keeping, because the background re-sync (`FollowUpTaskSyncService::syncEligibleRecordsForUser`) re-reads historical records and would otherwise cancel their tasks.
  - **H2 modal:** optionally lists pending Health Concern Follow-ups, nothing preselected from the header. Record Visit preselects its task. Opening never completes a task; only a successful save does.
  - **H3 legacy monitoring:** "Legacy — Pending RHU Verification". Excluded from Existing Monitoring selection in the frontend and on the server (`ConditionMonitoringService::lockContinued` returns 422). Reconciled only by an authorized RHU review: Confirm, Correct or Discontinue. General Consultation and referral are never blocked by a legacy row. Each RHU reconciliation is permission-checked and audit-logged.
  - **H4 explicit action:** "No Further BHC Action" is stored as the existing value `none`. Every `none`, old or new, is displayed as "No Further BHC Action". Stored values are unchanged.
  - **H5 refer + BHC follow-up:** Refer to RHU stays primary with no automatic BHC follow-up. A referred concern can explicitly add one through `diagnoses[].bhcFollowUp: true` (existing single follow-up). No migration: `health_records.diagnoses` is a JSON array cast.
  - **H6 reason:** Follow-up Reason is required on the frontend and on Laravel when a concern schedules a BHC follow-up (`follow_up`, or `refer` + `bhcFollowUp`). New saves only. Service-visit follow-ups are exempt. Historical records are untouched.
  - **H7 one referral and one follow-up per consultation:** sharing needs the worker's explicit confirmation that the concerns are compatible. The referral acknowledgment (`care_plan.shared_referral_acknowledged`, required when a referral covers 2 or more items) is **server-enforced** (422) and recorded through `AuditLogger` (`audit_logs.description`); no new column. It is not proof of compatibility. The shared follow-up date acknowledgment is frontend-required only. If the worker does not confirm, submission is blocked with the external-escalation message and nothing entered is cleared.
- Backend (release 1, no migration): `CarePlan.php`, `HealthRecordRequest`, `HealthRecordController`, `ConditionMonitoringService` (legacy rows cannot be continued), new `LegacyMonitoringReview` service. `FeedbackRequest` / `FeedbackController` and the RHU record path accept `legacy_monitoring_discontinuations: [{monitoring_id, reason}]` (RHU only; same patient, active, legacy; applied in the same transaction, before confirmations). The reason is capped at 488 characters because `stop_reason` stores "RHU review: " plus the reason in 500. Drafts keep `bhcFollowUp` in the payload schema.
- Frontend (release 1, `52f25b0..306bee6`):
  - Care Plan: explicit concern action with no default, the refer + BHC follow-up checkbox, "Covers:" lines, the two shared sections (BHC Follow-up Details, RHU Referral Details) and the acknowledgment checkboxes with the blocked state.
  - A follow-up visit line with Remove link; Review shows "Completes follow-up FU-x".
  - Start Consultation: a Visit type radio and an optional Scheduled follow-ups list; legacy rows read-only.
  - Profile and workspace: legacy rows shown as Pending RHU Verification.
  - RHU Confirm Conditions: Confirm / Correct / Discontinue per legacy row.
  - Draft restore maps `recheck` to `follow_up` with the reason prefilled; `null` stays unselected.
- The 2026-10-05 clinical-boundary spec has a one-line note that its per-concern actions (Recheck / Follow-up / Refer) are superseded by the 2026-10-09 spec.
- Unsupported workflows (by design; AKAY does not model them):
  - Different receiving facilities or priorities for concerns in one consultation.
  - Different BHC follow-up dates for concerns in one consultation.
  - A BHC cannot stop a legacy monitoring: only an RHU review ends it. There is no standalone BHC "stop monitoring" action outside a consultation.
  - Linking a legacy monitoring to a condition with a different identity: Correct discontinues it and starts fresh (history kept) rather than relinking.
- Still marked **[Validate with RHU/MHO]**:
  - Whether "recheck" locally means a same-visit repeat measurement (vital signs), not a return visit.
  - When a referred concern should also have a BHC return (H5 is opt-in, never automatic).
  - The wording of the H7 escalation guidance and the referral priority labels.
  - That RHU staff are the right reviewers of legacy monitoring, and whether Discontinue needs a reason list.
- The workflow examples in the spec illustrate how AKAY records steps. They are not DOH mandates and AKAY makes no clinical decisions.

### Tests/checks run
- Frontend node tests: 491 at baseline (`bb9c771`), 497 after Task 4, 498 after Task 5, 507 after Task 6, 515 after Task 7, 521 after Task 8, 532 after Task 9. ESLint: 0 errors and the 1 pre-existing warning (`exhaustive-deps`, `pages/rhu/RHUAddHealthRecords.jsx`). The vite build passes.
- Backend: `php -d memory_limit=2G vendor/bin/phpunit`. Baseline 673 tests, 198 failing/erroring names (pre-existing). Task 1: 682 tests, 186 failing names. Task 2: 687 tests, 186 failing names. Task 3: 696 tests, 186 failing names. Each backend task had 0 new failing names. 12 baseline names stopped failing; this was not investigated.
- Backend focused runs: Task 1 52/52; Task 2 58/58; Task 3 15/15 (`LegacyMonitoringReviewTest` + `RhuConditionConfirmationTest`).
- `php artisan test` runs out of memory at the 128M default because it spawns a child process. Use phpunit directly with the memory limit above.
- Not run: any browser pass against the real app. No BHC or RHU login was available. UI was verified only in a throwaway Vite harness with stubbed data, and `audit_logs` rows only by PHPUnit.

### Deploy order
1. Run the migrations still pending from the earlier feature on Supabase BEFORE deploying new backend code: `2026_09_30_000001_drop_care_pathway_tables`, then `2026_09_30_000002_create_condition_monitoring_tables`, then `2026_09_30_000003_allow_shared_follow_up_fulfilment`. This revision adds no migration.
2. Backend release 1 BEFORE the frontend: `f04e9f3`, `ab6a9da`, `415352a`, `dde26ef`. It still accepts `recheck` and `null` POSTs. An old open frontend tab that ticks a legacy monitoring gets a 422 after this deploy until the page is reloaded (accepted).
3. Frontend release 1: `52f25b0..306bee6`.
4. Release-2 gate (checklist under Next action), one full deployed release cycle later. Release 2 is a small backend-only change.

### Merge gate: staging smoke test
The `store()`-seam test classes (`HealthRecordIdempotencyTest`, `HealthRecordDraftFinalizationTest`, `FollowUpConcurrencyTest`, `ReferralSubmissionGateTest`, much of `FacilityIsolationSecurityTest`) are among the pre-existing backend failures, so they give no regression coverage. Before merging, smoke-test on staging:
- The manual QA list under Open risks (in a browser, with real BHC and RHU logins).
- An RHU health-record save (no care-plan actions) still succeeds.
- From the earlier feature: one consultation continuing two follow-ups and one monitoring; re-diagnose a continued Hypertension as No Ongoing Tracking (stop reason required); resume an old TB-program draft; a referral on a service visit (e.g. EPI with a next-dose date) keeps its follow-up.

### Open risks
- **Not exercised end-to-end.** No BHC/RHU login was available; the new UI was seen only in a stubbed Vite harness, and `audit_logs` writes were verified only by PHPUnit. Manual QA needed, at 1366x768:
  - Patients A, B, C and D (spec section C; plan Task 8 Step 5), including starting Patient B from the header with the follow-up unticked and ticked;
  - mixed actions (wound follow-up + cough refer: one task, one referral);
  - the H7 blocked state (acknowledgment unticked, nothing cleared);
  - a flagged referral (refer + "Also schedule a BHC follow-up");
  - RHU legacy review: Confirm, Correct and Discontinue, then check the `audit_logs` rows (reason, condition, monitoring id, actor, timestamp, previous/new status).
  The earlier feature's UI (Care Plan, Monitoring Details, Start Consultation modal, Barangay Health Services panel, FBS, Surveillance) also has no browser pass.
- Release 2 is pending, so until then the server still accepts `recheck` and `null` actions from BHC (transition behavior).
- Deferred review minors are in the branch's SDD ledger (`.superpowers/sdd/2026-10-10-consultation-care-plan-workflow-revision/progress.md`). Most user-visible:
  - Task 9: Confirm with a non-Active/Controlled status silently does not link the legacy monitoring (the old hint was removed).
  - Task 9: the Confirm Conditions intro sentence about "Set on patient's record" is misleading for legacy rows.
  - Task 8: the dropped follow-up message names the FU-id only.
  - Task 7: a stale legacy name can remain after unlinking one of several follow-ups.
- Migrations NOT yet run on Supabase: `2026_09_30_000001_drop_care_pathway_tables`, `2026_09_30_000002_create_condition_monitoring_tables`, and `2026_09_30_000003_allow_shared_follow_up_fulfilment` (an index swap). The app expects all three.
- The admin Health Records list (stored function `akay_health_record_list`) filters TB by category only, so it does not match the by-data TB detection used elsewhere.
- The "Start Postpartum Follow-up" CTA on Care & Programs (`focus=deliveryDate`) leads to a consultation that cannot record a delivery date. Product decision needed: restore the delivery date on the Maternal step, or retire the CTA.
- Old in-progress drafts that had the HFMD surveillance tick lose it; the worker re-ticks Include in Surveillance.
- The pre-existing backend test failures remain: 198 failing/erroring names at this work's baseline (the previous handoff recorded 194; the baseline here includes errors and a larger suite). They are mostly 403 / permission setup in tests and hide regressions in `store()`. The name list is `baseline-failures.txt` in the branch's SDD folder.
- `docs/ai/PROGRAMS-MONITORING-AUDIT.md`, referenced by earlier handoffs, does not exist in the repo.
- Repository has not yet been fully audited.
- Existing `docs/` files may conflict with current implementation.
- Security controls are present but have not yet received an end-to-end audit.

### Next action
1. Manual QA (list under Open risks) and the staging smoke test above, then decide the merge. Decide the open items (postpartum CTA, admin TB list). Run the pending Supabase migrations and deploy backend release 1, then frontend release 1 (deploy order above).
2. **Release 2 (plan Task 11), only after this gate is met. Record each result here:**
   - (a) Frontend release 1 has been deployed for one full cycle.
   - (b) A database check returns 0 rows for active drafts holding `recheck`. Run it once from a tinker session: decrypt each active `health_record_drafts` payload through `HealthRecordDraftService` and count diagnoses with `carePlan === 'recheck'`.
   - (c) Server logs and the audit log show no `recheck` POST since the frontend deploy. If no log exists, state that.
   - (d) An RHU health-record save in staging passes.

   Then implement: `CarePlan::TRANSITION_ACCEPTED = []`; a closure rule on POST that rejects `carePlan === 'recheck'` with 422 "Recheck is no longer offered. Choose Schedule BHC Follow-up and describe the purpose in Follow-up Reason."; for BHC users, a missing `diagnoses.*.carePlan` returns 422 "Choose a care plan action for this health concern." (scoped to BHC; `HealthRecordRequest` is shared with RHU records, which carry no care-plan action). Remove `test_transition_recheck_post_saves_as_follow_up_with_prefix`; keep `test_recheck_still_keeps_a_bhc_follow_up_for_stored_records` and add `test_resync_keeps_a_historical_referred_recheck_task`. Commit `feat(care-plan): release 2 rejects recheck and requires a BHC concern action`; deploy the backend only.
3. Then investigate the pre-existing backend test failures.
