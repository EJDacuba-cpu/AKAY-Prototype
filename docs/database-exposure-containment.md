# Phase 1 — Database exposure containment

Status: **proposed, not executed.** The migration in this phase has not been run
against any database. Nothing in this phase has been applied to the configured
Supabase project.

## The problem

AKAY's PostgreSQL database is hosted on Supabase. A Supabase project ships with
two roles that are reachable from a browser through the Data API: `anon` (the
publishable key, which is embedded in client applications by design) and
`authenticated`. On this project both roles hold `SELECT`, `INSERT`, `UPDATE`,
`DELETE`, `TRUNCATE`, `REFERENCES` and `TRIGGER` on every table in `public`,
`EXECUTE` on every legacy `public.akay_*` function, and `ALTER DEFAULT
PRIVILEGES` entries that hand the same access to every table, sequence and
function created in future. Row Level Security is disabled on all public tables
and no policies exist, so nothing else stands in the way.

The Laravel API is not the only path to this data — it is merely the intended
one. Anyone holding the project's publishable anon key can read
`public.patients`, `public.health_records`, `public.referrals` and
`public.audit_logs` directly, and can call
`public.akay_patient_list('admin', NULL, NULL)` — a function that takes the
caller's role and facility as plain arguments and returns full patient JSON for
every facility when told `'admin'`. No Laravel authorisation, no
`FacilityAccessService`, no session, no audit record.

The repository was re-checked for this phase: the React frontend contains no
`supabase-js` client, no PostgREST calls and no direct database access of any
kind. The exposure is therefore entirely unused by AKAY, and closing it costs
the application nothing.

## What the migration does

`backend/database/migrations/2026_07_25_000001_revoke_browser_role_database_access.php`

Containment is all-or-nothing. The migration runs three ordered stages inside a
single transaction, and there is no warn-and-continue path and no override flag.

### Stage 1 — preconditions (changes nothing)

Proves that every revocation the migration needs to make is actually permitted,
and raises `AKAY_CONTAINMENT_PRECONDITION_FAILED` listing every blocker if not.
Three classes are checked:

- relations and routines in `public` whose owner the connected role cannot act
  as, so a `REVOKE` would fail or leave privileges in place;
- **every** role in `pg_default_acl` holding an unsafe entry — enumerated from
  the catalog, not assumed, so an entry owned by a third role is caught;
- `postgres` and `supabase_admin` specifically, treated as required whenever
  either owns objects in `public` or holds an unsafe default entry.

`pg_has_role(…, 'MEMBER')` is the correct test: both `ALTER DEFAULT PRIVILEGES
FOR ROLE x` and `REVOKE` on an object owned by `x` require membership in `x`,
which a non-inheriting `SET ROLE` membership satisfies.

### Stage 2 — revocation

1. **All** privileges on every non-extension table, view, materialised view,
   partitioned table and foreign table in `public`, from `PUBLIC`, `anon` and
   `authenticated`. This also removes matching **column-level** grants:
   PostgreSQL revokes the corresponding `pg_attribute.attacl` entries alongside
   the table-level ones.
2. All privileges on every non-extension sequence in `public`.
3. All privileges on every `public.akay_*` function and procedure. Signatures
   come from `pg_get_function_identity_arguments`, one row per `pg_proc` entry,
   so **every overload is revoked under its own complete signature**.
4. Every unsafe `pg_default_acl` entry, at its own scope — schema-qualified
   entries with `IN SCHEMA`, global entries without, since the two are stored
   and applied separately — plus an unconditional override in schema `public`
   for `postgres` and `supabase_admin`. That last part matters: `pg_default_acl`
   holds no row until a default is modified, so PostgreSQL's built-in default of
   `EXECUTE` on new functions to `PUBLIC` is invisible to enumeration and has to
   be overridden explicitly.

### Stage 3 — assertions (or roll back)

Re-reads the catalog and raises `AKAY_CONTAINMENT_ASSERTION_FAILED` unless the
browser-facing grantees have been left with no access at all:

- **effective** table, sequence and function privileges via
  `has_table_privilege` / `has_sequence_privilege` / `has_function_privilege`,
  which resolve direct grants, grants inherited through role membership, and
  grants to `PUBLIC`. A role that still reaches a table by being a member of
  some third role — something revoking from `anon` directly would never fix —
  fails here;
