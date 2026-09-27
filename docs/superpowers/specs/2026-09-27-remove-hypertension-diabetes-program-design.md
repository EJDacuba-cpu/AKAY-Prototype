# Remove the Hypertension / Diabetes Program — Design

Date: 2026-09-27
Branch: Rework-Patch-AKAY-1.0

## Goal

Completely delete the Hypertension / Diabetes program (two selector checkboxes
that share one "Hypertension / Diabetic Monitoring" form) from the database,
backend, API layer and frontend. TB, Maternal, EPI and Family Planning must
keep working exactly as before.

## Decisions

- **Scope: the program only.** Clinical fields that merely mention these
  conditions belong to other forms and are kept:
  - prenatal risk factors `diabetes` / `hypertensive`
    (`prenatalForm.js`, `recordDetailsHelpers.js`,
    `HealthRecordDraftPayloadService.php` risk-factor keys)
  - `currentDiseases` / family history in the patient medical background
  - TB `comorbidities.otherComorbidities`
- **Stored data is cleaned by a migration.** All data in every environment is
  sample data, so the migration strips unconditionally (no safety gate) and
  logs the number of affected rows.
- **One pass.** Migration and code removal land together; there are no live
  users, so no staged rollout.

## 1. Database — new migration

`health_records.monitoring_data` (plain JSON):

- Remove keys `hypertensionDiabeticData` and `hypertension_diabetic_data`.
- Remove `"Hypertension"` and `"Diabetes"` from `selectedPrograms`; if the
  stored primary program is one of them, reset it to the first remaining
  program, or clear it when none remain.
- `health_records.category = 'Hypertension / Diabetic Monitoring'` →
  `'General Consultation'`.

`health_record_drafts` (payload lives in `encrypted_payload`):

- Decrypt each non-null payload with the same mechanism
  `HealthRecordDraftPayloadService` uses, apply the same key / program
  removal to its monitoring data, and re-encrypt.
- `classification = 'Hypertension / Diabetic Monitoring'` →
  `'General Consultation'`.
- A payload that fails to decrypt is left untouched and counted in the log.
- Log the affected row counts.
- `down()` is a documented no-op; the removed data is not restorable.

No schema columns or tables are dropped: the program never had its own. The
stored SQL functions pass `monitoring_data` through as a whole and need no
change.

## 2. Backend

- `app/Services/VisitPurpose.php`: drop `Hypertension` and `Diabetes` from
  `SERVICES`, so the API rejects them with a 422 like any unknown program;
  delete the BP / conditionType requirement block (~line 115).
- `app/Http/Requests/HealthRecordRequest.php`: delete the program requirement
  block (~line 393) and the `hypertensionDiabeticData` comment (~line 317).
- `app/Services/ConsultationPrograms.php`: remove both mappings.
- `app/Http/Requests/HealthRecordDraftRequest.php`: remove the
  `'Hypertension / Diabetic Monitoring'` category.
- `app/Services/HealthRecordDraftPayloadService.php`: remove the
  `hypertensionDiabeticData` schema (~line 220). Keep prenatal risk-factor keys.

## 3. Frontend — data / API layer

- `services/healthRecordService.js`: stop building and sending
  `hypertensionDiabeticData` / `hypertension_diabetic_data`; remove
  `getHypertensionDiabeticData` and `normalizeHypertensionDiabeticValue` and the
  key entries around line 1203. Vitals BP and treatment still flow through
  their own fields.
- `utils/healthRecordPrograms.js`: remove `isNcdRecord`,
  `getHypertensionDiabeticData`, the normalize/format helpers, the NCD category
  detection, the `ncd` tab entry and the `Hypertension`/`Diabetes` → `ncd` mapping.
- `utils/consultationPrograms.js`, `utils/consultationSteps.js`,
  `utils/visitPurpose.js`: remove the program, its form step, and the
  `hypertensionDiabeticData.*` error routing.

## 4. Frontend — UI

- `wizard/ConsultationProgramPanel.jsx`: the "Condition Monitoring /
  Evaluation" group contains TB only.
- `pages/bhc/ConsultationWorkspace.jsx`: remove the Hypertension / Diabetic
  form section, its state, defaults and validation wiring.
- `HealthRecordClinicalDetails.jsx`, `recordDetailsHelpers.js` (the record
  title mapping only), `SpecializedRecordsTab.jsx`: remove the display.
- `pages/bhc/HealthRecords.jsx`, `pages/bhc/FollowUps.jsx`,
  `followUpStatusStyles.jsx`, `pages/rhu/RHUHealthRecords.jsx`: remove the
  filter options, badge style and category detection.
- `pages/rhu/RHUAddHealthRecords.jsx`: remove the "NCD Monitoring" card.
- `pages/bhc/BHCReports.jsx`: delete the NCD report (definition entry,
  `NcdReportView`, `normalizeHypertensionDiabeticReportRow`, slug aliases,
  category option, switch cases, imports).
- `layout/sidebar/sidebarData.js`: remove the "Hypertension and Diabetes
  Monitoring" report link.
- `pages/bhc/PatientDetails.jsx`: update the comment that mentions NCD.

## 5. Tests and docs

- Update tests that expect the program: `consultationSteps.test.js`,
  `consultationPrograms.test.js`, `healthRecordPrograms.test.js`,
  `HealthRecordDraftPayloadServiceTest.php`.
- Add backend tests: posting `Hypertension` or `Diabetes` as a program returns
  422; the migration strips the blob, removes the programs from
  `selectedPrograms` and recategorizes the record.
- Unchanged: prenatal, patient medical background, TB comorbidity tests.
- Update docs: `docs/health-record-drafts.md`, `docs/ai/WORKFLOWS.md`,
  `docs/consultation-workflow-revision.md`,
  `docs/approved-workflow-ui-rework.md`.

## Success criteria

- A repo-wide grep for
  `hypertensionDiabeticData|hypertension_diabetic_data|isNcdRecord|Hypertension / Diabetic|NcdReport`
  finds nothing outside this spec and the new migration; the remaining
  `hypertens|diabet` hits are only the kept clinical fields.
- Backend (`php artisan test`) and frontend test suites pass.
- A consultation with TB, Maternal, EPI or Family Planning still saves and
  displays normally; the program panel no longer shows Hypertension or Diabetes.
- After migrating, no row in `health_records` / `health_record_drafts` contains
  the removed keys or program names.
