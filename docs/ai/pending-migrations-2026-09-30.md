# Pending migrations 2026-09-30 (review, 2026-10-10)

Read-only review of the three migrations that `docs/ai/CURRENT.md` lists as "NOT yet run on Supabase". Nothing was deployed or run against Supabase. The files were read in full:

- `backend/database/migrations/2026_09_30_000001_drop_care_pathway_tables.php`
- `backend/database/migrations/2026_09_30_000002_create_condition_monitoring_tables.php`
- `backend/database/migrations/2026_09_30_000003_allow_shared_follow_up_fulfilment.php`

Required order is the filename order (Laravel runs them that way): 000001, then 000002, then 000003. The app code (`ConditionMonitoring`, `ConditionMonitoringVisit`, `ConditionMonitoringService`, `CareOverviewController`, `LegacyMonitoringReview`, `PatientConditions`, and the multi-fulfilment in `HealthRecordController`/`FollowUpTask`) expects all three.

## 2026_09_30_000001_drop_care_pathway_tables

- **Purpose.** Retires the Care Pathway enrollment layer (NCD / TB-DOTS "pathways"). The create migrations `2026_09_29_00000{1-4}` were deleted in commit `d3c3bd8` and replaced by this drop. Uses `dropIfExists`, so a fresh database that never created the tables is a no-op.
- **Tables touched.** Drops, children first: `care_pathway_enrollment_follow_up_task`, `care_pathway_encounters`, `care_pathway_enrollment_conditions`, `care_pathway_enrollments`.
- **Depends on.** Nothing. (Runs safely before or after anything else; the child-first order avoids FK blocks if the 09_29 tables exist.)
- **down().** Empty. The migration is not reversible: rolling it back does nothing and does not recreate the tables. The comment says this is intended, because no code uses them any more.
- **Supabase status.** Pending per `docs/ai/CURRENT.md` (line 203). **Unverified**: nobody has read the `migrations` table on Supabase. The commit message of `d3c3bd8` says the 09_29 tables exist in Supabase and hold no rows, also unverified.
- **Risks.**
  - **Data loss:** the four tables are dropped with whatever they contain. The commit says they hold no rows. Confirm that with `select count(*)` on each of the four tables on Supabase **before** running. If any row exists, take a backup first.
  - Any leftover FK from another table into these four would make `dropIfExists` fail rather than silently succeed (no cascade). None was found in the repo migrations.
  - Stored user/facility permission lists may still contain the removed `care_pathways.manage` string. The code no longer lists it (`ActionPermissions::ALL`), so it is inert; not changed by this migration.

## 2026_09_30_000002_create_condition_monitoring_tables

- **Purpose.** BHC monitoring of one patient condition, started, continued or stopped only by saving a consultation (`HealthRecordController::store`, same transaction). Separate from `medical_background.currentDiseases`, which owns clinical status.
- **Tables touched (created).**
  - `condition_monitorings` (patient, barangay health center, `condition_key`, `condition_name`, `condition_identity`, `status` active|stopped, started/stopped health-record ids, `stop_reason`, `created_by`/`updated_by`, timestamps), index `condition_monitorings_patient_status_idx`, and a **partial unique index** `condition_monitorings_one_active_idx` on `(patient_id, condition_identity) WHERE status = 'active'` (raw `CREATE UNIQUE INDEX`).
  - `condition_monitoring_visits` (monitoring, health record, `action` started|continued|stopped, `referred`, `created_at`), unique `(condition_monitoring_id, health_record_id)`.
  - `condition_monitoring_follow_up_task` (pivot, composite primary key).
  - PostgreSQL only (guarded by `getDriverName() === 'pgsql'`): CHECK constraints `condition_monitorings_status_check` and `condition_monitoring_visits_action_check`, and `ENABLE ROW LEVEL SECURITY` on all three tables (schema-qualified `public.`).
- **Depends on.** Existing tables `patients`, `barangay_health_centers`, `health_records`, `users`, `follow_up_tasks`. Foreign keys: patient and BHC cascade on delete; `started_health_record_id` cascades; `stopped_health_record_id`, `created_by`, `updated_by` null on delete; the pivot cascades on both sides. Later migration `2026_10_05_000001_create_patient_conditions_tables` adds `condition_monitorings.patient_condition_id` and (on SQLite) rebuilds the partial index, so it depends on this one.
- **down().** Drops the pivot, visits and `condition_monitorings` tables in that order (`dropIfExists`). **All monitoring data is lost on rollback.** Cannot be rolled back separately while `2026_10_05_000001` is applied without rolling that back first (roll back newest first).
- **Supabase status.** Pending per `CURRENT.md`; **unverified**.
- **Risks.**
  - Creates RLS-enabled tables with no policies: only roles that bypass RLS (the table owner/service connection) can read them. This mirrors the repo's other pgsql migrations, but confirm the connection role used by the app on Supabase is the owner.
  - The `public.` schema prefix is assumed.
  - If the tables were created by hand on Supabase earlier, `Schema::create` fails ("already exists"); check first.
  - The existing `monitoring` rows start unlinked and are treated as "Legacy BHC Monitoring" by the later conditions feature (expected by design).

