# Shared TB case identity implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development.

**Goal:** Complete approved Step 3: persistent DS-TB case identity, safe case-number
allocation, facility-scoped reads, and preservation of historical consultation data.

**Architecture:** Add `tb_treatment_cases` independently of immutable consultation
JSON. A case references its RHU source consultation and patient. Number allocation
shares a transaction-scoped RHU/year counter lock for generated and supplied
numbers. No registration or other clinical mutation route is exposed in this step.

**Tech stack:** Laravel/PHP, PostgreSQL in production, SQLite feature tests.

**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md

## Global constraints
- Only RHU physicians authorize registration, after consultation finalization;
  the registration API/UI and prefill are Step 4.
- No automatic conversion of legacy `health_records.tb_data` or inference of a
  prescription, resistance classification, reporting year, or case outcome.
- Future BHC access requires explicit case endorsement (Step 5).
- No Form 4C or external facility portal.
- Continue in the existing non-main branch; no commits or deployment in this step.

## Task 1: Persistent identity and database safeguards
Files: new migration `2026_11_10_000001_create_tb_treatment_cases.php`,
`app/Models/TbTreatmentCase.php`, relations in Patient and HealthRecord,
`tests/Feature/TbTreatmentCaseTest.php` (all backend paths).

Interfaces: bigint case ID; patient_id, rural_health_unit_id,
source_health_record_id; reporting_year; canonical case_number (max 100);
status active/closed; registered_by, registered_at; diagnosis_snapshot, card_data
JSON; version initially 1. One case per source consultation; one active case per patient.
Composite source foreign key prevents patient/RHU mismatches. Restrict deletion
of clinical provenance. No historical records are updated.

- [x] Write schema/persistence tests, then run `php vendor/bin/phpunit --filter
  TbTreatmentCaseTest` and observe the missing shared-case schema failure.
- [x] Implement schema and model; test unique RHU/year numbers, source identity,
  active-case guard, repeat episode after closure, and FK deletion protection.
- [x] Verify migration up/down/up preserves a seeded legacy snapshot and rows.
- [x] Run the task tests; expected all pass.

## Task 2: Transactional case-number allocation
Files: `app/Services/TbCaseNumberAllocator.php`,
`tests/Feature/TbCaseNumberAllocatorTest.php`.

Interface: `allocate(int $rhuId, int $year, ?string $supplied = null): string`.
Requires an outer DB transaction; caller inserts the case before commit. Lock a
counter row per RHU/year; canonicalize supplied values using uppercase/trim;
generate TB-YYYY-NNNN, skip occupied values, retain database uniqueness backstop.
Reject blank/overlength/control-containing supplied values and invalid years.
Historical same-RHU case numbers reserve their exact normalized value, regardless
of encounter year, because legacy data has no authoritative reporting year.

- [x] Write tests and observe missing allocator failure before implementation.
- [x] Implement allocator; test independent RHU/year sequences, supplied duplicate
  rejection, generated collisions, transaction rollback, legacy reservations,
  validation, and requirement for a transaction.
- [x] Run the task tests; expected all pass.

## Task 3: Scoped read APIs and increment verification
Files: `app/Services/TbCaseAccessService.php`,
`app/Http/Controllers/Api/TbTreatmentCaseController.php`, `routes/api.php`,
`app/Http/Middleware/EnforceActionPermissions.php`,
`tests/Feature/TbTreatmentCaseAccessTest.php`.

Interfaces: GET `/api/patients/{patient}/tb-cases` (paginated, max 100/page),
GET `/api/tb-cases/{tbCase}`. Require clinical.history. RHU sees only owned cases;
admin retains existing clinical read semantics. BHC cannot see unendorsed cases.
No POST/PATCH/DELETE endpoint. Existing consultation reads and PDFs remain intact.

- [x] Write endpoint tests; observe 404 failures before adding routes.
- [x] Implement list/detail and clinical permission mapping. Test other-RHU,
  same-patient referrals, BHC, missing permission, inactive facility, pagination,
  unauthenticated requests and unchanged legacy consultation reads.
- [x] Run all new tests plus existing TB assessment/authority tests; expected pass.
- [x] Run full backend suite, frontend tests, build and PHP syntax/style checks;
  report failures by name, including baseline failures.
