# Consultation & Care Plan Workflow Revision — Design (REVISION 2, awaiting approval)

**Date:** 2026-10-09
**Status:** Planning only. No code has been changed for this design. Revision 2 incorporates the H1–H7 review decisions.
**Builds on:** `2026-10-05-clinical-boundary-condition-confirmation-design.md`,
`2026-09-30-care-plan-next-steps-design.md`, plan `2026-10-04-start-consultation-visit-context.md`.

Target architecture:

- **General Consultation** = the visit entry point, always available.
- **Health Concern Follow-up** = a scheduled return for a concern, with or without a confirmed diagnosis. It reuses General Consultation and is linked to its pending follow-up task.
- **Existing Monitoring** = continued monitoring of an **RHU-verified** condition the BHC monitors.
- **Referral** = escalation or evaluation at the receiving RHU, tracked through the existing closed loop (status, feedback, no-show).

The workflows below illustrate how AKAY records these steps. They are not DOH mandates, and they make no clinical decisions. **[Validate with RHU/MHO]** marks items that need local confirmation.

---

## Decisions (from review)

| # | Decision | Effect on this design |
|---|---|---|
| H1 | Approved with compatibility | One transition release accepts a legacy `recheck` POST as Schedule BHC Follow-up. The next release rejects it with a clear 422. History stays readable. |
| H2 | Approved | The modal optionally lists pending Health Concern Follow-ups, with nothing preselected from the header. Record Visit preselects its task. Opening never completes a task; only a successful save does. |
| H3 | Modified | Legacy monitoring becomes "Legacy — Pending RHU Verification". It is excluded from Existing Monitoring selection (frontend **and** server) and is reconciled by an authorized RHU review: confirm, correct or discontinue. |
| H4 | Approved | No Further BHC Action is stored explicitly, reusing the existing canonical value `none`. |
| H5 | Modified | Refer to RHU stays the primary action with no automatic BHC follow-up. A referred concern can **explicitly** add a BHC follow-up through a per-concern flag that uses the existing single follow-up. |
| H6 | Approved | Follow-up Reason is required on the frontend and on Laravel when a concern schedules a BHC follow-up. Create only, never retroactive. |
| H7 | Modified | One referral and one follow-up per consultation. Sharing requires the worker's explicit confirmation that the concerns are compatible. If they are not, submission is blocked with an explanation, entered data is kept, and the unsupported workflow is documented. |

---

## A. Current Workflow Analysis (unchanged from revision 1, condensed)

1. **Entry points.**
   - The profile header Start Consultation shows the modal only when there is active monitoring or an RHU recommendation (`startConsultation.hasStartChoices`). Otherwise it opens `?mode=new`.
   - Record Visit (Follow-ups list, calendar, details, profile) opens `?mode=continue&followUpIds=X` and goes straight to the workspace with that task continued.
   - Post-registration Start always opens `mode=new`.
2. **Modal.**
   - An optional checklist of every active `condition_monitorings` row, **legacy included**, plus RHU recommendations.
   - Nothing ticked means General.
   - Pending concern follow-ups are not listed.
3. **Care Plan.**
   - Per concern: `recheck | follow_up | refer | null`, plus reporting.
   - One referral and one follow-up per visit, drawn in the first concern card that needs them.
4. **Save** (`HealthRecordController::store`):
   - Referral handling (`keepsFollowUpWithReferral`) runs, and `applyRecheckReason` adds the "Recheck: …" prefix.
   - One task per record (`FollowUpTaskSyncService`).
   - Continued tasks are fulfilled **on save only**. A second save returns 409 `FOLLOW_UP_ALREADY_PROCESSED`.
   - Monitoring is applied, and `linkFollowUpTask` links the task to every monitored condition.
   - The referral is created or held.
5. **RHU authority.**
   - Only RHU staff with `conditions.confirm` set a condition's status (`PatientConditions::apply`).
   - Confirming an identity as Active or Controlled **already auto-links** a legacy monitoring of the same identity (`PatientConditions::set`, lines 159–165).
   - `ConfirmConditionsBlock` already shows "Already monitored at BHC — Legacy BHC Monitoring" rows read-only.
6. **Recheck vs Follow-up.** Identical date, validation, task and lifecycle. The only difference is the reason prefix.

## B. Identified Problems (unchanged, condensed)

