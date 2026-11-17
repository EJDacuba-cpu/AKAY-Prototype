# Audit Logs debugging and implementation report

Branch: `Eric-Manually-Fixer`  
Base commit: `13d60758`  
Date: November 17, 2026

## Confirmed root causes

1. **Missing identity, not necessarily a missing row.** Successful login called AuditLogger on a public request. Its request user could be null even though authentication had found the account. Invitation acceptance and password-reset completion had the same problem. The logger now accepts an optional explicit actor; existing four-argument calls still work.
2. **Misleading fallback identity.** The table rendered an absent account as System and defaulted its role to Admin. Unknown historical actors now display Not recorded. Known automatic activities alone use System.
3. **Automatic activity attributed to owners.** Both draft expiry paths and draft retention cleanup wrote the owner's ID as the actor. New events use AuditLogger without a human actor, preserving the owner ID as technical metadata. Historical rows are not changed.
4. **Missing administrative draft events.** Claim, takeover, submit and return already wrote `consultation_events`, but neither that service nor the controller wrote corresponding `audit_logs` entries. The administrative API only reads `audit_logs`. Each successful transition now writes one administrative audit entry inside the same transaction as the existing clinical event; stale, forbidden and invalid transitions do not add entries.
5. **Missing follow-up scheduling event.** Initial follow-up creation during consultation completion had no separate audit event. It now records each created schedule within the existing consultation transaction. Background schedule synchronization is not newly instrumented. Reschedule, cancellation and no-show already had audit events.
6. **Incorrect categories and filters.** Description substring matching interpreted `owner_user_id` as Account activity. Categories now come from an explicit module catalog shared by API presentation and filtering. Unknown modules use Other, rather than a guessed category.
7. **Incomplete filter choices.** Module choices came only from the displayed page. The API now supplies options from the full stored event vocabulary, independent of page/search filters.
8. **Search and ordering gaps.** PostgreSQL `LIKE` was case-sensitive, friendly labels were not searchable, and equal timestamps had no tie-breaker. Search now covers raw codes, readable labels/summaries/categories, names, staff roles, descriptions and numeric/LOG IDs. Ordering is `created_at DESC, id DESC`; the frontend preserves that order.
9. **Browser-local timestamps.** The table used the browser timezone. It now explicitly formats Asia/Manila using the existing shared timezone constant. Backend timestamp generation and historical values remain unchanged.

No production database was queried, so this report does not claim evidence of actual production insertion failures. Source inspection found no actor-specific filter in the Admin audit query. Authentication association, display defaults, filters, pagination and missing instrumentation explain several distinct ways an event could appear missing.

## Existing event coverage inspected

| Activity | Existing path / outcome |
|---|---|
| Login, logout, password change | AuthController; explicit actors and transactional audit writes added. Refresh still creates no login event. |
| Invitation acceptance / initial activation | AccountInviteController + AccountActivationService; existing invitation event now attributed to the verified invitation recipient and committed atomically. No duplicate activation event added for the same operation. |
| Password reset completion | Existing event retained, now attributed to the verified reset recipient. Public reset requests remain unattributed; an email submission does not prove identity. |
| Create/update accounts, permissions and staff roles | UserController already records these, including access details. Status changes now have explicit activation/deactivation wording while retaining the `updated` code. |
| Facility staff assignments | StaffAssignmentController already records assignment creation and revocation. |
| Register/update/deactivate patients | PatientController already records these. No duplicate events added. |
| Create/update/resume/discard drafts | Existing events retained. Create/update/discard now commit with their audit writes. Resume remains the existing explicit draft-open event. |
| Claim/takeover/submit/return drafts | New `draft_claimed`, `draft_taken_over`, `draft_submitted`, `draft_returned` administrative events; clinical history retained. |
| Finalize consultation | Existing `health_records:created`, draft-consumption and RHU visit-completion events represent separate saved entities. No extra duplicate consultation event added. |
| Record correction | RecordCorrectionController already records `correction_added`. |
| Referral creation/status/feedback/reschedule | ReferralCreationService, ReferralWorkflowService and ReferralRescheduleService already record them, including automatic no-show. Actual ordinary referral statuses are retained; fictional accepted/declined codes were not introduced. |
| Monitoring handoffs | MonitoringHandoffService already records creation, linkage changes, acceptance and decline. Exact known acceptance/decline descriptions receive safe, readable labels and summaries. |
| Follow-up schedule/reschedule | Initial schedules now audited; existing reschedule/cancel/no-show events retained. |
| Medicine stock, adjustment, dispensing, quarantine and reconciliation | MedicineController, MedicineStockService and RhuServiceUsageService already record these. Existing idempotency/business logic is unchanged. |
| Other important activities | Existing household membership/relationships, parent links, laboratory evidence/addenda, TB endorsements/follow-ups/referrals, doctor availability/roster, facility changes and reports reviewed and represented in the module catalog. |

