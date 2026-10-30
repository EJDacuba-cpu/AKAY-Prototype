# Care Pathway / Monitoring Pathway Architecture

## Context

Two days ago (2026-09-27), Hypertension/Diabetes were removed as a
consultation "program" entirely (`docs/superpowers/plans/2026-09-27-remove-hypertension-diabetes-program.md`).
Yesterday's session (uncommitted) reintroduced them narrowly, hardcoded as an
`'NCD'` entry in the same `ConsultationPrograms` list TB, Maternal, Family
Planning and EPI already share, with a diagnosis-triggered "Start Monitoring"
suggestion that just toggled that program key. Nothing about that NCD
implementation is committed, so it is free to be reshaped rather than
migrated.

The user now wants the underlying concept generalized before any more
conditions are added: `ConsultationPrograms` conflates two different things -
**visit services** (Maternal/Prenatal, Family Planning, EPI: chosen up front,
one visit-shaped form each) and **condition monitoring** (TB-DOTS, and now
NCD: diagnosis-driven, longitudinal, and meant to span many future visits for
the same patient). Only the second kind should become a **Care Pathway**: a
configurable, patient-level enrollment that a diagnosis makes *available*,
never assigns automatically. Visit services are explicitly out of scope for
this change and keep their existing mechanism untouched.

This spec is the result of a 12-question requirements pass with the user
(recorded inline below where a decision it produced needs to be visible) and
is scoped to: (1) the generic Care Pathway registry and enrollment model, (2)
migrating NCD Monitoring and TB-DOTS onto it, (3) the new
Diagnosis → Start Monitoring → Select Condition(s) → Select Pathway →
Activate flow, and (4) Continue Follow-up on a later visit. Maternal, Family
Planning and EPI are not touched.

## What stays exactly as it is (compatibility)

No existing table is renamed and no stored JSON key is renamed. Concretely:

| Name | Why it survives unchanged |
|---|---|
| `health_records.category` (string) | Read by list filters (`HealthRecords.jsx`), reports (`BHCReports.jsx`), the TB history tab (`SpecializedRecordsTab.jsx`), `recordDetailsHelpers.js`, and the draft `classification` check. A pathway-only visit's category is still set from the registry (see "Category derivation" below) so all of these keep working with zero changes. |
| `health_record_drafts.classification` | Encrypted drafts already store this string; `HealthRecordDraftRequest::CLASSIFICATIONS` keeps `'TB DOTS / TB Monitoring'` and gains `'NCD Monitoring'`, exactly as an ordinary classification. |
| `monitoring_data.selectedPrograms` / `primaryProgram` | Kept, but its meaning narrows to **visit services only** (Maternal, Family Planning, EPI) — see "Visit services vs. Care Pathways" below. Existing records/drafts with `TB` or `NCD` in this array are read as before by `getConsultationPrograms()` (nothing breaks); new saves never write pathway keys into it. |
| `health_records.tb_data` column, `TbTreatmentCardForm.jsx`, DOH Form 4b PDF | TB-DOTS keeps its full existing verified form and storage untouched. A TB pathway encounter's clinical detail is still `tb_data`, not the new generic field-set JSON. |
| `parent_health_record_id`, `follow_up_tasks` | The follow-up chain is reused, not replaced, as the mechanism a pathway encounter links through (see "Follow-up integration"). |
| Everything from yesterday's `monitoring_data.ncdData` work | Uncommitted. Superseded by the generic model below (`care_pathway_encounters.field_data`); removed rather than migrated. |

## Visit services vs. Care Pathways (the split)

`ConsultationPrograms::CLASSIFICATIONS` currently holds `Maternal`, `TB`,
`Family Planning`, `EPI`, `NCD`. It splits into two independent concepts,
each with its own list of "active screen keys" for the visit, merged only at
the point where the step sequence is built:

- **Visit services** (`ConsultationPrograms`, unchanged shape, TB/NCD
  removed): `Maternal`, `Family Planning`, `EPI`. Selected via the existing
  checkbox panel on the Interview step, exactly as today. `selectedPrograms`/
  `primaryProgram` mean only this from now on.
- **Care Pathways** (new `CarePathwayRegistry`): `ncd`, `tb_dots`. Never
  selected via a checkbox. An encounter's set of active pathways for *this*
  visit is a new, separate list — `activeCarePathways: ["ncd"]` — populated
  only by Start Monitoring or Continue Follow-up, carried in `monitoring_data`
  next to (not merged with) `selectedPrograms`.

