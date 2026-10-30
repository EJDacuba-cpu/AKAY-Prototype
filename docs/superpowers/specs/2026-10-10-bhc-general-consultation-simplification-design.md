# BHC General Consultation Simplification — Design (approved 2026-10-10)

**Date:** 2026-10-10
**Status:** Approved 2026-10-10 (G3 corrected). Sections B3 and C amended 2026-10-10 after Task 0: return dates are suggestions only.
**Builds on:** `2026-10-09-consultation-care-plan-workflow-revision-design.md` (branch `care-plan-workflow-revision`, unmerged, undeployed). This design **supersedes that spec's per-concern Care Plan Action UI** (H4, H5, the concern part of H7, and its release 2). Every other part of it stays: H1 transition reads, H2, H3 legacy monitoring review, H6 and the visit type.
**Branch:** `bhc-general-consultation-simplification`, cut from `care-plan-workflow-revision`. The two branches merge together.

Goal: digitize the BHC Daily Log Sheet workflow without making the health worker type the same complaint several times. The BHC records and refers; only the RHU confirms conditions. AKAY makes no clinical decisions. **[Validate with RHU/MHO]** marks items that need local confirmation.

---

## A. Dependency findings (audit)

| Area | Finding | Consequence |
|---|---|---|
| Health Concerns | They live in the JSON column `health_records.diagnoses[]` (`name`, `carePlan`, `bhcFollowUp`, `reportAs`, `includeInSurveillance`). There is no separate table. | Nothing is dropped. No migration. |
| Follow-up / referral | Both are already visit-level: `monitoring_data.followUpDate/Time/Reason/Status` and one `referral_data` per consultation. Per-concern `carePlan` only *gates* them: `needs_referral`, the date and reason rules, `CarePlan::keepsFollowUpWithReferral`, the shared-referral acknowledgment, and `FollowUpTaskSyncService` re-sync. | A visit-level follow-up flag is needed (Conflict 1). |
| Reporting | The Morbidity, Notifiable and Surveillance reports produce one row per **named** `diagnoses[]` entry. `morbidityReportingStatus` is derived from those entries. Nothing links to concern IDs. No SQL function reads these keys. | Reporting needs named entries. A visit-level flag would merge conditions (Conflict 2). |
| Visit `diagnosis` text | This is the concern names joined together. The server requires it for a follow-up or referral ("BHC Assessment is required…"). It appears in the referral ITR, RHU Health Records, the follow-up episode panel and the fallback morbidity row. | It is empty in v2. The rule changes and readers fall back to the Chief Complaint (Conflict 3). |
| RHU Confirm Conditions | It works from RHU-typed names and never reads BHC concerns. | Unaffected. |
| `resolveConditionEntries` | It renames exact monitored-condition aliases (e.g. "PTB" → "Tuberculosis") and sets `conditionKey`. It never writes a condition. | It is skipped for v2 reporting entries. |
| Daily Log Signs & Symptoms | `getMorbiditySignsSymptoms` (`BHCReports.jsx`) takes the first non-empty value, in this order: HPI, signs/symptoms, assessment findings, physical exam, Chief Complaint. | Unchanged here; see section H. |

---

## B. Backend contract

### B1. Discriminator
- A new top-level request field `consultation_workflow: "bhc_general_v2"`.
  - It is rejected with a 422 unless the user's working facility is a BHC, so RHU saves can never use it.
  - It is stored as `monitoring_data.consultationWorkflow`.
- A request **without** it runs today's rules exactly. This covers the production frontend on `main`, stale tabs and all RHU saves.
- A v2 request never runs per-concern processing: `normalizeConcernActions`, `applyRecheckReason`, `requireConcernFollowUp` and concern-based `referralItemCount`.

### B2. Reporting entries (v2 `diagnoses[]`)
- Each entry is `{id, name, reportIn[]}`, with `reportIn ⊆ {morbidity, notifiable, surveillance}`.
  - `name` is required (at most 150 characters, as today).
  - `reportIn` must not be empty.
  - There are at most 20 entries, as today.
