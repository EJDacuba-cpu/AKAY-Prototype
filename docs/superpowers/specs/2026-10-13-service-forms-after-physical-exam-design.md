# Service Forms After Physical Examination — Design

Date: 2026-10-13
Scope: BHC New Consultation workspace step flow, Barangay Health Services panel, prenatal risk modal.

Supersedes:
- `2026-10-10-bhc-general-consultation-simplification-design.md` §C, the line "Service forms remain
  detours from the Interview's Barangay Health Services panel."
- `2026-10-12-prenatal-medical-history-rework-design.md` §2 "Triggers" (the modal now has one trigger).

## Problem

A selected service (Maternal Care, Family Planning, EPI) is ticked in the right-hand panel on Patient
Interview, but its form only opens through a small button in that panel and is a detour that returns
to the Interview. Workers did not see a clear "start" for Maternal care, and the Prenatal form could be
filled before Vital Signs, so the height risk was not yet known when the form was open.

## Decisions (from the brainstorming session)

1. Ticking a service in the panel is the "start / enroll" for this visit; unticking removes it with
   no other change. Nothing is persisted beyond the existing `selectedPrograms` / `primaryProgram`.
2. The service forms become regular steps that come **after Physical Examination**, in the existing
   program order (primary first, then selection order).
3. The panel's form button is **removed** (no shortcut). There is one way to reach a service form:
   the step flow.
4. One consultation still covers everything (e.g. maternal visit with a cold: Chief Complaint/HPI and
   Physical Examination for the cold, then the Prenatal form, one ITR).

## Design

### 1. Step flow

```
Patient Interview → Physical Examination → [Service Details: one screen per selected service]
  → Medication, Treatment & Next Steps → (Monitoring Details) → Review & Finalize
```

- `getFormSequence(programSteps = [])` returns `[INTERVIEW_STEP, ASSESSMENT_STEP, ...programSteps.map(s => s.key)]`.
  Next from the last service form goes to Medication, Treatment & Next Steps (existing
  `getNextStepKey` behaviour); Previous from the first service form goes to Physical Examination.
- `buildConsultationSteps({ programSteps, monitoringDetailKeys })` adds one progress-bar step
  `{ key: PROGRAMS_STEP, phase: "form", label: "Service Details" }` between Physical Examination and
  Medication, Treatment & Next Steps **only when at least one service is selected**. The screen
  heading keeps `resolveStepHeading` ("Program 1 of 2 · Prenatal").
- `getStepOrder` ranks the service forms after Physical Examination, so a save error inside a service
  form sends the worker there after earlier screens' errors.
- A service form never blocks Next (unchanged): an unfinished form is caught at Review/finalize by
  the existing validation.
- Removed: the detour bookkeeping — `serviceFormOrigin`, `getServiceFormReturnTarget` and the
  "Back to Review" / "Done" special-casing. Review's Edit on a service section goes to that form
  like Edit on any other section, and Next walks forward from there.
- Draft resume: a draft saved on a service form reopens on that form (`resolveFormStep` already
  accepts program step keys). A stored service form that is no longer selected falls back to the
  first screen (unchanged). No draft payload or server allowlist change.
- Unselecting a service while its form is the current screen moves the worker to Physical
  Examination.

### 2. Barangay Health Services panel

- The checkbox, the Primary badge and "Make primary" stay.
- The form button and `programFormActionLabel` (added 2026-10-13) are removed.
- A selected service shows one badge, **Active**, and under it one line of help text: "Form opens
  after Physical Examination." The panel no longer shows Not Started / Incomplete / Completed: the
  form is not reachable from the panel any more, and today's status was misleading (Maternal has no
  error owned by its step, so it read "Completed" the moment it was ticked). Completeness is still
  enforced at Review/finalize. `programStatusByKey` and the panel's `statusByProgram` / `onOpenForm`
  props are removed.

### 3. Prenatal risk modal

One trigger: **entering the Prenatal form step** (`goToStepKey` to `programStepKey("Maternal")`).
At that point the visit's height is usually known, so age and height are announced together. The
"once per consultation per flag", "no modal when false or unknown" and "never on draft restore" rules
from the 2026-10-12 spec are unchanged. The triggers on ticking Maternal and on leaving Physical
Examination are removed.

## Out of scope

- A persisted maternal case/enrollment record.
- Making Vital Signs or height required.
- The Review "Height risk: Not assessed" row (proposed, not decided).
- RHU health record forms (`RHUAddHealthRecords.jsx`) — they do not use this step flow.

## Testing

- Unit (`consultationSteps.test.js`): form sequence with 0, 1 and 2 services; Service Details appears
  in `buildConsultationSteps` only with a service; `getStepOrder` puts service forms after Physical
  Examination; Next from the last service form → Medication, Treatment & Next Steps; Previous from
  the first service form → Physical Examination; `resolveFormStep` keeps a selected service form and
  drops an unselected one.
- Unit (`consultationPrograms.test.js`): `programFormActionLabel` tests removed with the function.
- Lint and build.
- Manual browser check: tick Maternal → Interview Next → Physical Examination (enter height 142) →
  Next opens the Prenatal form with the risk modal (age and/or height) once; Previous returns to
  Physical Examination; Review Edit on Prenatal opens it; resume a draft saved on the Prenatal form.
