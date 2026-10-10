# AKAY Current State / Handoff

**Status date:** 2026-10-11

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
- Consultation & Care Plan workflow revision (2026-10-10, spec: `docs/superpowers/specs/2026-10-09-consultation-care-plan-workflow-revision-design.md`, branch `care-plan-workflow-revision`, Tasks 0-9 implemented and reviewed, NOT merged, NOT deployed). Each Health Concern now has one explicit Care Plan Action (No Further BHC Action / Schedule BHC Follow-up / Refer to RHU, optionally with a BHC follow-up). Recheck is retired for new input. Referral and BHC follow-up are shared sections with explicit acknowledgments. Start Consultation has an explicit Visit type and optional scheduled follow-ups. Legacy BHC monitoring is "Legacy — Pending RHU Verification": not continuable, reviewed by RHU (Confirm / Correct / Discontinue). Per-concern actions in the 2026-10-05 spec are superseded. **Its per-concern Care Plan Action UI (H4, H5, the concern part of H7) and its release 2 (reject `recheck`, require a BHC action) are superseded by the 2026-10-10 simplification below;** the rest of that spec stays (H1 transition reads, H2, H3 legacy monitoring review, H6, the visit type). Release 2 is replaced by the B7 retirement checklist.
- BHC General Consultation simplification (2026-10-10 to 2026-10-11, spec: `docs/superpowers/specs/2026-10-10-bhc-general-consultation-simplification-design.md`, branch `bhc-general-consultation-simplification`, Tasks 0-12 implemented and reviewed, NOT merged, NOT deployed; Task 13 manual QA and staging checks UNVERIFIED). The BHC consultation is four steps. The worker records Reporting entries (a problem name plus Morbidity / Notifiable / Surveillance) instead of per-concern care-plan actions. Schedule BHC Follow-up and Refer to RHU are two independent visit-level checkboxes. No migration. The two branches merge together.

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
BHC General Consultation simplification ("v2"). Spec: `docs/superpowers/specs/2026-10-10-bhc-general-consultation-simplification-design.md`. Plan: `docs/superpowers/plans/2026-10-10-bhc-general-consultation-simplification.md`. Branch `bhc-general-consultation-simplification`, cut from the unmerged `care-plan-workflow-revision`. Tasks 0-12 are done; Task 13 (this handoff) recorded the manual QA and staging checks as UNVERIFIED. **Not merged, not deployed.**

Commits `76eeeba..HEAD` (`git log --oneline 76eeeba..HEAD`; the handoff commit comes after these):
- Docs and baseline: `3015cd0` plan, `6848879` baseline and pending-migration review, `fa436e9` return dates are suggestions only, `cb79343` and `d2141ab` post-implementation results.
- Tests only: `3dc4829` store()-path test users get real permissions (Task 0.5).
- Backend: `2043d7b` ReportingEntries; `1606718`, `4504148` discriminator and validation; `e6a2d92`, `162b064` v2 save path; `1194b07`, `954c824` draft schema; `1e4dc79` v2 compatibility tests.
- Frontend: `d2447f4` reporting normalizer; `b32d59e`, `ca9ce8d` next-actions helpers; `fefd17e` four-step consultation; `4d796b7` legacy draft conversion; `1916d8f`, `e5471a5` Review & Finalize; `353851c`, `4f3fe79` v2 history views.

