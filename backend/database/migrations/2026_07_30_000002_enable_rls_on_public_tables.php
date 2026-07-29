<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 2B step 2 - enable Row Level Security on every public table.
 *
 * Step 1 removed the browser-facing roles' privileges. This step is the second
 * independent control behind it: with RLS enabled and no policy defined, a
 * non-exempt role reads zero rows even if it somehow reacquires a privilege -
 * from a restored backup, a platform-side re-provision, or a future
 * default-privilege entry this phase could not reach. Privilege revocation and
 * RLS fail in different ways, which is precisely why both are applied.
 *
 * WHY THIS IS SAFE TO RUN NOW, AND ONLY NOW
 * -----------------------------------------
 * PostgreSQL exempts two kinds of caller from RLS: a role with the BYPASSRLS
 * attribute, and the table's owner (unless the table is set to FORCE ROW LEVEL
 * SECURITY). Laravel currently connects as postgres, which is both the owner of
 * every table in public and BYPASSRLS, so enabling RLS today changes nothing
 * the application can see - and stage 1 refuses to proceed unless it has proven
 * that for every single table rather than assuming it.
 *
 * The ordering constraint this creates is load-bearing for Phase 2C: pointing a
 * non-BYPASSRLS runtime role at RLS-enabled tables that have no policies is a
 * total outage, because every query returns zero rows. RLS must be enabled
 * while the application still connects as the exempt owner, and policies must
 * exist before any runtime role separation lands. Enabling RLS after role
 * separation is the incident this ordering exists to prevent.
 *
 * SCOPE
 * -----
 * Ordinary and partitioned tables in public, catalog-driven, excluding
 * extension-owned and temporary relations. Views, materialised views and
 * foreign tables are excluded: RLS is not a property they carry, and a view's
 * access is governed by its definer's or invoker's rights instead.
 *
 * No policy is created here. "RLS on, zero policies" is the intended terminal
 * state for this phase - it is deny-by-default for every non-exempt role.
 * Nothing here reads application rows.
 *
 * FAIL-CLOSED CONTRACT
 * --------------------
 *   1. PRECONDITIONS - prove every table can be altered AND that the connected
 *      role will still read every one of them afterwards. Changes nothing.
 *   2. ENABLEMENT    - ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
 *   3. ASSERTION     - re-read the catalog and RAISE EXCEPTION unless every
 *      in-scope table now carries RLS, no table forces it against its owner,
 *      the connected role is still exempt everywhere, and no policy exists that
 *      would hand access back.
 */