Ordinary page reads, keystrokes and token refresh were not newly logged. Existing report/QR/tracking and draft-resume instrumentation was retained.

## Implementation and API behavior

- AuditLogger failures emit a structured error containing action, module, actor ID and exception class, then propagate. Request bodies, passwords, tokens, descriptions and SQL bindings are not included in that new error context.
- Login, logout, password change, invitation acceptance, draft writes and draft transitions use transactions with their audit writes. Tests verify rollback of session creation, draft creation and transition history when logging fails.
- Existing raw response fields and pagination keys remain. Additive fields are `action_label`, `module_label`, `summary`, `category`, `actor_name`, `role_label`, and response-level `filter_options`.
- Existing raw module/action/user filters remain supported. Module filtering also accepts friendly names; role filtering supports account tiers and the StaffRoles catalog. Legacy Auth, Account, Referral and Inventory category names remain aliases. Legacy Status Update and Feedback filters use explicit action lists.
- Staff role labels come from the existing StaffRoles service, e.g. RHU · Doctor, RHU · RHU Staff, BHC · Midwife. Badge colors continue to use the existing account tier.
- Raw descriptions stay in the database and Admin API. The main table uses concise summaries that do not expose UUIDs, database field names, patient identities or clinical notes. Raw action identifiers remain available through the Action cell title.
- Examples: `login` → User Logged In; `patients:created` → Patient Registered; `health_records:created` → Consultation Completed; `health_record_drafts` → Consultations. Unknown codes get readable title-cased fallbacks.
- The API returns `Cache-Control: no-store, private`. The existing API client already uses no-store. Mount/reopen and browser reload fetch records; returning to a visible browser tab also triggers a fetch. Existing request-race protection, error/retry display and pagination remain.
- Sidebar, header, toolbar, columns, table markup, typography, spacing, borders, pagination and existing color palette are retained. No new buttons/cards/modals, schema changes, record rewrites or backfills.

## Modified files

Paths are relative to the repository root.

| File | Purpose |
|---|---|
| `backend/app/Services/AuditLogger.php` | Optional explicit actor; structured failure reporting and propagation. |
| `backend/app/Services/AuditPresentation.php` | New shared read-only label, summary, category and actor presentation catalog. |
| `backend/app/Http/Controllers/Api/AuditLogController.php` | Friendly/raw search, staff-role filtering, complete filter options, stable ordering, additive presentation and no-store response. |
| `backend/app/Http/Controllers/Api/AuthController.php` | Login attribution; atomic login/logout/password-change audits. |
| `backend/app/Http/Controllers/Api/AccountInviteController.php` | Verified recipient attribution and atomic acceptance audit. |
| `backend/app/Http/Controllers/Api/PasswordResetRequestController.php` | Verified reset-recipient attribution. |
| `backend/app/Http/Controllers/Api/UserController.php` | Explicit new account activation/deactivation descriptions without changing stored action codes. |
| `backend/app/Http/Controllers/Api/HealthRecordDraftController.php` | Missing transition events and atomic draft mutation audit writes. |
| `backend/app/Http/Controllers/Api/HealthRecordController.php` | Initial follow-up scheduling events in the existing completion transaction. |
| `backend/app/Services/HealthRecordDraftPruner.php` | Genuine System attribution through AuditLogger for automatic expiry/pruning. |
| `backend/app/Services/HealthRecordDraftService.php` | Genuine System attribution through AuditLogger for lazy automatic expiry. |
| `frontend/src/pages/admin/AuditLogs.jsx` | Consume API presentation/options, preserve server order and existing UI, refresh on tab return. |
| `frontend/src/utils/auditLogs.js` | Table row mapping and Philippine date/time formatting. |
| `frontend/src/utils/auditLogs.test.js` | Safe row presentation and timezone regression tests. |
| `backend/tests/Feature/AuditLogsTest.php` | New multi-account/API/security/persistence/search/pagination/timestamp tests. |
| `backend/tests/Feature/AuthenticationPersistenceTest.php` | Refresh creates no login duplicates; repeated explicit logins each recorded. |
| `backend/tests/Feature/TemporaryPasswordSignInTest.php` | Password-change actor verification. |
| `backend/tests/Feature/AccountInviteAcceptTest.php` | Invitation recipient attribution verification. |
| `backend/tests/Feature/ResetRequestDeliveryTest.php` | Reset-recipient attribution verification. |
| `backend/tests/Feature/ConsultationWorkflowRevisionTest.php` | Transition actors/counts, takeover and stale retry regression assertions. |
| `backend/tests/Feature/FollowUpTaskSchedulingTest.php` | Initial schedule audit verification. |
| `backend/tests/Feature/HealthRecordDraftTest.php` | Automatic system attribution and failure rollback tests. |
| `backend/tests/Feature/StaffRoleAccountTest.php` | Activation/deactivation labels, search and original code compatibility. |
| `docs/audits/2026-11-17-audit-logs-fix.md` | This report. |

