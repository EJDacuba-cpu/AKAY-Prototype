# TB assessment and authority implementation plan

> Execute inline with superpowers:executing-plans, task by task.

**Goal:** Complete Steps 1 and 2 of the approved TB workflow before introducing
the shared-case schema.

**Architecture:** Retain structured assessment in diagnoses JSON through draft,
final-save and read mappers. Share normalization on the frontend and validation
on the backend. Enforce RHU physician authority at official write boundaries,
including condition confirmations, independently of general permissions.

**Tech Stack:** React/JavaScript, Laravel/PHP, existing PostgreSQL migrations;
SQLite in-memory feature tests. No TypeScript configuration is present.

**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md

## Constraints
- Preserve the user's existing diagnosis/resistance label edits.
- No historical data rewrite or new treatment-case schema in this increment.
- No Form 4C or hospital portal, including in later Step 7.
- Evaluation must not register a treatment card; registration follows finalization.
- Keep non-TB consultation/condition permissions unchanged.

## Task 1: Assessment persistence and conditional fields
- [x] Add failing frontend tests for mapping, draft restore and infection reset.
- [x] Add failing backend tests for persisted assessment and validation.
- [x] Add pure `tbAssessment.js` normalization shared by `diagnoses.js`,
  `rhuCarePlan.js`, and `rhuTbCaseManagement.js`; retain camelCase payload keys.
  `tbManagementFields(entry)` returns diagnosisType, drugResistance,
  openTreatmentCard. `tbManagementFor(entry, next)` clears incompatible values.
- [x] Add `TbAssessment` validation for diagnosis/resistance and draft cleanup;
  wire into HealthRecordRequest and HealthRecordDraftPayloadService.
- [x] Run focused frontend/backend tests, PHP syntax checks and frontend build.

## Task 2: Official TB authority
- [x] Test physician/nurse/BHC/admin, general-permission bypasses, aliases,
  explicit condition IDs, legacy TB card submissions and draft preparation.
- [x] Add `TbClinicalAuthority` using effective RHU facility plus doctor staff
  role and existing action permissions. Protect official assessment, condition
  confirmation and legacy clinical-card changes; draft preparation is not approval.
- [x] Gate RHU assessment UI by physician authority and remove consultation-time
  registration. Keep clear copy directing registration after finalization.
- [x] Run focused and adjacent permission/consultation suites, syntax/lint checks,
  and frontend build. Review the increment before reporting completion.

## Later approved increments
3. Shared case identity, uniqueness and historical compatibility.
4. Explicit registration from finalized physician assessment and Form 4B prefill.
5. Case endorsement for walk-in and referral-return workflows.
6. Direct BHC DOTS/weight/adverse-event ledger with conflict protection.
7. RHU follow-up laboratories; outbound DR-TB status/slip only.
8. Physician closure/reopening, consistent printing and legacy reconciliation.

## Review focus
- Draft restoration must not resurrect stale resistance or silently authorize a case.
- A generic conditions.confirm grant must not confer physician authority for TB.
- BHC carrying forward historical clinical fields must not change those fields.
- Alternative payload paths and condition IDs must receive the same checks.
- No inference that a diagnosis name alone supplies DS-TB classification.

## Execution ledger
- Baseline: frontend assessment/care-plan/diagnosis tests: 32 passed.
- Ruling: work in the existing non-main branch Eric-Manually-Fixer, retaining the
  user's uncommitted label changes; no branch switching, commits or worktree copy.
- Implementation starts with Tasks 1 and 2; later case functionality remains pending.
- Task 1: complete. Regression tests first failed for dropped assessment, stale
  infection state, and permissive final API validation; then 37 frontend and 39
  backend tests passed, PHP syntax checks passed, and production build passed.
- Task 2: structured authority tests first failed (9 backend and 2 frontend
  failures); implementation then passed the focused suite. Broad pre-review
  backend selection: 244 tests passed, 1,438 assertions.
- Ruling: legacy clinical card fields may only be carried forward as a matching
  authorized same-patient snapshot. Doses/adverse events may change. No old data
  is rewritten; all new clinical-card writes, including physician writes, wait
  for separate case operations in Steps 3/4. This temporarily removes the old
  incomplete registration path and avoids introducing a second registration API.
- Ruling: legacy program/comorbidity tests now seed a historical card before
  BHC carry-forward; the RHU clinician fixture now uses staff_role=doctor.
  Their round-trip/referral-completion assertions remain intact.
- Final review: fresh read-only reviewer found narrative TB diagnosis bypass
  (mixed or qualified text). Endpoint and frontend regressions failed, then passed
  after whole-word TB/PTB/LTBI/tuberculosis/tuberculous detection was added.
  Names remain clinician supplied; no diagnosis, DS status or prescription is inferred.
- Working-assignment test preserves current platform policy: unsupported doctor
  duties are rejected even with permissions; authorized home-RHU physician succeeds.
- Post-review frontend: 127 tests passed; build passed; ESLint zero errors and
  seven existing hook warnings (verified against HEAD). Vite warns about bundle size.
- There is no TypeScript/typecheck configuration; JSX build and ESLint are the
  frontend checks, alongside PHP syntax checks and backend feature tests.
- Final focused backend authority/assessment run: 22 tests passed, 137 assertions.
  Full backend suite: 1,699 tests, 1,672 passed, 25 skipped, two failures.
  The failures are DeploymentOperationsReadinessTest's production-preflight
  success assertion and TurnstileLoginTest's CSP substring assertion. Both were
  reproduced using HEAD versions of all five modified application classes via
  a temporary prepended autoloader, without reverting or editing the workspace.
  They are baseline failures, outside this increment; the full suite is not green.
- PHP syntax checks passed and git diff --check is clean. Steps 1 and 2 are
  complete; Steps 3 through 8 remain pending for subsequent increments.