return new class extends Migration
{
    /**
     * ALTER TABLE ... ENABLE ROW LEVEL SECURITY is transactional in PostgreSQL,
     * so a failed stage 3 rolls every table back to RLS-disabled and the
     * migrations table row is never written.
     */
    public $withinTransaction = true;

    /**
     * The relkinds RLS applies to. Ordinary tables and partitioned tables only.
     */
    private const RLS_RELKINDS = "('r', 'p')";

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $this->assertRunningInATransaction();

        // Order matters. Preconditions must be proven before anything changes,
        // and the assertions must run after everything has changed.
        DB::unprepared($this->preconditionsSql());
        DB::unprepared($this->enableRowLevelSecuritySql());
        DB::unprepared($this->assertRowLevelSecuritySql());
    }

    /**
     * Deliberately non-reopening.
     *
     * DISABLE ROW LEVEL SECURITY is a trivially reversible statement, which is
     * exactly why it must not live in down(): a routine `migrate:rollback`
     * during an unrelated deployment would strip the deny-by-default control
     * off every clinical table without anyone deciding to. Re-opening is a
     * security decision, not a deployment step - see the per-step rollback
     * procedure in docs/database-exposure-containment.md.
     */
    public function down(): void
    {
        // No automatic re-opening. See the method docblock.
    }

    /**
     * Guards against the migration being executed outside a transaction - for
     * example by being invoked directly, or on a connection whose grammar does
     * not support schema transactions - which would allow stage 2 to leave RLS
     * enabled on some tables and not others when stage 3 fails.
     *
     * Pretend runs are exempt: Migrator::pretendToRun() logs statements without
     * opening a transaction and without executing anything.
     */
    private function assertRunningInATransaction(): void
    {
        if (DB::connection()->pretending()) {
            return;
        }

        if (DB::transactionLevel() < 1) {
            throw new RuntimeException(
                'AKAY containment must run inside a transaction so that a failed '
                .'assertion rolls back every change. Run it through '
                .'`php artisan migrate`, which wraps migrations in a transaction '
                .'on PostgreSQL.'
            );
        }
    }

    /**
     * The exemption test, inlined at each call site so the migration creates no
     * database object of its own.
     *
     * A caller still reads an RLS-enabled table when it is a superuser, when it
     * holds BYPASSRLS, or when it can act as the owner and the table does not
     * FORCE RLS. Ownership alone is not sufficient: relforcerowsecurity removes
     * the owner exemption, which would take the application down.
     *
     * rolsuper is tested alongside rolbypassrls because PostgreSQL exempts
     * superusers from row security unconditionally, while rolbypassrls is a
     * separate attribute a superuser does not necessarily carry. Testing only
     * the flag would block containment on a self-hosted server whose
     * application role is a superuser without it - fail-closed, but for no
     * reason.
     */
    private function connectedRoleIsExemptPredicate(): string
    {
        return "(
            EXISTS (
                SELECT 1 FROM pg_catalog.pg_roles AS me
                WHERE me.rolname = current_user
                  AND (me.rolsuper OR me.rolbypassrls)
            )
            OR (
                pg_catalog.pg_has_role(current_user, cls.relowner, 'MEMBER')
                AND NOT cls.relforcerowsecurity
            )
        )";
    }

    /**
     * @return array<string, string>
     */
    private function tokens(): array
    {
        return [
            '{{RLS_RELKINDS}}' => self::RLS_RELKINDS,
            '{{CONNECTED_ROLE_IS_EXEMPT}}' => $this->connectedRoleIsExemptPredicate(),
        ];
    }

    /**
     * Stage 1. Changes nothing; raises if RLS cannot be enabled safely.
     *
     * Two classes of blocker are detected:
     *
     *  - tables whose owner the connected role cannot act as, so ALTER TABLE
     *    would fail partway through the enumeration;
     *  - tables where enabling RLS would make the connected role itself unable
     *    to read rows. This is the check that stops this migration from being
     *    an outage: if the application's own role is not exempt on even one
     *    table, nothing is enabled at all.
     */
    private function preconditionsSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_rls_preconditions$
