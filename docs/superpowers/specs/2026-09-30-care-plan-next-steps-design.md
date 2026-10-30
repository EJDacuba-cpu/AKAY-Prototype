# Care Plan & Next Steps — Per-Diagnosis Care Planning

## Context

This spec supersedes the Care Pathway parts of
`2026-09-28-care-pathway-architecture-design.md` and
`2026-09-29-diagnosis-monitoring-surveillance-registry-design.md` (Start
Monitoring, pathways, enrollments, field sets, the surveillance disease
registry). The Care Pathway backend was removed in commit `d3c3bd8`; its
four empty tables are dropped by `2026_09_30_000001_drop_care_pathway_tables`
(not yet run against Supabase). The monitored-condition registry
(Hypertension, Diabetes Mellitus, Tuberculosis with aliases) and Current
Conditions sync from the 09-29 spec stay.

The developer's goal: the final consultation step becomes **Care Plan & Next
Steps**, where each diagnosis gets its own plan, while **one visit stays one
ITR / health record**. Monitoring, follow-ups, referrals, the Patient
Profile, service history and reports all update from that one ITR, with no
duplicate records and no re-encoding.

Every decision below was made explicitly by the developer during design.

## Principles

1. One visit = one ITR (`health_records` row). A saved ITR is never edited;
   a correction is a new record.
2. Care-plan decisions are per diagnosis; the resulting referral and
   follow-up are per consultation (at most one of each).
3. BHC monitoring is a separate patient-condition tracking record. Current
   Conditions owns only the clinical status (Active / Controlled /
   Resolved). Neither changes the other.
4. Visit Services (Maternal Care, Family Planning, EPI) are fixed BHC
   services, independent of diagnoses and monitoring.
5. Specialized fields appear only when a monitored condition needs data the
   ITR does not already hold or let you derive. Today that is only TB.
6. Nothing clinical is inferred: no diagnosis, alert, monitoring status or
   referral is derived from a measurement or a diagnosis name.

## Consultation flow

Every consultation, new or continued, uses the one step-based flow:

1. **Concern & Vital Signs**
   - New **Additional Measurements** subsection: optional **Fasting Blood
     Sugar (FBS)**, numeric, mg/dL, stored as `vital_signs.fbs`. It is not a
     core vital sign. Nothing (diagnosis, alert, monitoring) is derived from
     it; Diabetes monitoring and reports reuse the value.
   - Side panel renamed **Barangay Health Services**: "Select any service
     provided during this consultation. Leave unselected for a general
     consultation." Options: **Maternal Care, Family Planning, EPI**. TB is
     no longer a panel option. The existing primary-service control stays and
     appears only when two or more services are selected.
2. **Physical Exam & Assessment**
   - Diagnoses list unchanged (multiple diagnoses, registered-condition
     suggestions, Current Conditions sync).
   - **Records & Surveillance** becomes one per-diagnosis list: the existing
     *Not reported / Morbidity / Notifiable* choice, plus an independent
     **☐ Include in Surveillance** checkbox.
   - The HFMD Community-Based Surveillance checklist and the "matches a
     surveillance workflow — Add to Surveillance" prompt are removed. HFMD is
     an ordinary diagnosis.
3. **Service Details** — only when a service is selected; the existing
   Prenatal / Family Planning / EPI forms, unchanged.
4. **Actions Taken** — unchanged.
5. **Care Plan & Next Steps** — replaces Disposition (below).
6. **Monitoring Details** — fully conditional: appears only when a condition
   monitored in this visit needs fields not captured or derivable from the
   ITR. Today only **Tuberculosis** qualifies, using the existing TB-DOTS
   Treatment Card (DOH Form 4b, `TbTreatmentCardForm`, `health_records.tb_data`).
   Hypertension and Diabetes need none (BP and FBS come from Vital Signs).
   When nothing qualifies, the step is skipped and the flow goes straight to
   Review.

   **Extensible by declaration.** A `monitored_conditions` registry entry may
   declare `monitoring_details: '<key>'` (Tuberculosis declares `tb_dots`).
   The frontend keeps a map from that key to its form component (`tb_dots` →
   `TbTreatmentCardForm`) and its save/validation hooks. The step appears when
   any condition monitored in this visit (started or continued) declares a
   key, with one section per distinct key. Adding a specialized workflow is a
   registry entry plus a component in that map — no change to the step logic.
   Free-text conditions never declare one.
7. **Review & Confirm** → save one ITR.

### Category

`health_records.category` is service-based: the primary selected Visit
Service's classification, otherwise **General Consultation**. Monitored
conditions (Hypertension, Diabetes, Asthma, TB, …) never change it.

