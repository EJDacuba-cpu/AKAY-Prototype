# Continued Concern Outcomes Implementation Plan

**Goal:** Implement Task 1 on `itr-patient-history`, following Eric's supplied specification and clarification: date/reason required, time optional, blank time stays blank.

**Architecture:** Extend `care_plan` with `continued_concerns: [{taskId, careOutcome}]`. Validate one explicit decision for every selected BHC v2 task. Persist decisions and server-resolved original record linkage in existing `monitoring_data.continuedConcerns`. Reuse `followUpSchedules`, task locking, the finalization transaction, idempotency, encrypted drafts, and shared referral/availability handling. No schema migration or additional stored procedure is needed. TanStack Query remains responsible for cache refresh.

**Approach:** Task-keyed continued concerns remain separate from reporting diagnoses. Copying original diagnoses into new reporting entries risks duplicated case counts; a parallel scheduling/referral system would duplicate existing safeguards. Existing reporting classifications and health services remain intact. No new epidemiological counting rules are inferred.

**Constraints:** Task 1 only; no body continuity changes, historical rewriting, monitoring closure, live Supabase writes, unrelated cleanup, or required appointment time. Existing shared-referral confirmation and clinical permissions apply.

## Implementation

- [x] Add isolated SQLite feature tests for decisions, missing decisions, schedule association, shared referrals/holds, rollback, invalid tasks, reporting preservation, drafts, and idempotency; demonstrate failures before implementing.
- [x] Extend `HealthRecordRequest`, `CarePlan`, draft schema and finalization in `HealthRecordController`; store server-resolved source IDs inside the existing transaction.
- [x] Add tested pure helpers for task-keyed outcomes, schedules, restoration, and errors. Integrate workspace state, drafts, payload, referral coverage and review.
- [x] Extend `FollowUpVisitLine` using existing shadcn/Tailwind controls with inline errors and explicit unlink wording. Date/reason required; optional time validated by current rules.
- [x] Run focused backend/frontend regressions, build, and bounded UI verification. Browser unavailable; SSR checks passed. See `docs/task-1-continued-concern-report.md` for results and baseline failures.

## Review focus

- Multiple tasks with identical text must retain distinct identity and independent schedules.
- Forged/missing/extra decisions and conflicting schedules must fail before any task is fulfilled.
- Resuming old drafts must require explicit decisions; stale tasks must never acquire successors.
- A new problem with the same text as an earlier concern must remain independent.
- No-provider referral holds and failures must preserve the existing atomic behavior and retry contract.
