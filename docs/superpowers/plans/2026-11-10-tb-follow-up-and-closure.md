# TB follow-up laboratories and case closure implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development.

**Goal:** Step 8: RHU records case-linked follow-up labs; RHU physician reviews
evidence, closes with a treatment outcome, or explicitly reopens with history.
**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md
**Architecture:** Case-linked laboratory heads plus immutable clinical events;
new nullable case outcome/closure columns. Keep registration and consultation
snapshots immutable. Shared case version serializes labs, DOTS and closure;
UUID/hash command identity protects retries without replaying terminal actions.
**Stack:** Laravel/PHP, React/JavaScript, SQLite API tests, mounted DOM tests.

## Contracts
- Migration 000007: `tb_follow_up_labs` (case, milestone month_2/month_5/month_6/other,
  test_name, due_on, status requested/awaiting_result/result_available/cancelled,
  collection_on, examination_on, result, notes, version, recorder/name/time).
  `tb_case_clinical_events`: case, nullable lab, kind lab_saved/closed/reopened,
  case_version unique per case, immutable snapshot, note, actor/name/time,
  UUID request_key unique/hash. Restrict deletes. New nullable case columns:
  outcome_status/on/note, closed_by/name/at. No backfill or inferred old outcome.
- GET `/tb-cases/{id}/follow-up`: scoped labs/history, case status/version/outcome,
  capabilities, prescribed start and Manila today; BHC sees linked case only.
- POST `/tb-cases/{id}/follow-up-labs`, PATCH same `/{lab}`: complete lab fields,
  UUID; PATCH version + correction_reason required. Owner RHU clinical.history +
  records.correct only; admin/BHC cannot write. Multiple tests per milestone allowed.
  Request due date is explicit; no automated month-to-day schedule. Result Available
  requires examination date and nonblank result. Dates are valid, from prescribed
  start; observed dates cannot exceed today; collection cannot follow examination.
  Non-result statuses clear result. Cancelled requests retain revisions.
- POST `/tb-cases/{id}/close`: case_version, outcome_status (cured,
  treatment_completed, treatment_failed, lost_to_follow_up, died), outcome_on,
  note, confirmed, evidence_lab_ids (selected completed current case labs), UUID.
  Cured requires at least one selected completed lab plus physician attestation;
  the physician judges clinical criteria. No text parsing or auto-selected outcome.
- POST `/tb-cases/{id}/reopen`: case_version, note, confirmed, UUID. Physician with
  conditions.confirm + consultations.finalize + clinical.history at owning RHU only
  for both close/reopen. Reopen clears current outcome fields, preserves closure
  event/evidence, and rejects another active case across historical identity aliases.
- Closed cases remain readable through valid endorsements; no new labs/DOTS writes.
  Reopening retains accepted care assignment and enables its existing DOTS path.
  Case/entry versions must be current. All writes lock case first; reopen then locks
  known identity aliases and rechecks active episodes. Same UUID retry returns
  current state after fresh authorization, never reapplies an older close/reopen.
- Closure snapshot pins reviewed lab versions/results and DOTS revision references.
  Registration card/source JSON and unrelated patient conditions remain untouched.
  UI/PDF project current outcome and follow-up labs alongside registered diagnosis.
- Preserve earlier uncommitted increments. No application migration, commit or push.

## Task 1: Backend lifecycle and evidence
Create migration000007, TbFollowUpLab/TbCaseClinicalEvent models,
TbCaseFollowUpService, controller/request, TbCaseFollowUpTest. Extend case model,
routes/permissions; expose existing identity-guard APIs as needed.
- [x] Write regression tests and observe absent-route failures.
- [x] Implement scoped lab revisions, validated clinical closure/reopen commands,
  immutable events, locked versions, UUID recovery and actor attribution.
- [x] Test month labels, result/dates, lab corrections/cancellation, physician and
  facility/duty boundaries, BHC read-only, stale labs/DOTS/case, cure evidence,
  close/DOTS blocking, reopen/duplicate aliases, retry/terminal safety, immutable
  source/card, closure evidence history, DB uniqueness and rollback preservation.
  Run `php vendor/bin/phpunit tests/Feature/TbCaseFollowUpTest.php --do-not-cache-result`.
  Expected pass; run existing registration/monitoring/access tests after integration.