- **P1** Recheck and Follow-up are redundant.
- **P2** A header-started return visit skips the pending concern follow-up.
- **P3** A linked return visit shows no context and cannot be unlinked.
- **P4** General Consultation is only implicit.
- **P5** Legacy monitoring is selectable as existing monitoring.
- **P6** One task covers both concern and monitoring follow-ups.
- **P7** Referral and follow-up combining is silent.
- **P8** The shared sections are hosted inside the first concern card.
- **P9** The follow-up reason is checked only in the frontend.
- **P10** Drafts are disabled; per-patient duplicate consultations are blocked only at save, by the 409s.
- **P11** Refer plus BHC return cannot be represented.

New finding:

- **P12 The background re-sync re-reads stored action values.** `FollowUpTaskSyncService::syncEligibleRecordsForUser` re-syncs **historical** records (it runs on list loads) through `CarePlan::keepsFollowUpWithReferral` and the stored `diagnoses[].carePlan`.
  - If `recheck` ever stopped counting as "keeps a BHC follow-up", historical tasks from referred visits would be **cancelled** on the next re-sync.
  - So `recheck` must remain a follow-up-keeping value **permanently**, even after new submissions are rejected.

---

## C. Proposed Workflow

```
Start Consultation (profile header / Participants)
 ├─ No verified monitoring, no RHU recommendation, no pending follow-up, no legacy row
 │     → New / General Consultation opens directly                       (Patient A, D)
 └─ Otherwise → modal
      Visit type
        (•) New / General Consultation                       default, always present
        ( ) Follow-up Existing Monitoring                     only if VERIFIED active monitoring exists
              [ ] Hypertension · RHU-confirmed Active · since …   (≥1 required when chosen)
      Scheduled follow-ups (optional, either visit type)      pending tasks not tied to verified monitoring
              [ ] FU-12 · Reassess wound healing · due Oct 16     nothing preselected
      Recommended by RHU — start BHC monitoring (optional)    unchanged
      Pending RHU verification (read-only)                    legacy rows, not selectable, with a hint
 Record Visit on a task → workspace opens with THAT task preselected (current route, no modal)
        │
        ▼
 Workspace (unchanged steps). Linked visit → compact "Follow-up visit" line at the top of
 Care Plan and on Review: FU-12 · purpose · due date · source visit · [Remove link].
 Nothing is completed until Save succeeds.
        │
        ▼
 Care Plan & Next Steps
   Concern card × N:  Care Plan Action* (No further BHC action | Schedule BHC Follow-up | Refer to RHU)
                      └ if Refer: [ ] Also schedule a BHC follow-up for this concern   (H5)
                      Report as · Include in Surveillance
   Condition Monitoring (verified continued / starting rows only)
   BHC Follow-up Details   when a concern needs it (follow-up, or refer + flag) or monitoring/service needs a next visit
   RHU Referral Details    when a concern is referred or a monitored condition is referred back
   Additional Clinical Notes
        │
        ▼
 Save (same endpoint): 1 record · ≤1 follow-up task · ≤1 referral or hold · linked tasks fulfilled ·
 monitoring applied (legacy rejected) · never a condition write
        │
        ▼
 RHU: referral feedback / RHU record → Confirm Conditions block now also reviews
 "Legacy — Pending RHU Verification" rows: Confirm · Correct · Discontinue (H3)
```

Worked examples (illustrative only):

- Wound set to follow-up, cough set to refer → one record, one task (covers the wound), one referral (covers the cough).
- Cough set to refer **with** "Also schedule a BHC follow-up" ticked → one referral **and** one task, both covering the cough. Referral tracking is unaffected.

---

## D. UI Changes

### D1. Start Consultation modal

- A **Visit type** radio: New / General Consultation (default) and Follow-up Existing Monitoring.
  - Follow-up Existing Monitoring shows only with **verified** active monitoring (`patient_condition_id` set). At least one condition must be ticked.
- **Scheduled follow-ups (optional):** pending tasks whose linked monitoring is not verified-active, or that link none.
  - Shown under either visit type, because linking a task is not a visit type. A Hypertension patient can return for a wound follow-up without converting the visit into monitoring.
  - Rows show reason, due date, overdue flag and source date, all already in `care_overview.pending_follow_ups`.
  - Nothing is preselected.