### Changes made
- **Developer decisions of 2026-10-10:**
  - **v2 discriminator:** `consultation_workflow: "bhc_general_v2"`, stored as `monitoring_data.consultationWorkflow`. It is rejected with 422 unless the working facility is a BHC (or, with no working facility set, the user's role is bhw: `User::isBhw()`), so RHU saves never use it. A request without it runs today's rules exactly (production `main` frontend, stale tabs, RHU saves).
  - **`reportIn` with mirrors:** each v2 `diagnoses[]` entry is `{id, name, reportIn[]}`, `reportIn` is the source of truth, and the server derives the mirrors `reportAs` and `includeInSurveillance` (a client `reportAs` is ignored). The keys `carePlan`, `bhcFollowUp`, `addToConditions`, `conditionStatus`, `conditionKey` are rejected in v2. The name is stored as typed; `patient_conditions` and `patient_condition_events` are never touched. Central normalizers: `App\Services\ReportingEntries` and `utils/reportingEntries.js`.
  - **Visit-level checkboxes:** Schedule BHC Follow-up (`care_plan.bhc_follow_up`, stored as `monitoring_data.bhcFollowUp`; date always required, reason required unless H6 exempt) and Refer to RHU (`care_plan.refer_to_rhu` plus the existing `referral`). `CarePlan::keepsFollowUpWithReferral` and the re-sync read the stored flag, so ticking both keeps the follow-up. The visit `diagnosis` is empty in v2 and the "BHC Assessment is required" rule is skipped.
  - **Shared-referral acknowledgment:** required (422) when the structural count (refer + distinct referred monitorings) is 2 or more, or when the worker ticks the manual flag `care_plan.referral_multiple_issues` ("This referral covers more than one health issue"). Audit-logged, "Not a clinical compatibility check". Reporting entries never count; nothing is inferred from free text.
  - **Return dates are suggestions only:** an EPI next dose (or FP next appointment) is offered as "Use this date", fills only the date, and shows a non-blocking warning if the date differs. **No auto-tick:** nothing (service, monitoring, re-render) ticks Schedule BHC Follow-up. No new mandatory return rule.
  - **Accepted consequence:** in v2 an EPI next-dose date no longer creates a BHC follow-up task by itself; it does only when the worker ticks Schedule BHC Follow-up. Legacy records and their tasks are unchanged.
  - **Legacy draft conversion:** done once on restore in the frontend (`utils/draftConversion.js`). The result is always v2 and has no `carePlan` or `bhcFollowUp`. Concerns with reporting become `reportIn` entries; other concern names, old Additional Assessment Notes and General Consultation `monitoringNotes` go to `assessment_notes` as read-only "Earlier draft — Health concerns: ...". Referral and follow-up data are restored; the checkboxes start ticked when the old draft held the matching data.
  - **Chief Complaint fallback:** shown as "Chief Complaint: ...", never under a Diagnosis label, and **only for a v2 record with an empty `diagnosis`**. Historical and RHU diagnoses show as stored.
  - **No migration.** Every new key lives in `monitoring_data`, `diagnoses` or the request-only `care_plan`, or uses the existing `assessment_notes` column.
- **Backend:** `ReportingEntries`; `HealthRecordRequest` (BHC-only discriminator, prohibited keys, reportIn rules, next-action and acknowledgment rules); `HealthRecordController` v2 path (skips `normalizeConcernActions`, `applyRecheckReason`, `requireConcernFollowUp`, `resolveConditionEntries`); `CarePlan`; `HealthRecordDraftPayloadService` (v2 draft keys). Server-controlled v2 markers cannot be forged.
- **Frontend:**
  - Four steps: Patient Interview, Physical Examination, Medication, Treatment & Next Steps (plus Monitoring Details only when a continued monitoring needs it), Review & Finalize. The Assessment panel is removed from Physical Examination.
  - Step 3 holds Existing monitoring, Actions Taken / Treatment and medicines, the two Next Actions checkboxes, and Reporting (optional) with "+ Add entry".
  - v2 history views (`HealthRecordClinicalDetails`, `BhcConsultationDetails`, `RHUHealthRecords`, `FollowUpEpisodePanel`, `CreateReferral`) show a Reporting block, then Follow-up and Referral; legacy records are unchanged.
  - Report readers go through `reportingEntries.js`. The Morbidity and Notifiable log column is "Diagnosis / Suspected Case".
- Preserved (spec E): RHU-confirmed conditions and RHU-only status changes, `ConditionMonitoringService` and `lockContinued` (legacy 422), legacy monitoring RHU review and its audit, Start Consultation visit type, referral feedback and closed loop, RHU record save, medicine and inventory integration, service forms, TB Monitoring Details, all historical records.
- Still true from the revision branch (not changed here): H1 transition reads (stored `recheck` stays readable and counts as follow-up-keeping permanently, because the re-sync reads historical records), H2, H3, H6.
- Unsupported by design: different facilities, priorities or follow-up dates within one consultation; a BHC stop-monitoring action outside a consultation. Surveillance has no registry or classification list.

### Tests/checks run
Full detail by name: `docs/ai/test-baseline-2026-10-10.md` (sections "After Task 0.5" and "After implementation (Task 12)").
- **Backend** (`php -d memory_limit=2G vendor/bin/phpunit`, SQLite in memory): 766 tests, 601 passed, 21 skipped, **144 failing names, identical to the post-Task-0.5 baseline** (0 new, 0 changed, none newly passing). The 69 added tests all pass. New classes: `BhcGeneralConsultationV2Test` (51 tests), `ReportingEntriesTest`, plus v2 cases in `HealthRecordDraftPayloadServiceTest`, `CarePlanTest` and `FollowUpEpisodeTest`.
- **Task 0.5 test-setup sweep** (tests only): BHW test users in five `store()`-path classes now get `ActionPermissions::PRESETS['clinical']`, plus obsolete payloads fixed. Failing names went 186 to 144 (42 fixed, no assertion weakened). The 13 names still open are listed in the baseline doc under "Open after Task 0.5".
- **Frontend** (from `frontend/`): `node --test` 603/603 (538 at the branch baseline). ESLint 0 errors and the 1 pre-existing warning (`exhaustive-deps`, `pages/rhu/RHUAddHealthRecords.jsx:791`). `npm run build` passes.
- **Layout (harness only):** the real step-3 sections and Review rendered with stubbed data in headless Edge at 1366x768 and 390x844 (device-metrics override, full-height screenshots). No horizontal scroll, no clipped control, no nested cards. This is not the real page.
- **UNVERIFIED (no authenticated session / no staging):**
  - All 15 manual QA scenarios of spec F4 (1 General Consultation with no service; 2 Maternal only; 3 FP only; 4 Maternal plus symptoms; 5 treatment with no follow-up or referral; 6 follow-up only; 7 referral only; 8 follow-up and referral; 9 Reporting; 10 RHU-confirmed monitoring Continue/Refer/Stop; 11 historical Health Concern records; 12 draft auto-save and resume including a legacy draft; 13 validation and finalize; 14 role permissions; 15 referral feedback and follow-up completion), at 1366x768 and on mobile.
  - The revision branch's open manual-QA list (Patients A-D, mixed actions, the H7 blocked state, flagged referral, RHU legacy review with `audit_logs` rows) and the earlier feature's UI (Care Plan, Monitoring Details, Start Consultation modal, Barangay Health Services panel, FBS, Surveillance).
  - The six staging compatibility checks of G3 (under Deploy order).
  - Rollback evidence: the `care-plan-workflow-revision` backend against a copy of a staging database holding v2 records.
  - Layout and copy the harness did not render: the real workspace page (DashboardLayout sidebar, sticky action bar), the services sidebar at 1366, the stepper step labels, the Chief Complaint helper text, the report column header, and the former Medicines / Supplies Dispensed layout.
  - PostgreSQL behavior of the pending migrations (no disposable PostgreSQL was available).
  - `audit_logs` writes were checked by PHPUnit only.

### Deploy order (spec G2)
1. **Backend first.** It accepts both legacy and v2 payloads. Before the frontend ships, run the compatibility checks on staging (all UNVERIFIED so far):
   - old frontend (`main`) against the new backend with a legacy payload;
   - new frontend against the new backend with a v2 payload;
   - resuming a legacy draft and a v2 draft;
   - an RHU health-record save;
   - the follow-up re-sync over v2 records with follow-up, with referral, and with both;
   - the report readers over v2, legacy and HFMD records.
2. **Frontend** only after those checks pass. Reload open tabs. An old open tab against the new backend breaks until reloaded: ticking a legacy monitoring gets 422, Record Visit on a task linked to a legacy monitoring gets 422, and a save whose referral covers 2 or more items gets 422 on `care_plan.shared_referral_acknowledged`.
3. **The legacy payload path stays** until the B7 criteria below are met and recorded.
4. The old "release 2" plan (revision spec; plan Task 11) is **superseded by B7**. Do not implement it.
5. **Pending Supabase migrations must run BEFORE this backend is deployed.** This branch's backend inherits code from `care-plan-workflow-revision` that expects them: the three `2026_09_30` migrations (`000001`, `000002`, `000003`) plus the four later `2026_10_03` to `2026_10_05` ones listed below. Reason (`docs/ai/pending-migrations-2026-09-30.md`): `000003` swaps the unique index on `follow_up_tasks.fulfilled_by_health_record_id` for a plain index, and the old unique index causes a unique violation when a visit fulfils a second task. This work adds no migration of its own. Whether and when to deploy at all, and to run the migrations, is the developer's decision.
   - PostgreSQL testing is UNVERIFIED (SQLite only).
   - Roll back with `--step=7`, not `--step=3`. Four later migrations were missing from the old pending list: `2026_10_03_000001_add_background_changes_to_health_records`, `2026_10_04_000001_add_father_link_and_parent_birthdates_to_patients_table`, `2026_10_05_000001_create_patient_conditions_tables`, `2026_10_05_000002_grant_conditions_confirm_to_rhu_staff`. A read-only `migrate:status` against Supabase settles which are pending.

### Rollback and recovery (spec G3)
- **Frontend rollback** (redeploy the previous build) is safe at any time. v2 records stay readable through the backend, and the old frontend sends legacy payloads the backend still accepts.
- **Backend rollback:**
  - No v2 record yet (check `monitoring_data->consultationWorkflow`): a tested rollback is acceptable.
  - **v2 records exist: UNSAFE. Roll forward or hotfix instead; never restore a build without v2 support.** Known risks of the old code:
    - Silent data loss: the old `CarePlan::keepsFollowUpWithReferral` does not read `monitoring_data.bhcFollowUp`, so the re-sync (`FollowUpTaskSyncService::syncEligibleRecordsForUser`) would cancel the follow-up task of every v2 record that has both a follow-up and a referral.
    - Reinterpreted clinical information: old history views show `diagnoses[]` as Health Concerns, so v2 reporting entries would appear as concerns.
  - Rollback evidence: **UNVERIFIED (no staging).** The claim comes from reading the code, not from running the old backend over persisted v2 records. Backend rollback stays documented as unsafe until that is run and recorded.
- **Recovery if the v2 backend has a defect after v2 records exist:**
  1. Roll back the frontend only, so no new v2 records are created.
  2. Fix the backend and roll it forward.
  3. If the defect is in the re-sync, disable the background re-sync before the fix ships, then verify each v2 record's follow-up task and referral against its stored `monitoring_data` and `referral_data`.
  4. Make every manual correction through the application so it is audit-logged. Nothing is discarded or reinterpreted directly in the database.
- **Blockers:** any failed compatibility check, or any regression by name against the baseline.

### Legacy retirement checklist (spec B7)
After all of these are met and recorded here, a BHC POST without `consultation_workflow` returns 422. RHU saves are never affected. Stored `recheck`, `none` and per-concern values stay readable **permanently** (the re-sync reads historical records).
- (a) The v2 frontend has run for one full release cycle. Result: _(not recorded)_
- (b) Logs show no BHC POST without `consultation_workflow` since then (or state that no log exists). Result: _(not recorded)_
- (c) A draft check shows no unconverted active drafts. Run once from a tinker session: decrypt each active `health_record_drafts` payload through `HealthRecordDraftService` and count payloads without `consultationWorkflow`. Result: _(not recorded)_
- An RHU health-record save in staging passes (carried over from the old release-2 gate (d)). Result: _(not recorded)_

### Merge gate
Both branches merge together, only after the QA and staging results above are recorded. The `store()`-seam test classes (`HealthRecordIdempotencyTest`, `HealthRecordDraftFinalizationTest`, `FollowUpConcurrencyTest`, `ReferralSubmissionGateTest`, `FacilityIsolationSecurityTest`) are mostly fixed by Task 0.5 but still have failing names, so they give limited regression coverage. From the earlier feature, also smoke-test on staging: one consultation continuing two follow-ups and one monitoring; re-diagnose a continued Hypertension as No Ongoing Tracking (stop reason required); resume an old TB-program draft; a referral on a service visit keeps its follow-up.

### Open risks
- **All manual QA and staging checks are UNVERIFIED** (list under Tests/checks run). No BHC or RHU login and no staging were available. Nothing here is claimed as passed in the real app.
- **Possible facility-isolation bug (pre-existing, found in Task 0.5, NOT fixed in this branch).** A BHW can record another BHC's medicine as a planned (not given) item. `dispensed_medicines.*.medicine_id` is validated only with `required|integer|exists:medicines,id` (`backend/app/Http/Requests/HealthRecordRequest.php:425`), and `backend/app/Http/Controllers/Api/HealthRecordController.php:220` (`$data['items_planned'] = $dispensedMedicines;`) stores it in `items_planned` with no ownership check. There is no stock effect, and only the id and quantity are stored. `FacilityIsolationSecurityTest::test_bhw_cannot_dispense_other_bhc_medicine_during_record_creation` fails because of it. Developer decision needed.
- **Legacy `assessment_notes` have never been shown in any history view** (pre-existing). Spec D wrongly says they are. Developer decision needed on whether to show them.
- **144 baseline backend test failures remain** (stale 403 presets and payloads, user-admin payloads, draft lifecycle drift, allow-list drift). They hide regressions in `store()`. The 13 "Open after Task 0.5" items need human decisions (stock-assertion rewrites, the embedded-referral hold, the draft editor lease, the planned-item gap above); see the baseline doc.
- **Deferred-minor items** will be listed in the final branch review report; its triage decides them. The revision branch's deferred minors are in `.superpowers/sdd/2026-10-10-consultation-care-plan-workflow-revision/progress.md`.
- Cosmetic, seen in the harness: at 390 px the required asterisk of "Reported Health Problem / Suspected Case" wraps to its own line (`ReportingEntriesField.jsx`, row at line 59).
- Migrations NOT yet run on Supabase: `2026_09_30_000001`, `000002`, `000003`, and possibly the four later ones (Deploy order, item 5).
- The admin Health Records list (stored function `akay_health_record_list`) filters TB by category only, so it does not match the by-data TB detection used elsewhere.
- The "Start Postpartum Follow-up" CTA on Care & Programs (`focus=deliveryDate`) leads to a consultation that cannot record a delivery date. Product decision needed: restore the delivery date on the Maternal step, or retire the CTA.
- `docs/ai/PROGRAMS-MONITORING-AUDIT.md`, referenced by earlier handoffs, does not exist in the repo.
- Repository has not yet been fully audited. Existing `docs/` files may conflict with current implementation. Security controls are present but have not yet received an end-to-end audit.

### Remaining questions **[Validate with RHU/MHO]**
- The wording of the referral flag "This referral covers more than one health issue", plus the escalation guidance and referral priority labels.
- Whether a Maternal or FP visit should ever require a return. Today none do, and no new mandatory return rule was added.
- Whether EPI next-dose dates should create follow-up tasks automatically (v2: only when the worker ticks the box).
- The Signs & Symptoms rule for the Daily Log (spec H): today the first non-empty of HPI, signs/symptoms, assessment findings, physical exam, Chief Complaint. Combining them is a report-rule change to decide separately.
- Whether "recheck" locally means a same-visit repeat measurement (vital signs), not a return visit.
- Whether RHU staff are the right reviewers of legacy monitoring, and whether Discontinue needs a reason list.

The workflow examples in the specs illustrate how AKAY records steps. They are not DOH mandates and AKAY makes no clinical decisions.

### Next action
1. Developer review of this branch and the final branch review report (including its deferred-minor triage).
2. Manual QA with dedicated BHC and RHU test accounts and synthetic patients: the 15 F4 scenarios at 1366x768 and mobile, plus the revision branch's QA list. Record each result here.
3. Staging compatibility checks and the rollback evidence run (G3). Record the results here.
4. Decide the open items: the planned-item facility-isolation gap, legacy `assessment_notes` display, postpartum CTA, admin TB list, and the pending Supabase migrations.
5. Merge decision for `care-plan-workflow-revision` and `bhc-general-consultation-simplification` together.
6. Then deploy in the order above (backend, staging checks, frontend), and later fill the B7 checklist.
7. Then investigate the remaining pre-existing backend test failures.

### Previous session (2026-10-09 to 2026-10-10): Consultation & Care Plan workflow revision
Spec `docs/superpowers/specs/2026-10-09-consultation-care-plan-workflow-revision-design.md`, plan `docs/superpowers/plans/2026-10-10-consultation-care-plan-workflow-revision.md`. Branch `care-plan-workflow-revision`, Tasks 0-9 plus a documentation task (Tasks 1-9: `f04e9f3..306bee6`), not merged, not deployed. Its per-concern Care Plan Action UI and its release 2 (Task 11, never done) are superseded by the simplification above.
- Final decisions H1-H7 (spec section H):
  - H1 recheck: one transition release accepts a legacy `recheck` POST as Schedule BHC Follow-up; stored `recheck` stays readable and counts as follow-up-keeping permanently.
  - H2 modal: optionally lists pending Health Concern Follow-ups; opening never completes a task, only a successful save does.
  - H3 legacy monitoring: "Legacy — Pending RHU Verification", not continuable (`lockContinued` returns 422), reconciled only by an RHU review (Confirm / Correct / Discontinue), permission-checked and audit-logged. `legacy_monitoring_discontinuations` on the feedback and RHU record paths (reason capped at 488 characters).
  - H4 to H7 (explicit per-concern action, refer + BHC follow-up, follow-up reason, one referral and one follow-up per consultation with the server-enforced shared-referral acknowledgment): the concern-level UI is superseded; the H6 reason rule and the audited acknowledgment carry into v2.
- No migration. Backend: `CarePlan.php`, `HealthRecordRequest`, `HealthRecordController`, `ConditionMonitoringService`, new `LegacyMonitoringReview`. Frontend `52f25b0..306bee6`: Start Consultation Visit type and Scheduled follow-ups list, RHU Confirm Conditions with legacy review, legacy rows shown as Pending RHU Verification.
- Tests then: frontend 491 at baseline, 532 after Task 9; backend 673 tests with 198 failing names at baseline, 186 after Task 1 onward (0 new failing names per task). Not run: any browser pass against the real app.
- Its release-2 gate is replaced by the B7 checklist above. Its old-tab behavior notes and merge-gate smoke tests are carried into Deploy order and Merge gate.

### Earlier session (2026-09-30 to 2026-10-04)
Care Plan & Next Steps (spec `docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md`) and the fix waves after it. Details are in git history and `.superpowers/sdd/2026-09-30-care-plan-next-steps/final-fix-report.md`.
- Monitoring: condition monitoring tables replace the Care Pathway enrollment layer; follow-up tasks can be fulfilled by a shared follow-up. One care-overview read serves Care & Programs, Monitoring Details and the consultation.
- Start Consultation modal and one consultation step flow. TB is no longer a Visit Service and is identified by data (`tbRecords.isTbRecord`).
- Barangay Health Services panel (Maternal Care, Family Planning, EPI as one flat list); per-diagnosis "Include in Surveillance" and a Surveillance Report replace the HFMD registry.
- Optional Fasting Blood Sugar (mg/dL, 0-1000) in Vital Signs, stored in `vital_signs.fbs`, recorded only.
- Fix wave 2026-10-02: a referral on a service visit keeps its next-visit follow-up (`CarePlan::keepsFollowUpWithReferral`); the server rejects Refer without a referral (422 `needs_referral`); the monitoring 409 `CONDITION_MONITORING_CONFLICT` is also recognised on SQLite.
- Care Plan by suspected condition (2026-10-04); stopping a monitoring outside a consultation was not done.
- Tests then: backend 568 tests / 194 failed, frontend 397/397. Not exercised in a browser.