- **column-level** privileges via `has_any_column_privilege`;
- raw ACL entries for `PUBLIC`, which has no `pg_roles` row to test against;
- every `akay_*` overload;
- **effective** default privileges for `postgres` and `supabase_admin`,
  resolved against `acldefault()` when no stored row exists;
- any remaining unsafe stored `pg_default_acl` entry, at any scope, owned by
  anyone.

Other design points:

- **Object names come from the catalog, not a list.** Drift between the
  migrations directory and the live database cannot leave a table behind.
- **Every name is built with `format('%I.%I', …)`.** Nothing is interpolated.
- **Extension-owned objects are skipped** (`pg_depend.deptype = 'e'`), so
  installing `pgcrypto` or `uuid-ossp` into `public` is not broken.
- **Missing roles are handled.** `anon`, `authenticated` and `supabase_admin`
  are each checked against `pg_roles` first; a self-hosted PostgreSQL server
  with none of them runs the migration cleanly.
- **No `GRANT` statement appears anywhere in the migration**, and no application
  row is read — only `pg_catalog`.
- **`TYPES` default privileges are left alone.** Removing `PUBLIC USAGE` on
  types has no security benefit here and breaks ordinary schema use.

There is exactly one `CONTINUE` on a permission check, in stage 2's built-in
default override, and it is reachable only for a `postgres`/`supabase_admin`
that stage 1 found irrelevant — owns nothing in `public`, holds no unsafe
entry. Skipping it is not a silent security failure because stage 3 checks the
effective defaults of both roles unconditionally and raises if either would
still grant future objects away.

## Transaction safety

`Migrator::runMigration()` wraps `up()` in `$connection->transaction()` whenever
`getSchemaGrammar()->supportsSchemaTransactions()` and `$migration
->withinTransaction` are both true. `PostgresGrammar::$transactions` is `true`,
and the migration sets `public $withinTransaction = true` explicitly. PostgreSQL
applies `GRANT`, `REVOKE` and `ALTER DEFAULT PRIVILEGES` transactionally, so a
`RAISE EXCEPTION` from stage 1 or stage 3 rolls back every privilege change and
the `migrations` table row is never written.

As a belt-and-braces guard, `up()` refuses to run when
`DB::transactionLevel() < 1` — for example if the migration were invoked
directly, or on a connection whose grammar did not support transactional DDL.
Pretend runs are exempt, because `Migrator::pretendToRun()` logs statements
without opening a transaction and without executing anything.

## Precondition failures

`AKAY_CONTAINMENT_PRECONDITION_FAILED` means nothing was changed. The exception
`DETAIL` lists every blocker. Preflight section 2 reports the same set in
advance, so this should never be a surprise.

The expected blocker on a managed Supabase project is **`supabase_admin`**: the
`postgres` role the API connects as is generally not a member of it. This is the
correct outcome, not an inconvenience — it is precisely the case where the old
warn-and-continue behaviour would have reported a successful migration while
future tables and functions created by `supabase_admin` stayed exposed to `anon`
and `authenticated`.

Remediation, in order of preference:

1. **Confirm the role is irrelevant.** If preflight shows `supabase_admin` owns
   nothing in `public` and holds no unsafe default entry, it will not be
   reported as a blocker at all and the migration proceeds.
2. **Remove its unsafe defaults out of band**, from a session that is a member
   of `supabase_admin`, then re-run. The statements are the same ones the
   migration would have issued:

   ```sql
   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
       REVOKE ALL ON TABLES FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
       REVOKE ALL ON SEQUENCES FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
       REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
       REVOKE ALL ON FUNCTIONS FROM PUBLIC;
   ```

   Note this still leaves stage 3's effective-default check to verify the
   result, so a partial fix will not pass.
3. **Grant membership**, if your Supabase plan permits it, so the migration can
   do it itself.

Do not work around this by weakening the migration.

## Assertion failures

`AKAY_CONTAINMENT_ASSERTION_FAILED` means every privilege change has already
been rolled back. The `DETAIL` names what still reaches what. The most likely
cause is an inherited privilege: `anon` or `authenticated` is a member of
another role that holds grants on `public`. The effective-privilege query in
preflight section 3 reports the membership chain in its `role_is_member_of`
column. Revoke at the source role, then re-run.

