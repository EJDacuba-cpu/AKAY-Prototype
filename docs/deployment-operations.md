# AKAY Deployment Operations Runbook

This runbook prepares AKAY for production operations. It does not select a host,
provision TLS, create backups, run migrations, or deploy an application. Replace
all example domains and paths with approved deployment values.

## Scheduler matrix

| Task | Frequency | Timezone | Overlap policy | Production requirement |
| --- | --- | --- | --- | --- |
| `referrals:mark-no-show` | Hourly at minute 0 | `APP_TIMEZONE` | 60-minute mutex | Exactly one scheduler runner |
| `sanctum:prune-expired --hours=24` | Daily at `AKAY_TOKEN_PRUNE_TIME` | `APP_TIMEZONE` | 120-minute mutex | Exactly one scheduler runner |

Set `APP_TIMEZONE=Asia/Manila` when that is the approved clinical operating
timezone. The server operating-system timezone may differ; Laravel evaluates these
tasks in `APP_TIMEZONE`. The No-Show task keeps the rule that only Pending referrals
whose `referral_datetime` is before the current application date are eligible. Its
locked transactional service remains authoritative and repeated runs are idempotent.

Token pruning retains expired rows for 24 hours by default. Request-time Sanctum
expiration still rejects an expired token immediately; pruning is storage maintenance
only. Neither schedule uses `onOneServer` because the current file cache is not a
distributed lock. If AKAY later runs on multiple application instances, use a shared
atomic-lock cache and reassess `onOneServer`; until then, run exactly one scheduler.

Choose one production execution model:

```cron
* * * * * cd /path/to/akay/backend && php artisan schedule:run >> /dev/null 2>&1
```

Or supervise one long-running process:

```text
php artisan schedule:work
```

Verify registration safely:

```text
php artisan schedule:list
php artisan referrals:mark-no-show --dry-run
```

Run the dry-run only against development or explicitly approved test data. Do not
run the mutating No-Show command manually against production data.

## Health checks

- `GET /up` is liveness. It confirms the Laravel process can return `{"status":"ok"}`.
- `GET /api/health/ready` is readiness. It performs only `select 1`, returning
  `{"status":"ready"}` or generic `{"status":"unavailable"}` with HTTP 503.
- Both routes are public for infrastructure probes, limited per source IP, no-store,
  and protected by the Phase 3D.1 browser security headers.
- Readiness logs only an exception type. It never returns or logs connection strings,
  database names, Supabase identifiers, SQL errors, credentials, or patient data.

Configure the load balancer or platform probe timeout conservatively. Readiness is a
minimal query, but the deployment network and database driver must also enforce a
bounded connection timeout appropriate for the selected host.

## Deployment preflight

Run locally for development readiness:

```text
php artisan akay:deployment-check
```

Run before a production release:

```text
php artisan akay:deployment-check --production
```

The command checks environment/debug mode, application key and HTTPS URL, timezone,
database configuration/connectivity, exact CORS origins, frontend URL, token lifetime,
security headers, enforced CSP, trusted hosts/proxies, HSTS consistency, scheduler
registration, writable logs, rotating production logging, cache usability, and
frontend deployment documentation. It prints only `[PASS]` or `[FAIL]` with a check
name. Exit code 0 means every required check passed; exit code 1 blocks deployment.
It never prints keys, passwords, connection strings, mail credentials, bearer tokens,
QR tokens, patient values, or the rejected configuration value.

## Production logging

Use these production settings:

```dotenv
LOG_CHANNEL=daily
LOG_LEVEL=warning
LOG_DAILY_DAYS=30
```

The daily channel rotates `storage/logs/laravel.log` and retains the configured number
of days. Thirty days is the starting recommendation; privacy, legal, and incident
response owners must approve the final period. Debug logging is not permitted in
production. Broad exception logs must exclude request bodies, Authorization headers,
password/reset secrets, raw QR tokens, patient names, diagnoses, vital signs, and
clinical payloads. Database audit records remain governed by application business
logic and are not deleted by file-log rotation.

The application service account must own or have write access only where required,
including `storage` and `bootstrap/cache`. Log files must not be web-accessible or
committed to Git. Limit production log access to authorized operations/security staff,
record access through the hosting platform when available, and forward or back up logs
according to the approved hosting policy. Do not expose a public log viewer.

## Backup policy

Assign a named backup owner and a separate restore approver before launch. Cover:

- PostgreSQL data, including application audit records.
- User-uploaded files if AKAY begins storing them outside the database.
- Deployment artifacts and source history through release storage/source control.
- Configuration secrets through an approved secret manager, never ordinary source
  archives and never an unprotected `.env` copy.

Recommended starting policy is a verified daily database backup, at least 30 daily
restore points, and 12 protected monthly restore points when policy permits. Store an
independent encrypted copy away from the application host and restrict decryption and
restore privileges. Name backups with system, environment, UTC timestamp, and release
identifier only, never patient or facility names.

Each backup run must produce a success record and integrity/checksum evidence. Review
failures daily. Perform a sanitized staging restore rehearsal at least quarterly and
after material database/deployment changes. A managed-provider backup claim is not
sufficient until retention, restore access, and a successful rehearsal are verified.