- The keys `carePlan`, `bhcFollowUp`, `addToConditions`, `conditionStatus` and `conditionKey` are **prohibited** (422) in v2.
- `resolveConditionEntries` is skipped. The name is stored exactly as typed, `conditionKey` is null, and `patient_conditions` and `patient_condition_events` are never touched.
- **Central normalizer** `App\Services\ReportingEntries`. Its frontend counterpart is `utils/reportingEntries.js`.
  - `reportIn` is the source of truth for v2.
  - On save, it writes the compatibility mirrors `reportAs` (`notifiable` > `morbidity` > null) and `includeInSurveillance`. A client-sent `reportAs` is ignored.
  - On read, a legacy entry maps `reportAs` and `includeInSurveillance` into `reportIn`.
  - `normalizeDiagnosisReporting` uses it to derive the visit-level `morbidityReportingStatus` and its aliases. These are a **mirror only** and never decide which reports an entry appears in.

### B3. Visit-level next actions (v2)
- **Refer to RHU:** `care_plan.refer_to_rhu: true` together with the existing `referral` object.
  - `referral.reason_for_referral` is required.
  - Facility, priority, availability warnings, fallback and closed-loop tracking are unchanged.
- **Schedule BHC Follow-up:** `care_plan.bhc_follow_up: true`. The controller stores `monitoring_data.bhcFollowUp = true` and sets `followUpStatus = 'Follow-up Required'`.
  - `followUpDate` is **always** required when it is ticked.
  - `followUpReason` is required unless the return covers only a selected service or continued monitoring (H6). The exemption applies to the reason only, never to the date.
- No service or monitoring requires a return date (verified in Task 0). Service-proposed dates (the EPI next dose, and the FP next appointment where present) stay in their service records. They are never copied into `monitoring_data.followUpDate`, and never turn into a follow-up task, unless the worker ticks Schedule BHC Follow-up. No new mandatory return rule is added without RHU/MHO validation.
- **Consequence (accepted 2026-10-10):** in the legacy flow, an EPI visit's next-dose date became the visit's follow-up date and so created a follow-up task. In v2 it creates one only when the worker ticks Schedule BHC Follow-up. Legacy records and their tasks are unchanged.
- `CarePlan::keepsFollowUpWithReferral` also returns true for `monitoring_data.bhcFollowUp === true`, so ticking both keeps the follow-up. `FollowUpTaskSyncService` re-sync reads the same stored flag.
- `bhcFollowUp` never reads or writes `condition_monitorings`. Continue, stop and refer of monitoring stay on their own `care_plan.*` keys and services.
- The one-follow-up and one-referral per consultation limits are unchanged.
- The "BHC Assessment is required for follow-up or referral" rule does not apply in v2. `chief_complaint` (required) and the two reasons carry the purpose. The visit `diagnosis` is left empty.

### B4. Shared-referral safeguard (v2)
- **Structural count** = `(refer_to_rhu ? 1 : 0)` + the number of distinct referred monitorings.
- **Manual indication:** `care_plan.referral_multiple_issues: true` ("This referral covers more than one health issue").
- `care_plan.shared_referral_acknowledged` is required (422) when the count is 2 or more, **or** the indication is set. It is audit-logged through `AuditLogger` as today, with "Not a clinical compatibility check."
- Reporting entries never count toward it. Nothing is inferred from the free-text reason.
- Without the acknowledgment, the existing blocked state and escalation message apply, and nothing entered is cleared.

### B5. Drafts
- `HealthRecordDraftPayloadService` accepts `consultationWorkflow`, `diagnoses.*.reportIn`, `carePlan.bhc_follow_up`, `refer_to_rhu` and `referral_multiple_issues`.
- **Conversion** of a draft without `consultationWorkflow` happens once, on restore, in the frontend. The result is always v2 and never contains `carePlan` or `bhcFollowUp`, so it cannot reach legacy processing.
  - Concerns with reporting become `reportIn` entries.
  - Concern names without reporting, old Additional Assessment Notes and a General Consultation's `monitoringNotes` are combined into `assessment_notes` as "Earlier draft — Health concerns: A; B", followed by the notes. This text is read-only and shown in Review.
  - Referral form data and the follow-up date, time and reason are restored as entered.
  - The checkboxes start ticked when the old draft held referral data or a refer concern (Refer), or a follow-up date or a concern that scheduled one (Follow-up).

### B6. Schema
No migration. Every new key lives in an existing JSON column (`monitoring_data`, `diagnoses`) or in the request-only `care_plan`, or uses the existing `assessment_notes` column.

