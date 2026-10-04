# Clinical Boundary & RHU Condition Confirmation

Date: 2026-10-05 · Status: approved in brainstorming, awaiting spec review

Part 1 of 4 of the Patient Background rework. Order: **Clinical boundary /
assessment (this spec)** → Patient Background dashboard → Family relationships
→ Family Medical History / service integration (e.g. Maternal Care).

## Goal

Make the clinical boundary explicit: **BHC detects and refers → RHU assesses
and confirms → AKAY activates the confirmed condition → BHC may then monitor
the established condition.**

- BHW consultation records hold **Health Concerns** and a next action — never
  suspected or confirmed diagnoses.
- Finalizing a BHC consultation never creates, confirms or activates a
  condition.
- Only an RHU user sets a condition's clinical status, through an explicit
  action.
- Conditions are generic: no Hypertension/Diabetes-specific behavior; any
  confirmed condition may be monitored.

## Decisions

| # | Decision |
|---|----------|
| 1 | Clinician-confirmed conditions live in a new `patient_conditions` table (approach A), not in `medical_background.currentDiseases`. |
| 2 | Condition statuses (RHU only): `under_evaluation`, `active`, `controlled`, `resolved`, `ruled_out`. BHC never sets any status. |
| 3 | RHU confirms via a **Confirm Conditions** block on the referral feedback form and on the RHU health record form. Free-text `rhu_diagnosis` / "Updated Diagnosis" alone never activates anything. |
| 4 | BHC Assessment's "Suspected Case" becomes **Health Concerns**: free text, no suggestions, no "Add to Current Conditions". |
| 5 | Each Health Concern has one next action: **Recheck** (date; recheck task only), **Follow-up**, or **Refer to RHU**. No Emergency Referral (the RHU is not an emergency facility). |
| 6 | Each Health Concern keeps Report as (Morbidity / Notifiable) and Include in Surveillance, chosen by the worker per reporting rules/case definitions, never auto-classified. Reporting never creates or activates a condition. Notifiable/surveillance entries may be suspected/syndromic cases. |
| 7 | Formal BHC monitoring may start only for an RHU condition in `active` or `controlled`. `under_evaluation` is visible but not monitorable. |
| 8 | BHC starts monitoring a newly confirmed condition only when the RHU ticked **Recommend BHC monitoring**, which creates a pending BHC follow-up task; it surfaces in the existing Start Consultation prompt like any pending follow-up. |
| 9 | The Start Consultation modal keeps its current flow (existing monitoring + pending follow-ups only); no general "Existing Active Conditions" selector. BHC services stay selected in the workspace. |
| 10 | Existing `condition_monitorings` rows stay usable as **Legacy BHC Monitoring**; they are not labelled or backfilled as RHU-confirmed. They link to a `patient_condition` only when the RHU later confirms the same condition. |
| 11 | Existing `currentDiseases` entries are never rewritten. All carry `source: "Consultation"` (both the old sync and the old manual editor wrote it), so their provenance is unclear: they display as **Unverified — recorded from BHC consultation**, never as patient-reported or confirmed. |
| 12 | New entries in the consultation background card are **Patient-Reported Previous Conditions** only (name + optional note, `source: "Patient-reported"`), never Active/Confirmed. Outside diagnoses go here; the BHW may refer to the RHU. |
| 13 | Removed: `CurrentConditionsSync`, `PatientBackground::applyConditionStatuses`, `addToConditions`, the BHC diagnosis combobox (the carePathways.js suggestion exception no longer applies to BHC). |

## Data model

### `patient_conditions` (new)

| column | notes |
|---|---|
| `id` | |
| `patient_id` | FK, cascade |
| `condition_name` | string(150), typed by the RHU user |
| `condition_identity` | string(160), same normalization as `condition_monitorings.condition_identity` (`ClinicalRegistry::conditionIdentity`) |
| `status` | `under_evaluation \| active \| controlled \| resolved \| ruled_out` (CHECK on pgsql) |
| `confirmed_by` | FK users, the RHU user who last set the status |
| `confirmed_at` | timestamp of the last status set |
| `source_type` | `rhu_feedback \| rhu_record` |
| `source_id` | feedback id or health record id |
| `created_by`, `updated_by`, timestamps | |

Partial unique index: one **open** row (`under_evaluation`, `active`,
`controlled`) per `(patient_id, condition_identity)`. RLS enabled on pgsql,
like the monitoring tables.

### `patient_condition_events` (new)

`patient_condition_id`, `from_status` (nullable), `to_status`, `note`
(nullable, 500), `source_type`, `source_id`, `changed_by`, `changed_at`.
Append-only; the profile shows it as each condition's history.

### Changes to existing tables

- `condition_monitorings.patient_condition_id` — nullable FK. Required for
  every monitoring started after this change; null means Legacy BHC
  Monitoring.
- `follow_up_tasks.patient_condition_id` — nullable FK; set on the task the
  RHU's "Recommend BHC monitoring" creates.
- `health_records.diagnoses[]` — unchanged storage. On a BHC record created
  after this change each entry is a Health Concern; `carePlan` takes
  `recheck | follow_up | refer` (plus `recheckDate` for `recheck`). Older
  records keep `none | monitor | refer | monitor_refer` and are read as before.
