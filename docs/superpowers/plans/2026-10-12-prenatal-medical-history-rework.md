# Prenatal Medical History Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prenatal form's 14-item Medical History with four obstetric checkboxes, and compute age risk and height risk automatically, announced by a one-time modal.

**Architecture:** Pure logic lives in two util files (`maternalRisk.js` new, `prenatalForm.js` trimmed) and is unit-tested with `node --test`. `ConsultationWorkspace.jsx` only wires it: a records query for the last recorded height, an acknowledged-flag state, a `NoticeModal`, and overlaying the computed flags onto the saved/reviewed `riskAssessment`. The backend draft whitelist is kept (see Global Constraints).

**Tech Stack:** React 19 + Vite, `node:test` for utils, Laravel 13 + PHPUnit for the backend test.

**Spec:** `docs/superpowers/specs/2026-10-12-prenatal-medical-history-rework-design.md`

## Global Constraints

- Age risk = age < 18 or age > 35 (18 and 35 are NOT risk). Height risk = height < 145 cm (145 is NOT risk).
- Age is computed at the visit date (`dateOfVisit`), not today.
- Height source: this visit's Vital Signs height once entered, else the most recent health record of the patient with a height (any day).
- The modal is neutral: states the fact only. **No recommendation, referral or advice text** (no-clinical-suggestions rule). Button label "OK".
- A flag is announced at most once per consultation. No modal when the flag is false or its data is missing. Resuming a draft never opens the modal by itself.
- `ageRisk` and `heightRisk` keep their existing keys in `riskAssessment`; they are never user-editable.
- The four remaining checkboxes stay plain manual checkboxes, blank each visit (prefill is deferred, out of scope): `grandMultipara`, `previousCs`, `recurrentMiscarriageOrStillbirth`, `postpartumHemorrhage`. Section title: "Obstetric Risk Factors".
- Keys removed from the form and never written by new records: `tuberculosis`, `heartDisease`, `diabetes`, `bronchialAsthma`, `goiter`, `hypertensive`, `alcoholUser`, `smoker`, `medicalConditions`.
- Saved records are never rewritten; `MATERNAL_RISK_LABELS` in `recordDetailsHelpers.js` keeps every current label.
- **Backend whitelist is NOT trimmed** (deviation from spec section 5, amended in Task 5): `HealthRecordDraftPayloadService::sanitizeNode` throws 422 on unknown keys, also when a draft is read back, so removing keys would break resuming in-progress drafts. The frontend stops sending them instead.
- Copy: English UI. Frontend tests: `cd frontend && npm run test:prenatal-form`. Backend: `cd backend && php artisan test --filter=PrenatalFormFieldsTest`.

## Review Focus

- Birthday not yet reached on the visit date (age is one less); covered in Task 1 tests.
- Boundary values 17/18, 35/36, 144/145, and height `""`, `"0"`, `"abc"`, `"142.5"`; Task 1 tests.
- Missing or invalid birthdate, or no height anywhere: flags are `null`, no modal, no crash; Task 1 tests and Task 4 manual check.
- A resumed or continued draft that still carries `diabetes: true` etc. must neither 422 nor be saved into the new record; Task 2 (`sanitizeRiskAssessment`) and Task 5 tests.
- Acknowledged flag must not reopen the modal on re-selecting Maternal or on later steps; Task 1 test.

---

### Task 1: Risk flag logic and last-recorded-height helper

**Files:**
- Create: `frontend/src/utils/maternalRisk.js`
- Create: `frontend/src/utils/maternalRisk.test.js`
- Modify: `frontend/src/utils/currentPatientVitals.js` (add one export)
- Modify: `frontend/src/utils/currentPatientVitals.test.js` (add tests)
- Modify: `frontend/package.json` (`test:prenatal-form` also runs `src/utils/maternalRisk.test.js`)