### B7. Legacy retirement
Requests without the discriminator are retired only after all of these are met, each recorded in `docs/ai/CURRENT.md`:
- (a) the v2 frontend has run for one full release cycle;
- (b) the logs show no BHC POST without `consultation_workflow` since then (or state that no log exists);
- (c) a draft check shows no unconverted active drafts.

After that, a BHC POST without the discriminator returns 422. RHU saves are never affected. Stored `recheck`, `none` and per-concern values stay readable **permanently**, because the re-sync reads historical records. This replaces the earlier spec's release 2.

---

## C. Frontend — four steps

Patient Interview → Physical Examination → Medication, Treatment & Next Steps → (Monitoring Details, only when a continued monitoring needs it; unchanged) → Review & Finalize. Service forms remain detours from the Interview's Barangay Health Services panel.

1. **Patient Interview.** No structural change.
   - Chief Complaint helper text: "Reason for the visit — symptoms or a service, e.g. Initial prenatal checkup."
   - HPI is labeled "(optional)".
   - Patient Background Review / Update and the services panel (Maternal Care, Family Planning, EPI where eligible) are unchanged. There is no Visit Purpose selector.
2. **Physical Examination.**
   - Kept: Vital Signs (including FBS), Physical Findings, Location-Specific Findings and the 2D body map.
   - Removed from the active UI: the Assessment panel (concern rows, Add/Remove, Additional Assessment Notes).
   - Moved to step 3: Actions Taken and medicines.
3. **Medication, Treatment & Next Steps.** Flat sections divided by thin rules, with no nested cards.
   - **Existing monitoring** (only when selected at Start): the existing Continue / Refer / Stop rows and Additional Clinical Notes (`monitoringNotes`), unchanged.
   - **Actions Taken / Treatment:** the existing textarea, FP Medicines / Supplies (when FP is selected), and Medicines / Supplies Dispensed with its `items.dispense` gating unchanged.
   - **Next Actions:** two independent checkboxes. Each reveals its form, indented with a left rule.
     - *Schedule BHC Follow-up:* Date\*, Time and Reason\* (the H6 hint applies when exempt).
     - *Refer to RHU:* the existing referral form, Reason for Referral\*, a "Covers:" line (General consultation, plus any referred monitoring), "This referral covers more than one health issue", and the acknowledgment when required.
   - **Reporting (optional):** "Not reported for this visit." with "+ Add entry".
     - Each entry has a "Reported Health Problem / Suspected Case" text field (no suggestions, never prefilled) and three checkboxes: Morbidity Report, Notifiable Disease Report and Community-Based Surveillance. There is a Remove link per entry.
- **Behavior**
  - Unticking a box hides its form but keeps the values in state and in the draft. Submit sends only the ticked actions.
  - Schedule BHC Follow-up starts unticked. Only the worker ticks it, or a saved draft restores it. Nothing ticks it automatically: not a service, not monitoring, not a re-render.
  - Service-proposed return dates are shown in the follow-up area as suggestions, e.g. "EPI next dose: <date> — Use this date". Using one fills the follow-up date only. It does not tick the box or create a task.
  - If the follow-up date differs from a suggested service date, a **non-blocking** warning appears. Finalizing is not blocked and nothing is overwritten.
  - Selecting Maternal Care, FP or EPI never ticks the follow-up, starts an enrollment or schedules a return.
  - There is no "No Further BHC Action" card and no "No health concern was recorded" text.
4. **Review & Finalize.** Rows with no value are omitted.
   - *Patient Interview:* CC, HPI, Background updates and services.
   - *Physical Examination:* vitals, findings, body map.
   - *Medication, Treatment & Next Steps:* Actions Taken, medicines and supplies, monitoring and its notes, BHC Follow-up (plus "Completes follow-up FU-x"), RHU Referral (with Covers and acknowledgment), Reporting lines, and Earlier draft notes for converted drafts.
- **Layout:** Geist; black, red and white; thin borders; compact spacing. Single column. At 1366×768 the services sidebar stays on the right; on mobile it stacks.

## D. History views and report readers

- **Views:** `HealthRecordClinicalDetails`, `BhcConsultationDetails`, `RHUHealthRecords`, `FollowUpEpisodePanel` and `CreateReferral` / the ITR branch on `monitoring_data.consultationWorkflow`.
  - **v2 records:** a Reporting block, then Follow-up and Referral. There is no Health Concerns heading.
  - **Legacy records:** unchanged, with Health Concerns and their actions, Assessment Notes and `monitoringNotes`.