"Is this a TB record?" is answered by the presence of saved TB-DOTS data
(`tb_data`), not by category. Readers that currently check the
`TB DOTS / TB Monitoring` category (TB history tab, TB filters in Health
Records / Follow-ups, BHC Reports, record-detail titles) match **either** the
legacy category **or** non-empty `tb_data`, so old TB records keep appearing.

## Start Consultation modal

Clicking **Start Consultation** for a patient first loads the patient's care
overview:

- **Pending follow-ups** — follow-up tasks in an active state (pending,
  no-show) that have not been rescheduled to a newer task. Each shows due
  date (marked Due / Overdue), reason, linked monitored conditions, and the
  ITR that scheduled it.
- **Monitored at BHC with no pending follow-up** — active monitoring records
  not linked to any pending follow-up. Each shows the condition, when
  monitoring started, and the last visit.

If both lists are empty, no modal: a new ITR opens directly.

Otherwise the modal offers:

- **Continue Selected** (enabled once one or more items are ticked, from
  either list): opens a new ITR in the standard flow with the selected
  follow-ups and monitoring records linked. Care Plan pre-lists their
  monitored conditions.
- **Start New Consultation**: opens a new, unlinked ITR. Existing follow-ups
  and monitoring are untouched.

The existing unfinished-draft prompt still takes precedence when the worker
has a draft for this patient.

## Care Plan & Next Steps

Each part shows only when it applies.

### A. This visit's diagnoses

One row per diagnosis with a single choice (default **No Ongoing Tracking**):

- **No Ongoing Tracking**
- **Monitor at BHC**
- **Refer to RHU** — includes the condition in the visit's referral, which is
  tracked through its own status and the RHU feedback. It starts no BHC
  monitoring and needs no BHC follow-up date.

*Monitor at BHC + Refer to RHU* (`monitor_refer`) was retired on 2026-10-04:
older records keep it and still read back with that label, but it is no
longer offered and a new save rejects it. A draft holding it resolves to
*Refer to RHU*. A condition the BHC should follow clinically is set to
*Monitor at BHC*.

Monitor is available for **any** diagnosis, registered or free text.

Matching an existing active monitoring record uses a **condition identity**:
the registry `conditionKey` for registered diagnoses (so "HTN" continues
"Hypertension"), otherwise the normalized name (trimmed, lower-cased,
whitespace collapsed). When a row matches an active record, it shows
"Monitored at BHC since {date}", and choosing Monitor attaches this visit to
that same record — never a second one.

No Ongoing Tracking never stops monitoring by itself (see B for stopping).

### B. Continuing monitoring

For each monitoring record selected in the modal:

- If its condition is **not** among this visit's diagnoses: a row with
  **Continue monitoring** (default) or **Stop monitoring** (free-text reason
  required).
- If its condition **is** among this visit's diagnoses, it is handled on that
  diagnosis row, which then **defaults to *Monitor at BHC*** instead of No
  Ongoing Tracking: *Monitor at BHC* continues it; *Refer to RHU* also keeps
  it active (the referral never ends monitoring by itself - the visit is
  recorded in its history as referred); *No Ongoing Tracking* stops it, and a
  stop reason is then required.

Continued monitoring therefore stays active unless the worker explicitly
stops it.

Stopping monitoring does not change the Current Conditions status, and
changing that status does not stop monitoring.

### C. Referral

Shown when any diagnosis is *Refer to RHU*. The referral closes through its
own status / outcome, never through a care-plan choice.
**One referral per consultation**, with the existing fields (receiving RHU,
priority, reason) and existing rules (`referrals.submit` permission, RHU
doctor-availability block). The reason is pre-filled from those diagnoses
("Referred for: Diabetes Mellitus; Hypertension") and stays editable.

The RHU records its own assessment/outcome on the referral through the
existing `feedback` record (RHU diagnosis, action taken, treatment notes,
recommendation), which returns to the BHC. The RHU never edits the BHC ITR.
A monitored condition's history shows that feedback for visits that referred
it.

### D. Next follow-up

Shown when any condition is monitored in this visit (started or continued),
or a selected service needs a next visit (EPI's next-dose date keeps
pre-filling it as today). **One follow-up task per consultation.** The date
is optional; if set, a reason is required (existing rule). The task is linked
to every condition monitored in this visit.

A referral hands the follow-up to the RHU unless another diagnosis is set to
*Monitor at BHC* or a service visit has its next date. A referred condition
whose monitoring merely stays active does not keep it; the BHC schedules the
next monitoring visit after the RHU feedback.

When nothing is monitored, no service needs a next visit and nothing is
referred, the step reads "No follow-up or referral required."

