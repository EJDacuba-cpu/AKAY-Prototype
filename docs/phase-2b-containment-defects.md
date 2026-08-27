# Phase 2B containment defects — default-privilege override and assertion

Status: **Open. Not fixed.** Phase 2B must not be run against the production
Supabase project until items D1 and D2 below are resolved.

Scope: this document records two defects in the Phase 2B containment migrations
and their supporting preflight/prose, found by analysis and confirmed by direct
execution against a disposable local PostgreSQL 16.13 cluster. No connection to
the project's Supabase instance was made at any point, and no migration or
application file was modified in producing it.

Date: 2026-08-20. Related: `docs/database-exposure-containment.md`.

---

## 1. Summary

The Phase 2B step-1 migration attempts to override PostgreSQL's built-in default
privilege — "new functions are executable by `PUBLIC`" — using a
**schema-qualified** `ALTER DEFAULT PRIVILEGES`. That statement cannot perform
that job, in any PostgreSQL configuration. The migration's own assertion detects
the failure and rolls the whole step back, so the migration fails closed and
nothing is currently mis-applied.

Separately, the assertion that catches this is **itself wrong**, in both
directions. It rejects the state produced by the correct fix, and it accepts a
state in which `PUBLIC` retains `EXECUTE` on future functions.

| Defect | Where | Effect today | Effect if fixed naively |
|---|---|---|---|
| **D1** — override statement is schema-scoped | step 1 + step 4 | Migration blocked (fails closed) | — |
| **D2** — assertion resolves schema-scoped entries only | step 1 + step 4 + preflight | Masked by D1 | **False pass on an insecure database** |

D2 is the more dangerous of the two, because the obvious reading of D1 leads
directly into it.

### Current exposure

**No new exposure.** The migration aborts before any privilege change is
committed; `migrate:status` leaves the step `Pending`. The database remains in
the Phase 2A-only state already described in
`docs/database-exposure-containment.md` (Data API disabled, database-level
privileges unchanged). The risk documented here is a *forward* risk: applying an
incorrect fix would convert a control that fails closed into one that reports
success while granting nothing.

---

## 2. D1 — the override statement is schema-scoped and cannot subtract

### Affected code

`backend/database/migrations/2026_07_30_000001_revoke_browser_role_object_privileges.php`,
stage 2b, lines 503-508:

```php
FOREACH v_object_type IN ARRAY ARRAY['TABLES', 'SEQUENCES', 'FUNCTIONS']
LOOP
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM %s',
        'postgres', v_object_type, v_grantee
    );
END LOOP;
```

Duplicated verbatim at
`backend/database/migrations/deferred/2026_07_30_000004_deferred_supabase_admin_defaults.php:348`.

### Observed behaviour

```
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM PUBLIC;     -- succeeds, no error

SELECT count(*) FROM pg_default_acl;          -- 0
\ddp                                          -- (0 rows)
CREATE FUNCTION public.probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT proacl FROM pg_proc WHERE proname='probe';                 -- NULL
SELECT has_function_privilege('public','public.probe()','EXECUTE'); -- true
```

The migration then aborts:

```
SQLSTATE[P0001]: AKAY_CONTAINMENT_ASSERTION_FAILED
DETAIL:  future f created by postgres would hand EXECUTE to PUBLIC
```

which matches the `format()` at lines 720-724 of the same file.

### Root cause

The cause is **the scope of the statement, not the use of a bare `REVOKE`.**
The identical statement with `IN SCHEMA public` removed works correctly:

```
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

SELECT defaclrole::regrole, defaclnamespace, defaclobjtype, defaclacl FROM pg_default_acl;
--  postgres | 0 | f | {postgres=X/postgres}
CREATE FUNCTION public.probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT proacl ...;                                                -- {postgres=X/postgres}
SELECT has_function_privilege('public','public.probe()','EXECUTE'); -- false
```

PostgreSQL treats the two scopes asymmetrically (`aclchk.c`):

- A **global** entry (`defaclnamespace = 0`) starts from `acldefault()` and
  **replaces** the built-in default.
- A **schema-qualified** entry starts from an **empty** ACL and is combined with
  the built-in default by `aclmerge()`, which only **adds** privileges.

Two consequences follow:

1. Revoking from an empty baseline produces an empty ACL, which equals the
   baseline, so no `pg_default_acl` row is stored. Hence the silent no-op.
2. **No schema-qualified statement can ever remove `PUBLIC EXECUTE`**, even when
   a row does exist. Confirmed by forcing a row into existence with a `GRANT`
   first and then revoking — the stored ACL stayed `{postgres=X/postgres}` and
   `PUBLIC` could still execute new functions.

