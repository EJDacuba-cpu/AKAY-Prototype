# Form 4B registration implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development.

**Goal:** Complete approved Step 4: an RHU physician explicitly registers Form 4B
after finalization, with server-owned diagnostic prefill and manual prescription.
**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md
**Architecture:** Consume the Step 3 shared case and transactional number allocator.
Add a preview + registration API, snapshot diagnostic evidence, and mount a separate
registration panel on saved RHU consultation details. Reuse the current Form 4B
layout with a registration mode. Preserve consultation snapshots.
**Stack:** React/JavaScript, Laravel/PHP, PostgreSQL; SQLite isolated tests.

## Constraints and interfaces
- GET/POST `/health-records/{healthRecord}/tb-registration`: owning RHU clinical
  readers may preview; only an active physician with conditions.confirm and
  consultations.finalize may register. Require a finalized source assessed by an
  RHU physician, exactly one recognized TB diagnosis, TB Disease + drug-susceptible.
- Store takes reporting_year, optional case_number, source_revision, confirmed,
  card_data, and UUID Idempotency-Key. Store owns patient/RHU/source, registration
  identity, diagnosis, resistance, diagnostic date, physician and laboratory evidence.
- card_data accepts only editable case-finding, notification, classification,
  comorbidity, regimen, supporter and phase fields. Require bacteriological status,
  site, registration group, prescribed regimen text, baseline weight and dated
  dosage rows with strength/unit and at least one positive dose per row.
- Do not infer doses, durations, bacteriology or resistance from weight/lab text.
- Pin latest source lab evidence and require a matching source_revision token.
  Lock patient, source and source lab rows, then use Step 3's RHU/year counter lock.
- Identical UUID/payload retry returns existing case; changed payload/source under
  the same UUID conflicts. Different UUID for an already registered source conflicts.
  One active case per patient; no source consultation or legacy JSON rewrite.
- GET `/tb-cases/{tbCase}/pdf` reuses the existing template with the shared card and
  pinned diagnostic evidence. No new BHC access or endorsement in this increment.
- No DR-TB card/portal: DR-TB and infection remain blocked. Referral disposition is Step 7.
- Preserve Step 3's uncommitted work; do not migrate the application database or commit.

## Task 1: Registration API and durable retry identity
Files: new registration request/service/controller; new migration adding nullable
registration_key/hash to tb_treatment_cases; update model/routes/action middleware;
new backend/tests/Feature/TbCaseRegistrationTest.php.
- [x] Write endpoint tests, observe absent route failures.
- [x] Implement eligibility/preview, strict card validation, source revision,
  transactional creation, idempotent retries and audit attribution.
- [x] Test physician/nurse/BHC/admin, other RHU, missing duties, nonfinalized and
  nonphysician source, missing/ambiguous/infection/DR classification, forged fields,
  stale labs, duplicate source/key/active episode, supplied numbers, rollback and
  unchanged source data. Expected focused suite passes.

## Task 2: RHU registration and saved case view
Files: frontend/src/utils/tbRegistration.js + tests; services/tbCaseService.js;
components/features/health-records/TbCaseRegistrationPanel.jsx; extend existing
TbTreatmentCardForm.jsx; mount on pages/rhu/RHURecordDetails.jsx.
- [x] Write pure-helper tests for payload whitelist, source-owned fields, dosing
  errors and stable retry identity; observe missing implementation failures.
- [x] Implement preview/loading/error/blocked/registration/saved states. Keep a
  submission's key and payload together across network retries. Edits create a new
  attempt; source token stays pinned to the reviewed preview.
- [x] Add registered-case PDF using existing template. Test actual PDF response,
  case access and card content; do not fall back to consultation tb_data.
- [x] Run frontend tests, production build and changed-file lint. Expected pass.

## Task 3: Review and verification
- [x] Run all focused TB tests, full backend suite, full frontend tests, PHP syntax
  and style checks, and diff checks. Report baseline failures by name.
- [x] Fresh read-only review; important fixes follow RED to GREEN before final
  focused/full checks. Record limitations and evidence below.