### Why this cannot lock Laravel out

Laravel currently connects as `postgres`, which owns every object in `public`
(confirmed by the preflight `BLOCKER` queries in section 2). An owner's
privileges are implicit in ownership and are *not* represented as ACL entries,
so `REVOKE … FROM PUBLIC / anon / authenticated` cannot remove them. The
migration never names the connected role.

This is exactly why the preflight includes
`blocker_public_objects_not_owned_by_current_role` and
`blocker_akay_routines_not_owned_by_current_role`. **Both must return 0 before
the migration runs.** If a future Phase 2 runtime role is already in place and
is *not* the owner, this migration must be re-reviewed first, because a
non-owner runtime role could depend on an explicit grant.

## Rollback

The migration has an intentionally empty `down()`.

A security containment rollback must never restore browser access as a side
effect of an unrelated `migrate:rollback`. If access genuinely has to be
restored:

1. Take the **PRE-MIGRATION PRIVILEGE SNAPSHOT** from section 1 of
   `database-exposure-containment-preflight.sql` *before* migrating and store it
   with the deployment record.
2. Restore only the specific, reviewed grants from that snapshot, by hand, with
   named approval.

There is no supported automatic path back.

The same reasoning was applied retroactively to
`2026_07_20_000002_add_secure_qr_tokens_to_referrals_table.php`, whose `down()`
previously ran `GRANT EXECUTE ON FUNCTION akay_referral_lookup(…) TO PUBLIC`.
Rolling that migration back — for a reason as unrelated as dropping the QR token
columns — would have re-opened referral lookup, and with it full patient and
health-record JSON, to `anon` and `authenticated`. That statement has been
removed. `DatabaseExposureContainmentTest::test_no_migration_grants_privileges_to_browser_facing_roles`
now scans the whole migrations directory so the pattern cannot reappear.

## Execution procedure (requires approval; not yet performed)

1. **Back up.** Take a Supabase point-in-time restore point or an on-demand
   backup and record its identifier. Do not proceed without it.
2. **Preflight, read-only.** Run
   `docs/database-exposure-containment-preflight.sql` sections 0–2 against the
   target database. Confirm the two ownership `BLOCKER` counts are `0` **and
   that both default-privilege `BLOCKER` queries return no rows** — those are
   the stage 1 preconditions, and any row means the migration will abort. Save
   sections 0–1 output as the rollback snapshot.
3. **Confirm environment.** Verify the connection targets the intended project
   before anything else.
4. **Dry run.** `php artisan migrate --pretend`.

   Read its output for what it is: `--pretend` prints the SQL text of each
   `DB::unprepared` block **without executing any of it**. It does not run the
   `DO` blocks, so it cannot exercise the preconditions, cannot report what
   would be revoked, and cannot demonstrate the fail-closed behaviour. It also
   opens no transaction, which is why `up()` exempts pretend runs from the
   transaction guard.

   The authoritative preview of what will change is preflight section 1, which
   lists exactly the ACL entries that will be removed, plus the section 2
   blocker queries, which are the same checks stage 1 will run for real.
5. **Apply.** `php artisan migrate --force`, one migration, during a maintenance
   window.
6. **Verify.** Run preflight section 3. Every row must read `PASS` or `SKIPPED`.
   The `runtime_privilege_status` and `runtime_execute_status` blocks must all
   read `PASS` — that is the check that the API still works at the database
   level.
7. **Smoke test the API** as each of `bhw`, `rhu_staff` and `admin`: patient
   list, patient details, health record list and details, referral list and
   details, reports, and one inventory restock. All are stored-function paths
   and all must behave exactly as before.

## Verification status

| Check | Status |
| --- | --- |
| Static and structural assertions (11 tests) | Passing on SQLite |
| PostgreSQL privilege assertions (11 tests) | **Skipped — no PostgreSQL available** |
| Migration executed anywhere | **No** |
| Preflight run against any database | **No** |

The PostgreSQL assertions in
`backend/tests/Feature/DatabaseExposureContainmentTest.php` reproduce the
Supabase grant pattern on a throwaway database, run the containment migration
against it, and then assert:

