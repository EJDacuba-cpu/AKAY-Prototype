# Task 1 — Continued Concern Outcomes

Branch: `itr-patient-history`. Implemented locally; no migration, deployment, or live Supabase writes. Task 2 was not started.

## Diagnosis and reused architecture

The original `FollowUpVisitLine` rendered read-only references. `care_plan.continued_follow_up_task_ids` selected tasks for fulfillment but carried no per-task decision. Finalization could fulfill them without a saved Care Outcome. The encrypted draft schema likewise had no continued-outcome field.

The change extends existing care-plan JSON, independent `followUpSchedules`, predecessor task IDs, parent health-record linkage, facility checks, row locks, finalization transaction, idempotency, encrypted drafts, and shared referral/doctor-availability handling. Laravel validates and coordinates the transaction; PostgreSQL stores the existing JSON and task relationships. No additional stored procedure is needed. TanStack Query continues to handle existing cache refresh behavior.

## Changed files

| File | Change |
|---|---|
| `frontend/src/components/features/health-records/wizard/FollowUpVisitLine.jsx` | Continued Concern controls, history references, optional time, inline errors, unlink explanation |
| `frontend/src/pages/bhc/ConsultationWorkspace.jsx` | Outcome state, drafts/restoration, payload, independent schedules, referral coverage, review rows |
| `frontend/src/utils/continuedConcerns.js` | Task-keyed decisions, schedule updates/pruning, validation and review helpers |
| `frontend/src/utils/consultationSteps.js` | Routes server errors to the relevant concern/schedule fields |
| `frontend/src/utils/continuedConcerns.test.js` | Seven focused helper/reporting/draft regressions |
| `backend/app/Services/ContinuedConcerns.php` | Decision/successor consistency and server-resolved historical linkage |
| `backend/app/Http/Requests/HealthRecordRequest.php` | Per-task requirements, shared referral validation, canonical validation of existing aliases |
| `backend/app/Http/Controllers/Api/HealthRecordController.php` | Transaction-level verification, saved decision snapshots and shared referral coverage |
| `backend/app/Services/CarePlan.php` | Counts continued concerns in shared-referral acknowledgment |
| `backend/app/Services/HealthRecordDraftPayloadService.php` | Accepts and preserves draft decisions |
| `backend/tests/Feature/ContinuedConcernOutcomeTest.php` | Eighteen isolated feature tests |
| `backend/tests/Feature/FollowUpIndependentSchedulingTest.php` | Existing follow-up fixtures now supply explicit decisions |
| `backend/tests/Feature/BhcGeneralConsultationV2Test.php` | Existing finalization fixtures now supply explicit decisions/successor linkage |
| `docs/superpowers/plans/2026-10-27-continued-concern-outcomes.md` | Implementation plan and verification record |
| `docs/task-1-continued-concern-report.md` | This report |

The pre-existing untracked `.claude/settings.local.json` was left untouched.

## UI behavior

Each selected task shows its reason, FU identifier, previous consultation date, previous Chief Complaint/findings, and an independent required Care Outcome. The original new-health-problem section remains available, with its reporting classification and care outcome. Health-service forms remain available in the same encounter.

- Managed at BHC: no successor for that concern; explicit text explains that this does not mean recovery or monitoring closure.
- BHC Follow-up: date and reason are required; time stays optional. Existing date/time controls and validation rules are reused. Blank time persists as null, never an invented appointment time.
- Refer to RHU: joins the existing shared referral panel and its confirmation, permission and availability rules. No-provider results use the existing referral hold.
- Remove link: removes the decision and that task's new schedule from this encounter. It does not fulfill or cancel the original task.

No clinical-progress fields or separate follow-up screen were added.

## Persistence and safeguards

API input: `care_plan.continued_concerns: [{taskId, careOutcome}]`.

Official record: `monitoring_data.continuedConcerns: [{taskId, careOutcome, sourceHealthRecordId, purpose}]`. The source record ID and purpose are resolved from authorized, locked tasks rather than trusted client input. Successor schedules use explicit `predecessorTaskId`, with UI keys `continued:<taskId>`. New concerns retain their own `sourceEntryId`; text matching is not used by this workspace to attach successors.

