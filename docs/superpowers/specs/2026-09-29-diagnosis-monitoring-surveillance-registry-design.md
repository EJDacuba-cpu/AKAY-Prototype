# Diagnosis, Monitored Conditions & Surveillance Registry

## Context

This spec supersedes `docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md`
and its plan (`docs/superpowers/plans/2026-09-28-care-pathway-backend-foundation.md`).
Neither was committed to code, so nothing is migrated — the work below replaces
that design outright rather than amending it.

The user asked to rework two parts of Physical Exam & Assessment:

1. **Diagnosis** (renamed from "Diagnosis / Clinical Impression"): typing a
   diagnosis that matches a registered, monitored condition (initially
   Hypertension, Diabetes Mellitus, Tuberculosis) should automatically place
   that condition on the patient's profile under Current Conditions —
   scalable, so a new condition is one registry entry, not a code rewrite of
   the consultation flow.
2. **Records & Surveillance**: the single hardcoded HFMD checkbox becomes a
   registry of surveillance diseases, the same "one entry, no flow rewrite"
   shape, with diagnosis able to *suggest* (never force) a surveillance tag.

This absorbs yesterday's Care Pathway work: **enrollment** (Start Monitoring,
longitudinal tracking, the `care_pathway_*` tables) is still needed and still
explicit, but the two registries yesterday's spec built separately — care
pathways and (in earlier still-uncommitted work) NCD conditions — and the
diagnosis suggestion list (`carePathways.js`) are unified into **one**
config-driven clinical registry with three lists: monitored conditions,
surveillance diseases, and care pathways. One endpoint serves all three.

### Revising yesterday's "no mapping" decision

Yesterday's spec deliberately removed any diagnosis → pathway mapping,
reasoning that diagnosis and enrollment should be fully independent. That
still holds for **enrollment**: recording a registered diagnosis never
starts, pre-selects, or infers a Care Pathway enrollment — Start Monitoring
stays the one explicit entry point, exactly as decided. What changes is that
a monitored condition's registry entry *names* which pathway it belongs to
(`ncd`, `tb_dots`), used only to (a) auto-sync Current Conditions, (b) show a
badge naming the pathway on its chip and on the profile, and (c) pre-scope
Start Monitoring's pathway choice when the picked condition already names
one. None of this activates or changes an enrollment by itself.

## What stays exactly as it is (compatibility)