### Only `FUNCTIONS` is affected

Built-in defaults on this cluster:

| Object type | `acldefault(...)` for `postgres` | `PUBLIC` included? |
|---|---|---|
| `r` tables | `{postgres=arwdDxt/postgres}` | no |
| `S` sequences | `{postgres=U/postgres}` | no |
| `f` functions | `{=X/postgres,postgres=X/postgres}` | **yes — `EXECUTE`** |
| `n` schemas | `{postgres=UC/postgres}` | no |

The `TABLES` and `SEQUENCES` arms of the loop therefore have never had anything
to subtract and never could. They are harmless, but the comment at lines 426-429
overstates what they accomplish. Supabase's real table and sequence grants are
*stored* `pg_default_acl` rows, which are already handled correctly by the
enumeration loop at lines 462-495.

---

## 3. D2 — the assertion resolves the wrong set of entries

### Affected code

`2026_07_30_000001_revoke_browser_role_object_privileges.php`, stage 3,
lines 708-716:

```sql
SELECT COALESCE(
    (SELECT def.defaclacl
     FROM pg_catalog.pg_default_acl AS def
     JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
     WHERE def.defaclrole = owners.roleoid
       AND def.defaclobjtype = owners.objtype
       AND ns.nspname = 'public'),
    acldefault(owners.objtype, owners.roleoid)
) AS effective_acl
```

A global entry has `defaclnamespace = 0`, which has no matching `pg_namespace`
row, so the inner `JOIN` drops it and `COALESCE` falls through to
`acldefault()`. The query therefore models schema-scoped entries as *replacing*
the built-in default — the exact inverse of PostgreSQL's actual rule — and is
blind to global entries entirely.

Duplicated at
`backend/database/migrations/deferred/2026_07_30_000004_deferred_supabase_admin_defaults.php:393-397`
and at `docs/database-exposure-containment-preflight.sql:493-500`.

### Measured behaviour across four database states

Each state was built in a clean database; "reality" is
`has_function_privilege('public', <new function>, 'EXECUTE')`.

| Database state | `PUBLIC` can execute? | Migration assertion reports |
|---|---|---|
| Untouched | yes | FAIL — correct |
| Step 1 as currently written | yes | FAIL — correct |
| **Global revoke (the correct fix)** | **no** | **FAIL — false alarm** |
| **Schema-scoped `GRANT` then `REVOKE`** | **yes** | **PASS — false assurance** |

Row 3 means that repairing D1 alone will *not* unblock Phase 2B; the migration
will keep aborting on a database that is genuinely secure.

Row 4 is the serious case. It is the state produced by "materialise the row
first, then revoke" — a natural reading of the D1 symptom. It leaves `PUBLIC`
holding `EXECUTE` on every future function while the assertion reports success,
turning a control that fails closed into one that fails open and silently.

Because the preflight SQL shares this logic, it would clear both the state the
migration rejects and the insecure state the migration would accept. The
preflight cannot presently be used to validate this control.

---

## 4. Recommended remediation

Not yet applied. Five call sites, two of them code.

### R1 — make the override global, and functions-only in intent

Replace the schema-qualified override with a global one:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

This is the only mechanism PostgreSQL provides that subtracts from a built-in
default. Apply the same change at `deferred/...000004:348`.

**Trade-off requiring a decision.** A global entry applies to functions the role
creates in *every* schema, not only `public`. On Supabase that reaches
`extensions`, `graphql` and similar schemas, and could break an extension whose
functions are expected to be executable by `PUBLIC`. For AKAY the wider scope is
probably desirable as defence in depth, but it is a genuine widening and should
be a conscious choice rather than a side effect.

The mitigation falls out of the same asymmetry that causes D1: because
schema-qualified entries *add*, exemptions can be granted back per schema —

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA extensions
    GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
