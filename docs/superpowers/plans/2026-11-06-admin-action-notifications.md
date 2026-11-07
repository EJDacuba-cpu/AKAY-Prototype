# Admin actionable notifications implementation plan

Approved by Eric in chat after the read-only audit, 2026-11-06.

Goal: Complete the existing password-reset alert lifecycle and notify active Admins of failed invitation email delivery.

Architecture: Laravel owns events, eligibility and resolution. Reuse notifications, unique dedup_key, bell, inbox and existing routes. PostgreSQL row locks serialize reset creation and invitation delivery. React retains its existing cache with identity-safe refreshes. No new API, table, stored procedure, polling, scheduled job or invitation approval process.

Constraints: Work in Eric-Manually-Fixer; preserve BHC/RHU behavior and unrelated files; no commit, merge or push. Expiry-only alerts and Facility Without Staff are deferred. Page loads must never produce alerts.

1. RED/GREEN shared-cache regression tests: identity during mutations/pagination, fresh counts, late response isolation. Modify notificationService.js and useNotificationsContext.jsx; refresh after existing access mutations.
2. RED/GREEN reset tests: active Admin recipients, sequential reuse, all-recipient resolution on delivery/rejection/completion/ineligibility. Lock existing user before pending reset lookup/create; preserve public generic response and existing recovery actions.
3. RED/GREEN invitation tests: failure-only producer, repeated failure suppression, success resolution, later failure reopens unread. Reuse AccountInviteService, UserNotificationService and PasswordSetRecorder with a focused AdminAccessNotificationService helper.
4. RED/GREEN visibility/category tests: current Admin role and actionable source record required for these two types; keep other facility rules. Exact System mapping before legacy category heuristics. Verify GET endpoints do not produce notifications.
5. Verify focused and full existing tests, build, scoped lint/format, diff check; independent final review, address findings, leave changes uncommitted.

Review focus: concurrent reset/send events; manually dismissed repeated failures; late responses across logout and login; legacy stale or malformed alerts; role changes without clinical-notification regressions. Real PostgreSQL concurrency requires a disposable PostgreSQL database; SQLite tests alone do not prove its locking behavior.

Execution ledger: claude-mem work_state list admin-action-notifications-implementation (canonical, with task results and rulings).

Implementation decisions confirmed by regression tests:

- A failed invitation to a corrected mailbox starts a new unread episode; repeated failures to the same mailbox preserve dismissal.
- Account deactivation closes open reset requests using the existing rejected status, attributes closure to the acting Admin, retains prior notes and revokes reset links. Reactivation requires a fresh reset request. An existing failed invitation can become actionable again on reactivation without sending an email.
- Reset completion revalidates token, account and mailbox under the same user-then-request locks as administrative decisions.
- Notification creation remains event-only. Pure visibility queries hide legacy stale or wrong-role alerts without backfilling notifications.
- Email delivery is serialized under an account transaction. Production SMTP latency/timeout and PostgreSQL lock scheduling require separate environment verification; no job or schema change was added.