Selected tasks require exactly one decision. Follow-up outcomes require exactly one linked successor; managed/referral outcomes cannot also schedule one for the same concern. The existing transaction covers task fulfillment, new tasks and referrals/holds. Invalid or superseded tasks reject the encounter. Request checks cover inferred follow-up visit types and accepted task/schedule aliases; a second guard runs after task locks.

Drafts store decisions and schedules without fulfilling tasks. Old drafts remain readable and require an explicit outcome before new finalization. Only explicit visit referral intent is persisted; a derived concern referral cannot remain enabled after draft resume and unlink/change to Managed. Existing finalized records are not rewritten.

## Reporting continuity and limits

Continued concerns remain separate from `diagnoses[]`; historical report entries and classifications are preserved. A return does not automatically copy morbidity/notifiable/surveillance entries. New concerns can still be manually classified, including a genuinely independent concern with the same text as an earlier entry. No cross-visit diagnosis-text deduplication, automatic diagnosis or ICD coding was introduced.

Current BHC morbidity reporting distinguishes **Reported Diagnoses**, **Visits**, and **Distinct Diagnoses**. These are existing entry/visit summaries, not an epidemiological incident-case registry. This task prevents automatic duplicate reporting caused by continued concerns; it does not reconcile previously duplicated reports or define disease-specific new-case/update rules. Those rules need documented reporting evidence before extending counting behavior. The existing new-entry reporting controls remain available; no automatic reporting-update inference was added.

## Verification

All backend tests used SQLite `:memory:` with testing configuration; no live Supabase was used.

| Check | Result |
|---|---|
| New Task 1 backend feature tests | 18 passed, included in the broader run |
| New Task 1 frontend helper tests | 7 passed, included in the broader run |
| Focused backend regression selection | 258 tests: 257 passed, 1 pre-existing failure; 1,407 assertions |
| Focused frontend regression selection | 284 tests: 283 passed, 1 pre-existing failure |
| Production build (`npm.cmd run build`) | Passed; existing large-bundle warning |
| SSR rendering of the actual Continued Concern component | Four states passed: empty, managed, follow-up, referred; reference fields, unlink copy, errors and optional-time field verified |
| ESLint on added helpers, error routing and Continued Concern component | Passed |
| Workspace ESLint | Existing unused `DatePickerField` import at line 26; reproduced against `HEAD` |
| PHP syntax / new-file Pint / `git diff --check` | Passed |
| Actual browser interaction / desktop-mobile screenshots | Not executed: browser connector returned no available browsers |
| PostgreSQL concurrency execution | Not executed; isolated existing concurrency tests ran on SQLite |

Pre-existing failures, reproduced independently:

1. `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again`: expected 201, received 500 when recreating a discarded draft. Reproduced with original `HEAD` versions of all four modified existing backend classes loaded in an isolated test process.
2. `draftConversion.test.js` — `convertLegacyDraft: the converted care plan restores as the same checkbox state`: expected object omits `serviceReferrals: []`. Reproduced using the original `HEAD` test and unchanged draft-conversion/next-action helpers.

The regression selection included follow-up scheduling/rescheduling, shared referrals, availability safeguards, reporting, monitoring, programs, draft finalization and consultation identity. New tests cover missing decisions, optional/invalid time, mixed outcomes, new concerns, duplicate successors, stale tasks, unauthorized referral rollback, encrypted draft round trip/finalization, idempotent retry and preservation of services/history/condition status.

Review findings about task aliases, predecessor authorization, sticky draft referral intent and schedule alias validation were fixed. The final review also caught an error-bag reset in the transaction guard; the custom validation now runs in Laravel's `after` callback.

## Selected diff explanations

Persist explicit intent rather than a transient derived flag, so removing the final referred concern after draft restoration clears the referral requirement:

```diff
-        ...nextActionsDraft(effectiveNextActions),
+        // Persist explicit intent only; concern referrals are derived on resume.
+        ...nextActionsDraft(nextActions),
```

Send each existing task's decision separately from new reporting diagnoses:

```diff
       carePlan: {
+        continued_concerns: continuedDecisions,
         ...buildCarePlanPayload({
```

## Remaining decisions/blockers

No Task 1 implementation decision is pending. Interactive browser QA and production PostgreSQL verification remain unexecuted. The two baseline regression failures and pre-existing lint finding are documented rather than changed outside this task. Broader incident-case/report-update rules require source evidence before a future reporting change.