| Name | Why it survives unchanged |
|---|---|
| `health_records.category` (string) | Read by list filters, reports, the TB history tab, `recordDetailsHelpers.js`, and the draft `classification` check. Category derivation rule from yesterday's spec (visit service wins, else the single active pathway's category, else "General Consultation") is unchanged. |
| `health_record_drafts.classification` | Unchanged; still gains `'NCD Monitoring'` alongside the existing TB classification. |
| `monitoring_data.selectedPrograms` / `primaryProgram` | Visit services only (Maternal, Family Planning, EPI), as decided yesterday. |
| `health_records.tb_data`, `TbTreatmentCardForm.jsx`, DOH Form 4b PDF | TB-DOTS keeps its own verified form and storage untouched. Pulmonary vs. extrapulmonary stays an anatomical-site classification made *on that form*, never inferred from the diagnosis text. |
| `parent_health_record_id`, `follow_up_tasks` | Reused as the follow-up chain a pathway encounter links through. |
| `monitoring_data.hfmdSurveillance`, `surveillanceCategory` / `diseaseSurveillanceCategory`, `otherSurveillanceCategory` | Still written on every save (derived from the new `surveillanceTags`) and still read by every existing helper (`getHfmdSurveillance`, `BHCReports.jsx`'s filters) for records saved before this change. No backfill migration. |
| `medical_background.currentDiseases[].{name,status,firstRecorded,lastConfirmed,source}` | Shape unchanged; gains one new optional field (`conditionKey`, below). Existing entries with no key still display and edit exactly as today. |

## The registry

`backend/config/clinical_registry.php` — the single source of truth for all
three lists, config not a database table (per the user's "config now, admin
later" decision: a verified clinical mapping is a reviewed code change
today; the shape below is exactly what a later admin-editable table would
store, so that migration is additive, not a redesign):

```php
return [
    'monitored_conditions' => [
        'hypertension' => [
            'name' => 'Hypertension',
            'aliases' => ['HTN', 'High blood pressure'],
            'pathway' => 'ncd',
        ],
        'diabetes_mellitus' => [
            'name' => 'Diabetes Mellitus',
            'aliases' => ['DM', 'Diabetes'],
            'pathway' => 'ncd',
        ],
        'tuberculosis' => [
            'name' => 'Tuberculosis',
            'aliases' => ['TB', 'PTB', 'EPTB', 'Pulmonary TB', 'Pulmonary Tuberculosis', 'Extrapulmonary TB', 'Extrapulmonary Tuberculosis'],
            'pathway' => 'tb_dots',
        ],
    ],
    'surveillance_diseases' => [
        'hfmd' => [
            'name' => 'Hand, Foot and Mouth Disease',
            'aliases' => ['HFMD'],
        ],
    ],
    'care_pathways' => [
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
            'uses_dedicated_form' => true,
        ],
    ],
];
```

The three condition entries and their alias lists above were reviewed and
confirmed with the user during design; a future registry addition (a new
condition or surveillance disease) follows this same shape and needs the
same confirmation before it ships, never invented unilaterally.

Matching (`ClinicalRegistry::matchCondition($text)` /
`matchSurveillance($text)`): exact match against a list entry's `name` or any
of its `aliases`, ignoring case and collapsing whitespace — the same
`normalizeNameKey` already used by `carePathways.js`/`diagnoses.js`. No
fuzzy, substring, or typo matching, anywhere in this feature.

`GET /api/clinical-registry` serves this whole config read-only (auth
required, no special permission — same reasoning as yesterday's
`/api/care-pathways`, which this endpoint replaces). The frontend keeps zero
copy of any of the three lists; suggestions, badges, and Start Monitoring's
pathway options all render from this one response.

## Diagnosis (Assessment step)

- Label changes from "Diagnosis / Clinical Impression" to **"Diagnosis"**.
  Same input + Add button + chip layout, otherwise unchanged.
- Suggestions while typing now come from `monitored_conditions` (previously
  `carePathways.js`'s `STRUCTURED_DIAGNOSES`, which is deleted). Typing or
  picking a match inserts the chip under the registry's official `name`; a
  match by alias is stored under the official name, exactly as
  `findStructuredDiagnosis` already renormalizes today — same behavior, new
  source.
- The diagnosis entry gains `conditionKey` (nullable). The **server** resolves
  it from the entry's `name` at save time via `ClinicalRegistry::matchCondition`
  — a client-sent `conditionKey` is always ignored and recomputed, so a
  tampered request can't mislabel a condition or force a sync.
- **Registered chip** (`conditionKey` resolves): shows a small badge naming
  its pathway (e.g. "NCD", "TB-DOTS"). No ★ toggle — a registered diagnosis
  always syncs to Current Conditions on save regardless of any toggle, so
  showing one would be misleading.
- **Free-text chip** (`conditionKey` is null): unchanged from today — ★
  toggle, gated by `clinical.history`, controls whether it's added to
  Current Conditions.
- The orphaned-pathway removal guard (`findOrphanedPathway` in
  `DiagnosisListField.jsx`) is replaced by the real enrollment-based check
  from yesterday's spec (a small read of the patient's active enrollments'
  `condition_name`s), unchanged in behavior from that spec — it now also
  covers a registered chip being removed, with the same warning copy.

## Surveillance suggestion (new)

Directly under the diagnosis chips: if any chip's name matches a
`surveillance_diseases` entry (name or alias, same matching rule), a one-line
prompt appears — *"[Name] matches a surveillance workflow — [Add to
Surveillance]"*. Clicking it ticks that disease's checkbox in the Records &
Surveillance section below and scrolls it into view (same reveal pattern
`recordTypeFieldRef` already uses for Record Type). Never auto-ticked; a
suspected case can still be tagged by hand with no matching diagnosis at
all. Removing the diagnosis chip afterward does not remove an
already-ticked tag — the two are independent once a tag is added, per the
"diagnosis and surveillance are separate concepts" decision.