```

### R2 — resolve global and schema-scoped entries separately in the assertion

`PUBLIC` reaches a future function if **either**
`COALESCE(<global row>, acldefault(...))` grants it **or** the schema-scoped row
grants it. `aclmerge()` is not SQL-callable (no `pg_proc` entry), so this needs
two lookups combined with `OR` rather than a single `COALESCE`. Sketch:

```sql
-- unsafe if either source grants to PUBLIC
EXISTS (
  SELECT 1 FROM aclexplode(COALESCE(
      (SELECT defaclacl FROM pg_default_acl
        WHERE defaclrole = <owner> AND defaclobjtype = 'f' AND defaclnamespace = 0),
      acldefault('f', <owner>))) a
   WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
OR
EXISTS (
  SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace,
    LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole = <owner> AND d.defaclobjtype = 'f' AND n.nspname = 'public'
     AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
```

This formulation was tested against all four states in §3 and matched reality in
every one. Apply to `...000001` stage 3, `deferred/...000004` stage 3, and
`docs/database-exposure-containment-preflight.sql`.

### R3 — consider asserting on observed behaviour instead of a derived model

Both defects are re-derivation errors: the migration reproduces PostgreSQL's ACL
resolution rules in SQL and gets them wrong. Since the migration already
requires a transaction (lines 124-131), the assertion could instead create a
throwaway function, test `has_function_privilege('public', ...)` against it, and
drop it — measuring the real outcome rather than predicting it. This retires the
entire class of bug and is worth weighing against the added side effect.

### R4 — correct the supporting prose

`docs/database-exposure-containment.md:97-101` currently documents the
schema-qualified override as correct by design and gives the reasoning that led
to it. It needs to state the global/schema-scoped asymmetry instead.

### R5 — sequencing

1. Fix D1 and D2 together. Fixing either alone leaves the migration wrong:
   D1 alone still aborts (§3 row 3); D2 alone still fails to contain.
2. Re-verify with `pg_default_acl`, `\ddp`, `proacl`, and
   `has_function_privilege` on a **real** PostgreSQL server — not SQLite.
3. Re-run the full suite so that Phase 2B steps 2 and 3 (RLS enable, schema
   `USAGE` revoke), never reached in this analysis, are exercised on real
   PostgreSQL.
4. Verify on a **disposable** Supabase project before the production one, to
   settle the superuser-versus-owner question below.
5. **Do not relax the assertion to obtain a pass.** The assertion firing is the
   reason this defect was caught rather than shipped. It needs to be made
   *correct*, not permissive.

---

## 5. Confidence and limits

**Confirmed by execution (PostgreSQL 16.13, Ubuntu 24.04, `initdb` superuser):**

- The schema-qualified `REVOKE` stores no `pg_default_acl` row and leaves
  `proacl` `NULL`, so `PUBLIC` retains `EXECUTE`.
- The equivalent global `REVOKE` does store a row and does remove `PUBLIC`
  `EXECUTE`.
- A schema-qualified `REVOKE` cannot remove `PUBLIC EXECUTE` even against an
  existing row.
- The four-state assertion results in §3, including both the false alarm and the
  false pass.
- `acldefault()` values per object type; `aclmerge()` is not SQL-callable.

**Established by code reading, not execution:**

- That the five call sites listed are the complete set. Located by grepping for
  `ALTER DEFAULT PRIVILEGES`, `acldefault`, and `defaclnamespace`.

**Not verified here:**

- The Laravel migration suite was not run. The claim that all migrations up to
  `2026_07_29_000001_remove_follow_up_reason` apply cleanly is untested in this
  analysis, though nothing observed contradicts it.
- Behaviour under Supabase's `postgres` role, which owns every object but is not
  a full database superuser. This is expected to make no difference — both
  defects concern statement *scope* and catalog *interpretation*, neither of
  which is privilege-dependent — but it remains unconfirmed, and R5 step 4
  stands regardless.

---

## Appendix — reproduction

Requires only a local PostgreSQL 16 cluster; no application code and no Supabase
connection.

```sql
-- D1: the statement the migration runs is a no-op
CREATE DATABASE d1; \c d1
SELECT count(*) FROM pg_default_acl;                        -- 0
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM PUBLIC;
SELECT count(*) FROM pg_default_acl;                        -- 0  (unchanged)
CREATE FUNCTION public.p() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT proacl FROM pg_proc WHERE proname='p';               -- NULL
SELECT has_function_privilege('public','public.p()','EXECUTE');  -- true

-- D1: the global form works
CREATE DATABASE d2; \c d2
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SELECT defaclnamespace, defaclacl FROM pg_default_acl;      -- 0 | {postgres=X/postgres}
CREATE FUNCTION public.p() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT has_function_privilege('public','public.p()','EXECUTE');  -- false

-- D1: schema scope cannot subtract even with a row present
CREATE DATABASE d3; \c d3
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT  EXECUTE ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SELECT defaclacl FROM pg_default_acl;                       -- {postgres=X/postgres}
CREATE FUNCTION public.p() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT has_function_privilege('public','public.p()','EXECUTE');  -- true  <-- still exposed
```

For D2, run the stage-3 effective-default query from
`...000001` lines 695-726 against each of the four databases above and compare
its output with `has_function_privilege` in the same database.