## Task 2: Shared UI and print
Create TbCaseFollowUpPanel, service/helpers and tests; mount in SharedTbCaseView
and TbCaseRegistrationPanel. Project outcome in card view/PDF and add printable
follow-up lab section. No prescription/diagnostic edits added.
- [x] Observe RED for payload, real PDF projection and mounted clinical controls.
- [x] Add RHU lab form/history and physician close/reopen with explicit review;
  show read-only BHC outcome/evidence, refresh monitoring/case capabilities on change.
- [x] Retain draft/UUID across checks; require renewed review when case/evidence
  version changes; immediately hide denied/paused data until scope is verified.
- [ ] Run full frontend tests, build and scoped ESLint; expected pass.

## Task 3: Final review and validation
- [ ] One fresh read-only review; Important fixes RED to GREEN in one pass.
- [ ] Full backend/frontend suites, PHP syntax/Pint and diff checks; disclose
  existing deployment-preflight and Turnstile-CSP failures and unverified PG/browser.

## Review focus
- Reopen must not create concurrent episodes through different linked patient IDs.
- An old close/reopen retry must not undo a newer lifecycle decision.
- Closed-case evidence/DOTS must not mutate after physician review.
- Evidence/date/version changes must force renewed physician review.
- Denial during offline/reconnect must hide cached evidence and preserve drafts.

## Execution ledger
- Baseline: Eric-Manually-Fixer, HEAD e866e5d; approved uncommitted Steps3–7
  retained. Continue authorized checkout, existing clinical ledger UI and DOM tests.
- Pre-flight: Step6/endorsement writes already lock/increment the case; follow-up
  commands join that contract. Step5 alias guard protects registration and reopening.
- Ruling: RHU clinical.history + records.correct controls laboratory recording;
  physician confirmation/finalization controls outcome and reopen. Cost: designated
  RHU lab recorders need the existing correction duty; BHC/admin remain read-only.
- Ruling: explicit dates and physician attestation determine follow-up/outcome;
  no dosing, schedule or result-text algorithm. Cured needs selected completed
  evidence, with clinical adequacy judged by physician. Cost: physician must assess
  the clinical criteria, and dates are entered rather than generated.
- Ruling: reopen resumes the existing accepted BHC assignment after duplicate-case
  checks. Cost: it authorizes that care partner's DOTS again; changing it remains a
  separate physician endorsement decision.
- Ruling: closure changes this treatment case only; source diagnoses, registration
  JSON and independent patient conditions remain historical/separate. Cost: other
  clinical condition reconciliation is explicit rather than inferred from an outcome.
- Task 1 RED: initial 13 endpoint tests failed on absent routes. First implementation
  passed 10 tests; real PDF projection failed as expected before integration, and
  two migration regressions exposed SQLite table rebuild damage to expression /
  partial indexes plus foreign-key rollback failure. Reproduced native ADD/DROP
  behavior with isolated PDO SQLite before fixing migration strategy.
- Ruling: add/drop nullable closed_by with native ALTER (supported by SQLite and
  PostgreSQL) while other scalar columns use Blueprint. This preserves the existing
  populated case's expression/partial indexes and child FKs. Cost: native SQL is
  explicitly limited to the project's supported SQLite/PostgreSQL engines.
- Task 1/print GREEN: 35 follow-up/monitoring/shared-case tests passed, 285 assertions.
  The real PDF projects head outcome and current labs; original card stays unchanged.
- Task 2 RED to GREEN: five payload/projection helpers and seven mounted component
  tests passed after missing-module failures. Added an actual lab request -> result
  revision interaction, physician close -> reopen controls, renewed evidence review,
  uncertain-save reconnect and denied/offline recovery with preserved draft.
- Integration regression reproduced cached shared-card PHI after a PDF denial while
  its scope refetch paused offline. Shared view now suspends paused/denied scope,
  retains child form owners through checks, and restores only on fresh success.
- Mounted shared integration + helpers + prior view coverage: 26 frontend tests
  passed. Build and 8-file scoped ESLint passed; PHP Pint applied.
- Case-linked follow-up labs are recorded without a fabricated consultation and
  shared only through the treatment case. Generic source consultation labs/history
  and their existing access rules remain unchanged.