- **Chief Complaint fallback:** only for a **v2** record with an empty `diagnosis`. It is shown as "Chief Complaint: …", never under a Diagnosis label. Historical `diagnosis` values and RHU diagnoses are shown as stored.
- **Report readers:** every reader goes through `reportingEntries.js`: `getReportedDiagnoses`, `getSurveillanceDiagnoses`, `formatRecordReporting` and the `healthRecordService` mirrors.
  - It handles v2 `reportIn`, legacy `reportAs` and `includeInSurveillance`, the existing single-row fallback for visit-status-only records, and legacy HFMD tags as one HFMD row.
  - Rows are built once per (entry, report), so there is no double counting.
  - The Morbidity and Notifiable log column becomes "Diagnosis / Suspected Case".
- **Follow-up completion:** unchanged (H2). Opening never completes a task; only a successful finalized save does.

## E. Preserved (explicitly unchanged)

- RHU-confirmed conditions and RHU-only status changes.
- `ConditionMonitoringService` and `lockContinued`, including the legacy 422.
- The legacy-monitoring RHU review (Confirm / Correct / Discontinue) and its audit.
- Start Consultation's visit type and its monitoring and follow-up selection.
- Referral feedback and closed-loop tracking, and the RHU record save path.
- Medicine and inventory integration and its permissions.
- Service forms and their notes, and the TB Monitoring Details step.
- All historical records and reports.

## F. Tests and QA

### F1. Baseline (before any code change)
- Run the full backend suite at the branch point with `php -d memory_limit=2G vendor/bin/phpunit`.
- Record every failing or erroring test **by name and cause** in `docs/ai/test-baseline-2026-10-10.md`. Examples of causes: a 403 because the test user lacks a permission, the SQLite-only 409 path, or a specific error message.
- Record the frontend node tests, ESLint and the vite build in the same file.
- Later comparisons are **by name**:
  - A new failing name is a regression, even if the total count stays the same.
  - A baseline name that starts passing is noted, not credited.

### F2. Backend (PHPUnit)
- **New v2 feature tests must exercise the real code paths.**
  - They reach the real `HealthRecordController::store` and `HealthRecordRequest`.
  - Each test asserts a 2xx or the specific 422 key, never just "not 403".
  - Setup grants the real BHC and RHU permissions.
  - Each new test class passes when run on its own (`--filter`).
- **Authorization:**
  - An RHU user sending v2 gets a 422.
  - A BHC user without `items.dispense` cannot dispense.
  - Monitoring and condition permissions are unchanged.
  - The RHU record save path still succeeds.
- **Discriminator and legacy:**
  - A BHC legacy payload keeps its current behavior.
  - v2 never runs the per-concern normalizers.
  - Prohibited keys get a 422.
- **Reporting normalization:**
  - Morbidity only, Notifiable only, both, and each of these combined with Surveillance.
  - An empty `reportIn` gets a 422.
  - The mirrors are correct.
  - The name is stored as typed.
  - No `patient_conditions` or `patient_condition_events` rows are created.
  - Legacy entries read the same through the normalizer.
- **Follow-up and referral persistence:**
  - Follow-up only: a task is created and the date is required. The reason is required or exempt per H6; the date is required either way.
  - Referral only: the reason is required.
  - Both: the follow-up is kept, and the re-sync keeps the task.
  - `bhcFollowUp` does not change monitoring state.
  - The acknowledgment is required both from the structural count and from the manual indication, and it is audited.
- **Duplicate submission:** the existing idempotency key and `consultation_uuid` replay returns the same record for v2, without a second follow-up task or referral.
- **Follow-up completion:** a task completes only on a successful save.
- **Drafts:**
  - The v2 schema keys are accepted.
  - Legacy drafts still validate.
  - Finalizing a draft consumes it as today.

### F3. Frontend (node tests, ESLint, vite build)
- **`reportingEntries`:**
  - v2, legacy, visit-status-only and HFMD records;
  - no double counting.
- **Next actions:**
  - the follow-up starts unticked and nothing ticks it automatically;
  - a service-date suggestion fills only the date;
  - the non-blocking date-difference warning;
  - an unticked action is left out of the payload but kept in the draft.
