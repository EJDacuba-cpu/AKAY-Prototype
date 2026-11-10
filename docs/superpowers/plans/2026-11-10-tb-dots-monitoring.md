# TB DOTS and weight monitoring implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development.

**Goal:** Step 6: BHC records dated DOTS observations and weight directly on the
accepted shared case; owning RHU reviews the same log and PDF.
**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md
**Architecture:** One current observation per case/date plus immutable revision
snapshots. Case/endorsement locks and optimistic entry versions protect concurrent
writes; UUID/hash identities make retries harmless. Preserve source and card JSON.
**Stack:** Laravel/PHP, React/JavaScript, isolated SQLite tests.

## Contracts and constraints
- New tables `tb_monitoring_entries` and `tb_monitoring_revisions`; restrict foreign
  key deletes. Current entry: case/date unique, BHC, endorsement, dose_status,
  nullable decimal weight_kg, notes, voided, version, recorder attribution/time.
  Revisions: entry/version unique, immutable values, author/time, reason,
  endorsement ID, UUID request_key unique and request_hash.
- GET `/tb-cases/{id}/monitoring?page=1`: scoped paginated entries, can_write,
  accepted endorsement ID/version, prescribed start date and Manila today.
- POST same: observed_on (YYYY-MM-DD), dose_status nullable (taken, missed,
  incomplete, on_hold, dispensed), weight_kg nullable positive decimal (2 places),
  notes (max 1000), endorsement_id/version and UUID Idempotency-Key. At least
  one dose/weight observation; on_hold requires an RHU instruction note.
- GET `/tb-cases/{case}/monitoring/{entry}`: scoped entry and revision history.
- PATCH same: full replacement observation, version, correction_reason,
  endorsement_id/version and UUID. Date/facility/case/actor remain server-owned.
  A void correction retains the dated row/history but clears observation values;
  a later correction can restore it. No delete route.
- Write requires effective BHC context, clinical.history + consultations.encode,
  active case, accepted current endorsement, active local patient still at BHC.
  A BHC corrects only its own facility's entries while it retains accepted care.
  RHU/admin read; no RHU diagnostic/prescription/outcome write in these APIs.
- Dates cannot precede earliest prescribed regimen row dateStart or exceed Manila
  today. No valid prescribed start means reconcile at RHU before logging.
- Fresh authorization precedes retry recovery. Retry checks precede stale version
  checks so committed requests resolve without replaying a newer event.
- Read/PDF reuse case scope. Reassignment carries the log but never grants access
  to unrelated consultations. Shared PDF uses current nonvoid observations;
  historical JSON PDF remains unchanged. No invented adherence percentage.
- Preserve prior uncommitted increments. No commit/push/application DB migration.

## Task 1: Storage and API
Files: migration 000005_create_tb_monitoring_entries; TbMonitoringEntry and
TbMonitoringRevision models; TbMonitoringService; TbMonitoringController;
TbMonitoringRequest; TbMonitoringTest. Extend case model, routes and permissions.
- [x] Write regressions and observe missing-route failures.
- [x] Implement schema, validation, scopes, locked versioned writes and audit.
- [x] Cover accepted BHC writes, weight-only records, dates/precision, pending/
  revoked/closed/inactive/moved/wrong facilities, missing duties, clinical tampering,
  duplicate dates, stale corrections, UUID conflicts and lost-response retries,
  void/restore/history, reendorsement provenance, immutable source/card and rollback.
  Run `php vendor/bin/phpunit tests/Feature/TbMonitoringTest.php --do-not-cache-result`.
  Expected: pass.

## Task 2: Shared UI and PDF
Files: TbMonitoringPanel + rendered tests; tbMonitoring helpers + tests;
tbCaseService; SharedTbCaseView; TbCaseRegistrationPanel;
TbTreatmentCaseController and tb-treatment-card Blade; PDF behavior test.
- [x] Write helper/rendered/PDF regressions and observe RED.
- [x] Add date/status/optional weight/note entry, paginated readable log, explicit
  correction reason, void and revision-history view; only server capabilities show
  write controls. Recheck access and hide cached data after errors. Preserve retries.
- [x] Mount on shared card for BHC and registered RHU case for read-only oversight.
- [x] Project log into shared PDF without rewriting registration/source JSON.
- [x] Run frontend tests, production build and scoped ESLint; expected pass.

## Task 3: Review and verification
- [x] One fresh read-only review; Important fixes RED to GREEN.
- [x] Full backend/frontend suites, build, PHP syntax/Pint and diff checks.
  Report known deployment-preflight and Turnstile-CSP failures by name.