- [x] Fresh read-only review of this increment, address important findings with
  failing regression tests before fixes, and record final evidence below.

## Review focus
- Patient/referral visibility must not imply ownership of another RHU's TB case.
- Supplied numbers and generation must share the same lock until insertion.
- Legacy blank or copied snapshots must not create duplicate treatment cases.
- New source links must not join a different patient or RHU consultation.
- Migration rollback must remove only new structures and leave legacy JSON intact.

## Execution ledger
- Pre-flight: Task 1 supplies case/counter schema to Tasks 2 and 3; field names and
  ownership keys agree. Registration will consume the allocator in Step 4.
- Ruling: keep this increment backend-only; expose read APIs but no registration
  writes, since Step 4 owns physician eligibility, finalization and prefill.
  Cost: no new Form 4B can be registered until Step 4 is implemented.
- Ruling: reserve legacy same-RHU case numbers across reporting years rather than
  infer a reporting year from encounter dates. Cost: a supplied number previously
  used in legacy data must be reconciled or replaced before reuse.
- Workspace baseline: branch Eric-Manually-Fixer, HEAD e866e5d, clean working tree;
  earlier increment was committed by the user. Existing two backend baseline
  failures are documented in the Steps 1/2 plan.
- Task 1: missing schema/model observed before implementation; seven tests pass,
  32 assertions, including migration down/up with unchanged legacy record bytes.
  Corrected a test fixture to compare a freshly loaded source (including database
  defaults) rather than an incomplete newly inserted Eloquent instance.
- Task 2: missing allocator observed before implementation; 15 combined schema/
  allocation tests pass, 61 assertions. Legacy reservations include records with
  an explicit RHU and RHU-less records at that RHU's BHCs, without changing rows.
- Task 3: absent route 404s observed before implementation. Corrected the referral
  fixture to use the required tracking ID. Existing admin clinical reads bypass
  per-staff duty grants, so the case scope uses the same policy. All 48 focused TB
  tests pass, 274 assertions.
- Frontend `node --test --test-reporter=dot`: exit 0. `npm.cmd run build`: exit 0;
  existing large-bundle warning remains. No frontend source changes in this step.
- PHP syntax checks pass for all 12 changed/new PHP files. Pint passed after
  formatting property spacing in the three new test files.
- Actual PostgreSQL concurrency is not exercised: AKAY_TEST_PG_URL is not
  configured. SQLite tests verify scopes, constraints, rollback and migration
  behavior; PostgreSQL locking semantics require a disposable PostgreSQL run.
- Final review: fresh read-only reviewer found no ownership, locking, FK or
  rollback defect. PostgreSQL query compilation was inspected; no live PostgreSQL
  execution is claimed. Future registration, endorsement and legacy consolidation
  were correctly deferred to their approved increments.
- Final Ruling: re-grade visually blank Unicode identifiers from Minor to
  Important because a case number must be readable and usable for identification.
  Reject Unicode-whitespace-only identifiers and canonicalize Unicode edge spaces
  consistently in the model, allocator and legacy lookup. Cost: surrounding
  formatting whitespace is removed from supplied numbers.
- Final fix: Unicode blank/padded identifier tests and legacy reservation
  regression first failed (three failures), then passed. Final focused selection:
  49 tests passed, 280 assertions. No deferred review findings remain.
- Pre-fix full backend run: 1,730 tests, 1,703 passed, 25 skipped; only the two
  previously documented baseline failures (deployment preflight success and
  Turnstile CSP substring).
- Post-fix PHP syntax checks, Pint and git diff --check pass. No application
  database migration was executed; schema changes ran only in isolated tests.
- Final full backend run after the Unicode fix: 1,731 tests, 1,704 passed,
  25 skipped, two baseline failures, 10,318 assertions. Failures:
  `DeploymentOperationsReadinessTest::test_valid_production_preflight_passes_without_printing_secrets`
  and `TurnstileLoginTest::test_csp_allows_the_turnstile_widget`.
  No new test failures. The full backend suite remains red for those baseline
  assertions; this increment's 49 TB tests pass.
- Step 3 complete. Step 4 was subsequently implemented in
  `2026-11-10-tb-form-4b-registration.md`; Step 5 is the next approved increment.