## Review focus
- Lost response/reload or changed body must not silently change a registered case.
- Referral visibility does not grant registration in a different RHU.
- New lab addenda between preview and submission must force review.
- Hidden outcome/DOTS/diagnostic ownership fields must not slip through arrays.
- Old, unclosed legacy cards must not gain an overlapping new treatment episode.

## Execution ledger
- Baseline: HEAD e866e5d on Eric-Manually-Fixer; Step 3 remains uncommitted and is
  the approved dependency, not unrelated work to revert.
- Pre-flight: shared case field names and counter transaction contract agree.
- Ruling: prescription/weight-band dosage stays physician-entered. Cost: no automatic
  weight-to-dose selection until approved clinical tables are supplied.
- Ruling: legacy numbered cards without an explicit recorded terminal outcome block
  a new episode pending reconciliation. Explicit terminal outcomes permit a later
  episode from a new consultation. Cost: unresolved legacy cases require review.
- Ruling: registration starts at the owning RHU; BHC assignment/endorsement waits
  for Step 5. Cost: registration alone does not expose the card to BHC.
- Task 1: 13 endpoint regressions first failed on absent routes; then all passed,
  122 assertions. Task 2 PDF test first returned 404, then passed using actual PDF
  rendering. Registration selection reached 14 tests, 132 assertions; sources and
  legacy JSON remain unchanged and retries create only one audit/number/case.
- Frontend helpers first failed on missing implementation, then five tests passed
  for payload ownership, manual dosing/weight persistence and retry identity.
  Existing form normalization/row edits now retain regimen description and weight.
  Registration mode locks source diagnosis/physician/date/resistance, hides case
  number duplication, outcome and DOTS controls, and uses a separate explicit action.
- Fresh read-only review found one Important issue: mutable physician account
  attributes could retroactively invalidate a finalized assessment. No other
  important issue found. Unsupported secondary physician duties were verified as
  outside current platform policy; the initial secondary-duty scenario was withdrawn.
- Final fix: a real finalization followed by physician reassignment first failed
  registration (422), then passed. New server-owned `tb_assessment_authority` JSON
  is captured at finalization, bound to physician/RHU/assessment, and frozen into
  registration provenance. Added migration 000003, HealthRecord cast/fillable,
  HealthRecordRequest prohibition and HealthRecordController finalization capture.
- Ruling: older assessments without authority snapshots retain conservative
  verification through their original physician's current role/facility. No old
  rows are backfilled. Cost: unverifiable old sources need clinical review/new
  consultation rather than invented historical credentials.
- Added rollback/reapply test with an existing shared case: card/source data and
  the unique active-patient guard survive both registration migrations.
- Lost-response UI recovery now resolves a committed source case as success;
  clinical conflicts remain errors. Two additional helper regressions first failed
  on the absent recovery implementation, then passed. Seven helper tests pass.
- Pre-final focused TB selection: 63 tests passed, 412 assertions; the additional
  migration rollback test passed separately (five assertions).
- Browser smoke verification attempted with synthetic API fixtures and headless
  Edge. The debugging endpoint never became available, so the run was stopped.
  Temporary frontend harness files and the helper script were removed. No visual
  verification or browser-interaction success is claimed.
- Application database remains untouched. PostgreSQL concurrency is not executed
  because no disposable PostgreSQL test connection is configured.
- Final frontend: all 1,879 tests pass, zero skipped; production build succeeds
  (existing bundle-size warning). ESLint passes on all six changed/new frontend
  files. PHP syntax checks pass for all changed/new PHP files; targeted Pint passes.
- Final backend full run: 1,746 tests, 1,719 passed, 25 skipped, two baseline
  failures, 10,455 assertions. All 64 TB tests (417 assertions) pass. The only
  failures remain
  `DeploymentOperationsReadinessTest::test_valid_production_preflight_passes_without_printing_secrets`
  and `TurnstileLoginTest::test_csp_allows_the_turnstile_widget`.
  The full backend suite remains red for those previously documented failures.
- Step 4 complete. Step 5 (RHU endorsement and BHC shared-case access) is next.