## Review focus
- A stale accepted endorsement cannot authorize writes after reendorsement.
- UUID retry cannot roll back a newer correction or bypass revoked access.
- Cross-facility corrections must not overwrite a previous BHC's observations.
- Blank/void/dispensed observations must not count as supervised doses.
- Manila dates, treatment start and decimal precision must agree UI/API/PDF.

## Execution ledger
- Baseline: branch Eric-Manually-Fixer, HEAD e866e5d; approved Steps 3–5 remain
  uncommitted and are retained as dependencies. Continue existing checkout.
- Pre-flight: Step 5 case access supplies reads; accepted endorsement supplies
  write context. UI and PDF consume the same dated current-entry model.
- Ruling: existing clinical.history + consultations.encode duties authorize routine
  BHC observations and reasoned corrections; no new permission taxonomy. Cost:
  authorized BHC encoders can correct their own facility's log with an audit trail.
- Ruling: void retains the date and revision history; another facility cannot
  rewrite prior observations. Cost: transferred-case mistakes require reconciliation.
- Ruling: dose statuses describe observations using existing calendar meanings;
  held medication requires an RHU instruction note. No dosage/phase/adherence rules
  are inferred. Cost: those clinical decisions remain explicit RHU work.
- Task 1 RED: all initial 12 endpoint tests failed on missing routes. The first
  implementation run revealed a fixture's missing in-memory default version;
  explicitly setting fixture version 1 resolved validation errors. All 12 tests
  then passed, 99 assertions; source/card JSON untouched, no consultation created.
- Task 2 RED: four helper tests failed on absent module, then passed; rendered
  component tests failed on missing panel, then passed. PDF regression first saw
  zero projected observations, then passed using real PDF rendering with a view
  composer asserting only current nonvoid rows. A separate rendered regression
  caught the stale legacy calendar; shared cards now suppress it while legacy
  consultation cards keep their existing behavior. No adherence is inferred.
- Pre-review: 13 monitoring backend tests passed, 110 assertions; 14 focused
  frontend tests passed. Build passes (existing large bundle warning), 8-file
  scoped ESLint passed. Pint formatting applied to new service/test files.
- Ruling: keep unconfirmed network-error drafts and the same UUID for an explicit
  retry; do not clear/refetch the form until success or a definite access/version
  conflict. Cost: the user retries or explicitly refreshes after an uncertain save.
- Final backend: 15 monitoring tests / 128 assertions passed, including actual
  revoke/reendorse/link/accept flow and UTC/Manila date-boundary coverage. Full
  backend: 1,780 tests, 1,753 passed, 25 skipped, 10,725 assertions; only the same
  two baseline failures remain:
  `DeploymentOperationsReadinessTest::test_valid_production_preflight_passes_without_printing_secrets`
  and `TurnstileLoginTest::test_csp_allows_the_turnstile_widget`.
- Fresh review: no concrete backend defect found. Two Important frontend issues:
  background ancestor/log refetch unmounted drafts and retry keys; log/history
  access denials did not refresh the entire shared card. Both accepted for one
  consolidated fix pass. No minor findings; no second review dispatched.
- Final fixes RED to GREEN: mounted DOM tests reproduced an empty draft after
  reconnect and absent case rechecks after history/save denials. All three now
  pass. Keep the monitoring owner/form component mounted during background checks
  while suspending their DOM; retain the same draft and UUID. Confirmed 403/404
  removes cached views and invalidates case/log access. No persistent draft store.
- Added exact dev-only happy-dom dependency for real React DOM interaction tests;
  only HTTP is faked, React/components/query cache/services stay real. Initial
  sandbox download was denied by network permissions; normal escalation succeeded.
- Review dispositions: automatic adherence, dose/phase/prescription changes and
  outcomes remain the already excluded clinical decisions/later scope. Cross-BHC
  correction remains the explicit reconciliation rule above.
- Final: Ruling: allow retrospectively recorded observations from prescribed start
  through Manila today, including before endorsement acceptance. No earlier
  restriction was approved; author/time and revisions expose actual recording.
  Cost: recording time can differ from observation date and must be reviewed as such.
- Final fix pass changes only frontend/test dependency files; backend code remains
  exactly the version covered by the full backend run. PHP syntax (11 files),
  targeted Pint and diff checks pass. No app DB migration, commit or push performed.
- Live PostgreSQL concurrency and visual browser checks remain unverified. Mounted
  DOM coverage is executed without claiming a full browser/production session.
- Final frontend after review fixes: all 1,900 tests passed, zero skipped;
  production build passed (existing large-chunk warning); all 9 increment frontend
  source/test files passed ESLint. No TypeScript configuration is present.
- Step 6 complete. Next is Step 7: physician-authorized outbound DR-TB referral
  disposition/status and printable RHU slip; no hospital portal or Form 4C module.