**Interfaces:**
- Produces, in `maternalRisk.js`:
  - `calculateAgeInYears(birthdate, referenceDate = new Date()): number | null` (moved verbatim from `ConsultationWorkspace.jsx:657`).
  - `getMaternalRiskFlags({ birthdate, visitHeight, recordedHeight, referenceDate }): { ageRisk: boolean|null, heightRisk: boolean|null, age: number|null, heightCm: number|null, heightSource: "visit"|"record"|null, heightDate: string|null }`. `visitHeight` is the raw form string; `recordedHeight` is `{ value: number, date: string } | null`.
  - `pendingRiskAnnouncements(flags, acknowledged: string[]): { key: "ageRisk"|"heightRisk", message: string }[]`.
  - `applyRiskFlags(riskAssessment, flags): object`: copy with `ageRisk`/`heightRisk` set to `flags.x === true`.
- Produces, in `currentPatientVitals.js`: `getLatestRecordedHeight(records): { value: number, date: string } | null`, the most recent record with a finite height > 0, `date` as `YYYY-MM-DD`.

- [ ] **Step 1: Write failing tests in `maternalRisk.test.js`.** Names and assertions:
  - `age risk boundaries`: birthdate giving age 17 → `ageRisk` true; 18 → false; 35 → false; 36 → true (use `referenceDate: new Date("2026-10-12")`).
  - `age is taken at the visit date`: birthdate `2008-10-13`, reference `2026-10-12` → age 17, true; reference `2026-10-13` → age 18, false.
  - `height risk boundaries`: `visitHeight` `"144"` → true, `"145"` → false, `"142.5"` → true.
  - `unusable height is null`: `""`, `"0"`, `"abc"`, `undefined` with no `recordedHeight` → `heightRisk` null, `heightSource` null.
  - `visit height wins over the recorded one`: `visitHeight "150"`, `recordedHeight { value: 140, date: "2026-08-12" }` → `heightRisk` false, `heightSource "visit"`; with `visitHeight ""` → true, `heightSource "record"`, `heightDate "2026-08-12"`.
  - `missing birthdate is null`: `birthdate ""` and `"not-a-date"` → `ageRisk` null, `age` null.
  - `pendingRiskAnnouncements`: only true flags are listed, in order age then height; keys in `acknowledged` are omitted; null/false produce nothing. Messages are exactly `"Age risk — patient is 17 years old."` and, for a record height, `"Height risk — last recorded height is 142 cm (2026-08-12)."`, for a visit height `"Height risk — height entered this visit is 142 cm."`. Assert neither message contains "refer" or "recommend".
  - `applyRiskFlags` sets both keys true/false (null → false), keeps other keys, does not mutate its input.
  Add to `currentPatientVitals.test.js`: `getLatestRecordedHeight` returns the newest record with a height regardless of day, skips records with empty/0/non-numeric height, returns `null` for `[]`/`undefined`.
