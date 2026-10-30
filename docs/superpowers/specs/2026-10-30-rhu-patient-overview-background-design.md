# RHU Patient Details Overview and Patient Background

Status: planning only; no implementation authorized by this document until the implementation plan is written and approved.

## Intent

BHC Patient Details is the fixed visual reference. RHU Patient Details is mismatched on Overview and is missing the Patient Background tab. Update only those RHU surfaces so they use the same layout and components BHC already ships. RHU still loads RHU patient data. Today’s Queue check-in stays as it is.

The RHU Start Consultation wizard also needs a later design match to BHC. Flag that as the next task. Do not restyle it here.

## Job and audience

An RHU nurse or doctor opening a patient profile should scan Overview the same way a BHC worker does: anatomy workspace, vitals on the figure, clinical cards on the right, Patient History beside the tabs. They should open Patient Background for the saved chart (past medical, family, social, obstetric) without leaving the profile. Success is visual and structural match to BHC Overview and Background, with RHU records and the existing queue action.

Visitor mode: Operate.

## Selected direction

Reuse BHC’s Overview and Background pieces inside `pages/rhu/RHUPatientDetails.jsx`. Do not change BHC. Do not extract a shared Patient Details shell. Do not restyle RHU Overview from scratch.

Rejected: changing ProfileQueueAction / Today’s Queue check-in; restyling the live RHU consult wizard; dropping or merging other RHU tabs in this task.

## Architecture

- Keep `/rhu/patients/:patientId`, RHU `DashboardLayout`, RHU profile queries (`queryKeys` with `"rhu"`), and `ProfileQueueAction` on the header.
- Import the same overview CSS BHC uses (`patient-overview.css`) and the `patient-profile-content` / `bhc-patient-profile` / `patient-profile-panels` frame classes Overview needs so the anatomy workspace lays out.
- Overview with `clinical.history`: mount `PatientOverviewBoard` with `anatomyWorkspace`, vitals inside `AnatomyFindingsPanel`, `ClinicalOverviewColumn` on the right, `PatientHistoryReference` as `ProfileTabs` `aside`. Without history: keep the existing locked Overview placeholder.
- Insert a **Patient Background** tab after Patient Information, before Care & Programs, only when `clinical.history` is present. Render `PatientBackgroundTab` with `basePath="/rhu"` and `canEdit={false}`. No `onEditBackground` on the Overview history popover. RHU does not gain `clinical.background.update`.
- Patient Information, Care & Programs, Health Records, specialized record tabs, and Referrals stay as they are, except the tab list gains Background in BHC’s position.
- Health Records still open `/rhu/health-records/:id` (already the BHC ledger details page).

## Overview arrangement (match BHC)

1. Header: identity, Care Path, **existing** queue check-in / start / resume. Do not replace or restyle `ProfileQueueAction`.
2. Tab strip with Patient History control on the right when Overview is active and history is allowed.
3. Anatomy workspace: body figure and findings in the main canvas; vitals tiles on the figure (not a separate left column).
4. Right column: existing RHU clinical cards (care tracking, referrals, records). If BHC Overview also shows open follow-ups there, wire the same `ClinicalOverviewColumn` follow-up preview from RHU follow-up tasks for this patient (`getPatientFollowUpTasks`, RHU query key). That is layout parity, not a new follow-ups module.
5. Patient History popover: saved `medicalBackground` only. Never substitute another facility’s background. Missing/error states match BHC’s reference panel.

## Patient Background tab

Read-only latest chart, same sections as BHC’s tab. Visit-specific history stays on Health Records. Staff do not edit background from this tab; consult-time history remains the recording path (wizard restyle is next, not this task).

## Data

RHU patient, records, referrals, conditions, and follow-up tasks for this `patientId` only. No BHC patient list, no copied background. `getPatientById` already backs the RHU profile.

## Errors and empty

Keep RHU profile loading, connection, and not-found shells. Overview empty/locked states follow BHC Overview (locked placeholder without history). Background tab uses `PatientBackgroundTab` empty/error behavior. Do not invent new empty-copy.

## Testing

- Source or unit coverage that RHU details imports `PatientBackgroundTab`, `PatientHistoryReference`, `anatomyWorkspace`, and `patient-overview.css`, and still mounts `ProfileQueueAction`.
- Tab order with history: Overview, Patient Information, Patient Background, then the existing RHU tabs.
- Background tab is read-only (`canEdit={false}`) and uses `basePath="/rhu"`.
- Overview no longer uses the three-column vitals | anatomy | cards board (`anatomyWorkspace` true; vitals passed into `AnatomyFindingsPanel`).
- BHC Patient Details tests stay green. Do not change BHC files for this task.

## Scope and anti-goals

In:

- RHU Overview layout
- RHU Patient Background tab (read-only)
- Overview Patient History reference
- Optional follow-up preview on the Overview right column for layout parity

Out:

- BHC Patient Details
- Today’s Queue check-in / `ProfileQueueAction` behavior and styling
- RHU Start Consultation wizard (next flagged task)
- Patient Information, Care & Programs, Health Records, specialized tabs, Referrals redesign
- Cross-facility data sharing
- Enabling background edit on RHU
- Diagnosis vs Health Problems mapping

## Next (flagged, not this task)

RHU Start Consultation / walk-in consultation wizard: match BHC Start Consultation recording UI, with RHU follow-up questions and nurse-station content. Separate spec.

## Constraints

- English UI. Clinic Ledger tokens.
- Roles with `clinical.history` see Overview clinical board and Background; others keep the locked Overview and Patient Information.
- Saved clinical history remains immutable on this page.