- **Scenario-level payload tests:**
  - General Consultation;
  - service-only visits (Maternal, FP, EPI);
  - Existing Monitoring;
  - combined Follow-up + Referral.
- **Draft conversion:**
  - legacy becomes v2, with no `carePlan`;
  - the Earlier draft text is built;
  - the checkboxes are mapped;
  - referral and follow-up data are kept.
- **History helpers:**
  - the legacy concern view;
  - the Chief Complaint fallback applies to v2 only.
- **Step labels.**
- Per-concern UI tests are removed only together with the code they cover.

### F4. Manual QA
- Use dedicated BHC and RHU **test** accounts with synthetic patients. No production credentials and no real patient records.
- Run each of the 15 scenarios at 1366×768 and at a mobile width:
  1. General Consultation with no service.
  2. Maternal Care only.
  3. FP only.
  4. Maternal Care plus symptoms.
  5. Treatment with no follow-up or referral.
  6. Follow-up only.
  7. Referral only.
  8. Follow-up and referral.
  9. Reporting: Morbidity, Notifiable, both, and Surveillance.
  10. RHU-confirmed monitoring: Continue, Refer, Stop.
  11. Historical Health Concern records.
  12. Draft auto-save and resume, including a legacy draft.
  13. Validation and finalize.
  14. Role permissions.
  15. Referral feedback and follow-up completion.
- Also run the revision branch's open manual-QA list.
- A scenario not run in an authenticated session is reported as **UNVERIFIED**, never as passed. Harness or stub checks are labeled as such.

## G. Delivery

### G1. Pending migrations (separate from this refactor)
- This refactor adds **no** migration.
- Before any deployment, document the purpose, dependencies, Supabase deployment status and risks of each of these:
  - `2026_09_30_000001_drop_care_pathway_tables`
  - `2026_09_30_000002_create_condition_monitoring_tables`
  - `2026_09_30_000003_allow_shared_follow_up_fulfilment`
- Run them against a **disposable** PostgreSQL instance holding a schema copy, both up and (where defined) down.
- Deploying them is a separate decision. It is not assumed as part of this refactor.

### G2. Deploy order
1. **Backend first.** It accepts both legacy and v2 payloads. Before the frontend ships, verify on staging:
   - an old client (`main` frontend) payload;
   - an existing draft resume;
   - an RHU health-record save.
2. **Frontend** only after those checks pass. Reload open tabs.
3. **The legacy payload path stays** until the B7 retirement criteria are verified and recorded.

### G3. Rollback and recovery
**Frontend rollback** (redeploy the previous build) is safe at any time, because the backend keeps v2 support.
- v2 records stay readable through the backend.
- The previous frontend sends legacy payloads, which the backend still accepts.

**Backend rollback depends on whether any v2 record has been saved.**
- **No v2 record yet:** a tested rollback is acceptable. Check with `monitoring_data->consultationWorkflow`.
- **v2 records exist:** treat a backend rollback to a build without v2 support as **unsafe**. Use a compatible hotfix or roll-forward instead. The old code would misread v2 records in two known ways:
  - **Silent data loss.** The old `CarePlan::keepsFollowUpWithReferral` does not read `monitoring_data.bhcFollowUp`. The background re-sync (`FollowUpTaskSyncService::syncEligibleRecordsForUser`) would therefore cancel the follow-up task of every v2 record that has both a follow-up and a referral.
  - **Reinterpreted clinical information.** The old history views show `diagnoses[]` as Health Concerns, so v2 reporting entries would appear as concerns.
- **Before release:** verify the claim above against actual persisted v2 test records on staging. Run the old backend against a copy of the staging database and record the result.
  - If any v2 record is misread, rollback stays documented as unsafe.
  - If none is, record that evidence before allowing a rollback.

**Recovery procedure if the v2 backend has a defect after v2 records exist:**
1. Roll back the frontend only, so no new v2 records are created. The backend keeps reading the existing ones.
2. Fix the backend and roll it forward. Never restore a build without v2 support.
3. If the defect is in the re-sync, disable the background re-sync before the fix ships. Then verify each v2 record's follow-up task and referral against its stored `monitoring_data` and `referral_data`.
4. Every manual correction is made through the application and recorded in the audit log. Nothing is discarded or reinterpreted directly in the database.