The consultation's step engine (`consultationSteps.js`) does not change its
mechanics: `getProgramFormSteps` already turns "a list of keys + a
classification lookup" into ordered steps. `ConsultationWorkspace.jsx` builds
one merged list (`[...selectedPrograms, ...activeCarePathwayProgramKeys]`)
against a merged classification lookup (`{...PROGRAM_CLASSIFICATIONS,
...pathwayClassifications}`) before calling it, so a TB or NCD step appears
in the same "Program / Service Details" step exactly as it does today — the
only thing that changed is what feeds that list.

**Category derivation** (this visit's `health_records.category`), per the
user's explicit choice: if a visit service is selected, its classification
wins (unchanged behavior); otherwise, if exactly one Care Pathway is active
this visit, that pathway's configured category wins; otherwise `"General
Consultation"`. Two simultaneous pathways with no visit service (e.g. a
patient with both NCD and TB) fall back to General Consultation for the
category column, same as today's rule for two co-equal programs with no
explicit choice — their detail still saves fully via `activeCarePathways`
and each pathway's own encounter row.

## Data model

Four new tables. Nothing else changes shape.

**`care_pathway_enrollments`**
```
id, patient_id, pathway_key (string, e.g. "ncd"), status (active|completed|discontinued),
barangay_health_center_id, started_health_record_id, started_at,
ended_health_record_id (nullable), ended_at (nullable), end_reason (nullable),
created_by, updated_by, timestamps
```
Partial unique index on `(patient_id, pathway_key) WHERE status = 'active'` —
the database guarantees one active enrollment per pathway per patient; a
patient may still have several *different* active pathways at once.

**`care_pathway_enrollment_conditions`**
```
id, enrollment_id, condition_name (string, the diagnosis text as typed),
field_set_key (nullable string — the pathway's chosen field set, e.g.
"diabetes_monitoring"; null means "None"), diagnosis_ref (string, the
diagnosis entry's id it came from, for traceability only),
added_health_record_id, removed_health_record_id (nullable), removed_at (nullable)
```
Removing a condition from an enrollment is a soft end stamped with the visit
that removed it — never a delete. `field_set_key` is persisted here (not
re-asked) per the user's explicit requirement that a later encounter reuses
the same field set.

**`care_pathway_encounters`** (append-only)
```
id, enrollment_id, health_record_id, kind (started|continued|legacy_linked),
field_data (json, nullable), created_at
```
Unique on `(enrollment_id, health_record_id)`. `field_data` holds the
generic pathway's field-set values for *this visit* (e.g.
`{"diabetes_monitoring": {"fbs": "126 mg/dL"}}`); a `legacy_linked` row
carries no `field_data` — it only records that an old, unmodified TB record
now counts as this enrollment's history.

**`care_pathway_enrollment_follow_up_task`** (pivot)
```
enrollment_id, follow_up_task_id
```
Populated only from the Disposition checklist (see below); a visit opened
from that follow-up task auto-links to exactly those enrollments.

Immutability is preserved throughout: a health record, once saved, is never
edited by any of this. An enrollment's status/conditions only change via a
*new* saved consultation, in the same transaction as that consultation's
`HealthRecord::create()`, and every enrollment/condition change is written to
the existing `AuditLogger`.

## The registry

`backend/config/care_pathways.php` is the single source of truth — config,
not a database table, so a verified pathway is a reviewed code change, not a
runtime-editable clinical form:

```php
return [
    'ncd' => [
        'label' => 'NCD Monitoring',
        'category' => 'NCD Monitoring',
        'field_sets' => [
            'hypertension_monitoring' => ['label' => 'Hypertension Monitoring', 'fields' => []],
            'diabetes_monitoring' => [
                'label' => 'Diabetes Monitoring',
                'fields' => [
                    'fbs' => ['label' => 'Fasting Blood Sugar (FBS)', 'type' => 'string', 'max' => 100],
                ],
            ],
        ],
    ],
    'tb_dots' => [
        'label' => 'TB-DOTS',
        'category' => 'TB DOTS / TB Monitoring',
        // TB keeps its own existing verified form and health_records.tb_data
        // column - it is not expressed as generic field sets.
        'uses_dedicated_form' => true,
    ],
];
```
An empty `fields: []` field set (Hypertension Monitoring today) is still a
real, selectable option — its form is just "the vitals already captured this
visit; no condition-specific fields are verified yet." This is what lets a
condition join a pathway with `field_set_key = null` ("None") or with an
empty-but-named set, without inventing fake generic fields, per the user's
explicit instruction.

`GET /api/care-pathways` serves this config read-only (auth required, no
special permission — everyone who can open a consultation needs to see what's
available). The frontend keeps zero copy of pathway definitions; it always
renders from this response. A new pathway or field set is: one config array
entry, reviewed and deployed — no consultation-flow redesign, satisfying the
scalability requirement directly.

`ConsultationPrograms::NCD_CONDITIONS`, `monitoring_data.ncdData` and its
validation rules, `NcdMonitoringForm.jsx`, and `ncdMonitoring.js` (all
uncommitted) are deleted, superseded by this.