## Records & Surveillance

- "Include in HFMD Community-Based Surveillance" (single checkbox) becomes a
  checkbox **list** driven by `surveillance_diseases`: "Include in
  Community-Based Surveillance:" + one checkbox per registry disease.
  Multiple diseases may be ticked for one visit.
- Saves as `monitoring_data.surveillanceTags: string[]` (registry keys, e.g.
  `["hfmd"]`). Each save also derives and writes the legacy
  `hfmdSurveillance` / `surveillanceCategory` / `diseaseSurveillanceCategory`
  keys (true / `"hfmd"` iff `"hfmd"` is in the tag list) so every existing
  reader keeps working unmodified.
- Reading a record: `surveillanceTags` is used if present; otherwise a record
  with only the legacy `hfmdSurveillance: true` is read as
  `surveillanceTags: ["hfmd"]`. One shared helper (`getSurveillanceTags`)
  replaces the ad hoc legacy getters currently duplicated across
  `healthRecordService.js`, `ConsultationWorkspace.jsx`, and
  `BHCReports.jsx`.
- `BHCReports.jsx`'s Community-Based Surveillance report gains a disease
  filter (options from the registry; defaults to "HFMD" preselected, matching
  today's only behavior), filtering on `surveillanceTags` with the legacy
  fallback above.
- Tag entries carry no case-status or per-disease fields in this change
  (YAGNI until a specific verified case form is needed) — a tag is exactly
  "this visit is included in this disease's surveillance record," as today.

## Current Conditions sync (backend)

`CurrentConditionsSync::sync` runs, inside the existing `HealthRecordController::store`
transaction, for:
- every diagnosis where the server resolved a `conditionKey` — **always**,
  regardless of `addToConditions` or the saving user's permissions;
- every diagnosis with no `conditionKey` where `addToConditions === true` —
  gated by `clinical.history`, exactly as today.

`assertAllowed` (the permission guard) is narrowed to only inspect entries
with no `conditionKey`; a registered diagnosis is never blocked by it, per
the "auto-sync always runs" decision — it is a registry rule attached to the
diagnosis, not a manual history edit.

Matching an existing Current Conditions entry: by `conditionKey` first (so
"HTN" this visit matches an existing "Hypertension" entry from any past
wording), falling back to today's case-insensitive name match only when
either side has no key (a pre-registry legacy entry). A match:
- **links, keeps status** — only `lastConfirmed` moves to this visit;
  `status` is left exactly as the profile or a prior visit set it (Active,
  Controlled, or Resolved) — a re-diagnosis is never itself treated as a
  relapse;
- **renames to the official name** if the matched entry's stored name
  differs from the registry's (e.g. a legacy "HTN" entry becomes
  "Hypertension") — Current Conditions is a live profile field, not an
  immutable saved record, so renaming it here doesn't touch
  [[health-records-immutable-after-save]].

No match creates a new entry exactly as today, now also stamped with
`conditionKey` when one was resolved.

**Patient Profile editor** (`PatientBackgroundTab.jsx` / `PatientRequest`):
typing a Current Conditions name directly on the profile runs through the
same `ClinicalRegistry::matchCondition` resolution on save, so a manually
typed "PTB" is likewise normalized to "Tuberculosis" and tagged with
`conditionKey` — the two entry paths (consultation, profile) can never
produce two different spellings of the same condition.

## Current Conditions display (Patient Profile)

One Current Conditions list, two groups, per the user's explicit choice:
- **Monitored Conditions** — every entry with a `conditionKey`. Each row
  shows its mapped pathway/group (from the registry, e.g. "NCD",
  "TB-DOTS") and its enrollment status: **Not started** (no active or past
  enrollment), **Active**, **Completed**, or **Discontinued** (from the
  patient's `care_pathway_enrollments` for that pathway, yesterday's spec's
  table, unchanged). Condition presence and enrollment are shown together
  but remain separate facts — a Monitored Condition can sit at "Not started"
  indefinitely; nothing here starts an enrollment.
