# AKAY Source-Grounded Workflows

## Purpose

This file summarizes **confirmed operational workflow evidence** from the BHC/RHU interviews and follow-up answers.

It intentionally avoids inventing clinical detail that the sources do not provide.

When this file conflicts with implementation, flag the mismatch before changing either the code or this document.

---

## 1. Barangay Health Center -> RHU Referral

### Current paper process

Confirmed from the Barangay Pitpitan Health Center interview:

1. Patient comes to the Barangay Health Center.
2. If the BHC cannot treat/manage the case, the patient is referred to the RHU.
3. BHC staff use a referral form.
4. BHC staff take vital signs.
5. BHC staff write their assessment on the form.
6. The patient carries the paper referral to the RHU.

### Known problems

- Referral forms can be misplaced, particularly by elderly patients.
- Paper slips can become dirty and difficult for RHU staff to read.
- BHC staff do not consistently receive timely feedback after referral.
- Crowding at the RHU is a recurring patient complaint.
- Some referred patients do not proceed to the RHU immediately.

### Desired digital support confirmed by interview

BHC interview evidence supports usefulness of:

- digital referral submission;
- real-time referral tracking;
- RHU feedback visibility;
- no-show visibility;
- RHU patient-volume/crowding visibility;
- referral counts by week and month;
- referral counts by category/case.

These are user-supported needs. Exact implementation behavior must still be verified in code.

---

## 2. RHU Entry / Referral Expectation

RHU interview evidence states that the RHU generally expects patients to go through the health center and bring a referral.

However, the same interview states that exceptions may be made depending on the patient's situation, such as difficulty travelling back and forth.

Therefore the correct operational statement is:

> **Referral through the BHC is the normal pathway, but exceptions can occur.**

Do not encode an absolute "RHU never accepts direct patients" rule unless newly validated.

---

## 3. RHU Emergency Boundary and Prioritization

Interview/follow-up evidence indicates:

- RHU is a **non-emergent facility**.
- Hospital-level emergency cases belong in a hospital.
- A doctor may prioritize certain cases internally, including contagious cases mentioned in the RHU transcript.
- The follow-up answer did not establish a BHC urgency coding scheme for referrals.

Therefore:

- do not invent an emergency-referral classification workflow;
- do not assume "non-emergent facility" means RHU staff never prioritize patients;
- if the system contains urgency fields/rules, they require validation against current approved requirements.

---

## 4. General RHU Service Process

The RHU follow-up answers repeatedly summarize the general process as:

`Interview -> Vital Signs -> Consult -> Meds`

Follow-up timing depends on the doctor's findings and may be days, a week, or months.

Patients are informed about follow-up.

If a patient misses a scheduled visit/checkup/medication, the follow-up answer states that the BHW will follow up.

This is a high-level workflow only. Do not infer specific medical schedules.

---

## 5. RHU Records

Follow-up evidence states:

- ITR is updated during visits.
- Existing record-keeping uses ITR, iClinicSys, and logbook.
- One follow-up response describes the order as:
  `ITR first -> iClinicSys -> logbook`

The RHU interview answers also identify both logbook and iClinicSys for patient registration.

The digital AKAY design should be compared against this real workflow during audit, but should not automatically copy every manual duplication into the new system.

---

## 6. Program-Specific Workflows

The sources name RHU programs/services including:

- Maternal/Prenatal Care
- Family Planning
- Immunization/EPI
- Diabetes
- Hypertension
- Tuberculosis / TB-DOTS
- Adolescent services
- Mental Health
- Laboratories
- Nutrition
- Communicable Diseases

The follow-up answers give the same high-level sequence (`Interview -> Vital Signs -> Consult -> Meds`) for several programs.

This is **not enough evidence to invent detailed program-specific forms, schedules, clinical rules, or decision logic**.

If implementation contains detailed program behavior, classify it as:

- source-confirmed;
- code-derived/current implementation;
- developer-approved revision; or
- unverified.

---

## 7. Reporting

RHU follow-up answers indicate report information may include:

- consultation counts;
- referral counts and outcomes;
- case surveillance;
- immunization coverage;
- maternal health indicators;
- supply utilization.

For monthly BHC submissions, the follow-up answers identify consultation summaries and immunization records among requested information.

The RHU also reports upward using FHSIS.

The Barangay interview specifically supports referral reporting by:

- week;
- month;
- category/case.

Do not assume every report named here must be implemented in the current capstone scope. Compare against approved system scope and current code.

---

## 8. Medicine Inventory

RHU interview/follow-up evidence indicates:

- RHU maintains medicine inventory.
- Inventory is managed in Excel/spreadsheet.
- A Logistics Manager is responsible.
- The Logistics Manager is RHU staff.
- Recorded medicine details include at least:
  - medicine name;
  - quantity;
  - unit.
- Inventory updates can occur during:
  - periodic physical counts;
  - new stock arrival;
  - dispensing/use;
  - near-expiry handling.
- Program supplies were reported as being kept in the same spreadsheet rather than separate program-specific spreadsheets.
- "First in, first out" was provided as the current handling approach for expired/near-expiry medicine, though this answer is not detailed enough to infer a complete expiration-management policy.

Do not invent pharmacy rules beyond the evidence.

---

## 9. Doctor / Provider Availability

Follow-up answers indicate:

- the RHU has approximately 1-2 doctors in the provided response;
- schedules are posted at the RHU;
- schedules can change from time to time;
- General Practitioner was identified as a specialization.

The earlier RHU transcript states two doctors are at the RHU every day unless meetings affect availability, with another doctor/head potentially covering in some situations.

Because the sources reflect different question contexts and dates, the system should treat provider schedules as operational data that can change rather than a hard-coded weekly truth.

---

## Workflow Design Rule

When converting these workflows into software:

- preserve the operational intent;
- remove unnecessary paper duplication where safe;
- do not invent clinical logic;
- distinguish required fields from convenient fields;
- keep BHC/RHU responsibilities clear;
- protect patient information;
- make state transitions explicit;
- record important actions for accountability;
- surface contradictions for developer/client validation.
