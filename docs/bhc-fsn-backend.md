# BHC FSN backend: activation and verification

## Included flow

- BHC registration creates a persisted household with `FSN-YYYY-NNNN` on save,
  or joins an existing local household without generating another number.
- Each BHC/year has an independent counter. Staff may explicitly override or
  correct an FSN; normalized duplicates within that BHC are rejected.
- BHC Families list, details, basic creation and editing use the Laravel API.
  Patient household changes use `/bhc/patients/{id}/edit`.
- Directory/edit permissions are real admin-assigned `families.view` and
  `families.manage` grants. Registration lookup needs `patients.register`.
- Families is not an Admin/MHO module (no sidebar item; `/admin/families` is refused).
  `families.view`/`families.manage` are server-stored for BHC and RHU accounts
  through the Role & Access checklist; browser (localStorage) grants are gone.
  The RHU Families pages still run on the prototype registry until RHU conversion.
- RHU conversion, cross-barangay search, related-family graph editing and legacy
  group reconciliation remain outside this phase.

## Activate in the intended development/deployment database

Review the new migration before applying it. No deployment migration was executed
as part of implementation.

```powershell
cd backend
php artisan migrate
```

Migration: `2026_10_16_090000_create_bhc_households.php`. It adds household identity,
membership columns, constraints, durable counters and the PostgreSQL allocation
function. Existing patients and FSNs are preserved; seeded browser mock families
are not imported into the database.

Use the admin's existing account/assignment editor to grant Families access to
the intended BHC staff. `families.manage` requires `families.view`. Old browser
grants are not trusted or automatically migrated. Registrars can still select
households without being granted the standalone Families directory.

If migrations run under a different database owner from Laravel's runtime role,
grant the runtime role only the required new table/sequence/function privileges
through the existing deployment permission process. Public function execution
is revoked by the migration; do not grant browser/anonymous roles access.

## Existing patient records

No household head or membership is guessed from a name or address. Historical
unlinked patients remain readable. Their nonblank FSNs are reserved against new
canonical households until a separate reconciliation workflow is implemented.

Read-only check of the pending legacy population:

```sql
SELECT barangay_health_center_id, count(*) AS unlinked_with_fsn
FROM patients
WHERE barangay_health_center_id IS NOT NULL
  AND household_id IS NULL
  AND nullif(trim(family_serial_number), '') IS NOT NULL
GROUP BY barangay_health_center_id;
```

For linked patients, FSN correction is done in Edit Family. Their permanent
household ID keeps the membership intact and compatibility serials are updated
inside the same transaction.

## Verification commands

```powershell
cd backend
php -d memory_limit=512M vendor/bin/phpunit --no-extensions --filter "BhcHouseholdsTest|FamilyPermissionsTest|HouseholdParentLinkTest|HouseholdEnvironmentTest|PatientCreationPermissionsTest"
```

Actual PostgreSQL concurrency verification is opt-in. Set `AKAY_TEST_PG_URL` in
the process environment to a **disposable PostgreSQL test database**, then run:

```powershell
php -d memory_limit=512M vendor/bin/phpunit --no-extensions --filter HouseholdFsnPostgresConcurrencyTest
```

The harness creates a random test-owned schema, launches independent workers,
checks automatic/manual collisions and rollback, then removes that schema.
Without the explicit test URL it is skipped. SQLite tests do not prove PostgreSQL
locking behavior. Do not substitute the application database URL automatically.

Frontend verification:

```powershell
cd frontend
node --test
npm run build
```

The production build may report the repository's existing large-chunk warning.
Live browser verification requires an available connected browser and a migrated
development database; an automated build is not evidence of a visual review.

## Observed implementation checks — 2026-10-16

- Frontend: 923 tests passed; changed-file ESLint and production build passed.
- Focused backend: 46 tests / 314 assertions passed, plus one explicitly skipped
  PostgreSQL concurrency test. Pint passed for the new/modified household PHP files.
- Broad backend: 809 passed, 128 assertion failures, 3 errors, 22 skipped and one
  risky test. All 131 failing/error test names and messages were reproduced on
  an isolated HEAD backend snapshot; no new shared-test failure was found.
- Comparison evidence: `backend/storage/logs/fsn-baseline-comparison.json` and
  `backend/storage/logs/fsn-full-tests-512m.log` (local ignored verification output).
- No disposable PostgreSQL test URL or connected browser was available. Those
  checks remain unverified. No application database migration was executed.