- **Other Conditions** — every entry with no `conditionKey`: today's
  free-text list, unchanged (name, status, ★-sourced dates).

## Care Pathway enrollment (from yesterday's spec, unchanged)

Everything in `2026-09-28-care-pathway-architecture-design.md` under "Data
model," "The flow: Start Monitoring," "Disposition," "Permission," "Legacy TB
records," and "Care & Monitoring panel" carries over as designed there —
`care_pathway_enrollments`, `care_pathway_enrollment_conditions`,
`care_pathway_encounters`, `care_pathway_enrollment_follow_up_task`; the
Start Monitoring panel (select diagnosis → select pathway → select field set
→ Activate, staged and persisted only in the `HealthRecord::create()`
transaction); Continue Follow-up; the `care_pathways.manage` permission; the
"Care & Monitoring" read-only panel. The only changes from that spec:
- its config lives at `clinical_registry.php['care_pathways']` (above),
  served by `/api/clinical-registry` instead of a dedicated
  `/api/care-pathways` endpoint;
- Start Monitoring's "Select the condition(s)" step pre-scopes the pathway
  choice when every checked condition names the same `pathway` in the
  registry (skipping "Which care pathway do these belong to?" when
  unambiguous); a mixed selection, or a free-text condition with no pathway,
  still asks, exactly as yesterday's spec described.

## API surface

- `GET /api/clinical-registry` — all three lists, read-only. Replaces
  `GET /api/care-pathways`.
- `GET /api/patients/{patient}/care-pathway-enrollments` — unchanged from
  yesterday's spec.
- `HealthRecordRequest` gains `diagnoses.*.conditionKey` (server-resolved,
  any client value ignored) and `monitoring_data.surveillanceTags` (array,
  keys validated against `surveillance_diseases`), alongside yesterday's
  `monitoring_data.activeCarePathways` and its staged-activation fields.
- `HealthRecordDraftPayloadService::SCHEMA` gains the matching draft-side
  keys (`surveillanceTags`; `conditionKey` is server-resolved so it is not a
  draft field) so autosave keeps working through this flow.
- `PatientRequest` gains the same registry-resolution step for
  `medical_background.currentDiseases.*.conditionKey` (server-resolved,
  read-only from the client's perspective).

## Testing plan

- Backend: `ClinicalRegistry` matching unit tests (name, alias, case/space
  variants, no match, across all three lists); `CurrentConditionsSync`
  key-based merge tests (dup by alias vs. by legacy name match, status
  preserved across Active/Controlled/Resolved on re-diagnosis, renaming a
  legacy free-text entry to the official name); a permission test confirming
  a registered diagnosis syncs even when the saving user lacks
  `clinical.history`, while a free-text `addToConditions` entry still
  requires it; surveillance tag round-trip (new tag list ↔ legacy
  `hfmdSurveillance` boolean, both directions); Start Monitoring pathway
  pre-scoping (unambiguous single-pathway selection skips the pathway
  question; mixed selection still asks). Everything under yesterday's
  "Testing plan" for enrollment mechanics carries over unchanged.
- Frontend: registry-consuming helper tests (condition/surveillance
  suggestion matching, badge text, chip rendering with no ★ for registered
  entries); `DiagnosisListField` surveillance-suggestion reveal test;
  `BHCReports` disease filter against a legacy-only record and a
  `surveillanceTags`-only record; Current Conditions grouping
  (Monitored/Other split, enrollment status label per pathway state).

## Out of scope (explicitly)

- No admin UI to edit the registry at runtime in this change — config only
  (its shape is chosen so that UI is additive later).
- No per-surveillance-disease case fields or case-status classification.
- No fuzzy, partial, or typo-tolerant matching anywhere in this feature.
- Maternal, Family Planning and EPI remain visit services, untouched (per
  yesterday's spec).
- No backfill migration for existing records; both old and new
  surveillance/monitoring keys are written and read going forward.