## Diagnosis → pathway: no mapping

Per the user's explicit decision, `carePathways.js`'s
`STRUCTURED_DIAGNOSES`/`CARE_PATHWAYS` diagnosis→pathway mapping and the
auto-appearing "Suggested: NCD Monitoring" card
(`CarePathwaySuggestions.jsx`, wired into `ConsultationWorkspace.jsx`'s
Assessment section) are **removed**, replaced by the explicit Start
Monitoring button and panel described below. Hypertension
and Diabetes Mellitus remain typing suggestions in the Diagnosis / Clinical
Impression field (that registry, `findStructuredDiagnosis`/
`filterDiagnosisSuggestions`, is unrelated to pathways and is untouched) but
carry no pathway linkage. The two decisions are now fully independent, which
is exactly the "diagnosis and care pathway are separate concepts" requirement
made structural rather than just documented.

Removing that mapping also retires the guard added last session in
`DiagnosisListField.jsx` (`findOrphanedPathway`), which warned before
deleting the last diagnosis the *mapping* linked to an active pathway. That
check is replaced by a real one, since real enrollment data now exists to
check against: before removing or renaming a diagnosis, look up whether its
exact name is an un-removed `care_pathway_enrollment_conditions.condition_name`
in any of this patient's *active* enrollments (a small read on patient
select, alongside the panel's own enrollment list). If so, warn exactly as
before ("this diagnosis is linked to an active enrollment; removing it here
does not end the enrollment"); otherwise no warning. This is more accurate
than the old mapping-based guard, since it reflects what the worker actually
enrolled rather than which two condition names happen to be configured.

## The flow: Start Monitoring

Available only from the Assessment step, once at least one diagnosis exists
(button sits directly under `DiagnosisListField`, replacing the old
suggestion card):

1. **Start Monitoring** opens an inline panel (no modal, matching the
   existing diagnosis UI's own constraint) listing every diagnosis recorded
   in *this* consultation as a checkbox: "Select the condition(s) that need
   ongoing monitoring."
2. After picking one or more, the panel shows the pathways from `GET
   /api/care-pathways`: "Which care pathway do these belong to?" — a single
   choice (a diagnosis set joins one pathway at a time; picking two
   conditions destined for different pathways means running Start Monitoring
   twice, once per pathway).
3. If the chosen pathway has field sets (NCD does), each selected condition
   gets its own "Monitoring form" dropdown populated from that pathway's
   `field_sets`, defaulting to **None**.
4. If the chosen pathway is TB-DOTS and the patient has prior TB records
   (queried by patient, category `TB DOTS / TB Monitoring`) with no
   enrollment yet, the panel offers: "Link previous TB-DOTS records to this
   enrollment?" — an explicit, unticked checkbox; the worker decides per the
   user's requirement that the system never infers this.
5. **Activate** stages everything in consultation state
   (`pendingCarePathwayActivations`) — nothing is persisted yet. The pathway
   is added to `activeCarePathways` for this visit, so its step (TB's
   existing form, or a small generic form rendering the chosen field sets)
   now appears in the step sequence.
6. On consultation save, inside the existing `HealthRecordController::store`
   transaction, right after `HealthRecord::create()`: for each staged
   activation, create the `care_pathway_enrollments` row (or reuse a still-
   active one, if Continue Follow-up staged it instead — see below),
   `care_pathway_enrollment_conditions` rows, one `care_pathway_encounters`
   row (`kind: started`) carrying this visit's field-set values, and, if TB
   records were chosen for linking, one `legacy_linked` encounter row per
   linked record. If save fails or the draft is discarded, nothing here ever
   existed, per the user's explicit requirement.

**Continue Follow-up**, per the user's decision, only appears when the
consultation was opened from that pathway's scheduled follow-up task
(mirroring how `visit_type: follow_up_visit` already resolves a linked task
today). It stages a `continued` activation against the existing active
enrollment instead of a new one, reusing each condition's already-recorded
`field_set_key` without re-asking, and otherwise persists the same way at
save time.

**Ending or changing an enrollment** (Complete / Discontinue with a reason;
add/remove a condition) is only ever done from inside a pathway encounter
(Start Monitoring's panel gains a second mode when the pathway is already
active for this patient: "Manage this enrollment" instead of "Start"), and
takes effect in the same save transaction, per the user's decision. This is
in scope for this change (not deferred).

## Disposition: linking a scheduled follow-up to a pathway

`NextActionSection.jsx` (used by every consultation, unchanged otherwise)
gains one small block, shown only when `activeCarePathways` is non-empty for
this visit: "This follow-up is for:" with one checkbox per pathway active in
this consultation, **unticked by default**. On save, the created/updated
`FollowUpTask` is linked via `care_pathway_enrollment_follow_up_task` only
for ticked pathways — the user's explicit choice over auto-linking every
pathway in the visit.

## Permission

A new `care_pathways.manage` permission (added to `ActionPermissions::ALL`
and the `'clinical'` preset) gates Activate, Continue, condition changes and
ending an enrollment — both server-side (`EnforceActionPermissions` /
`ActionPermissions::ensure`) and in the UI (Start Monitoring is hidden
without it, same pattern `canAddToConditions` already uses for the diagnosis
checkbox). `resources/js/pages/admin/*` permission-preset editors
(`StaffAssignments.jsx`, `AddUser.jsx`) need the new permission added to
their checkbox list, since they already enumerate `ActionPermissions::ALL`-
shaped options.

## Legacy TB records

No backfill migration. Existing TB records and their `tb_data` are untouched
and remain readable exactly as today (`SpecializedRecordsTab.jsx`'s TB
history tab keeps working off `category`, unaffected). The only new
behavior is the explicit linking offer described in step 4 above, on the
patient's *next* consultation — never inferred, never automatic, exactly as
decided.

## Care & Monitoring panel

`ConsultationProgramPanel.jsx` is renamed in the UI to "Care & Monitoring"
(component file can keep its name or be renamed — implementation detail).
Per the user's explicit decision:
- **Kept, unchanged:** the Maternal / Family Planning / EPI checkboxes
  ("Services" group).
- **Removed:** the TB and NCD checkboxes and the "Condition Monitoring /
  Evaluation" group that held them.
- **Added:** a new, strictly read-only section listing the patient's active
  Care Pathway enrollments (queried once the patient is selected), each with
  a "Continue Follow-up" action *only* when this visit was opened from that
  enrollment's linked follow-up task (see above) — otherwise just a status
  line. This section never offers a way to start a new pathway; Start
  Monitoring on the Assessment step is the only entry point, per the user's
  explicit "one clear entry point" requirement.

## API surface (new)

- `GET /api/care-pathways` — the registry, read-only.
- `GET /api/patients/{patient}/care-pathway-enrollments` — a patient's
  enrollments (active and past), with their conditions and encounter count;
  used by the Care & Monitoring panel and (later) a Patient Profile section.
  Gated by `clinical.history` (read), matching how Current Conditions reads
  are already gated.
- No dedicated write endpoint: enrollment changes are never a standalone API
  call, only a side effect of `POST /api/health-records` (and, for follow-up
  linking, the existing follow-up task completion path) inside its existing
  transaction, per the user's explicit "created only on save" decision.
- `HealthRecordRequest` gains: `monitoring_data.activeCarePathways` (array,
  keys validated against the registry), and per staged activation, its
  conditions/field-set values — validated per-field against whatever field
  set was actually chosen (never a single hardcoded shape), plus the
  optional `linkLegacyTbRecordIds` array and the Disposition
  `followUpForPathways` array.
- `HealthRecordDraftPayloadService::SCHEMA` gains the matching draft-side
  keys so autosave keeps working through this flow before it is saved.

## Testing plan

- Backend unit tests for the registry loader/validator (unknown pathway key,
  unknown field-set key, and a field set's own field rules, all rejected).
- Feature tests: activation creates exactly the rows described, in one
  transaction, rolled back on failure; the partial-unique-active-enrollment
  index is exercised (a second concurrent "start" attempt is rejected, not
  duplicated); Continue Follow-up reuses the existing enrollment and its
  conditions' saved field sets without re-asking; legacy TB linking creates
  `legacy_linked` encounters without touching the linked records; the
  Disposition checklist links the follow-up task only for ticked pathways;
  `care_pathways.manage` is enforced for every write path.
- Existing suites that must keep passing unchanged: `ConsultationProgramsTest`
  (visit services only, now without TB), `RemovedHypertensionDiabetesProgramTest`
  (old `Hypertension`/`Diabetes` keys still rejected), `CurrentConditionsSyncTest`
  (fully unrelated, diagnosis-level), the TB-DOTS PDF/`tb_data` tests.
  `NcdMonitoringProgramTest` (uncommitted, from yesterday) is deleted and
  replaced by the new Care Pathway feature tests above.
- Frontend: unit tests for the new registry-consuming helpers (condition
  selection, field-set defaulting to None, category-derivation rule), and the
  removal of `carePathways.js`'s diagnosis→pathway mapping tests.

## Out of scope (explicitly, per the user)

- Maternal, Family Planning and EPI do not become Care Pathways or gain
  patient-level enrollment in this change.
- No admin UI to create pathways or field sets at runtime — config only.
- No automatic diagnosis→pathway inference, pre-selection, or "commonly used
  for" hinting anywhere in the flow.
