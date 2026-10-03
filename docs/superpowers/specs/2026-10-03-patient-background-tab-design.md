# Patient Background Tab & Consultation-Owned Background Updates

Date: 2026-10-03 · Status: approved in brainstorming

## Goal

Past Medical History, Family History and Personal & Social History move out of
the Patient Information tab into a dedicated, **read-only** Patient Background
tab that shows the current values and a dated change log. Reviewing and
updating the background happens only inside a consultation (Start / Resume
Consultation), and is saved together with the finalized health record.

## Decisions

| # | Decision |
|---|----------|
| 1 | Move (not duplicate) the three sections to a new `background` profile tab, gated by `clinical.history`. |
| 2 | The tab is read-only; the only editor is mounted in the Consultation Workspace. |
| 3 | Background edits are staged in the consultation draft and applied on finalize. |
| 4 | The editor is a collapsed card on Concern & Vital Signs, after Interview (Chief Complaint / HPI) and before Vital Signs. Not a global step. |
| 5 | The update rides on the health-record POST and is applied inside the record's transaction, before `CurrentConditionsSync`. |
| 6 | Optimistic concurrency per **edited** section: 409 on a stale revision; the workspace shows latest vs. mine and requires a per-section choice before retrying. Untouched sections never block. |
| 7 | The patient API ignores `medical_background` on create and update. |
| 8 | Each record stores `background_changes` (before/after per changed section); the tab's log is built from them. |
| 9 | Users without `clinical.history` see a locked card; drafts never send them `backgroundUpdate`, their draft saves keep the stored one, and any `backgroundUpdate` they send is rejected (403). |

## Data model

`patients.medical_background` gains a server-owned
`revisions: { medical, family, social }` (ints, default 0). `updatedAt.{section}`
stays the displayed date.

`health_records.background_changes` (nullable JSON):

```
[{ section, source: "consultation" | "diagnosis", before, after,
   revision, changedBy, changedAt }]
```

Section slices: `medical` = `currentDiseases, allergies, hospitalizations, surgeries`;
`family` = `familyHistory`; `social` = `personalSocial`.

## API

- `POST /health-records` accepts optional
  `background_update: { sections: { <section>: <slice> }, base_revisions: { <section>: int } }`.
  Without `clinical.history` → 403. Stale base revision → 409
  `{ code: "PATIENT_BACKGROUND_CONFLICT", conflicts: [{ section, current, revision, updatedAt }] }`.
- Draft payload accepts `backgroundUpdate: { sections, baseRevisions }` (same shape, camelCase).
  `GET /health-record-drafts/{id}` strips it for users without `clinical.history`;
  their `PUT` keeps the stored value; sending it → 403.
- `GET /patients/{id}/background-history` → change entries newest first
  (`clinical.history` + facility access).
- `POST/PUT /patients` ignore `medical_background` / `medicalBackground`.

## Finalize transaction order

1. Lock patient row; for each edited section compare `revisions[section]` with
   `base_revisions[section]` → 409 on mismatch.
2. Merge edited slices (`PatientBackground::apply`), resolve `currentDiseases`
   through the clinical registry, bump revision, stamp `updatedAt`.
3. Create the record with `background_changes` for sections that actually changed.
4. `CurrentConditionsSync` runs; if it changes Current Conditions it bumps
   `revisions.medical` and its change is appended with `source: "diagnosis"`.

## Frontend

- `BackgroundEditor` (controlled, no save logic) extracted from `PatientBackgroundTab`.
- `PatientBackgroundTab` becomes read-only + Changes log.
- Consultation card states: collapsed summary / empty / expanded editor / locked.
- Review & Confirm gains a "Patient Background Changes" block.
- 409 → conflict panel per section: Keep my changes / Use latest.
- Removed: background editing on Patient Information, `PatientSummaryDrawer`,
  `updatePatientMedicalBackground`, frontend `mergeBackgroundSection`
  (its rule now lives server side).
- Overview background card: Edit → View (opens the new tab).

## Testing

Backend feature tests for apply, 409 only on edited stale sections, 403s,
draft strip/preserve, patient API ignoring the field, sync ordering, change
log, history endpoint access. Frontend unit tests for edited-section
detection, review rows, conflict resolution and the summary.
