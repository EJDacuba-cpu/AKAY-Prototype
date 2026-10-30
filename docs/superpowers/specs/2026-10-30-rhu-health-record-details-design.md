# RHU Health Record Details match BHC layout

Status: planning only; no implementation authorized by this document until the implementation plan is written and approved.

## Intent

RHU staff opening a saved health record should see the same Clinic Ledger details screen BHC already uses. The page is a read-only visit sheet, not a second consult workspace. RHU keeps its own facility records. Nothing is copied or merged from BHC patients.

BHC consultation and RHU walk-in consultation should eventually share the same recording workflow UI. That live workspace, Patient Details, and the Patient Background tab are later tasks. Mapping RHU Diagnosis onto BHC Health Problems is also a later task.

## Job and audience

An RHU nurse (and any RHU role with clinical history) opens a finalized or saved visit from the RHU patient profile. They need to read what was recorded on that visit: vitals, assessment, body findings, the background snapshot taken that day, programs, treatment, and medicines. Success is: the RHU details page is visually and structurally the BHC details page, filled with that RHU record.

Visitor mode: Operate. Scan a dense clinical sheet. Do not invent a new RHU layout.

## Selected direction

Reuse the existing BHC details workspace on the RHU route. Same UI component and print document. Different page wrapper, query key, dashboard role, and record identity.

Rejected:

- A shared clinical database or copied records across facilities.
- Restyling `RHURecordDetails.jsx` in place (accordion / side-card / two-column), which would drift from BHC again.
- Extracting a renamed shared workspace in this task. The BHC workspace is the visual source of truth; RHU mounts it.

## Architecture

- Route stays `/rhu/health-records/:recordId` inside RHU `DashboardLayout`.
- `RHURecordDetails` stops rendering `RecordHeaderCard`, accordions, fade-up chrome, and the patient-list identity lookup.
- It renders `BhcHealthRecordWorkspace` on screen and `BhcHealthRecordPrintDocument` for print, the same way `pages/bhc/HealthRecordDetails.jsx` does.
- Data is that RHU health record plus its patient, loaded through existing APIs and facility authorization. Query key remains `healthRecordDetails("rhu", recordId)`.
- Back navigation returns to the RHU patient profile via `getPatientRecordReturn(..., "/rhu")`.
- Print uses the existing `?print=1` auto-print behavior and BHC print page styles.

The workspace already owns section order, empty states, program sheets, body findings, and the visit history snapshot. RHU does not reorder, restyle, or add a sidebar.

## Exact arrangement (BHC order, unchanged)

One column of Clinic Ledger sheets, top to bottom:

1. Visit header — Back, title, Record #, Print, then patient full name, service type, date of visit, time of visit, recorded by. Follow-up of record #N when this visit is a follow-up.
2. Purpose of visit — only when the visit recorded services.
3. Vital signs
4. Clinical assessment — chief complaint; HPI or follow-up findings; physical exam; Assessment only when the workspace already shows a stored assessment distinct from concerns; body findings when present.
5. Patient History at This Visit — informant and the family / past medical / social snapshot stored on this record. Missing snapshot says historical history is unavailable. Never substitute today’s live Patient Background.
6. Program sheets when this visit has them — Child Health / EPI, Maternal / Prenatal or Postpartum, Family planning, TB DOTS / TB monitoring.
7. Health concerns & care outcomes — **this slot stays**. This task does not rename it to Diagnosis or map RHU Diagnosis onto BHC Health Problems.
8. Treatment & dispensed medicines
9. Earlier draft notes — only if present
10. Related consultation history

Empty blocks use the BHC empty copy in the same slots. Do not hide Health concerns & care outcomes to make an RHU-specific layout.

Do not add RHU-only header actions (Record Follow-up Visit, View Referral) that BHC’s header does not have. Follow-up and referral context stay inside the workspace slots that already show them.

## Data flow

1. Authorized RHU user opens `/rhu/health-records/:recordId`.
2. Client loads `getHealthRecordById(recordId)` and, when the record has a patient id, `getPatientById(patientId)`. On patient fetch failure, fall back to the patient embedded on the record, matching BHC.
3. Optional linked referral fetch matches BHC (`getReferralByHealthRecordId`, then tracking id when needed). A 403 or miss is treated as no linked referral; it must not fail the page or leak another facility’s referral.
4. The workspace and print document receive that record, patient, and referral. They read fields already stored on the health record (vitals, interview, exam, body findings, `visitHistory` snapshot, programs, treatment, medicines).
5. Facility access stays on the existing health-record and patient APIs. A BHC record the RHU user is not allowed to see remains forbidden. An RHU record is never loaded through a BHC-only identity list.

Stop using `getPatientDetailsListByRole("rhu")` and `getPatientsByRole("rhu")` to resolve the patient on this page.

## Errors, loading, and empty

Match BHC details, with RHU chrome:

- Loading: `SoftLoadingArea` skeleton details, “Loading health record details...”
- Transport / server error other than 404: `ConnectionErrorState` with retry
- Missing record / 404: “Health record not found” card and Go Back
- Refreshing an already shown record: existing updating indicator on the header
- Missing snapshot, vitals, or program data: BHC empty notes in those sections

## Testing

- Keep existing `BhcHealthRecordWorkspace` / print SSR tests. BHC details must not regress.
- Add coverage that the RHU details page mounts the BHC workspace (and print document) instead of the accordion/side-card layout.
- Cover RHU data isolation: the page requests the record by id and the patient by id; it does not scan the RHU patient list to attach identity.
- Cover a typical RHU general-consult record: header, vitals, clinical assessment, Patient History at This Visit, treatment/medicines appear in BHC order even when Health concerns is empty.
- Cover program and TB records still showing their BHC program sheets when those payloads exist on the RHU record.
- Do not assert a Diagnosis → Health Problems mapping in this task.

## Scope and anti-goals

In:

- RHU Health Record Details screen and print
- Same layout, section order, empty states, and field set as BHC details
- Patient History at This Visit from the saved consult snapshot
- Body findings and other recorded Start Consultation fields the workspace already displays

Out:

- Live RHU Start Consultation / walk-in workspace restyle
- Patient Details page and Patient Background tab
- Nurse vs doctor station workflow changes
- Queue check-in
- Cross-facility record sharing or silent TB/case copy
- Redesigning Diagnosis as Health Problems / Health Concerns
- Unrelated dispensing, inventory, notifications, auth, or ITR recording behavior

## Constraints

- English UI copy. Clinic Ledger tokens (navy ink, brand red, white, pill controls, sheet cards).
- Saved records stay immutable; this page does not add edit.
- Roles with `clinical.history` may read; the page does not grant new permissions.
- Later tasks may restyle RHU walk-in consultation and Patient Details to the same BHC UI without changing this arrangement.