DECLARE
    v_blockers text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Tables this migration must alter.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name,
               pg_catalog.pg_get_userbyid(cls.relowner) AS owner_name
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN {{RLS_RELKINDS}}
          AND cls.relpersistence <> 't'
          AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_depend AS dep
              WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                AND dep.objid = cls.oid AND dep.deptype = 'e'
          )
          AND NOT pg_catalog.pg_has_role(current_user, cls.relowner, 'MEMBER')
        ORDER BY 1
    LOOP
        v_blockers := v_blockers || format(
            'table %s is owned by %s, which %s cannot act as, so row level '
            'security cannot be enabled on it',
            v_row.object_name, v_row.owner_name, current_user
        );
    END LOOP;

    -- Tables where enabling RLS would lock the application out of its own data.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name,
               pg_catalog.pg_get_userbyid(cls.relowner) AS owner_name,
               cls.relforcerowsecurity AS forced
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN {{RLS_RELKINDS}}
          AND cls.relpersistence <> 't'
          AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_depend AS dep
              WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                AND dep.objid = cls.oid AND dep.deptype = 'e'
          )
          AND NOT {{CONNECTED_ROLE_IS_EXEMPT}}
        ORDER BY 1
    LOOP
        v_blockers := v_blockers || format(
            'enabling row level security on %s would deny %s its own rows: the '
            'role lacks BYPASSRLS and is not an exempt owner (owner %s, force '
            'row level security = %s). No policy exists to restore access',
            v_row.object_name, current_user, v_row.owner_name, v_row.forced
        );
    END LOOP;

    IF array_length(v_blockers, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AKAY_CONTAINMENT_PRECONDITION_FAILED',
            DETAIL = array_to_string(v_blockers, E'\n'),
            HINT = 'Containment step 2 was aborted before row level security '
                   'was enabled on any table. See '
                   'docs/database-exposure-containment.md, "Precondition '
                   'failures". Do NOT work around this by enabling RLS on a '
                   'subset of tables.';
    END IF;
END
$akay_rls_preconditions$;
SQL, $this->tokens());
    }

    /**
     * Stage 2. Enable RLS on every in-scope table.
     *
     * Tables are resolved from the catalog rather than a hard-coded list, so a
     * table added between writing this migration and running it is covered, and
     * extension-owned tables are left alone. Every name is built with
     * format('%I.%I', ...) rather than interpolated.
     *
     * Already-enabled tables are skipped rather than re-issued, so re-running
     * this step after a partial manual intervention is a no-op on those.
     */
    private function enableRowLevelSecuritySql(): string
    {
        return strtr(<<<'SQL'
DO $akay_rls_enable$
DECLARE
    v_table record;
BEGIN
    FOR v_table IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS qualified_name
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN {{RLS_RELKINDS}}
          AND cls.relpersistence <> 't'
          AND NOT cls.relrowsecurity
          AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_depend AS dep
              WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                AND dep.objid = cls.oid AND dep.deptype = 'e'
          )
        ORDER BY cls.relname
    LOOP
        EXECUTE format(
            'ALTER TABLE %s ENABLE ROW LEVEL SECURITY',
            v_table.qualified_name
        );
    END LOOP;
END
$akay_rls_enable$;
SQL, $this->tokens());
    }

    /**
     * Stage 3. Prove the deny-by-default state, or roll the whole step back.
     *
     * Four things are checked, and all four matter:
     *
     *  - every in-scope table now carries RLS. A table missed here is a table
     *    that is still readable by any role holding a privilege;
     *  - no table FORCEs RLS. Forcing it removes the owner exemption and takes
     *    the application down, so a pre-existing forced table is a failure even
     *    though this migration never sets that flag;
     *  - the connected role is still exempt on every table. This is stage 1's
     *    check repeated after the fact, because the guarantee that matters is
     *    the post-state, not the pre-state;
     *  - no policy exists on any in-scope table. RLS with a permissive policy
     *    can be weaker than no RLS at all, and this phase creates none, so any
     *    policy present is unreviewed and fails the step.
     */
    private function assertRowLevelSecuritySql(): string
    {
        return strtr(<<<'SQL'
DO $akay_rls_assertions$
DECLARE
    v_failures text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Every in-scope table must now carry RLS.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN {{RLS_RELKINDS}}
          AND cls.relpersistence <> 't'
          AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_depend AS dep
              WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                AND dep.objid = cls.oid AND dep.deptype = 'e'
          )
          AND NOT cls.relrowsecurity
        ORDER BY 1
    LOOP
        v_failures := v_failures || format(
            'row level security is still disabled on %s', v_row.object_name
        );
    END LOOP;

    -- Forcing RLS removes the owner exemption this phase depends on.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN {{RLS_RELKINDS}}
          AND cls.relpersistence <> 't'
          AND cls.relforcerowsecurity
        ORDER BY 1
    LOOP
        v_failures := v_failures || format(
            '%s forces row level security against its owner, which this phase '
            'never sets and which would deny the application its own rows',
            v_row.object_name
        );
    END LOOP;

    -- The application's role must still read every table it owns.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN {{RLS_RELKINDS}}
          AND cls.relpersistence <> 't'
          AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_depend AS dep
              WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                AND dep.objid = cls.oid AND dep.deptype = 'e'
          )
          AND NOT {{CONNECTED_ROLE_IS_EXEMPT}}
        ORDER BY 1
    LOOP
        v_failures := v_failures || format(
            '%s is no longer readable by %s after enabling row level security',
            v_row.object_name, current_user
        );
    END LOOP;

    -- No policy may hand access back. This phase creates none.
    FOR v_row IN
        SELECT format('%I.%I', pol.schemaname, pol.tablename) AS object_name,
               pol.policyname
        FROM pg_catalog.pg_policies AS pol
        WHERE pol.schemaname = 'public'
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            'unreviewed policy %s exists on %s; this phase defines no policy '
            'and deny-by-default cannot be asserted while one is present',
            v_row.policyname, v_row.object_name
        );
    END LOOP;

    IF array_length(v_failures, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AKAY_CONTAINMENT_ASSERTION_FAILED',
            DETAIL = array_to_string(v_failures, E'\n'),
            HINT = 'Every change in containment step 2 has been rolled back and '
                   'row level security is off again on every table. See '
                   'docs/database-exposure-containment.md, "Assertion failures".';
    END IF;
END
$akay_rls_assertions$;
SQL, $this->tokens());
    }
};