- **Pending RHU verification:** legacy rows shown read-only, labeled "Legacy — Pending RHU Verification", with the hint "Refer to RHU for verification if care is needed. It cannot be continued as monitoring until verified."
- RHU recommendations are unchanged. Maternal Care and other services stay in the workspace panel; nothing is added to the modal.
- The modal opens when any of these exist: verified monitoring, a recommendation, a pending follow-up, or a legacy row.

### D2. Follow-up visit line (workspace)

- One compact line per linked task: purpose, due date, source visit, and **Remove link**. Removing it drops the task from `continuedFollowUpTaskIds`, so the task stays pending.
- Review & Confirm shows "Completes follow-up FU-12".
- Completion happens only on a successful save, through the existing `fulfillTasks` / 409 rules.
- When a linked task's monitoring is legacy, show "Hypertension (Legacy — Pending RHU Verification) is not continued as monitoring."

### D3. Concern card

| Control | Proposed |
|---|---|
| Care Plan Action (required) | **No further BHC action** · **Schedule BHC Follow-up** · **Refer to RHU**. No default; the worker must pick one. Error: "Choose a care plan action for this health concern." |
| Refer sub-option | `[ ] Also schedule a BHC follow-up for this concern`. Unticked by default; shown only under Refer. |
| Pointer line | "Covered by BHC Follow-up Details below" / "Included in RHU Referral Details below" |
| Reporting | Report as and Include in Surveillance, unchanged |

Cards are compact, white, with one thin border and no tinted panels (as today).

### D4. Shared sections (after the cards, before Additional Clinical Notes)

**BHC Follow-up Details**
- Fields: Follow-up Date (required), Follow-up Time (optional), Follow-up Reason (required).
- A **Covers:** line lists concern names (follow-up, and refer + flag), monitored conditions, and the service next visit.
- When the date covers 2 or more concerns, a required checkbox appears: **"One follow-up date is clinically appropriate for all listed concerns."** (H7)

**RHU Referral Details**
- The existing facility select, availability summary, no-doctor warning and fallback, priority and reason are kept unchanged.
- A **Covers:** line lists the referred concerns and referred monitored conditions.
- When 2 or more are covered, a required checkbox appears: **"All listed concerns can go to this facility with this priority."** (H7)

**H7 blocked state** (the worker leaves a compatibility box unticked and presses Continue). Inline error under the box:

> "AKAY records one referral and one follow-up date per consultation. If these concerns need a different facility, priority or date, refer or schedule the most urgent one here, set the others to another action, and follow your facility's referral or escalation procedure for the rest. Record what you did in Additional Clinical Notes."

- Nothing entered is cleared.
- Nothing is auto-chosen.
- Continue stays blocked until the box is ticked or the actions change.

### D5. Labels

- Review rows: concern → "No further BHC action" / "Schedule BHC Follow-up" / "Refer to RHU" (+ " · BHC follow-up").
- Messages: "Set the follow-up date for the concerns that schedule a BHC follow-up." and "Follow-up reason is required." The server text changes in step.

### D6. Read-back (record details, history)

| Stored | Shown |
|---|---|
| `recheck` (historical) | **Recheck** (unchanged; stored "Recheck: …" reasons unchanged) |
| `follow_up` | Schedule BHC Follow-up |
| `refer` + `bhcFollowUp: true` | Refer to RHU · BHC follow-up |
| `none` | No further BHC action (also on older records, see E) |
| `monitor`, `monitor_refer` | unchanged legacy labels |

### D7. RHU — Confirm Conditions block (H3)

Each "Legacy — Pending RHU Verification" row gets one optional decision:

- **Confirm:** adds a condition row prefilled with the legacy name. Choosing Active or Controlled links the monitoring through the **existing** identity auto-link, so it becomes verified.
- **Correct:** discontinues the legacy monitoring with the reason "Corrected by RHU to \<name\>" and adds a condition row for the corrected name, where the RHU may tick "Recommend BHC monitoring". The BHC then starts **new** verified monitoring at its next visit. The legacy row and its visits are kept untouched as history.
- **Discontinue:** stops the legacy monitoring with a required reason.

Rows with no decision stay pending. The block stays RHU-only (`conditions.confirm` + RHU working role).

### D8. Patient Profile

- Medical Conditions / Monitoring list legacy rows under **"Legacy — Pending RHU Verification"**, separate from verified monitoring.
- No profile action changes the row (only the RHU review does).

---