## 2026_09_30_000003_allow_shared_follow_up_fulfilment

- **Purpose.** One consultation may now fulfil several continued follow-ups, so `follow_up_tasks.fulfilled_by_health_record_id` can no longer be unique. The lookups still need an index.
- **Tables touched.** `follow_up_tasks` only: drops the unique `follow_up_tasks_fulfilled_record_unique` and adds a plain index `follow_up_tasks_fulfilled_record_index` on `fulfilled_by_health_record_id`.
- **Depends on.** `follow_up_tasks` having the unique constraint `follow_up_tasks_fulfilled_record_unique`, created by `2026_07_28_000002_add_follow_up_lifecycle_constraints`. If that unique is missing or has another name on Supabase, `dropUnique` fails and the migration stops.
- **down().** Drops the new index and re-adds the unique. **It fails (unique violation) once any health record has fulfilled more than one task**, which is exactly the data the new code produces. In practice this migration cannot be rolled back after the new feature has been used. Treat it as one-way after the first multi-fulfilment save.
- **Supabase status.** Pending per `CURRENT.md`; **unverified**.
- **Risks.**
  - Low data risk on the way up (an index swap). While `follow_up_tasks` is being altered the table takes a short lock.
  - Deploy order: run it **before** the new backend code. The old code (unique still present) would hit a unique violation when a visit fulfils a second task; the new code is written for the plain index.

## Things worth knowing

- **Other migrations after these may also be pending.** Four more migrations sit after 000003 and are not listed as pending in `CURRENT.md`: `2026_10_03_000001_add_background_changes_to_health_records`, `2026_10_04_000001_add_father_link_and_parent_birthdates_to_patients_table`, `2026_10_05_000001_create_patient_conditions_tables` and `2026_10_05_000002_grant_conditions_confirm_to_rhu_staff`. `2026_10_05_000001` needs `condition_monitorings` from 000002, so it cannot already be on Supabase if 000002 is not; either those four are also pending or `CURRENT.md` is out of date. A single `php artisan migrate:status` against Supabase (read-only) would settle it. A plain `migrate` would run all of them, in order.
- **`migrate:rollback --step=3` (the brief's wording) would NOT roll back these three.** Rollback goes newest first, so with the four later migrations present `--step=3` hits `2026_10_05_000002`, `2026_10_05_000001` and `2026_10_04_000001`. To roll back exactly 000001-000003 you need `--step=7` (all of the seven that follow `2026_09_28_000003`).

## Step 6: run against a disposable PostgreSQL

**UNVERIFIED: no disposable PostgreSQL available.** Docker, `psql`, `pg_ctl`, `postgres` and `initdb` are not installed on this machine, there is no PostgreSQL service and no WSL. Nothing was run against `backend/.env`'s Supabase connection, and `.env` was not touched. Do not deploy on the strength of this document alone.

What was done instead (supplementary, **SQLite only, not evidence for the PostgreSQL-specific parts**): a throwaway file database in the scratchpad (outside the repo), with `DB_CONNECTION=sqlite DB_DATABASE=<scratch>/mig.sqlite` exported and confirmed by `php artisan config:show database.default` (`sqlite`):

```
php artisan migrate --force              # all migrations, including the three, ran DONE
php artisan migrate:rollback --step=7 --force   # all seven rolled back DONE (000001's down() is a no-op, 0.08 ms)
php artisan migrate:status               # the seven show Pending afterwards
```

That shows: the three files and the four after them apply and roll back cleanly on SQLite, and the unique-to-index swap works there. It does not exercise the `pgsql`-guarded CHECK constraints, row-level security, the `public.` schema qualification, the partial-index syntax on PostgreSQL, or `dropUnique` on a real PostgreSQL constraint. The full backend suite also runs all migrations on in-memory SQLite on every test, with the same limits.

Before deploying: run the same three commands (`migrate`, then `migrate:rollback --step=7`, then `migrate` again) against a disposable `postgres:16` (for example `docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=... postgres:16`, with every `DB_*` value passed explicitly and the host checked to be `127.0.0.1:55432`), restoring a schema dump of Supabase first so that `follow_up_tasks_fulfilled_record_unique` exists as it does in production.
