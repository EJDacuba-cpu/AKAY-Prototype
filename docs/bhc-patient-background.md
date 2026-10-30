# BHC Patient Background

This change separates registration information, longitudinal clinical background, and current-visit answers for BHC users. RHU consultation editing retains its existing flow.

## Intended workflow

1. Register/edit Education and Current Occupation in Patient Information.
2. Open Patient Background to edit medical, family, lifestyle and eligible obstetric history. Each section has explicit Save/Cancel. An active consultation is not required.
3. Use Patient History as a read-only reference on Overview and in consultation; it starts closed.
4. Record Informant and Similar Illness in the Family in Patient Interview. BHC consultation no longer has a separate Patient History step.
5. From the reference or Prenatal Care summary, Edit in Patient Background saves the draft to the server and opens Background in the same tab. A failed server save keeps the consultation open, even if a protected device copy succeeded. Ordinary Leave & Resume Later retains its existing device-recovery fallback.
6. After a section save, an open server draft enables the Background saved modal and Continue Consultation banner. Continue resumes the stored step. Without a draft, saving shows a toast.
7. A legacy History-step draft reopens Patient Interview. Staff must explicitly Keep or Discard staged history before submitting/finalizing. Existing staged sections can be corrected without creating new staged sections or replacing their original conflict revisions. A finalizer without correction permission can acknowledge Keep but cannot edit/discard. Recovery is also visible on Review.

The admin must assign both clinical history reading and the new background update capability. Viewing history alone does not authorize editing. Assigned BHC access remains enforced by the API.

## Data ownership

Laravel validates and authorizes the change, applies existing revision checks under a database row lock, and writes the audit in the same transaction. PostgreSQL stores demographic Education columns and independent background audit entries. No new stored procedure is required. TanStack Query refreshes patient details, consultation patient data and background audit after a successful save.

Saved historical consultation records and old background values remain intact. Education is backfilled once into demographic columns; clearing it later does not fall back to the historical JSON. Past Occupations input is removed while previous values remain in historical data. Old BHC consultation drafts are explicitly recoverable and must not silently overwrite current registration details.

## Activation and verification

Implementation and Task 3 review fixes were verified on October 17, 2026. The four review findings (server-save navigation, explicit legacy acknowledgement, incomplete-row correction, and misleading removed-field review rows) are resolved. Education/Past Occupations from compatible drafts remain copyable recovery text; BHC conflict comparisons exclude them from proposed clinical changes. Shared RHU defaults remain unchanged.

Activation requires the additive migration `backend/database/migrations/2026_10_16_100000_add_patient_background_changes_and_education.php`. It adds patient Education columns, backfills compatible existing values once, creates `patient_background_changes`, and refreshes PostgreSQL `akay_patient_json` to expose Education. Apply through the normal deployment process after reviewing the combined workspace changes and pending migrations. No application/production database migration was run in this session. Grant `clinical.background.update` explicitly alongside `clinical.history` to the intended BHC staff through the existing admin capability UI; it is not automatically granted by role.

Fresh verification:

- All discovered frontend tests: `node --test --test-concurrency=2` over every `*.test.js` under `frontend/src` and `frontend/config`: **983 passed, 0 failed**.
- Focused `npm.cmd run test:patient-history`: **119 passed**; consultation step baseline: **97 passed** (also included in the full run).
- Scoped ESLint: **exit 0** across 18 Task 3 implementation/test files.
- `npm.cmd run build`: **exit 0**, with the existing large-chunk warning and a plugin-timing warning.
- Backend `php -d memory_limit=512M vendor/bin/phpunit --no-extensions --filter 'PatientBackgroundIndependentTest|PatientEducationTest|PatientBackgroundConsultationTest|PatientHistorySectionsTest|PatientHistoryRecordTest'`: **56 passed, 347 assertions**, using the configured in-memory SQLite test database.
- `git diff --check`: no whitespace errors. No staging, commit, merge, or push performed; unrelated FSN changes were preserved.

The first combined component-test run hit a Vite WebSocket port collision and dependency-optimizer memory exhaustion. Both server-rendered component tests now use isolated React-only Vite configuration, without WebSockets or dependency scanning; the focused and full reruns passed. This changes test infrastructure only.

Verification limits:

- The browser inventory returned no connected browser/app surface. Desktop/mobile layout, non-modal focus behavior, and the complete interactive Background/Continue round trip still need a browser smoke test. SSR tests verify rendered correction controls, read-only finalizer controls, prenatal guards, and BHC/RHU conflict filtering.
- PostgreSQL migration execution, actual row-lock concurrency, and deployment timezone behavior were not verified against a PostgreSQL instance. SQLite tests do not prove those properties.
- Pre-ITR incompatible background shapes were already stripped by backend draft sanitization and frontend restoration before this work. This change recovers compatible staged History drafts; it cannot recover data already removed by that sanitizer.
- Keep acknowledgement is deliberately requested again after reopening a draft; the original staged values and revisions persist, but acknowledgement is session state.

Run logs and the Task 3 review handoff are retained under `.superpowers/sdd/2026-10-16-bhc-patient-background/` because the mixed feature workspace remains uncommitted.
