# Approved workflow implementation

Source: [approved handoff](approved-workflow-ui-rework.md). Recorded 2026-09-23.

## Change map

| Phase | Application boundaries | Additive database changes |
| --- | --- | --- |
| Accounts and context | User, UserRequest, UserController, FacilityAccessService, request middleware, AuthController, AddUser, apiClient, DashboardLayout | professional designation, home permissions, dated facility assignments |
| Shared consultation queue | HealthRecordDraftService/controller, patient response filtering, consultation workspace, review UI | editing lease, reviewer state, attribution, append-only events and corrections |
| Purposes and programs | VisitPurpose, ConsultationPrograms, purpose selection and consultation sections | approved program registry, standard monitoring and confirmed enrollment |
| Appointments and referrals | FollowUpTaskSyncService, appointment intercept, referral validation | consultation/appointment links and multiple scheduled tasks |
| Items given | MedicineStockService, stock functions, consultation release UI | explicit releases with independent dispenser attribution |

## Constraints and verification

- Preserve current records and the untracked `.claude/settings.local.json`.
- Do not run database resets or historical destructive migrations against application data.
- Existing `bhw` is a facility workflow role, not proof of professional designation or clinical authority. Legacy BHC accounts require explicit clinical authorization from MHO; default to encoding permissions.
- Home facility remains on the user; additional dated assignments never relocate patient/record ownership.
- Enforce permissions and privacy on the server, including direct API routes, notifications, related data, exports and stored-function paths.
- Preserve existing stock locking and idempotency. User confirmed vaccine stock is in **vials**; automatic vaccine deduction is deferred. Do not treat immunization doses as vials.
- Run isolated SQLite tests, frontend checks/build, and inspect PostgreSQL function compatibility. Report PostgreSQL runtime and visual verification separately if unavailable.

## Progress

- Repository inspected: no tracked working-tree changes at start; handoff assumptions about roles and draft ownership confirmed.
- Approved plan saved before implementation.
- Implementation and verification in progress; this file does not claim completion or deployment.

## Login schema repair — 2026-09-23

- User encountered a missing `facility_assignments` table because modified application code was running before its migrations.
- Verified the configured PostgreSQL migration status: only the two new 2026-09-23 migrations were pending.
- Applied those two migrations using explicit `--path` arguments. Existing data was not reset or deleted. New tables enable PostgreSQL row-level security, following the existing deployment posture.
- Read-only `php tools/verify-rework-schema.php 2` verified all three new tables, access/review columns, and successful facility and profile lookup for the affected active account (one authorized facility). Password-based browser login was not exercised.
- Full workflow rework remains in progress. Earlier PHP test and Vite build attempts encountered Windows paging-file/memory errors; these are not passing verification results.
