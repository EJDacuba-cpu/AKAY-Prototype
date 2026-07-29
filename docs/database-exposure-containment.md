# Database exposure containment

Status: **Phase 2A complete. Phase 2B prepared, not executed.** No containment
migration has been run against any database. The only change applied to the
configured Supabase project so far is the Phase 2A Data API disablement, which
is a control-plane toggle and changed no database privilege.

## The problem

AKAY's PostgreSQL database is hosted on Supabase. A Supabase project ships with
two roles that are reachable from a browser through the Data API: `anon` (the
publishable key, which is embedded in client applications by design) and
`authenticated`. On this project both roles hold `SELECT`, `INSERT`, `UPDATE`,
`DELETE`, `TRUNCATE`, `REFERENCES` and `TRIGGER` on every table in `public`,
`EXECUTE` on the legacy `public.akay_*` reporting functions, and `ALTER DEFAULT
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

The repository has been re-checked at each phase: the React frontend contains no
`supabase-js` client, no PostgREST calls and no direct database access of any
kind. Every request goes through `frontend/src/services/apiClient.js` to the
Laravel API. The exposure is therefore entirely unused by AKAY, and closing it
costs the application nothing.

### What Phase 2A did, and what it did not do

Phase 2A disabled the Supabase Data API and verified the application was
unaffected. It was, completely: Laravel connects over a direct PostgreSQL
session on port 5432, which the Data API toggle does not touch.

It is important to be precise about what that bought. Disabling the Data API
**turns off the PostgREST and GraphQL endpoints. It revokes no privilege.**
`anon` and `authenticated` still hold `USAGE` on schema `public`, still hold
full DML on all 26 tables, and still hold `EXECUTE` on 12 `akay_*` functions.
The protection is a reversible dashboard setting, not a property of the
database. Phase 2B is what makes it a property of the database.

## The migration sequence

Phase 2B replaces the original single-file migration
(`2026_07_25_000001_revoke_browser_role_database_access`, now removed — it was
never applied anywhere) with four independently applicable steps.

| Step | Migration | Applied by |
| --- | --- | --- |
| 1 | `2026_07_30_000001_revoke_browser_role_object_privileges` | Laravel |
| 2 | `2026_07_30_000002_enable_rls_on_public_tables` | Laravel |
| 3 | `2026_07_30_000003_revoke_public_schema_usage` | Laravel |
| 4 | `deferred/2026_07_30_000004_deferred_supabase_admin_defaults` | **Blocked — Supabase support** |

### Why the original had to be split

The original migration was one atomic unit spanning two categories of work with
different privilege requirements:

| Work | Requires | Available to `postgres`? |
| --- | --- | --- |
| Revoke privileges on existing objects in `public` | ownership | yes |
| Set `postgres`'s own default privileges | self-ownership | yes |
| Rewrite `supabase_admin`'s default privileges | membership in `supabase_admin` | **no** |

Because its precondition stage was all-or-nothing, the third row blocked the
first two. Every revocation the connected role was fully permitted to perform
was held hostage by one it could never perform, on any managed Supabase project,
by design.

It also left the repository in a state where `php artisan migrate` failed: the
file sat unapplied in the migration path, so every deployment attempted it and
aborted. Step 4 is therefore kept **outside** the migration path, in
`database/migrations/deferred/`. `Migrator::getMigrationFiles()` globs
`'/*_*.php'` per registered path and does not recurse, so nothing there is ever
discovered. `DatabaseExposureContainmentTest::test_deferred_migration_is_not_in_the_migration_path`
enforces that it stays there.

### Step 1 — object privileges

Revokes all privileges on every non-extension table, view, materialised view,
partitioned table, foreign table and sequence in `public` from `PUBLIC`, `anon`
and `authenticated`, plus all privileges on every `public.akay_*` function and
procedure. Signatures come from `pg_get_function_identity_arguments`, one row
per `pg_proc` entry, so **every overload is revoked under its own complete
signature**. Table-level revocation also removes matching **column-level**
grants: PostgreSQL revokes the corresponding `pg_attribute.attacl` entries
alongside the table-level ones, and stage 3 verifies that it did.

It then secures default privileges for every owner the connected role can act
as, at each entry's own scope — schema-qualified entries with `IN SCHEMA`,
global entries without, since the two are stored and applied separately — plus
an unconditional override in schema `public` for `postgres`. That last part
matters: `pg_default_acl` holds no row until a default is modified, so
PostgreSQL's built-in default of `EXECUTE` on new functions to `PUBLIC` is
invisible to enumeration and has to be overridden explicitly.

**Owners it cannot act as are deferred, not treated as blockers.** They are
enumerated and reported by name with `RAISE NOTICE`, and stage 3 excludes
exactly the same set from its assertions. The deferral is therefore visible in
the migration output and cannot be mistaken for containment — step 4 is where
it is closed out.

### Step 2 — Row Level Security

Enables RLS on every non-extension, non-temporary ordinary and partitioned table
in `public`. No policy is created. "RLS on, zero policies" is the intended
terminal state for this phase: it is deny-by-default for every non-exempt role.

This is the second independent control behind step 1. Privilege revocation and
RLS fail in different ways — a restored backup, a platform-side re-provision or
a default-privilege entry this phase could not reach can all hand a privilege
back, and none of them creates a policy.

**Why it is safe now, and why the ordering is load-bearing.** PostgreSQL exempts
two kinds of caller from RLS: a role with `BYPASSRLS`, and the table's owner
unless the table is set to `FORCE ROW LEVEL SECURITY`. Laravel connects as
`postgres`, which is both the owner of every table in `public` and `BYPASSRLS`,
so enabling RLS today changes nothing the application can see. Stage 1 refuses
to proceed unless it has proven that for every single table rather than assuming
it, and stage 3 re-proves it afterwards.

The constraint this creates for Phase 2C is absolute: **pointing a
non-`BYPASSRLS` runtime role at RLS-enabled tables that have no policies is a
total outage**, because every query returns zero rows. RLS must be enabled while
the application still connects as the exempt owner, and policies must exist
before any runtime role separation lands.

### Step 3 — schema `USAGE`

Removes all privileges on schema `public` from `anon`, `authenticated` and the
pseudo-role `PUBLIC`. A role without `USAGE` on a schema cannot use any object
in it, present or future, whatever privileges it may later be handed.

**`PUBLIC` must be revoked too, and that has a blast radius.** PostgreSQL hands
`USAGE` on schema `public` to `PUBLIC` by default, and `has_schema_privilege()`
resolves privileges reaching a role through `PUBLIC`. Revoking from `anon` and
`authenticated` alone would change nothing measurable — both would still resolve
names through `PUBLIC`. Revoking `PUBLIC` means every role relying on it, rather
than on a direct entry of its own, loses access.

Stage 1 therefore predicts the post-revoke state for each depended-on role and
refuses to proceed if any would lose `USAGE`. The hard-blocker set is the
connected role, `postgres` and `service_role`. `authenticator` and the
`supabase_*_admin` roles are deliberately **not** hard blockers — `authenticator`
exists to switch into `anon`/`authenticated` for the Data API that Phase 2A
disabled, and the `*_admin` roles operate in their own schemas — but any role
that loses `USAGE` is reported by name in stage 2, so the blast radius appears
in the migration output rather than being discovered afterwards.

This is the step that makes step 4's deferral tolerable: a default privilege on
a future object is worthless to a role that cannot resolve names in the schema
the object lives in.

### Step 4 — deferred `supabase_admin` defaults

Supabase's project bootstrap stores default-privilege entries owned by
`supabase_admin` that hand every future table, sequence and function in `public`
to `anon` and `authenticated`. Removing them requires `ALTER DEFAULT PRIVILEGES
FOR ROLE supabase_admin`, which PostgreSQL permits only to a member of
`supabase_admin`.

**There is no self-service path on a managed project.** The Laravel connection,
the pooler and the dashboard SQL editor all authenticate as `postgres`, which is
not a member of `supabase_admin` and cannot make itself one — that would require
superuser or `ADMIN OPTION` on the role. Earlier revisions of this document
suggested removing the entries "out of band" or granting membership; neither is
available here, and both should be disregarded.

The remediation is a **Supabase support request**. Record the ticket reference
here before moving the file into the migration path:

> Supabase support ticket: _(not yet raised)_

**Why deferring is acceptable.** These defaults only ever apply to objects
`supabase_admin` itself creates in `public`. AKAY's tables and routines are
created by Laravel migrations connecting as `postgres`, and inherit `postgres`'s
defaults, which step 1 secures. Step 3 then removes schema `USAGE` from the
browser roles entirely. The residual risk is narrow and conditional — it matters
only if step 3 is ever reversed — but it is tracked to completion rather than
written off, because narrow is not none.

Step 4 carries the **unscoped, phase-closing assertion**: no unsafe stored entry
may remain at any scope owned by anyone, and the effective defaults of both
object-creating roles must be safe. Steps 1 to 3 each deliberately narrow their
own assertions; this is the one that lets Phase 2B be recorded as complete
rather than partial.

## Design properties preserved across the split

Every step retains all of these, and the test suite enforces them per file:

- **Object names come from the catalog, not a list.** Drift between the
  migrations directory and the live database cannot leave a table behind.
- **Every name is built with `format('%I', …)`.** Nothing is interpolated.
- **Extension-owned objects are skipped** (`pg_depend.deptype = 'e'`), so
  installing `pgcrypto` or `uuid-ossp` into `public` is not broken.
- **Missing roles are handled.** `anon`, `authenticated`, `service_role` and
  `supabase_admin` are each checked against `pg_roles` first; a self-hosted
  PostgreSQL server with none of them runs every step cleanly.
- **No `GRANT` statement appears anywhere**, and no application row is read —
  only `pg_catalog`.
- **Effective-privilege assertions**, not ACL-entry reads:
  `has_table_privilege` / `has_any_column_privilege` / `has_sequence_privilege`
  / `has_function_privilege` / `has_schema_privilege` resolve direct grants,
  grants inherited through role membership, and grants to `PUBLIC`. A role that
  still reaches a table by being a member of some third role — something
  revoking from `anon` directly would never fix — fails.
- **Raw ACL checks for `PUBLIC`**, which has no `pg_roles` row to test against.
- **Fail-closed, three-stage shape.** Preconditions prove what is permitted
  before anything changes; the mutation runs; assertions re-read the catalog and
  raise otherwise. Each step raises from both its own precondition and its own
  assertion stage — splitting the phase does not dilute the contract.
- **No warn-and-continue path and no override flag.** `RAISE NOTICE` is used
  only to record deferrals and blast radius that the assertions separately
  account for; `RAISE WARNING` appears nowhere, and `env(` / `config(` are
  forbidden in every step.
- **`TYPES` default privileges are left alone.** Removing `PUBLIC USAGE` on
  types has no security benefit here and breaks ordinary schema use.

## Transaction safety

`Migrator::runMigration()` wraps `up()` in `$connection->transaction()` whenever
`getSchemaGrammar()->supportsSchemaTransactions()` and `$migration
->withinTransaction` are both true. `PostgresGrammar::$transactions` is `true`,
and every step sets `public $withinTransaction = true` explicitly. PostgreSQL
applies `REVOKE`, `ALTER DEFAULT PRIVILEGES` and `ALTER TABLE … ENABLE ROW LEVEL
SECURITY` transactionally, so a `RAISE EXCEPTION` from any stage rolls that
step's changes back and its `migrations` table row is never written.

Each step is a **separate migration and therefore a separate transaction**. That
is the entire point of the split: a blocker in step 4 no longer discards steps 1
to 3.

As a belt-and-braces guard, every `up()` refuses to run when
`DB::transactionLevel() < 1` — for example if a migration were invoked directly,
or on a connection whose grammar did not support transactional DDL. Pretend runs
are exempt, because `Migrator::pretendToRun()` logs statements without opening a
transaction and without executing anything.

### Why this cannot lock Laravel out

Laravel connects as `postgres`, which owns every object in `public` (confirmed
by the preflight `BLOCKER` queries in section 2). An owner's privileges are
implicit in ownership and are *not* represented as ACL entries, so `REVOKE …
FROM PUBLIC / anon / authenticated` cannot remove them. No step names the
connected role as a revocation target.

Steps 2 and 3 add their own availability preconditions on top of that, because
neither is protected by ownership alone: step 2 proves the connected role is
RLS-exempt on every table before enabling anything, and step 3 predicts the
post-revoke schema privileges of every depended-on role. Both re-prove the same
property in their assertion stage, because the guarantee that matters is the
post-state.

This is also why the preflight includes
`blocker_public_objects_not_owned_by_current_role` and
`blocker_akay_routines_not_owned_by_current_role`. **Both must return 0 before
step 1 runs.** If a future Phase 2C runtime role is already in place and is
*not* the owner, this sequence must be re-reviewed first, because a non-owner
runtime role could depend on an explicit grant.

## Precondition failures

`AKAY_CONTAINMENT_PRECONDITION_FAILED` means nothing was changed by that step.
The exception `DETAIL` lists every blocker, and the `HINT` names the step.
Preflight section 2 reports the same set in advance, so this should not be a
surprise.

| Step | Expected blocker | Remediation |
| --- | --- | --- |
| 1 | An object in `public` owned by a role `postgres` cannot act as | Re-review before proceeding; this contradicts the ownership model the phase assumes |
| 2 | The connected role is not RLS-exempt on some table | Do **not** work around by enabling RLS on a subset. Either the role lost `BYPASSRLS` or a table forces RLS; resolve that first |
| 3 | A depended-on role would lose `USAGE` | Give that role a direct, reviewed schema entry out of band, then re-run |
| 4 | `supabase_admin` — **expected, and currently unresolvable** | Supabase support request; see step 4 above |

Do not work around any of these by weakening a migration.

## Assertion failures

`AKAY_CONTAINMENT_ASSERTION_FAILED` means every change in that step has already
been rolled back. The `DETAIL` names what still reaches what.

The most likely cause in step 1 is an inherited privilege: `anon` or
`authenticated` is a member of another role that holds grants on `public`. The
effective-privilege query in preflight section 3 reports the membership chain in
its `role_is_member_of` column. Revoke at the source role, then re-run.

In step 2 the most likely cause is a pre-existing policy on a public table.
Deny-by-default cannot be asserted while an unreviewed policy is present, and
this phase creates none.

## Execution procedure (requires approval; not yet performed)

1. **Back up.** Take a Supabase point-in-time restore point or an on-demand
   backup and record its identifier. Do not proceed without it.
2. **Preflight, read-only.** Run
   `docs/database-exposure-containment-preflight.sql` sections 0–2 against the
   target database. Confirm the two ownership `BLOCKER` counts are `0`. Save
   sections 0–1 output as the rollback snapshot.

   Note that the default-privilege `BLOCKER` queries in section 2 are now
   expected to return `supabase_admin` rows. Under the original single-file
   migration that was a stop condition; it is now step 4's scope and does not
   block steps 1 to 3.
3. **Confirm environment.** Verify the connection targets the intended project
   before anything else.
4. **Prove the migrations work.** Run the containment suite against a throwaway
   PostgreSQL server — see "Verification status" below. This is a hard gate, not
   a nicety: the PostgreSQL assertions have never executed anywhere.
5. **Dry run.** `php artisan migrate --pretend`.

   Read its output for what it is: `--pretend` prints the SQL text of each
   `DB::unprepared` block **without executing any of it**. It does not run the
   `DO` blocks, so it cannot exercise the preconditions, cannot report what would
   be revoked, and cannot demonstrate the fail-closed behaviour. It also opens no
   transaction, which is why `up()` exempts pretend runs from the transaction
   guard.

   The authoritative preview is preflight section 1, which lists exactly the ACL
   entries that will be removed, plus the section 2 blocker queries.
6. **Apply, one step at a time**, during a maintenance window:

   ```bash
   php artisan migrate --force --step
   ```

   Verify after each step (section 3 of the preflight, plus the step-specific
   checks in the checklist below) before running the next. `--step` also records
   each migration in its own batch, so a reviewed rollback can target one.
7. **Smoke test the API** as each of `bhw`, `rhu_staff` and `admin`: patient
   list, patient details, health record list and details, referral list and
   details, follow-ups, notifications, reports, PDF generation, and one
   inventory restock. All are stored-function paths and all must behave exactly
   as before.
8. **Rotate keys.** The anon/publishable and service keys should be treated as
   compromised: until Phase 2B they were the only thing standing between the
   internet and `public.patients`, and Phase 2A's protection was a reversible
   toggle.
9. **Record.** File the restore-point identifier, the preflight snapshot, the
   step-by-step verification output and the Supabase ticket reference with the
   deployment record.

## Rollback

Every step has an intentionally empty `down()`.

A security containment rollback must never restore browser access as a side
effect of an unrelated `migrate:rollback`. This applies even to step 2, whose
reversal is a single trivially-issued statement — that is precisely why it must
not be automatic.

| Step | Reversal | Notes |
| --- | --- | --- |
| 1 | Manual replay of reviewed grants from the preflight section-1 snapshot | No automatic path. Requires named approval |
| 2 | `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, per table | Genuinely reversible and zero-risk to reverse, but re-opening is a security decision |
| 3 | Restore the schema entries recorded in the snapshot | One statement per role. Re-opens the whole containment surface |
| 4 | Manual replay from the snapshot | Not applicable until step 4 has run |
| all | Supabase PITR to the pre-window restore point | Last resort — discards clinical data written since |

If access genuinely has to be restored:

1. Take the **PRE-MIGRATION PRIVILEGE SNAPSHOT** from section 1 of
   `database-exposure-containment-preflight.sql` *before* migrating and store it
   with the deployment record.
2. Restore only the specific, reviewed privileges from that snapshot, by hand,
   with named approval.

There is no supported automatic path back.

The same reasoning was applied retroactively to
`2026_07_20_000002_add_secure_qr_tokens_to_referrals_table.php`, whose `down()`
previously re-opened `EXECUTE` on `akay_referral_lookup(…)` to `PUBLIC`. Rolling
that migration back — for a reason as unrelated as dropping the QR token columns
— would have re-opened referral lookup, and with it full patient and
health-record JSON, to `anon` and `authenticated`. That statement has been
removed. `DatabaseExposureContainmentTest::test_no_migration_grants_privileges_to_browser_facing_roles`
now scans the whole migrations directory, including
`database/migrations/deferred`, so the pattern cannot reappear.

## Verification status

| Check | Status |
| --- | --- |
| Static and structural assertions (15 tests) | Passing on SQLite |
| PostgreSQL privilege assertions (11 tests) | **Skipped — no PostgreSQL available** |
| RLS behavioural assertions | **Not yet written** |
| Schema-`USAGE` behavioural assertions | **Not yet written** |
| Any step executed anywhere | **No** |
| Preflight run against any database | **No** |

The PostgreSQL assertions in
`backend/tests/Feature/DatabaseExposureContainmentTest.php` reproduce the
Supabase grant pattern on a throwaway database, run all four containment steps
against it in order, and then assert:

- `anon` and `authenticated` can neither read nor mutate any application table;
- independently granted **column-level** privileges are revoked, with no
  orphaned `pg_attribute.attacl` entries left behind;
- an **inherited** privilege — `anon` made a member of a role holding
  `SELECT` — makes the sequence **fail closed** rather than report success;
- a failed assertion **rolls back every privilege change**, verified by
  comparing a full before/after privilege fingerprint;
- the **precondition stage aborts before changing anything**, exercised via
  `SET LOCAL ROLE` to a role that owns nothing, since a superuser passes every
  `pg_has_role` check;
- unsafe default privileges owned by **any** role, at both schema and global
  scope, are removed;
- a table created afterwards is unreachable, and a function created afterwards
  does not hand `EXECUTE` to `PUBLIC`;
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
has been available in this environment, so **they have never been executed and
the runtime behaviour of every step is unproven.**

**Coverage gap introduced by Phase 2B.** The eleven behavioural tests were
written against the original migration's scope. Steps 2 and 3 currently have
structural coverage only — that the RLS step checks `rolbypassrls`,
`relforcerowsecurity` and `pg_policies`, and that the schema step revokes the
`PUBLIC` pseudo-role and proves its depended-on roles survive. Behavioural tests
for both must be written and run on a throwaway PostgreSQL server before step 2
or step 3 is applied anywhere. Specifically:

- a non-exempt role reads zero rows from an RLS-enabled table;
- the connected role still reads every row;
- a table that forces RLS fails the precondition rather than being enabled;
- a role holding schema `USAGE` only through `PUBLIC` loses it, and one holding
  a direct entry keeps it;
- step 3 fails closed when `service_role` would lose `USAGE`.

## Residual exposure Phase 2B deliberately leaves open

These are reported by preflight section 4 and are *not* changed by any step
above. Each needs a separate decision.

**`service_role` keeps full access.** The Supabase service key is a server-side
secret and AKAY does not use it, but anything that obtains it still reaches every
table. Step 3 explicitly protects `service_role`'s schema access rather than
removing it, because revoking it is a larger behavioural change than containment
and belongs with Phase 2C role separation. Recommended, pending approval.

**The legacy `akay_*` functions still trust caller-supplied role and facility
arguments.** Revoking `EXECUTE` removes the browser's access to them, but the
functions remain a latent hazard: any future role granted `EXECUTE`, and any
`SECURITY DEFINER` wrapper written over them, inherits an authorisation model
where `'admin'` is a string the caller chooses. This is Phase 3 and Phase 6 work.

**Laravel still connects as `postgres`**, a `BYPASSRLS` role that owns every
table, and uses the same credential for runtime and migrations. Containment
raises the floor; it does not address this. That is Phase 2C — and step 2 above
is what makes it possible to do safely, provided policies are written first.

**`APP_DEBUG` is `true` in the current environment file.** Unrelated to
containment, but it must be `false` before any production exposure.

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

They are **not dropped here**. Repository-level absence of callers is not proof
of database-level disuse — a view, another function, or an out-of-band tool
could depend on them. Dropping them requires a separate, reviewed migration
preceded by a `pg_depend` dependency check against the live catalog. Revoking
`EXECUTE` in step 1 already removes the reachable attack path.
