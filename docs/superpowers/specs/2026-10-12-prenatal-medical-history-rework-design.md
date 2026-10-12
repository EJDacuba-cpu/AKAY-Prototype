# Prenatal Medical History Rework — Design

Date: 2026-10-12
Scope: BHC New Consultation → Prenatal (Maternal) form, "Medical History" section.

## Problem

The Prenatal form's Medical History asks for 14 risk factors on every visit. Most of them are asked
again elsewhere or cannot be answered by a BHC worker:

- **Diagnoses** (Tuberculosis, Heart Disease, Diabetes, Bronchial Asthma, Goiter, Hypertensive) are
  tickable by the midwife. BHC never confirms a disease; only RHU sets condition status
  (see the clinical boundary spec, 2026-10-05).
- **Smoker / Alcohol user** are already collected in Patient Background → Personal & Social, in the
  Patient Interview step of the same consultation, and shown on the Patient Profile.
- **Age risk / Height risk** are facts the system already holds (birthdate, Vital Signs height) but
  the midwife has to tick them by hand.
- Every visit starts blank, so on a second prenatal visit the midwife re-answers questions whose
  answers cannot change (previous C/S, past miscarriages).

## Decisions (from the brainstorming session)

1. Diseases, Hypertensive, Smoker and Alcohol user are removed from the Prenatal form. The Patient
   Profile Overview (Current Conditions, Patient Background card, vitals) is where they are viewed.
   The TB monitoring section is unrelated and unchanged (still RHU-activated).
2. Age risk and Height risk become computed flags with no checkbox.
3. The midwife is told about them with a **modal**, not a banner.
4. The remaining pregnancy-only items stay as manual checkboxes, prefilled from the previous
   prenatal visit.
5. The Patient Overview already shows height (vitals tiles / summary panel); nothing is added there.

## Design

### 1. Computed risk flags

New pure helper `getMaternalRiskFlags({ birthdate, heightCm, referenceDate })` returning
`{ ageRisk: boolean|null, heightRisk: boolean|null, age, heightCm }`.

- `ageRisk` = age < 18 or age > 35, age computed at `referenceDate` (the visit date). `null` when
  there is no usable birthdate.
- `heightRisk` = height < 145 cm. `null` when no height is known.
- Reuses the existing `calculateAgeInYears` logic from `ConsultationWorkspace.jsx` (move it to a
  shared util rather than duplicating).

Height source, in order: (a) this visit's Vital Signs height once entered, (b) the most recent
health record of the patient that has a height (not "today only"). The record says which was used
(date for (b)).

### 2. Risk modal

A modal with a single "OK" button, neutral wording, **no recommendation or referral advice**
(no-clinical-suggestions rule). Example lines:

- "Age risk — patient is 17 years old."
- "Height risk — last recorded height is 142 cm (12 Aug 2026)."

Triggers (only while Maternal is a selected program):

- When the worker selects Maternal in the Barangay Health Services panel (`handleProgramSelect`).
- When the worker leaves the Physical Examination step after entering a height (not while typing).

A flag is announced at most once per consultation: the workspace keeps a set of acknowledged flags,
and the modal opens only for flags that are true and not yet acknowledged. If no flag is true, or
the data is missing, no modal opens. Re-selecting Maternal does not re-announce an acknowledged flag.
Resuming a draft does not open the modal by itself.

### 3. Saving

On finalize, `riskAssessment.ageRisk` and `riskAssessment.heightRisk` are set from
`getMaternalRiskFlags` using the visit date and this visit's height (falling back to the
latest-record height). They are never user-editable. They keep their existing keys, so record
details, Review and older records keep working. The Review step's Prenatal section lists them.

### 4. Prenatal form changes

- "Medical History" section is renamed **Obstetric Risk Factors** with four checkboxes:
  `grandMultipara`, `recurrentMiscarriageOrStillbirth`, `postpartumHemorrhage`, `previousCs`.
- Prefill: on a visit that is not the patient's first prenatal record, the four values start from
  the patient's most recent prenatal record, each labelled "From last visit". The worker can change
  them. Nothing is written back to earlier records.
- The `previousPregnancyComplications` parent flag keeps its current behaviour
  (`applyRiskFactorChange`). The `medicalConditions` parent is no longer set by new records.
- `MATERNAL_RISK_GROUPS` in `prenatalForm.js` is reduced accordingly.

### 5. Backend

- `HealthRecordDraftPayloadService`: drop `tuberculosis`, `heartDisease`, `diabetes`,
  `bronchialAsthma`, `goiter`, `hypertensive`, `alcoholUser`, `smoker` and `medicalConditions` from
  the maternal `riskAssessment` whitelist for new drafts. `ageRisk`, `heightRisk`, the four
  obstetric items and `previousPregnancyComplications` stay.
- No migration. Saved records are never rewritten.

### 6. Existing records

Records that already carry the removed keys keep them. Record details still render them through
`MATERNAL_RISK_LABELS`, which keeps all current labels, so old data is shown as it was recorded.

## Out of scope

- Any change to Patient Background, condition status, or TB monitoring.
- Gravida/Para-derived GRANDMULTI.
- A persisted "maternal enrollment" record. The maternal state stays derived in Care Tracking.
- Referral or advice text attached to a risk flag.

## Testing

- Unit: `getMaternalRiskFlags` boundaries (17/18, 35/36, 144/145, missing birthdate/height,
  birthday not yet reached on the visit date).
- Unit: the acknowledged-flag logic (opens once, not for false/missing, not after acknowledge).
- Unit: `MATERNAL_RISK_GROUPS` contains only the four obstetric items; `applyRiskFactorChange`
  parent behaviour unchanged for `previousCs`.
- Unit: prefill takes the latest prenatal record and ignores non-prenatal ones.
- Backend feature test: a draft with a removed key does not persist it; with `ageRisk`/`heightRisk`
  and obstetric keys it does (extend `PrenatalFormFieldsTest`).
- Existing record-details rendering of an old record containing `diabetes: true` is unchanged.
- Manual browser check of the first-visit and second-visit flows.
