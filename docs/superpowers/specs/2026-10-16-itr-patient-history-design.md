# ITR Patient History — Design

Date: 2026-10-16 · Status: approved in brainstorming, awaiting spec review
Sub-project 1 of 4 of the ITR digitization (see "Roadmap" below).

## Goal

The Municipal Health Office's paper Individual Treatment Record (ITR), page 1
"Patient's Record", is filled on a PC during the consultation — at BHC and at RHU — and the
patient is asked each question once. This is digitization **with automation**: the system
prefills, carries forward and computes so staff only type what is new. It never decides for them.

Source form: MHO Bulakan ITR (`ITR ng buhay ko.pdf`), sections I–V.

## Principles

1. **Staff decide.** Automation prefills, carries forward and does arithmetic. Staff see the
   result and confirm or change it. The system never flags, classifies ("at risk", "heavy
   smoker"), or hides something staff cannot open.
2. **One patient, one history.** BHC and RHU read and update the same background. Whoever sees
   the patient first fills it in. The other facility reviews it ("No changes") or updates it.
3. **Existing rules stay.** The profile Background tab is read-only. The background changes
   only through a consultation, and edits apply when the record is finalized
   (2026-10-03 spec). Only RHU confirms conditions (2026-10-05 spec). The system never copies
   a relative's conditions into Family History.

## Roadmap (separate specs)

| # | Sub-project | Depends on |
|---|---|---|
| **1** | **ITR Patient History (this spec)** | — |
| 2 | Print a health record in ITR format (page 1 = history as of the visit, page 2 = consultation) | 1 |
| 3 | Prenatal de-paperization: prefill from OB history, computed AOG/EDD, the 2026-10-12 Prenatal Medical History spec | 1 |
| 4 | Postnatal care, tied to Maternal Care tracking (Spec A) | 3, Spec A |

## Decisions

| # | Decision |
|---|---|
| D1 | BHC: Patient History is its own consultation screen right after Interview (layout B). The `ConsultationBackgroundCard` leaves the Interview screen. |
| D2 | RHU: the same component is mounted as a section of `RHUAddHealthRecords.jsx`, after Consultation Information. |
| D3 | Five sections, I–V, mirroring the ITR. I is read-only identity data. II–V are editable background. |
| D4 | Each section offers **No changes** (stamps a review date) and **Update**. A **Mark all reviewed** action sits under the section list. It marks only sections that already hold recorded data. An empty section needs Update, where "None known" is itself an answer. Reviewing is never required to continue or finalize. |
| D5 | Storage is Approach A: extend `patients.medical_background` and the `PatientBackground` service. No new per-item tables. |
| D6 | "Current Diseases" holds patient-reported conditions only. The "Unverified (legacy)" group is removed. Test data is cleaned by a one-time migration. |
| D7 | Informant and Similar Illness are per-visit and stored on the health record. |
| D8 | Water source and toilet are stored per patient but **prefilled** from the most recent record of another patient with the same Family Serial Number. Households have no backend table yet. |
| D9 | Hospitalizations are patient-reported. AKAY covers BHC → RHU only, so they are never derived from referrals. |
| D10 | Section V is for Female patients only. It is expanded at age ≥ 10 and collapsed with a **Show** control below 10. The Sexual subsection is expanded at age ≥ 15 and collapsed below 15. |
| D11 | No computed value is stored. Age, pack-years and G/P are derived when displayed. |

## Section contents

### I. General Data (read-only)

- Name, Age/Sex/Civil Status, Residence, Occupation, Birthday come from registration. Age is
  computed at the consultation date. An "Edit in Patient Information" link leads to the
  patient record. Identity data is not part of the background update.
- **Informant** (per visit): relation, one of Patient, Mother, Father, Spouse, Guardian,
  Grandparent, Sibling, Other, plus a name.
  Default via `defaultInformant`:
  - age ≥ 18 → `Patient`;
  - under 18 with `mother_patient_id` → `Mother` and that patient's name and id;
  - under 18 with `guardian_name` → `Guardian` and that name;
  - otherwise no default.

  Staff can always change it.
- **Date History Taken** has no field. Each section's review date (`reviewedAt`) is the date
  of the consultation that reviewed or updated it.

### II. Past Medical History (`medical`)

- **Current Conditions:** two groups.
  - **Confirmed by RHU:** read-only, from `patient_conditions`.
  - **Reported by patient (not confirmed):** editable. Each entry has `name` (required),
    `yearDiagnosed`, `diagnosedWhere` and `note`. The server stamps
    `source: "Patient-reported"` and `firstRecorded`.
- **Allergies:** `{ noneKnown: bool, items: [{ allergen, reaction }] }`. `noneKnown` and a
  non-empty `items` are mutually exclusive (422). Allergies show as a chip through
  `PatientAlertChips` in the consultation header (BHC and RHU) and on the profile.
- **Hospitalizations / Surgeries:** `{ none: bool, items: [{ type: "Hospitalization" | "Surgery", year, reason, place }] }`.
  This replaces the separate `hospitalizations` and `surgeries` strings.

### III. Family History (`family`)

- `familyHistory: { noneKnown: bool, items: [{ condition, kind: "Chronic" | "Hereditary", relation, relativePatientId }] }`.
- `relation` is one of Mother, Father, Sibling, Grandparent, Child, Other.
- `relativePatientId` is optional. It is picked from the patient's linked family members and
  identifies the person only. It never copies conditions.
- **Similar Illness** is per visit (D7): `{ answer: "Yes" | "No" | "Unknown", who, note }`.
  It appears under III on screen and in print.

### IV. Personal & Social History (`social`)

`personalSocial`:

| Field | Shape |
|---|---|
| `education` | `{ level: None \| Elementary \| High School \| Senior High School \| Vocational \| College \| Postgraduate, completed: "Level" \| "Graduate" }` |
| Occupation | Read-only, from registration |
| `pastOccupations` | text, optional |
| `smoking` | `{ status: never \| former \| current, sticksPerDay (1–100), years (0–80), quitYear }`. `sticksPerDay` and `years` apply to former and current; `quitYear` to former only |
| `alcohol` | `{ status: never \| former \| current, frequency: occasional \| weekly \| daily }`. `frequency` applies to current only |
| `diet` | `{ highSalt, fatty, sweetDrinks, lowFruitVeg: bool, notes }` |
| `sexual` | `{ active: yes \| no \| declined, notes }` |
| `environment` | `{ waterSource: Level I \| Level II \| Level III \| Other, toilet: Water-sealed (own) \| Water-sealed (shared) \| Pit latrine \| None \| Other, exposures: [secondhandSmoke, biomassCooking, industrialPollution], notes }` |

Pack-years = `sticksPerDay / 20 × years`, shown as a number only.

### V. Obstetric & Menstrual History (`obstetric`, new section)

| Field | Shape |
|---|---|
| `menarcheAge` | int 6–25 |
| `menstrualStatus` | `menstruating \| menopause` |
| `menopauseAge` | int 30–70, menopause only |
| `intervalDays`, `durationDays` | int (interval 10–90, duration 1–15) |
| `amount` | `light \| moderate \| heavy` |
| `regularity` | `regular \| irregular`, chosen by staff |
| `symptoms` | subset of `dysmenorrhea, headache, moodChanges, bloating, breastTenderness` |
| `symptomNotes` | text |
| `pregnancies` | `[{ year, outcome: liveBirth \| miscarriage \| stillbirth, delivery: normal \| cesarean \| notApplicable, place, note }]` |

G/P is derived: G = number of pregnancies; P = live births + stillbirths. LMP, AOG and EDD
belong to sub-project 3. The link to Maternal Care episodes waits for Spec A.

## Data model

`patients.medical_background`:

```
{
  currentDiseases, allergies, hospitalizations,        // medical
  familyHistory,                                        // family
  personalSocial,                                       // social
  obstetric,                                            // obstetric (new)
  revisions:  { medical, family, social, obstetric },   // existing concurrency tokens
  updatedAt:  { <section>: date },                      // existing
  reviewedAt: { <section>: { date, facility, by } }     // new
}
```

`PatientBackground::SECTIONS` becomes `medical → [currentDiseases, allergies, hospitalizations]`,
`family → [familyHistory]`, `social → [personalSocial]`, `obstetric → [obstetric]`.

`health_records` gains two nullable JSON columns: `informant` `{ relation, name, patientId }`
and `similar_illness` `{ answer, who, note }`.

## Backend

- **Staged update shape:** `background_update: { sections, base_revisions, reviewed: [section] }`.
  The draft carries the same shape in camelCase (`reviewed`).
- **`apply()`**
  - Edited sections behave as today: conflict check, revision bump, `updatedAt`, a change
    entry. They also stamp `reviewedAt`.
  - Sections listed only in `reviewed` stamp `reviewedAt` with no conflict check, no revision
    bump and no change entry.
  - `reviewedAt.facility` is the user's facility name.
- **Validation** (`PatientBackground::rules`) covers the shapes above.
  - Enums and numeric ranges.
  - `noneKnown`/`none` exclusive with items.
  - Obstetric updates (edited or reviewed) on a non-Female patient → 422.
- **`conditionEntries()`** loses its legacy branch. Every submitted entry is patient-reported
  and keeps its stored `firstRecorded` when the name matches.
- **Health record:** `HealthRecordRequest` and `HealthRecordDraftPayloadService` accept
  `informant` and `similarIllness`. BHC and RHU share `POST /health-records`, so RHU needs no
  new endpoint.
- **Environment prefill:** `GET /patients/{id}` adds
  `householdEnvironment: { environment, patientId, patientName, date } | null`. It is the most
  recently updated `personalSocial.environment` among other patients with the same
  `family_serial_number`. It requires `clinical.history`.
- **Cleanup migration** (one-time, test data):
  - `currentDiseases` keeps only `Patient-reported` entries;
  - `allergies`, `hospitalizations`, `surgeries`, `familyHistory`, `personalSocial` are reset
    to null;
  - `health_records.background_changes` is cleared.
- **Errors:**
  - 409 `PATIENT_BACKGROUND_CONFLICT` for a stale edited section. Unchanged.
  - 403 without `clinical.history`.
  - 422 for invalid input.
- **Out of scope:** Legacy BHC Monitoring rows, Maternal Care links, any household table.

## Frontend

**Pure utils**
- `utils/backgroundUpdate.js` adds the `obstetric` section, the new field shapes, and
  `reviewed` (in build, overlay and edited/reviewed detection).
- New `utils/patientHistory.js`:
  - `packYears`, `gravidaPara`, `defaultInformant`;
  - `sectionVisibility(patient, date)`;
  - `sectionStatus(background, update, today)`, returning
    `auto | notRecorded | lastReviewed | reviewedToday | updatedToday`.

**Components** (`components/features/patients/history/`)
- `PatientHistoryPanel({ patient, background, update, onUpdateChange, informant, onInformantChange, similarIllness, onSimilarIllnessChange, householdEnvironment, layout: "screen" | "section" })`:
  the one shared component. It holds no save logic.
- `SectionNav`: I–V with status.
- `GeneralDataSection`, `PastMedicalSection`, `FamilySection`, `PersonalSocialSection`,
  `ObstetricSection`: all controlled.
- `ListEditor`: the item list used by allergies, hospitalizations, family items and
  pregnancies.
- `PatientHistoryReview`: three groups for the Review step (Updated before → after /
  Reviewed, no changes / Not reviewed). It is informational and never blocks.

**Mounting**
- **BHC:** `buildConsultationSteps` gains a `history` step after Interview.
  `informant` and `similarIllness` join workspace state, the draft and the finalize payload.
- **RHU:** `RHUAddHealthRecords.jsx` mounts `PatientHistoryPanel layout="section"` and the
  review block. RHU has no drafts, so the update lives in form state and is sent on submit.
  On 409 it shows the existing `BackgroundConflictPanel`.
- **Profile:** `PatientBackgroundTab` is rewritten read-only for the new shape, showing
  "Last reviewed [date] · [facility]" per section and the Changes log.

**Removed:** `BackgroundEditor`, `BackgroundFields`, `ConsultationBackgroundCard`, and the
unverified group (`UNVERIFIED_LABEL`, its branch in `backgroundConditions` and
`MedicalConditionsGroups`).

**Updated for the new shape:** `LifestyleRow`, `PatientSummaryPanel`, `AnatomyFindingsPanel`,
`PatientClinicalControls`, `PatientAlertChips`, `PatientDetails`, `backgroundSummary`,
`patientService`.

**Before implementation:** the uncommitted changes in `AnatomyFindingsPanel`, `LifestyleRow`,
`PatientClinicalControls` and `PatientDetails` (and `arcPlacement.js`) must be committed or
settled first.

## Testing

**Backend** (extend `PatientBackgroundConsultationTest`)
- Each section applies and saves in the new shape.
- 422 cases:
  - bad enums and ranges;
  - `noneKnown` together with items;
  - an obstetric update on a male patient.
- `reviewed` only:
  - stamps `reviewedAt` (date, facility, user), with no revision bump and no change entry;
  - two concurrent reviews of the same section give no 409.
- A stale edited section still gives 409. A user without `clinical.history` still gets 403.
- `informant` and `similarIllness` save on the record and round-trip through the draft.
- `householdEnvironment`: returns the latest same-FSN record, excludes the patient
  themselves, and is null without a match.
- An RHU user updates the background through `POST /health-records`.
- The cleanup migration leaves only patient-reported conditions and clears the old fields.

**Frontend** (unit, next to `backgroundUpdate.test.js`)
- `packYears`, `gravidaPara`, `defaultInformant`:
  - ages 17 / 18;
  - a minor with a mother link, with a guardian, and with neither.
- `sectionVisibility`: ages 9 / 10 for V, 14 / 15 for Sexual, and a male patient.
- `sectionStatus` for each state, and `reviewed` handling in `backgroundUpdate`.
- `PatientHistoryReview` grouping.

**Manual browser check**
1. BHC, new female patient: fill all five sections and finalize, then check the profile tab.
2. RHU, same patient: answers are present. Mark all reviewed and submit, then check
   "Last reviewed … RHU".
3. A male patient (no V) and a child (informant default = Mother, Sexual collapsed).
4. A second member of the same FSN gets the environment prefill.

## Implementation notes (2026-10-17)

Where the built behavior differs from or refines the design above:

- **API key.** The household environment is exposed as `household_environment` (frontend `householdEnvironment`). It is absent on the admin stored-function path.
- **Older drafts.** Drafts saved before this change may carry a legacy `backgroundUpdate`. They are dropped instead of failing: the server checks `PatientBackground::isLegacyUpdate`, the client uses `restoreBackgroundUpdate`.
- **Environment prefill.** "Use these" copies only the water source and the toilet, and only on an explicit staff click.
- **RHU conditions.** They show as three read-only sub-groups (Confirmed by RHU, Under evaluation at RHU, Past (RHU)), plus the unchanged Legacy BHC Monitoring group.
- **Status changes.** Changing a status clears its dependent fields in the UI. The server stores what it is sent.
