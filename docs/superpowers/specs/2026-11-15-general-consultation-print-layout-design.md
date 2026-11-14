# General Consultation Print Layout Design

**Date:** 2026-11-15  
**Status:** Implemented (aligned to print reference sample)  
**Scope:** General Consultation records only (RHU and BHC share layout)

## Problem

Staff need a clean A4 print of a saved General Consultation visit. The print must include Chief Complaint, History of Present Illness (HPI), and Vital Signs even when RHU on-screen health details under-label HPI. Blank fill-in lines are wrong — the record is already saved.

## Goals

- One black-and-white A4 layout for RHU and BHC General Consultation.
- Section order matches the approved reference sample.
- Data from the same record helpers used elsewhere (`getRecordChiefComplaint`, `getRecordSummary` / `history_of_present_illness`, `recordedVitalItems`, `getRecordDiagnosis`, `getDispensedMedicines`, `visitHistoryInformantLine`).
- Empty fields omitted — **no multi-line writing grids**. Signature area has **one** signature line only.
- Maternal, EPI, family planning, TB, and other program prints unchanged.

## Layout (reference order)

### Page

- A4, `@page { size: A4; margin: 18mm; }`
- Black text / black rules / white background
- Body: Arial / Helvetica, 11pt

### Header

- Left: **AKAY**
- Right: General Consultation Record · facility · Record #…

### Patient row (inline labels)

- Patient: … | Patient ID: … | Age / Sex: … | Date / Time: …

### Sections

1. **Chief Complaint** — Complaint · Informant  
2. **History of Present Illness** — Present illness, or on follow-up: Changes since last visit (`getRecordSummary`)  
3. **Vital Signs** — table with units in headers: BP (mmHg), Pulse (bpm), Temp (°C), SpO₂ (%), Height (cm), Weight (kg), BMI  
4. **Assessment** — **General exam findings** from `getRecordPhysicalExam` (RHU physical findings; replaces empty `assessment_notes`) plus **Diagnosis** when present (RHU via `showsDiagnosisRow`; BHC when diagnosis has a value)  
5. **Medications** — Prescribed · Instructions from dispensed medicines  
6. **Signatures** — Pinned to page bottom. Each block: signature line, then caption below. Left: name on the line + “Recorded by” below (no role/specialization duplicate). Right: blank line + “Attending Physician / Signature” below.

### Out of scope

Family history dump, parent record, purpose of visit, labs, concerns, program sections, fill-in writing lines, on-screen chrome.

## Note on RHU health details

RHU consultation workspace captures **History of Present Illness**, but the RHU health-record details view may not surface that label clearly. Print always includes HPI when `getRecordSummary` / `history_of_present_illness` has a value, for both RHU and BHC.

## Files

- Preview: `docs/print-previews/general-consultation-record-print.html`
- App: `frontend/src/components/features/health-records/BhcHealthRecordPrintDocument.jsx` (GC branch)