### Compatibility

The visit-level `followUpStatus`, `followUpDate`, `followUpReason` and
`needs_referral` values are still derived from the choices above, so every
existing reader (Follow-ups list, reports, record details) keeps working.

## Data model

### New tables

**`condition_monitorings`** — one row per monitored condition per patient.

```
id, patient_id, barangay_health_center_id,
condition_key (nullable; registry key),
condition_name (as recorded; registry name when registered),
condition_identity (conditionKey, else "name:" + normalized name),
status (active | stopped),
started_health_record_id, started_at,
stopped_health_record_id (nullable), stopped_at (nullable), stop_reason (nullable),
created_by, updated_by, timestamps
```

Partial unique index on `(patient_id, condition_identity) WHERE status =
'active'` — at most one active record per patient and condition. A stopped
condition can be monitored again later as a new record.

**`condition_monitoring_visits`** — append-only history.

```
id, condition_monitoring_id, health_record_id,
action (started | continued | stopped), referred (boolean), created_at
```

Unique on `(condition_monitoring_id, health_record_id)`.

**`condition_monitoring_follow_up_task`** — pivot linking the visit's follow-up
task to each monitoring record it covers (`condition_monitoring_id`,
`follow_up_task_id`).

### Changes to existing data (no new columns)

- `health_records.diagnoses[]` entries gain:
  - `carePlan`: `none | monitor | refer` on a new save (server-validated;
    `monitor_refer` only on records saved before 2026-10-04),
  - `includeInSurveillance`: boolean.
  The ITR permanently records what was decided.
- `config/clinical_registry.php`: the `tuberculosis` entry gains
  `'monitoring_details' => 'tb_dots'` (served by `/api/clinical-registry`).
- `health_records.vital_signs.fbs`: nullable number, mg/dL, validated
  numeric and non-negative.
- Continued follow-up tasks get `fulfilled_by_health_record_id` = the new
  ITR (a task can already be fulfilled by any ITR; several tasks may share
  one).
- The new ITR's `visit_type` is `follow_up_visit` when anything was
  continued, and `parent_health_record_id` points to the most recent
  previous ITR among the selections. This is **backward compatibility and
  display only**; the authoritative links to the continued follow-ups and
  monitoring are `follow_up_tasks.fulfilled_by_health_record_id` and
  `condition_monitoring_visits`.
- Request and draft payload gain a `care_plan` block:
  - `continued_follow_up_task_ids: int[]`
  - `continued_monitoring_ids: int[]`
  - `monitoring_stops: [{ monitoring_id, reason }]`
  Draft autosave (`HealthRecordDraftPayloadService::SCHEMA`) carries it.
  The server verifies every referenced task / monitoring record belongs to
  the same patient and is still active.

### One save, one transaction

`HealthRecordController::store`, inside its existing `DB::transaction`:

1. Create the ITR.
2. Sync Current Conditions (existing `CurrentConditionsSync`).
3. Start / continue / stop monitoring records and append their history rows.
4. Mark the continued follow-ups fulfilled by this ITR.
5. Create the one new follow-up task (if a date was set) and link it to the
   monitoring records.
6. Create the one referral (existing `ReferralCreationService`).
7. Dispense medicines (existing).

All or nothing: any failure rolls everything back. A unique-index collision
from a concurrent save of the same condition returns a retryable conflict.
The existing idempotency key still guards duplicate submits.

Reports, service history and the surveillance report read from the ITR
fields; nothing is copied or re-entered.

### Permission

Monitoring changes are part of saving a consultation and are covered by
`consultations.finalize`. There is no separate monitoring permission.

### API

- `GET /api/patients/{patient}/care-overview` — only what the Start
  Consultation modal needs, nothing clinical beyond condition names:

  ```
  {
    pending_follow_ups: [{ id, due_date, due_time, state, is_overdue, reason,
                           source_health_record_id, source_date,
                           conditions: [{ monitoring_id, condition_name }] }],
    monitoring_without_follow_up: [{ id, condition_name, condition_key,
                                     started_at, last_visit_date }]
  }
  ```

  No ITR bodies, vitals, diagnoses lists or referral data. Allowed for users with `consultations.encode` or
  `clinical.history` (an encoder must be able to start a consultation), plus
  the usual facility access check.
- `POST /api/health-records` — gains `care_plan`, `diagnoses.*.carePlan`,
  `diagnoses.*.includeInSurveillance`, `vital_signs.fbs`.

## Reports

- **Surveillance Report** lists diagnoses with `includeInSurveillance`, grouped
  by diagnosis name. Records saved before this change are still read through
  the legacy `surveillanceTags` / `hfmdSurveillance` fallback
  (`getSurveillanceTags`).