- `medical_background.currentDiseases` — unchanged storage; new entries carry
  `source: "Patient-reported"` and an optional `note`, no status.
  `PatientBackground::rules`/`normalize` accept `note` (max 500) and force
  `source: "Patient-reported"` on entries not already stored, so a staged
  update cannot add a "Consultation"/confirmed entry; stored legacy entries
  pass through unchanged.

## BHC consultation

- **Start Consultation modal:** unchanged flow. A pending follow-up task with
  a `patient_condition_id` appears as e.g. "Start BHC monitoring —
  Hypertension (recommended by RHU, confirmed 2026-10-01)". Ticking it opens
  the workspace with that condition's Condition Monitoring section in *start*
  mode.
- **Assessment & Next Steps:** only new BHC findings. Health Concerns list
  (free text, max as today) with per-concern next action and reporting
  controls. Recheck requires its own date and creates one recheck task per
  concern; Follow-up uses the visit's single follow-up date; the visit still
  has one referral (all referred concerns).
- **Condition Monitoring section** (one per ticked monitoring / start item):
  findings and notes; Continue Monitoring / Refer back to RHU / Stop BHC
  Monitoring (reason required). In *start* mode: Start BHC Monitoring. No
  clinical-status control anywhere on the BHC side.

### Finalize (backend, `HealthRecordController::store`)

- No condition write of any kind from a BHC record.
- `ConditionMonitoringService` starts monitoring only from a
  `patient_condition_id` that belongs to the patient and is `active` or
  `controlled`; otherwise 422. Starting fulfills the linked follow-up task.
  Continue/stop/refer of existing (incl. legacy) monitoring work as today.
- `ClinicalRegistry` remains only for identity matching and TB's
  `monitoring_details`; it drives no sync.

## RHU confirmation

**Confirm Conditions** block, on the referral feedback form and the RHU health
record form:

- Context (read-only): the Health Concerns the BHC referred; the patient's
  open conditions and any Legacy BHC Monitoring.
- **+ Confirm condition**: name, status, optional note, **Set on patient's
  record** tick (only ticked rows are written), **Recommend BHC monitoring**
  tick (only for `active` / `controlled`).
- Existing open conditions: change status with a note.

Saving, in the same transaction as the feedback / record:

- Lock the patient row. A confirmation whose identity matches an open row
  updates that row; otherwise insert. Write one event per change.
- If an active Legacy BHC Monitoring row has the same identity and the new
  status is `active` / `controlled`, link it (`patient_condition_id`) — no
  new task needed.
- "Recommend BHC monitoring" with no linked active monitoring creates a
  pending follow-up task at the patient's BHC with `patient_condition_id`
  set.

Authorization: new action permission `conditions.confirm`, granted to the RHU
profile only; the backend also requires an RHU working facility → otherwise
403.

## Profile display (Medical Conditions groups)

Applied to the Background tab, `PatientFactsSections`, `PatientAlertChips`
and the overview. Part 2's dashboard reuses these groups.

1. **Confirmed / Monitored** — RHU `active` / `controlled` ("Confirmed by RHU
   · <date>", plus "Monitored at BHC since …" when linked), and Legacy BHC
   Monitoring rows labelled **Legacy BHC Monitoring** (never "confirmed by
   RHU"). Alert chips come only from this group.
2. **Under Evaluation** — RHU `under_evaluation`, labelled "Under RHU
   evaluation". Not monitorable.
3. **Unverified — recorded from BHC consultation** — legacy `currentDiseases`
   entries (`source: "Consultation"`), name and date exactly as stored.
4. **Patient-Reported Previous Conditions** — `currentDiseases` entries with
   `source: "Patient-reported"` only.
5. **Past (n)** — `resolved` / `ruled_out`, collapsed; each expands to its
   event history with who, when and the source feedback/record.

## Migration

One reversible migration: create `patient_conditions` and
`patient_condition_events`; add the two nullable FKs. No backfill: legacy
monitoring stays unlinked, `currentDiseases` is not touched.

## Testing

Backend feature tests:

- A BHC finalize with concerns — including names matching registry entries —
  creates no condition and no `currentDiseases` change.
- Concern reporting flags still reach the morbidity and surveillance reports.
- Recheck creates a task, never a monitoring row.
- Start monitoring: 422 without a `patient_condition_id`, for another
  patient's condition, and for `under_evaluation` / `resolved` /
  `ruled_out`; success fulfills the RHU follow-up task.
- Legacy monitoring continues/stops as before.
- `conditions.confirm`: 403 for BHC users and non-RHU facilities.
- Feedback and RHU-record confirmations write the condition and its event in
  the same transaction; an unticked row writes nothing; a second confirmation
  of the same identity updates the open row; the one-open-row index holds.
- Confirming a condition links matching Legacy BHC Monitoring.
- "Recommend BHC monitoring" creates exactly one pending task.
- Patient-reported entries are saved through the consultation background
  update with the existing revision/409 rules.

Frontend unit tests:

- Medical Conditions grouping, including the Unverified rule for legacy
  `source: "Consultation"` entries and Legacy BHC Monitoring labelling.
- Start Consultation prompt: an RHU "start monitoring" task appears as a
  pending item; no general condition selector exists.
- Health Concern next action validation (Recheck needs a date; no emergency
  option).

## Out of scope (later parts)

The 40/40/20 Background dashboard, list-based allergies and
hospitalizations/surgeries, structured social history, Family Serial
grouping and relationships, Family Medical History entries, Maternal Care
reuse.