- [ ] **Step 2: Run** `cd frontend && node --test src/utils/maternalRisk.test.js src/utils/currentPatientVitals.test.js`. Expected: FAIL (module/export missing).
- [ ] **Step 3: Implement** the four exports above. Reuse `getVitalRecordDate` and `hasVitalValue` from `currentPatientVitals.js` in `getLatestRecordedHeight`; `date` is `getVitalRecordDate(record)` formatted as the clinic-local `YYYY-MM-DD` (the file's `dayFormatter` already produces that).
- [ ] **Step 4: Add** `src/utils/maternalRisk.test.js` to the `test:prenatal-form` script, then run `npm run test:prenatal-form` and `npm run test:patient-profile`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(prenatal): maternal risk flag logic`.

### Task 2: Trim the checklist model and sanitize legacy keys

**Files:**
- Modify: `frontend/src/utils/prenatalForm.js`
- Modify: `frontend/src/utils/prenatalForm.test.js`

**Interfaces:**
- Produces: `MATERNAL_RISK_GROUPS` with ONE group (`key: "obstetric"`, `eyebrow: "Pregnancy / Obstetric Risk Factors"`) holding exactly the four manual items in the Global Constraints order `grandMultipara`, `previousCs`, `recurrentMiscarriageOrStillbirth`, `postpartumHemorrhage`, with the same labels and `parent` values as today. `MATERNAL_RISK_PARENTS` becomes `{ previousPregnancyComplications: ["previousCs", "recurrentMiscarriageOrStillbirth", "postpartumHemorrhage"] }`.
- Produces: `MATERNAL_RISK_KEYS` (array: `ageRisk`, `heightRisk`, `grandMultipara`, `previousPregnancyComplications`, `previousCs`, `recurrentMiscarriageOrStillbirth`, `postpartumHemorrhage`) and `sanitizeRiskAssessment(riskAssessment): object` that keeps only those keys (returns `{}` for null/undefined).
- `applyRiskFactorChange` is unchanged.

- [ ] **Step 1: Update `prenatalForm.test.js` to the new behavior (failing).**
  - Replace the "three columns" test with `Obstetric Risk Factors is one group of four`: one group, option keys exactly the four above in order.
  - Update "every risk factor maps to a field the record already stores" to the 7-key set (`MATERNAL_RISK_KEYS`).
  - Replace the Risk Code D/E parents test: only `previousPregnancyComplications` is a parent.
  - Rewrite the tests that used removed keys: the "flag stays set while ANY item" test uses `previousCs` + `postpartumHemorrhage`; "an item without a Risk Code never touches a flag" uses `grandMultipara`; the legacy-survives test uses `grandMultipara` instead of `ageRisk`/`diabetes`.
  - Add `sanitizeRiskAssessment drops removed keys`: input with `diabetes`, `smoker`, `tuberculosis`, `medicalConditions`, `previousCs: true`, `ageRisk: false` → only `{ previousCs: true, ageRisk: false }`; `undefined` → `{}`.
- [ ] **Step 2: Run** `npm run test:prenatal-form`. Expected: FAIL.
- [ ] **Step 3: Implement** in `prenatalForm.js` (also update the file's header comment so it no longer mentions Risk Code E).
- [ ] **Step 4: Run** `npm run test:prenatal-form`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(prenatal): reduce risk checklist to obstetric items`.

### Task 3: Prenatal form uses the trimmed checklist

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (`EMPTY_MATERNAL_DATA.riskAssessment` ~line 352, `mergeMaternalData` ~line 499, draft `pickDraftFields` list ~line 1473, the Medical History `FormSection` ~line 4495)

**Interfaces:**
- Consumes: `MATERNAL_RISK_GROUPS`, `sanitizeRiskAssessment` from `utils/prenatalForm`.

- [ ] **Step 1: Edit `EMPTY_MATERNAL_DATA.riskAssessment`** to the seven `MATERNAL_RISK_KEYS` (all `false`), keeping the Risk Code D comment and dropping the Risk Code E comment/keys.
- [ ] **Step 2: In `mergeMaternalData`**, build `riskAssessment` as `{ ...EMPTY_MATERNAL_DATA.riskAssessment, ...sanitizeRiskAssessment(legacyRiskAssessment) }` so a resumed draft or a continued record can never carry a removed key into the new record.
- [ ] **Step 3: Trim the draft `pickDraftFields` list** to `MATERNAL_RISK_KEYS` (import and pass it directly).
- [ ] **Step 4: Retitle the section** to "Obstetric Risk Factors", subtitle "Mark any obstetric risk factors relevant to this pregnancy.", and change the grid to a single `RiskCodeChecklist` column (drop the `@xl:grid-cols-2 @3xl:grid-cols-3` classes).
- [ ] **Step 5: Verify** `cd frontend && npm run lint && npm run build`. Expected: no new lint errors, build succeeds. Also `npm run test:prenatal-form` PASS.
- [ ] **Step 6: Commit** `feat(prenatal): show only obstetric risk factors in the form`.

### Task 4: Computed flags, modal, save and review

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`

**Interfaces:**
- Consumes: `getMaternalRiskFlags`, `pendingRiskAnnouncements`, `applyRiskFlags`, `calculateAgeInYears` (Task 1); `getLatestRecordedHeight` (Task 1); existing `getEffectivePatientBirthdate`, `getHealthRecordsByPatient`, `NoticeModal`, `useQuery`, `handleProgramSelect` (~line 3740), `goToStepKey` (~line 3612), `recordMaternalData` (~line 3089), `reviewSections` (~line 4109), `dateOfVisit`, `height`.

- [ ] **Step 1: Replace the local `calculateAgeInYears`** (~line 657) with the import from `utils/maternalRisk`; behavior must be identical (`getPatientAgeInYears` keeps using it).
- [ ] **Step 2: Add the records query** `useQuery({ queryKey: ["patient-records-height", selectedPatientId], queryFn: () => getHealthRecordsByPatient(selectedPatientId), enabled: Boolean(selectedPatientId) })` (NOT gated on `isMaternal`, so the records are already loaded when Maternal is selected). Derive `recordedHeight = getLatestRecordedHeight(data)`. A failed or pending query leaves `recordedHeight` null (flags just have no record height).
- [ ] **Step 3: Derive `riskFlags`** with `useMemo` from `getMaternalRiskFlags({ birthdate: getEffectivePatientBirthdate(selectedPatient), visitHeight: height, recordedHeight, referenceDate: dateOfVisit })`.
- [ ] **Step 4: Add state** `acknowledgedRiskFlags` (string array, not persisted in drafts) and `riskModal` (`{ items } | null`). Add `announceRiskFlags(flags = riskFlags)`: when Maternal is selected, compute `pendingRiskAnnouncements(flags, acknowledgedRiskFlags)` and, if non-empty, set `riskModal`.
- [ ] **Step 5: Trigger it** (a) in `handleProgramSelect` when `option === "Maternal"` is being added (call with flags computed now; the program state change is not needed to compute them), and (b) in `goToStepKey` when the step being left is `ASSESSMENT_STEP` and `isMaternal` (use the latest `height`).
- [ ] **Step 6: Render** a `NoticeModal` (`title` "Pregnancy risk", `subtitle` "AKAY Notice", one paragraph per item message as `children`, default "OK"). On close add the shown keys to `acknowledgedRiskFlags` and clear `riskModal`. It must never open from draft restore.
- [ ] **Step 7: Save and review:** in `recordMaternalData` set `riskAssessment: applyRiskFlags({ ...EMPTY_MATERNAL_DATA.riskAssessment, ...maternalData.riskAssessment }, riskFlags)`; in the `reviewSections` map pass `Maternal: { ...maternalData, riskAssessment: applyRiskFlags(maternalData.riskAssessment, riskFlags) }` so Review shows the same values that will be saved.
- [ ] **Step 8: Verify** `npm run lint && npm run build && npm run test:prenatal-form`. Then manual in the browser (`npm run dev`): (1) patient aged 17, select Maternal → modal "Age risk — patient is 17 years old.", OK, deselect and reselect Maternal → no second modal; (2) type height 142 in Physical Examination, press Next → height modal once; (3) patient aged 25 with height 160 → no modal; (4) patient without birthdate → no modal, no console error; (5) Review shows "Age risk Yes" / "Height risk Yes" and the saved record's details show the same.
- [ ] **Step 9: Commit** `feat(prenatal): announce age and height risk and save the computed flags`.

### Task 5: Backend draft compatibility and spec amendment

**Files:**
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php` (comment only, ~line 109)
- Modify: `backend/tests/Feature/PrenatalFormFieldsTest.php`
- Modify: `docs/superpowers/specs/2026-10-12-prenatal-medical-history-rework-design.md` (section 5)

- [ ] **Step 1: Write failing/guarding tests** in `PrenatalFormFieldsTest`:
  - `test_a_draft_with_only_the_current_risk_keys_saves_and_reads_back`: `saveDraft` with `riskAssessment` of `ageRisk`, `heightRisk`, `grandMultipara`, `previousCs`, `previousPregnancyComplications` → 2xx and the keys come back.
  - `test_a_draft_saved_with_the_removed_keys_still_saves_and_reads_back`: `riskAssessment` containing `diabetes => true`, `smoker => true`, `medicalConditions => true` → still 2xx (older in-progress drafts must keep resuming).
- [ ] **Step 2: Run** `cd backend && php artisan test --filter=PrenatalFormFieldsTest`. Expected: PASS (they document current behavior and guard against a future trim).
- [ ] **Step 3: Replace the comment** above the whitelist keys with one noting that `tuberculosis`, `heartDisease`, `diabetes`, `bronchialAsthma`, `goiter`, `hypertensive`, `alcoholUser`, `smoker`, `medicalConditions` are legacy: no longer sent by the form but kept so older drafts still validate when read back. Do not remove any key.
- [ ] **Step 4: Amend spec section 5** to say the whitelist is kept for read-back compatibility and the frontend stops sending the removed keys; update the Testing section's backend bullet to match Step 1.
- [ ] **Step 5: Commit** `test(prenatal): keep legacy draft keys readable; amend spec`.