- **Morbidity / Notifiable** reports: unchanged (`reportAs`).
- TB report / filters: legacy category **or** `tb_data`.

## Cleanup (in scope)

BHC consultation only:

1. Dead flags and everything behind them: `purposeFlow = false`,
   `generalSelected = true`, `isEditingRecord = false`, and every branch that
   tests them (including the "BHC Assessment" field on Actions Taken and the
   `generalSelected` parameter of `consultationSteps.js`).
2. Purpose of Visit flow: `PurposeOfVisitModal.jsx`, the workspace's
   `visitPurpose` state and `PregnancyConfirmation` usage, and backend
   `VisitPurpose` validation for new saves. Keep `VISIT_SERVICES` and the
   teenage-pregnancy message in `utils/visitPurpose.js` for
   `BhcConsultationDetails`, which displays old records.
3. The legacy follow-up form: every `!usesConsultationSteps` /
   `isFollowUpVisitMode` rendering path and its free-text-only reporting row.
   Old follow-up ITRs stay readable through the record detail pages.
4. TB as a program: `TB` in `PROGRAM_CLASSIFICATIONS` (frontend) and
   `ConsultationPrograms::CLASSIFICATIONS` (backend), the
   `selectedPrograms`-based `isTb`, and the panel's `PROGRAM_GROUPS`
   "Condition Monitoring" / "Other" groups. An old draft that stored a `TB`
   selection restores without it.
5. HFMD surveillance: the `surveillance_diseases` registry block,
   `ClinicalRegistry::matchSurveillance` / `isValidSurveillanceKey`,
   `surveillanceTags` on new saves, and the "Add to Surveillance" prompt.
   Keep the legacy reader for old records.
6. BHC Disposition: `NextActionSection` replaced by the new Care Plan
   component in `ConsultationWorkspace`. `NextActionSection` itself stays
   because `pages/rhu/RHUAddHealthRecords.jsx` uses it.

## Out of scope

- The RHU record form (`RHUAddHealthRecords.jsx`), including its stale
  "NCD Monitoring" label.
- Changing the TB Form 4b, its PDF, or `tb_data`'s shape.
- Editing saved ITRs (never).
- Stopping monitoring outside a consultation (e.g. from the Patient Profile).
- A Patient Profile monitoring section (the `care-overview` endpoint makes it
  additive later).
- Per-disease surveillance case fields.

## Testing

Backend feature tests:

- Monitoring start / continue / stop; one active record per patient and
  condition, including a concurrent-save collision; free-text match by
  normalized name; alias match by `conditionKey` ("HTN" continues
  "Hypertension"); stop requires a reason; stopping leaves Current
  Conditions status unchanged.
- One follow-up linked to every monitored condition; continued follow-ups
  fulfilled by the new ITR; `care_plan` ids belonging to another patient, or
  already closed, are rejected.
- One referral containing exactly the referred diagnoses; referring a
  continued condition keeps its monitoring active without a stop or a
  follow-up date; a new save rejects `monitor_refer`.
- Category stays service-based; TB detection by `tb_data` for new records and
  by category for old ones.
- `care-overview` output and access control.
- `vital_signs.fbs` validation; nothing derived from it.
- `includeInSurveillance` round-trip; legacy HFMD-tagged records still in the
  Surveillance Report.
- `care_plan` draft round-trip.

Frontend unit tests:

- Care Plan section visibility and defaults; stop-reason requirement;
  pre-filled referral reason.
- Modal skip logic (no pending follow-ups and no active monitoring → no
  modal).
- Monitoring Details appears only when a monitored (started or continued)
  condition declares `monitoring_details`; one section per distinct key; a
  test registry entry with a second key renders through the same map.
- A continued condition that is re-diagnosed defaults to *Monitor at BHC*.
- The simplified step sequence (no `generalSelected`, no legacy form).

Regression: backend suite stays at its current baseline (201 failures that
already existed, no new ones); frontend tests, lint and build stay green.

## Rollout

New migrations are written and tested locally (SQLite in tests) but **not**
run against Supabase until the developer approves, together with
`2026_09_30_000001_drop_care_pathway_tables`.

Implementation is phased (the implementation plan fixes the exact order):

1. Backend: monitoring tables, models, save flow, `care-overview`, request /
   draft changes, FBS and surveillance flags, category/TB detection.
2. Frontend: Care Plan & Next Steps, Monitoring Details step, Start
   Consultation modal.
3. Retire the legacy follow-up form and dead flags.
4. Barangay Health Services panel, FBS field, surveillance checkbox, HFMD
   removal.