**Compatibility checks in the deployment plan**, run on staging before each release and before any rollback decision:
- the old frontend against the new backend, with a legacy payload;
- the new frontend against the new backend, with a v2 payload;
- resuming a legacy draft and a v2 draft;
- an RHU health-record save;
- the follow-up re-sync over v2 records with follow-up, with referral, and with both;
- the report readers over v2, legacy and HFMD records.

**Blockers:**
- any failed compatibility check above, or in G2.1;
- any regression by name against the F1 baseline.

## H. Out of scope / follow-ups

- **Signs & Symptoms in the Daily Log:** combining CC, HPI and relevant exam findings, instead of taking the first non-empty value, is a report-rule change. It should be documented and decided separately.
- A surveillance registry or classification list. None exists, and none is added.
- Different facilities, priorities or follow-up dates within one consultation (unchanged limitation).
- The `resolveConditionEntries` alias renaming for legacy BHC payloads (unchanged).

## I. Final delivery report

The report lists:
- files changed;
- new and updated tests;
- passing and failing results, by name;
- baseline failures, by name and cause;
- migration verification (G1);
- manual QA results, with UNVERIFIED scenarios marked;
- known limitations;
- remaining clinical workflow questions **[Validate with RHU/MHO]**.

## J. Step-by-step implementation order

Each step that changes behavior is test-first. Each step ends with its focused tests green and no new failing name against F1.

| # | Step | Main files |
|---|---|---|
| 0 | Branch `bhc-general-consultation-simplification` from `care-plan-workflow-revision`. Record the F1 baseline (backend by name and cause, plus frontend). Write up the pending migrations per G1. | `docs/ai/test-baseline-2026-10-10.md` |
| 1 | Backend `ReportingEntries` normalizer (v2 `reportIn` ↔ legacy mirrors) with unit tests. | `app/Services/ReportingEntries.php` |
| 2 | Discriminator and v2 validation: BHC-only check, prohibited entry keys, `reportIn` rules, follow-up and referral rules (B3), acknowledgment (B4), assessment rule skipped. | `HealthRecordRequest.php` |
| 3 | Controller v2 path: skip the per-concern normalizers and `resolveConditionEntries`; store `consultationWorkflow` and `bhcFollowUp`; set the follow-up status; audit the acknowledgment. Update `CarePlan::keepsFollowUpWithReferral` and check the re-sync. | `HealthRecordController.php`, `CarePlan.php`, `FollowUpTaskSyncService.php` |
| 4 | Draft schema for the v2 keys. | `HealthRecordDraftPayloadService.php` |
| 5 | Backend v2 feature tests (F2) with real permissions, then a full-suite comparison by name. | `tests/Feature/BhcGeneralConsultationV2Test.php` and related |
| 6 | Frontend `reportingEntries.js`. Rewire `diagnosisReporting`, `surveillance`, `healthRecordService` and `BHCReports` (including the column label). | `utils/`, `pages/bhc/BHCReports.jsx` |
| 7 | Next-actions state helpers, test-first: checkbox state, service-date suggestions, non-blocking date warning, payload builder. | `utils/nextActions.js` |
| 8 | Steps and UI: Interview copy; remove Assessment from Physical Examination; step 3 (monitoring block, Actions Taken and medicines, Next Actions, Reporting); `consultation_workflow` in the payload. | `ConsultationWorkspace.jsx`, `consultationSteps.js`, a new `wizard/NextStepsSection.jsx` |
| 9 | Draft conversion on restore (legacy → v2, Earlier draft notes). | `utils/draftConversion.js`, `ConsultationWorkspace.jsx` |
| 10 | Review & Finalize with the v2 groups. | `ConsultationWorkspace.jsx` |
| 11 | History views branched on `consultationWorkflow`, plus the Chief Complaint fallback. | `HealthRecordClinicalDetails`, `BhcConsultationDetails`, `RHUHealthRecords`, `FollowUpEpisodePanel`, `CreateReferral` |
| 12 | Full runs: backend by name against F1, frontend tests, ESLint, build. Responsive check at 1366×768 and mobile. | — |
| 13 | Manual QA (F4) with test accounts, or mark scenarios UNVERIFIED. Update `docs/ai/CURRENT.md` and write the final report (I). | `docs/ai/CURRENT.md` |