AuditLog model, database migrations, authorization routes and API client were inspected and did not require changes.

## Testing results

All backend runs use the repository's isolated SQLite in-memory test configuration, not production data.

- Broad selected regression run: **223 tests, 221 passed, 2 pre-existing failures**, 1,836 assertions. Covered audit logs, authentication persistence, temporary passwords, invitations, reset delivery, consultation workflow, drafts/finalization, scheduling, inventory, referral transitions, handoffs, patient registration/education and staff roles.
- The two failures are `PatientCreationPermissionsTest`, datasets **RHU staff** and **RHU registration only**. Both send `family_serial_number` for RHU registration and expect 201, but existing validation returns 422. Reproduced the same two failures with every modified application class preloaded from original HEAD `13d60758` in a temporary bootstrap. Patient-registration logic and those tests were not changed.
- Latest focused run after the final account-description and timestamp/patient tests: **28 tests passed, 230 assertions** (`AuditLogsTest|StaffRoleAccountTest`).
- Draft/audit focused rerun: **36 tests passed, 297 assertions**. The later broad run also passed the two additional audit-failure draft rollback tests.
- Frontend audit tests: **3 passed**. UTC and explicit +08:00 inputs produce the same Manila time, including midnight rollover. Unknown identities stay unknown and technical descriptions stay out of table rows.
- Targeted ESLint: passed for AuditLogs.jsx and the new audit utility/test.
- `npm.cmd run build`: passed. Vite reports a large application chunk warning; no bundle splitting changes were made in this task.
- `git diff --check`: passed.

Representative commands:

```text
php artisan test --compact --filter='AuditLogsTest|AuthenticationPersistenceTest|TemporaryPasswordSignInTest|AccountInviteAcceptTest|ResetRequestDeliveryTest|ConsultationWorkflowRevisionTest|HealthRecordDraftTest|HealthRecordDraftFinalizationTest|FollowUpTaskSchedulingTest|MedicineInventoryWorkflowTest|ReferralStatusStateMachineTest|MonitoringHandoffTest|PatientCreationPermissionsTest|PatientEducationTest|StaffRoleAccountTest'
php artisan test --compact --filter='AuditLogsTest|StaffRoleAccountTest'
node --test src/utils/auditLogs.test.js
npx.cmd eslint src/pages/admin/AuditLogs.jsx src/utils/auditLogs.js src/utils/auditLogs.test.js
npm.cmd run build
```

## Remaining verification and historical limitations

- No production database, Supabase policy, PostgreSQL stored procedure, clock configuration or deployed browser session was exercised. Verify the deployed API's database privileges, write errors, timezone configuration, PostgreSQL search behavior and inventory functions, then perform the requested real Admin → Doctor → RHU Staff → BHC → Admin sequence.
- No browser screenshot comparison was performed. The code preserves the existing table structure/styles; visually check longer role/category labels at the application's supported screen sizes.
- Null-user historical login/invitation/reset events cannot be attributed safely from current data. They remain unchanged and show Not recorded. Historical automatic draft events that stored owner IDs remain unchanged and should be reviewed as legacy attribution defects.
- Account names and roles are resolved from the related user account, as in the existing schema. Historical names/roles at event time are not snapshotted; subsequent account edits or deletion cannot be reconstructed. No identities or role history were invented.
- Existing generic historical `updated` events may lack enough detail to reconstruct a specific change. Only known recorded message formats receive more specific result wording.
- Some legacy business operations outside the transactional paths changed here commit before logging; an audit failure can therefore return an error after their business mutation. Failures are reported and propagated, not presented as successful audited responses. No broad transaction/outbox redesign was introduced.
- Standard offset pagination remains: insertion of new events between separate page requests can shift page boundaries. Ties are deterministic, and every page remains available; this is not a frozen historical snapshot.
- Database timestamp values were not shifted or rewritten. If a deployment previously changed its storage timezone convention, historical ambiguity requires a separate evidence-based review.

Changes remain local on the requested branch; nothing was pushed, deployed or applied to production history.