## E. Data Compatibility & Backend Dependencies

**No migration in any phase.** Every change uses existing JSON keys or existing nullable columns.

### E1. Action values (`diagnoses[].carePlan`)

| Value | Status |
|---|---|
| `none` | **Reused** as No Further BHC Action. It is already in `CarePlan::VALUES` and becomes selectable again. It means "no BHC follow-up or referral from this concern", consistent with its old "No Ongoing Tracking" meaning, so the old records' label becomes "No further BHC action". `diagnosisCarePlanHeading` currently uses `none` to detect old records; it switches to `monitor` / `monitor_refer` only. |
| `follow_up` | Reused as Schedule BHC Follow-up. |
| `refer` | Unchanged. It may carry `bhcFollowUp: true` (H5). |
| `recheck` | Historical. **Permanently** counts as follow-up-keeping for reads and re-sync (P12). Accepted on POST only during the transition. |
| `monitor`, `monitor_refer` | Retired, unchanged. |
| `null` | Accepted on POST only during the transition (old tabs). Afterwards, a BHC concern must have a value. |

### E2. Release sequencing (H1, H4)

**Release 1 (transition):**
- `recheck` on POST is normalized to `follow_up` before validation runs. Its "Recheck: \<concern\>" prefix is still written, and the prefix satisfies the reason rule.
- `null` is accepted as today.
- The frontend never sends either.