## Restore procedure

1. Open an approved recovery incident and identify the target recovery point.
2. Confirm authorization, scope, backup integrity, encryption keys, and destination.
3. Prefer sanitized/non-production data for rehearsals. Never place production PHI on
   a developer laptop without explicit authorization and equivalent safeguards.
4. Put the affected environment in maintenance or approved read-only mode and stop
   scheduler/process writers when required.
5. Restore into an isolated staging target first using the approved database-provider
   procedure. Do not overwrite the current production database during verification.
6. Apply only reviewed release-compatible migrations when required.
7. Compare safe aggregate facility, user, referral, health-record, and audit counts;
   do not print names or clinical details.
8. Test authorized login, facility isolation, patient access, referral transitions,
   QR resolution, token revocation, and audit integrity.
9. Obtain recovery approval before switching production traffic or promoting data.
10. If verification fails, keep the original environment isolated, preserve evidence,
    return traffic to the last known-good service, and select another approved backup.
11. Record the recovery point, release, checks, approvers, outcome, and follow-up work.

No destructive restore command belongs in application code or an unattended script.

## Backend deployment

1. Record the immutable release identifier and Git commit; retain the previous release.
2. Confirm an approved backup exists before any risky database change.
3. Obtain release source and install locked production dependencies with
   `composer install --no-dev --optimize-autoloader`.
4. Configure production environment variables through the approved secret mechanism.
5. Run `php artisan akay:deployment-check --production`; stop on any failure.
6. Enable maintenance mode when the release cannot be applied compatibly online.
7. Review pending migrations. Run `php artisan migrate --force` only in the real,
   approved deployment after backup and migration review.
8. Run `php artisan optimize` when compatible with the selected host.
9. Restart PHP/application workers and processes using the hosting platform procedure.
10. Start or verify exactly one scheduler runner and inspect `php artisan schedule:list`.
11. Disable maintenance mode and run the smoke test below.
12. Monitor readiness, 5xx responses, logs, CSP reports, and scheduler execution.

## Frontend deployment

1. Record the release identifier and Git commit; retain the previous `dist` artifact.
2. Set `VITE_API_BASE_URL` to `/api` for a verified same-origin HTTPS proxy or to the
   exact HTTPS production API URL.
3. Run `npm ci`, `npm run test:env`, `npm run lint`, and `npm run build` in the release
   pipeline. Deploy only the generated `dist` directory.
4. Configure the static host to serve `index.html` for unknown client-side routes.
5. Configure HTTPS and an HTTP-to-HTTPS redirect at the edge.
6. Reproduce the CSP, nosniff, referrer, frame, Permissions Policy, and COOP headers
   documented in `production-security.md` on the React document and assets.
7. Cache fingerprinted static assets with long-lived immutable caching. Revalidate or
   use a short lifetime for `index.html` so releases propagate predictably.
8. Never cache authenticated API responses at a frontend proxy; preserve their
   `no-store, private` and `Vary: Authorization` headers.
9. Verify direct SPA routes, API connectivity, camera permission, and security headers.

Vite preview is a verification server, not a production host. Backend headers do not
protect a separately hosted React document.

## Release smoke test

Use dedicated authorized test accounts and non-PHI test records:

1. Load the frontend over HTTPS and verify all static security headers.
2. Sign in and confirm `/api/auth/profile` succeeds.
3. Confirm a BHW sees only the assigned BHC and RHU staff only the assigned RHU.
4. Test patient search and the current draft/official health-record behavior.
5. Create a test referral and verify Pending to Received to Completed.
6. Retrieve and scan its QR code over HTTPS.
7. Confirm notifications appear and authenticated responses remain no-store.
8. Confirm an unknown CORS origin is not allowed.
9. Check `/up`, `/api/health/ready`, and `php artisan schedule:list`.
10. Review logs for errors and confirm no secrets or clinical payloads were recorded.

## Rollback

Rollback criteria include failed readiness, sustained 5xx errors, login/facility
isolation regression, broken referral or health-record saves, blocked frontend assets,
or an unresolved high-impact security-header/CSP failure.

For a code-only release, remove traffic from the faulty release, restore the previous
backend and frontend artifacts, rebuild/clear framework caches safely, restart
processes, verify the single scheduler runner, and repeat the smoke test.

For a database-changing release, first assess forward fixes and migration
reversibility. Never run `migrate:rollback` automatically in production. Restore a
database backup only when necessary, approved, and compatible with the restored code.
Follow the restore controls above and preserve the failed release and logs for review.

## Operational security checklist

Daily or regularly:

- Review failed-login/security events and application errors.
- Confirm the scheduler and both registered tasks are running.
- Confirm backups complete and storage capacity remains healthy.
- Check liveness/readiness and investigate repeated 503 responses.

After account or staff changes, verify inactive users cannot access AKAY and review
active role/facility assignments. After every release, run the smoke test, inspect CSP
violations and 5xx spikes, verify scheduler next runs, and confirm health probes.

During an incident, revoke affected users/tokens, preserve access-controlled logs,
assess possible patient-data exposure, restore service through the approved process,
and document timeline, decisions, notifications, and corrective work.
