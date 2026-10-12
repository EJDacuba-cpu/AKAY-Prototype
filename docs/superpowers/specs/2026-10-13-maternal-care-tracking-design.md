# Maternal Care Tracking — Design (Spec A)

Date: 2026-10-13
Scope: Care & Programs tab, Start Consultation modal, Barangay Health Services panel, Prenatal form
(BHC). Spec B (TT/Td administration deducting inventory) follows separately.

## Problem

Found while recording a first and a second prenatal visit in the browser (patient #34, records #32
and #33):

- Care & Programs shows a "Not started" card for every program a patient is eligible for, so it is
  never empty, and the Maternal card shows only G/P, a frozen AOG text, EDD and last visit.
- Nothing marks a pregnancy as started or finished. A follow-up visit does not know the patient is
  under maternal care: Maternal is not enrolled, the Prenatal form is blank again (LMP, EDC, G/P,
  TPAL retyped), and TT/Td doses are scattered across records.
- There is no way to close a pregnancy that ends in loss or transfer, and no BHC field records a
  delivery date, so the existing Postpartum phase can never be reached by a new record.

## Decisions (brainstorming, 2026-10-13)

1. Care Tracking shows a program only while the patient is **enrolled** in it: a finalized
   consultation with that service enrolled (drafts do not count). TB keeps its rule (RHU-activated).
   With nothing enrolled the section reads "No active care tracking."
2. Only Maternal is redesigned now. Family Planning, EPI and TB keep their card content; only the
   "enrolled only" rule applies to them.
3. Maternal phases: **Prenatal** from the enrolling record; **Postpartum** automatically once a
   delivery date is recorded; ends only when a worker presses **Complete Maternal Care** with a
   reason. One active maternal episode per patient.
4. After closing, the pregnancy is listed under a collapsed **Past pregnancies** section.
5. Community Programs stays as is, below Care Tracking.
6. TT/Td: list every dose with its date (lifetime, all records) and "Next dose: TTn" with **no
   date** (no schedule computed by the system).
7. Medicines: from items dispensed out of BHC inventory on the episode's records (no new field).
8. Start Consultation modal: no General/Continue radio. Sections shown only when they have items:
   **Ongoing care**, **Condition monitoring (RHU-confirmed)**, **Other follow-ups**. Nothing ticked
   = general consultation.
9. Panel: while maternal care is active, Maternal is read-only **Ongoing** — "Included in this
   visit" or "Not included in this visit" — with no button. It can only be included by ticking it
   in Start Consultation. Enroll returns after Complete Maternal Care.
10. Prenatal form on a follow-up visit: pregnancy data is shown read-only with **[Correct]**;
    Obstetric Risk Factors and OB History are not asked again.
11. Fundal height is written as a 2D body finding on Abdomen (free text). No new field.

## Design

### 1. Maternal episode (the pregnancy)

An episode is derived, not stored, except for its closure:

- Maternal records = the patient's finalized records with the Maternal service, ordered by visit
  date then id.
- **Closures** are stored (new table, §6). An episode starts at the first maternal record after the
  latest closure (or the first maternal record ever) and contains every maternal record up to its
  closure.
- **Active episode** = an episode with no closure. At most one exists by construction.
- Phase: `postpartum` when any record in the episode has `maternalData.deliveryDate`, else
  `prenatal`. Closed episodes are `completed`.
- Pregnancy values (LMP, EDC, gravida, para, TPAL, obstetric risk factors, previous FP method) =
  the latest record in the episode that has the value. A [Correct] on a later visit therefore wins.

The backend computes the active-episode summary for the patient payload and the consultation
overview: `maternalCare: { active: bool, phase, startedRecordId, startedOn, lastVisitOn,
pendingFollowUpId|null, closures: [{ id, reason, closedOn, note, closedBy, startedRecordId }] }`.
The card's detailed facts (AOG, labs, TT/Td, medicines) are derived on the frontend from the
records it already loads, using those boundaries.

### 2. Recording the delivery (new, minimal)

On a follow-up while the episode is Prenatal, the Prenatal form shows a **Delivery** block:
"Delivered?" toggle; when on, **Date of delivery** (required, not in the future, not before LMP)
and **Place of delivery** (optional text). Saved as `maternalData.deliveryDate` /
`maternalData.deliveryPlace`. Neither is accepted today: the draft whitelist
(`HealthRecordDraftPayloadService`) has no top-level `deliveryDate` (its `placeOfDelivery` belongs
to `previousPregnancyHistory` items), so both are added there and validated in
`HealthRecordRequest` (`deliveryDate` date, not after today; `deliveryPlace` string ≤ 200). Once recorded the episode is
Postpartum, and later maternal visits in the episode count as postpartum visits. No other
postpartum fields are added in this spec.

### 3. Care & Programs tab

- Care Tracking lists enrolled programs only (decision 1), Maternal first.
- **Maternal card**
  - Header: "Maternal Care" + phase badge (Prenatal / Postpartum).
  - Pregnancy: AOG computed from LMP to today ("16 weeks 2 days · 2nd trimester"; trimesters
    <14, 14–27, ≥28 weeks), EDC with weeks remaining, G/P and TPAL. Postpartum: delivery date and
    days since delivery instead of AOG/EDC countdown.
  - Visits: prenatal visits per trimester (AOG at each visit date), last visit, next pending
    follow-up date (from the episode's follow-up tasks). Postpartum: number of postpartum visits.
  - Risk & Labs: age risk, height risk, obstetric risk factors ticked (or "None"); the seven labs
    with latest result and date in the episode, or "Not recorded".
  - TT/Td: all doses from all maternal records of the patient, each series in order with dates;
    "Next dose: TT3" (or "Series complete" after TT5 / Td5). No due dates.
  - Medicines: items dispensed on the episode's records (name, quantity, date). Empty: "None
    dispensed".
  - Flags (no advice text): "Past EDC — delivery not recorded" when today > EDC in Prenatal;
    "Postpartum period ended — close maternal care" when more than 42 days after delivery.
  - **Complete Maternal Care** button (§4).
- **Past pregnancies (n)**, collapsed: one row per closed episode — "LMP … · Completed … · reason
  · x prenatal / y postpartum"; expanding shows delivery date, visits per trimester, labs count,
  TT/Td given in that episode, and "Closed by … · date". Hidden when there are none.
- Community Programs unchanged below.

### 4. Complete Maternal Care

Modal: reason (required) — `delivered` ("Delivered / postpartum completed"), `pregnancy_loss`
("Pregnancy loss"), `transferred` ("Transferred / moved out"); date (required, default today, not
in the future, not before the episode's first visit); note (optional, ≤500). Confirm text: "This
closes the current pregnancy's tracking. Records are not changed." No clinical advice.

After closing: the card leaves Care Tracking, the pregnancy appears in Past pregnancies, the panel
shows "Not Started" + Enroll again, and pending follow-ups of the episode are left as they are
(follow-ups have their own cancel action).

### 5. Start Consultation, panel, Prenatal form

- **Modal**: remove the visit-type radio. Sections, each only when non-empty:
  - Ongoing care: "Maternal Care — Prenatal · AOG … · Follow-up due …". Ticking it also continues
    the episode's pending follow-up (if any).
  - Condition monitoring (RHU-confirmed): today's monitored-condition and RHU-recommended rows.
  - Other follow-ups: pending follow-ups not linked to a monitored condition or to the maternal
    episode.
  - Nothing ticked starts a general consultation. `hasStartChoices` also counts an active maternal
    episode. The existing monitoring/follow-up validation and routing stay as they are.
- **Route**: ticking Maternal adds `care=maternal` to the workspace URL; the workspace then starts
  with Maternal selected.
- **Panel** (active episode): Maternal card shows "Ongoing" with "Included in this visit" or "Not
  included in this visit", no button. `handleProgramSelect` ignores Maternal while an episode is
  active. Without an active episode: today's Not Started / Enroll / Remove.
- **Prenatal form, follow-up mode** (active episode and Maternal included):
  - Pregnancy Information read-only: LMP, EDC, G/P, TPAL, AOG (auto), with "Recorded <date> ·
    [Correct]". [Correct] turns the fields editable for this visit.
  - Obstetric Risk Factors and OB History hidden.
  - Shown: FHT, Delivery block (§2, Prenatal phase only), Laboratory Results, Immunization This
    Visit, Ultrasound.
  - On save the record still carries the full pregnancy values (carried or corrected) and the
    episode's obstetric risk factors and previous FP method, so every record stays complete on its
    own. Age/height risk are computed per visit as today.
- **First visit / enrollment**: unchanged from the current form.

### 6. Backend

- Migration: `maternal_care_closures` — id, patient_id (fk), started_health_record_id (fk), reason
  (string, one of the three), closed_on (date), note (text, nullable), closed_by (fk users),
  timestamps. Unique on started_health_record_id (an episode closes once).
- `MaternalEpisodeService`: derives episodes from records + closures (§1); used by the patient
  payload, consultation overview and the close endpoint.
- `POST /api/patients/{patient}/maternal-care/close` — body `{ reason, closedOn, note }`; 422 when
  there is no active episode or input is invalid; facility-scoped like other patient writes;
  permission `consultations.finalize` (add the path to `EnforceActionPermissions`).
- No change to how records are saved, except accepting `deliveryDate` and `deliveryPlace` (§2).
- Existing records are never rewritten.

## Out of scope

- TT/Td inventory deduction (Spec B).
- Redesign of the Family Planning, EPI and TB cards.
- Fundal height as a field; any other postpartum fields.
- Due dates or protection status for TT/Td.
- RHU-side maternal forms.

## Testing

- Unit (frontend): episode derivation (no records, one open episode, closed + new episode,
  delivery → postpartum), AOG/trimester/weeks-to-EDC at a fixed "today", visits per trimester,
  latest lab per test, TT/Td union and next dose (incl. TT5 complete, Td series), flags (past EDC,
  42 days), Care Tracking "enrolled only" rule, Start Consultation section building and
  `hasStartChoices`.
- Backend feature: close endpoint (success, no active episode 422, invalid reason/date 422, other
  facility 403/404, permission), overview/patient payload `maternalCare`, closing then a new
  maternal record starts a new episode.
- Manual browser: enroll → follow-up via Start Consultation (Maternal Ongoing, read-only pregnancy
  data, Correct) → record delivery → Postpartum → Complete Maternal Care → Past pregnancies →
  Enroll available again.