**Release 2:**
- POST with `recheck` returns 422: "Recheck is no longer offered. Choose Schedule BHC Follow-up and describe the purpose in Follow-up Reason."
- BHC POST with a missing action returns 422: "Choose a care plan action for each health concern."
- Both rules are **scoped to BHC consultations** (creating user's workflow role is BHW). `HealthRecordRequest` is shared with RHU records, whose `diagnoses[]` carry no care-plan action. **Verify the RHU payload during phase 1.**
- PUT / read paths keep accepting every stored value. Records are immutable after save, so nothing is retroactive.

### E3. H5 flag

- `diagnoses[].bhcFollowUp` is a boolean, honored only with `refer`, and lives in existing JSON.
- `CarePlan::keepsBhcFollowUp` changes from value-based to entry-based: `follow_up | recheck | (refer && bhcFollowUp)`.
- That one change flows into `keepsFollowUpWithReferral`, the date and reason requirements, and the background re-sync, so stored flagged records keep their task.

### E4. Drafts

- `HealthRecordDraftPayloadService` diagnoses schema adds `bhcFollowUp`; no other draft change.
- On restore, the frontend maps `recheck` to `follow_up` and prefills an empty reason with "Recheck: \<concern\>". `null` stays unselected, so the worker must choose.
- The drafts flag is still off; payload-level compatibility is kept and tested.

### E5. Unavoidable backend dependencies

| For | Change | Files |
|---|---|---|
| H1 / H4 | `SELECTABLE` adds `none`; transition normalization of `recheck`; release-2 rejections scoped to BHC; new messages | `Services/CarePlan.php`, `Http/Requests/HealthRecordRequest.php`, `HealthRecordController` (`applyRecheckReason` kept for transition input) |
| H5 | `diagnoses.*.bhcFollowUp` rule (boolean, ignored unless `refer`); entry-based `keepsBhcFollowUp`; draft schema key | `CarePlan.php`, `HealthRecordRequest.php`, `HealthRecordController::requireConcernFollowUp`, `HealthRecordDraftPayloadService.php` |
| H6 | On POST, when any concern keeps a BHC follow-up: `monitoring_data.followUpReason` required, not blank. Service-visit follow-ups stay exempt. | `HealthRecordRequest.php` |
| H3 (BHC) | `ConditionMonitoringService::lockContinued` rejects legacy rows with 422: "This monitoring is pending RHU verification and cannot be continued." | `ConditionMonitoringService.php` |
| H3 (RHU) | New optional payload `legacy_monitoring_discontinuations: [{monitoring_id, reason}]` on the feedback and RHU health-record saves, guarded by `PatientConditions::canConfirm` and checked as same patient, active and legacy. Applied in the same transaction after confirmations. It sets `status=stopped`, `stopped_at`, `stop_reason`, `updated_by`, and `stopped_health_record_id` (the RHU record id, or null for feedback). It writes an audit log entry and a `condition_monitoring_visits` row only when there is a health record, since that column is NOT NULL. | `PatientConditions.php` or `ConditionMonitoringService.php`, `FeedbackRequest.php`, `FeedbackController.php`, `HealthRecordRequest.php`, `HealthRecordController.php` |
| H3 (read) | None. `care-overview` already returns `legacy` per row, and `patients/{id}/conditions` already returns `legacy_monitorings`. | — |
| H2, H7, D1–D4 | None. Frontend only. | — |

Unchanged: follow-up tasks, the `linkFollowUpTask` rule (it can now link only verified monitoring), referrals, holds, feedback, reports (`reportAs`), permissions, and TanStack Query invalidation (the existing post-save keys plus `patientConditions` after an RHU review).

---

## F. Implementation Phases

Deploy order is the same as CURRENT.md: backend before frontend.

| # | Phase | Scope | Backend |
|---|---|---|---|
| 0 | Baseline | Settle the uncommitted Care Plan UI work on the branch. Record node test, lint, build and backend baseline (194 known failures). | — |
| 1 | Backend compatibility (release 1) | Everything in E5 except the release-2 rejections: `none` selectable, `recheck` normalization, `bhcFollowUp`, entry-based `keepsBhcFollowUp`, reason rule, legacy rejection in `lockContinued`, RHU `legacy_monitoring_discontinuations`. PHPUnit for each. Verify the RHU `diagnoses[]` payload. | yes, no migration |
| 2 | Care plan action model (frontend) | Options and labels, required choice, H5 checkbox, draft mapping, messages, payload, Review rows, read-back labels and heading logic. Node tests. | — |
| 3 | Shared sections | Compact cards, then BHC Follow-up Details and RHU Referral Details with Covers lines, H7 compatibility confirmations and blocked state. Retire in-card hosting. | — |
| 4 | Legacy separation (BHC side) | The modal, workspace and profile show legacy rows read-only as Pending RHU Verification. `resolveContinuedCare` continues a task but skips its legacy conditions. | — |
| 5 | RHU legacy review (UI) | `ConfirmConditionsBlock` Confirm / Correct / Discontinue per legacy row, sending phase 1's payload; cache invalidation. | uses phase 1 |
| 6 | Start modal + follow-up visit line | Visit type radio, Scheduled follow-ups list, `hasStartChoices` update, follow-up visit line with Remove link, Review line. | — |
| 7 | Release 2 | Reject `recheck`; require a BHC care-plan action. PHPUnit. Ships only after release 1 has been deployed (one release window). | yes, small |
| 8 | Docs & QA | `docs/ai/CURRENT.md` (decisions, unsupported workflows, deploy order); note in the clinical-boundary spec; 1366×768 browser QA; staging smoke. | — |

---

## G. Test Scenarios

Automated tests are node or PHPUnit unless marked *manual*. Backend tests should use the passing `HealthConcernBoundaryTest` / `CarePlanValidationTest` setup, because the `store()`-seam suites are among the 194 known failures.

| # | Scenario | Expected |
|---|---|---|
| 1 | First-ever General Consultation | No modal. One concern = No further BHC action, stored `none`. No task, no referral, no condition, no monitoring. |
| 2 | Concern follow-up, no confirmed condition | `follow_up` with date and reason → one task. Missing reason → 422 (server) and blocked (frontend). Missing time is fine. No `patient_conditions` write. |
| 3 | Return visit from Record Visit | Task preselected. The line shows its purpose. Remove link leaves it pending. Save fulfills it; a second save on the same task → 409. Opening and leaving without saving changes nothing. |
| 4 | Return visit from the header | The modal lists the pending follow-up unticked; ticking it links it; leaving it unticked leaves the task pending. |
| 5 | Verified monitoring (Patient C) | Listed under Existing Monitoring; continue and stop as today. |
| 6 | Legacy monitoring | Read-only "Pending RHU Verification" in the modal and profile. Continuing its id via the API → 422. A Record Visit task linked to it is fulfilled without continuing the legacy row. |
| 7 | RHU legacy review | Confirm (same identity, Active) links it and it becomes selectable. Correct: the legacy row is stopped with its reason, the new condition is recommended, and history rows are intact. Discontinue without a reason → 422. A BHC user sending discontinuations → 403. Another patient's monitoring → 422. |
| 8 | Maternal Care, no monitored condition (Patient D) | No Existing Monitoring option. The service next date uses the follow-up. No condition. |
| 9 | Mixed actions | Wound follow-up + cough refer → one task, one referral, both sections shown. |
| 10 | Refer + BHC follow-up (H5) | The flag is ticked → date and reason required, the task survives the referral, the referral is tracked normally. The flag is unticked → no task (plain referral clears the date). |
| 11 | Shared referral (H7) | Two referred concerns: the confirmation box is required; unticked → blocked with the message and no data lost; ticked → one referral covering both. |
| 12 | Shared follow-up (H7) | Two follow-up concerns: the same rule for the date box. |
| 13 | Historical Recheck | An old record shows "Recheck" and its stored reason. **Re-sync of an old referred Recheck record keeps its task (P12).** Release 1: a `recheck` POST saves as `follow_up` with the prefix. Release 2: → 422 with the message. |
| 14 | Explicit action (H4) | Release 1: `null` is accepted. Release 2: BHC `null` → 422; RHU record without care-plan actions still saves. |
| 15 | No-doctor referral | Hold created; the warning and fallback are unchanged. |
| 16 | Permissions | Care overview needs `consultations.encode` or `clinical.history`. BHC `condition_confirmations` → 403. Facility isolation on task ids is unchanged. |
| 17 | Drafts | A payload with `bhcFollowUp` round-trips. A draft holding `recheck` restores as follow-up with the prefilled reason. A draft holding `null` restores unselected. |
| 18 | *manual* | 1366×768 browser pass of the modal, follow-up line, cards, both sections, the H7 blocked state and the RHU legacy review; staging smoke from CURRENT.md. |

---

## H. Final Decisions (approved 2026-10-10)

1. **Historical `none`:** every `none`, old or new, is displayed as "No Further BHC Action". Stored values are unchanged.
2. **Transition:** one complete, coordinated deployment cycle. The backend is deployed before the frontend. Release 2 is gated on three checks:
   - (a) updated clients no longer send `recheck`;
   - (b) no active server draft still holds `recheck`;
   - (c) RHU health-record saves pass with the BHC-only action-required rule.
3. **H7 acknowledgment:** no new column.
   - **Server-enforced** when a referral covers 2 or more items (referred concerns plus referred monitored conditions): the request field `care_plan.shared_referral_acknowledged` must be `true`, otherwise 422.
   - The acknowledgment is recorded through `AuditLogger` (`audit_logs.description`).
   - It is not proof of compatibility and does not override incompatible destinations, urgency or medical needs.
   - The external escalation guidance stays.
   - The shared follow-up date acknowledgment stays frontend-required, as approved for H7.
4. **H3 safeguard:**
   - Legacy rows are not selectable for Existing Monitoring until reconciled.
   - General Consultation and referral are never blocked because a legacy row exists.
   - Each RHU reconciliation or discontinuation is permission-checked and audit-logged with reason, affected condition, monitoring id, actor (`user_id`), timestamp (`created_at`) and previous/new status.
5. **H5 persistence is verified as migration-free.** `health_records.diagnoses` is a JSON `array` cast. The flag must be carried through four places that currently whitelist keys:
   - `HealthRecordRequest` rules (only validated keys reach `validated()`);
   - frontend `utils/diagnoses.normalizeDiagnoses` (read and payload);
   - `HealthRecordDraftPayloadService` diagnoses schema;
   - read-back (`recordCarePlan`).
   `ClinicalRegistry::resolveConditionEntries` keeps other keys.
6. **H6:** the reason is required on new saves for `follow_up` and for `refer` + `bhcFollowUp`, frontend and backend. Service-visit follow-ups are exempt, and historical records are untouched.

## Unsupported workflows (to record in CURRENT.md)

- Different receiving facilities or priorities for concerns in one consultation.
- Different BHC follow-up dates for concerns in one consultation.
- A standalone BHC "stop monitoring" action outside a consultation (legacy rows are ended only by RHU review).
- Linking a legacy monitoring to a condition with a *different* identity (Correct discontinues it and starts fresh, by design, to keep history intact).

## [Validate with RHU/MHO]

- Whether "recheck" locally means a same-visit repeat measurement (vital signs), not a return visit.
- When a referred concern should also have a BHC return (H5 is opt-in, never automatic).
- The wording of the H7 escalation guidance and the referral priority labels.
- That RHU staff are the right reviewers for legacy monitoring, and whether a reason list is needed for Discontinue.