- `anon` and `authenticated` can neither read nor mutate any application table;
- independently granted **column-level** privileges are revoked, with no
  orphaned `pg_attribute.attacl` entries left behind;
- an **inherited** privilege — `anon` made a member of a role holding
  `SELECT` — makes the migration **fail closed** rather than report success;
- a failed assertion **rolls back every privilege change**, verified by
  comparing a full before/after privilege fingerprint;
- the **precondition stage aborts before changing anything**, exercised via
  `SET LOCAL ROLE` to a role that owns nothing, since a superuser passes every
  `pg_has_role` check;
- unsafe default privileges owned by **any** role, at both schema and global
  scope, are removed;
- a table created afterwards is unreachable, and a function created afterwards
  does not grant `EXECUTE` to `PUBLIC`;
- **every overload** of an `akay_*` function is revoked, not just one;
- `service_role` privileges and the Phase 4A inventory functions and
  append-only ledger trigger are **byte-for-byte unchanged**;
- the Laravel connection still reads every table and executes every stored
  function the API calls.

They are opt-in and skip when unconfigured:

```bash
AKAY_PGSQL_TEST_HOST=127.0.0.1 AKAY_PGSQL_TEST_DATABASE=akay_containment_test AKAY_PGSQL_TEST_USERNAME=postgres AKAY_PGSQL_TEST_PASSWORD=... php artisan test --filter=DatabaseExposureContainmentTest
```

They refuse to run if `AKAY_PGSQL_TEST_HOST` looks like a managed Supabase
endpoint, because they create roles and grant privileges. No PostgreSQL server
was available in this environment, so **they have never been executed and this
migration's runtime behaviour is unproven.** Phase 9 formalises this test
profile; until it exists, step 6 of the execution procedure is the only real
verification.

## Residual exposure Phase 1 deliberately leaves open

These are reported by preflight section 4 and are *not* changed here. Each needs
a separate decision.

**`service_role` keeps full access.** The Supabase service key is a server-side
secret and AKAY does not use it, but anything that obtains it still reaches every
table. Revoking it is a larger behavioural change than containment and belongs
with Phase 2 role separation. Recommended, pending approval.

**`USAGE` on schema `public` is still granted to `anon` and `authenticated`.**
With every object privilege revoked this grants no data access, but it still lets
those roles resolve object names. Revoking it is the strongest single
containment statement available and, given that the frontend uses no Supabase
Data API, it is safe here — but it is outside the scope this phase was given and
would disable the project's auto-generated REST and GraphQL APIs entirely. If
approved, it is one statement per role:

```sql
REVOKE USAGE ON SCHEMA public FROM anon;
REVOKE USAGE ON SCHEMA public FROM authenticated;
```

**The legacy `akay_*` functions still trust caller-supplied role and facility
arguments.** Revoking `EXECUTE` removes the browser's access to them, but the
functions remain a latent hazard: any future role granted `EXECUTE`, and any
`SECURITY DEFINER` wrapper written over them, inherits an authorisation model
where `'admin'` is a string the caller chooses. This is Phase 3 and Phase 6 work.

**Laravel still connects as `postgres`**, a `BYPASSRLS` superuser that owns every
table, and uses the same credential for runtime and migrations. Containment
raises the floor; it does not address this. That is Phase 2.

## Dead function analysis

Three functions have no caller anywhere in the repository — not in
`backend/app`, not in tests, not in the frontend:

| Function | Only occurrences |
| --- | --- |
| `akay_incoming_referrals(bigint,text,int,int)` | its own `CREATE`/`DROP` |
| `akay_referral_lookup(text,text,bigint,bigint)` | its own `CREATE`/`DROP`, plus the QR migration's revoke |
| `akay_dashboard_summary_counts(text,bigint,bigint)` | its own `CREATE`/`DROP` |

`akay_referral_lookup` is the most dangerous of the three: it resolves a referral
by `tracking_id` **or** `qr_code_value` and returns full referral JSON including
the patient and health record, with the caller's role passed as an argument.

Per the phase brief they are **not dropped here**. Repository-level absence of
callers is not proof of database-level disuse — a view, another function, or an
out-of-band tool could depend on them. Dropping them requires a separate,
reviewed migration preceded by a `pg_depend` dependency check against the live
catalog. Revoking `EXECUTE` in this phase already removes the reachable attack
path.
