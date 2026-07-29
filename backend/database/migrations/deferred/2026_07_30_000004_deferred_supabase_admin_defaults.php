<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 2B step 4 - DEFERRED. Secure the default privileges this phase cannot
 * reach, and close containment out.
 *
 * ============================================================================
 * THIS FILE IS NOT IN THE MIGRATION PATH, AND THAT IS DELIBERATE.
 * ============================================================================
 * Migrator::getMigrationFiles() globs each registered path with '/*_*.php' and
 * does not recurse, so nothing in database/migrations/deferred is ever
 * discovered by `php artisan migrate`. That is the whole point: on a managed
 * Supabase project this migration CANNOT succeed today, and a migration that
 * cannot succeed must not sit in the pending set breaking every deployment -
 * which is exactly the state the original single-file
 * 2026_07_25_000001_revoke_browser_role_database_access left the repository in.
 *
 * Move this file up one directory - and only then - once the blocker below is
 * resolved. Renaming it to a current timestamp at that point is fine; it has
 * never been applied anywhere.
 *
 * THE BLOCKER
 * -----------
 * Supabase's project bootstrap stores default-privilege entries owned by
 * supabase_admin that hand every future table, sequence and function in public
 * to anon and authenticated. Removing them requires ALTER DEFAULT PRIVILEGES
 * FOR ROLE supabase_admin, which PostgreSQL permits only to a member of
 * supabase_admin.
 *
 * On a managed project the Laravel connection, the pooler and the dashboard SQL
 * editor all authenticate as postgres, which is not a member of supabase_admin
 * and cannot make itself one - that would require superuser or ADMIN OPTION on
 * the role. There is therefore no self-service path, and the remediation is a
 * Supabase support request. Record the ticket reference in
 * docs/database-exposure-containment.md before moving this file.
 *
 * WHY DEFERRING IT IS ACCEPTABLE
 * ------------------------------
 * These defaults only ever apply to objects supabase_admin itself creates in
 * public. AKAY's tables and routines are created by Laravel migrations
 * connecting as postgres, and inherit postgres's defaults, which step 1 already
 * secured. Step 3 then removed USAGE on schema public from anon and
 * authenticated, so a role that cannot resolve names in the schema gains
 * nothing from a default privilege on an object inside it.
 *
 * The residual risk is therefore narrow and conditional, not open: it matters
 * only if step 3 is ever reversed. It is still tracked to completion here
 * rather than written off, because "narrow" is not "none".
 *
 * FAIL-CLOSED CONTRACT
 * --------------------
 *   1. PRECONDITIONS - raise if any unsafe default entry is owned by a role
 *      this connection cannot act as. Changes nothing.
 *   2. REVOCATION    - remove every unsafe entry, at every scope, for every
 *      owner.
 *   3. ASSERTION     - raise unless NO unsafe stored entry remains anywhere,
 *      owned by anyone, and the effective defaults of both object-creating
 *      roles are safe. This is the unscoped, phase-closing assertion that
 *      steps 1 to 3 each deliberately narrowed.
 */
return new class extends Migration
{
    /**
     * ALTER DEFAULT PRIVILEGES is transactional in PostgreSQL, so a failed
     * stage 3 rolls every change back and the migrations table row is never
     * written.
     */
    public $withinTransaction = true;

    /**
     * Resolves an aclexplode() row's grantee to a role name, or the literal
     * 'PUBLIC' for grantee 0, which has no pg_roles entry.
     */
    private const ACL_GRANTEE_NAME = "CASE WHEN acl.grantee = 0 THEN 'PUBLIC' "
        ."ELSE pg_catalog.pg_get_userbyid(acl.grantee) END";

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $this->assertRunningInATransaction();

        // Order matters. Preconditions must be proven before anything changes,
        // and the assertions must run after everything has changed.
        DB::unprepared($this->preconditionsSql());
        DB::unprepared($this->revokeDefaultPrivilegesSql());
        DB::unprepared($this->assertDefaultPrivilegesSql());
    }

    /**
     * Deliberately non-reopening.
     *
     * Restoring a default privilege that hands every future object to anon is
     * not something a routine `migrate:rollback` may do as a side effect of an
     * unrelated deployment. See docs/database-exposure-containment.md.
     */
    public function down(): void
    {
        // No automatic privilege restoration. See the method docblock.
    }

    /**
     * Guards against the migration being executed outside a transaction - for
     * example by being invoked directly, or on a connection whose grammar does
     * not support schema transactions - which would allow stage 2 to leave
     * partial privilege changes behind when stage 3 fails.
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
                .'assertion rolls back every privilege change. Run it through '
                .'`php artisan migrate`, which wraps migrations in a transaction '
                .'on PostgreSQL.'
            );
        }
    }

    /**
     * Which pg_default_acl grants count as unsafe, inlined at each call site so
     * the migration creates no database object of its own.
     *
     * anon and authenticated must receive no default at all on tables,
     * sequences, functions or schemas. PUBLIC is unsafe on the same object
     * types minus schemas - notably on functions, where PostgreSQL's built-in
     * default hands EXECUTE to PUBLIC unless a stored entry overrides it.
     * TYPES are excluded: PUBLIC USAGE on types is normal and carries no data.
     */
    private function unsafeDefaultPredicate(string $objectType): string
    {
        $grantee = self::ACL_GRANTEE_NAME;

        return "(
            (({$grantee}) IN ('anon', 'authenticated')
                AND {$objectType} IN ('r', 'S', 'f', 'n'))
            OR (({$grantee}) = 'PUBLIC'
                AND {$objectType} IN ('r', 'S', 'f'))
        )";
    }

    /**
     * @return array<string, string>
     */
    private function defaultPrivilegeTokens(): array
    {
        return [
            // Entries physically stored in pg_default_acl.
            '{{UNSAFE_STORED_DEFAULT}}' => $this->unsafeDefaultPredicate('def.defaclobjtype'),
            // Effective defaults, resolved against acldefault() when no row exists.
            '{{UNSAFE_EFFECTIVE_DEFAULT}}' => $this->unsafeDefaultPredicate('owners.objtype'),
        ];
    }

    /**
     * Stage 1. Changes nothing; raises if any unsafe default is unreachable.
     *
     * Owners are enumerated from pg_default_acl rather than assumed, so an
     * unsafe entry owned by a third role is caught here too, not just the
     * supabase_admin entries Supabase installs. postgres and supabase_admin are
     * additionally checked whenever either is relevant, because the built-in
     * default hands EXECUTE on new functions to PUBLIC even when pg_default_acl
     * holds no row at all and is therefore invisible to enumeration.
     */
    private function preconditionsSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_deferred_preconditions$
DECLARE
    v_blockers text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Every default-privilege owner with an unsafe entry, whoever it is.
    FOR v_row IN
        SELECT DISTINCT
               pg_catalog.pg_get_userbyid(def.defaclrole) AS owner_name,
               COALESCE(ns.nspname, '(all schemas)') AS schema_scope
        FROM pg_catalog.pg_default_acl AS def
        LEFT JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
        CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
        WHERE {{UNSAFE_STORED_DEFAULT}}
          AND NOT pg_catalog.pg_has_role(current_user, def.defaclrole, 'MEMBER')
        ORDER BY 1, 2
    LOOP
        v_blockers := v_blockers || format(
            'default privileges owned by %s in %s hand future objects to a '
            'browser-facing grantee, and %s cannot act as that role',
            v_row.owner_name, v_row.schema_scope, current_user
        );
    END LOOP;

    -- postgres and supabase_admin create objects in public. If either exists
    -- and is relevant here, its default privileges MUST be modifiable.
    FOR v_row IN
        SELECT rol.rolname AS owner_name
        FROM pg_catalog.pg_roles AS rol
        WHERE rol.rolname IN ('postgres', 'supabase_admin')
          AND NOT pg_catalog.pg_has_role(current_user, rol.oid, 'MEMBER')
          AND (
              EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_class AS cls
                  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
                  WHERE ns.nspname = 'public' AND cls.relowner = rol.oid
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_proc AS pro
                  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
                  WHERE ns.nspname = 'public' AND pro.proowner = rol.oid
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_default_acl AS def
                  CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
                  WHERE def.defaclrole = rol.oid
                    AND {{UNSAFE_STORED_DEFAULT}}
              )
          )
        ORDER BY 1
    LOOP
        v_blockers := v_blockers || format(
            'role %s creates objects in public but %s is not a member of it, so '
            'its default privileges cannot be secured',
            v_row.owner_name, current_user
        );
    END LOOP;

    IF array_length(v_blockers, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AKAY_CONTAINMENT_PRECONDITION_FAILED',
            DETAIL = array_to_string(v_blockers, E'\n'),
            HINT = 'Containment step 4 was aborted before any privilege was '
                   'changed. On a managed Supabase project this is expected '
                   'until the platform removes supabase_admin default '
                   'privileges on your behalf: there is no self-service path, '
                   'because postgres cannot make itself a member of '
                   'supabase_admin. Raise a Supabase support request, record '
                   'its reference in docs/database-exposure-containment.md, '
                   'and move this file back into database/migrations only once '
                   'it is resolved.';
    END IF;
END
$akay_deferred_preconditions$;
SQL, $this->defaultPrivilegeTokens());
    }

    /**
     * Stage 2. Every unsafe entry, at its own scope.
     *
     * Schema-qualified entries are revoked with IN SCHEMA and global entries
     * without, because the two are stored and applied separately. postgres and
     * supabase_admin are additionally revoked in schema public unconditionally,
     * because pg_default_acl holds no row until a default is modified, so the
     * built-in default is invisible to the enumeration above.
     *
     * TYPES are left alone: removing PUBLIC USAGE on types has no security
     * benefit here and breaks ordinary schema use.
     */
    private function revokeDefaultPrivilegesSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_deferred_revoke$
DECLARE
    v_grantees text[] := ARRAY['PUBLIC'];
    v_browser_role text;
    v_owner text;
    v_grantee text;
    v_object_type text;
    v_entry record;
BEGIN
    FOREACH v_browser_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_browser_role
        ) THEN
            v_grantees := v_grantees || pg_catalog.quote_ident(v_browser_role);
        END IF;
    END LOOP;

    -- Existing unsafe entries, at whatever scope and owner they were made.
    FOR v_entry IN
        SELECT DISTINCT
               pg_catalog.quote_ident(
                   pg_catalog.pg_get_userbyid(def.defaclrole)
               ) AS owner_ident,
               ns.nspname AS schema_name,
               CASE def.defaclobjtype
                   WHEN 'r' THEN 'TABLES'
                   WHEN 'S' THEN 'SEQUENCES'
                   WHEN 'f' THEN 'FUNCTIONS'
                   WHEN 'n' THEN 'SCHEMAS'
               END AS object_type
        FROM pg_catalog.pg_default_acl AS def
        LEFT JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
        CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
        WHERE {{UNSAFE_STORED_DEFAULT}}
    LOOP
        FOREACH v_grantee IN ARRAY v_grantees
        LOOP
            IF v_entry.schema_name IS NULL THEN
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %s REVOKE ALL ON %s FROM %s',
                    v_entry.owner_ident, v_entry.object_type, v_grantee
                );
            ELSE
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA %I REVOKE ALL ON %s FROM %s',
                    v_entry.owner_ident, v_entry.schema_name,
                    v_entry.object_type, v_grantee
                );
            END IF;
        END LOOP;
    END LOOP;

    -- Override the built-in defaults for the roles that create objects here.
    -- Stage 1 has already proven membership for both.
    FOREACH v_owner IN ARRAY ARRAY['postgres', 'supabase_admin']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_owner
        ) THEN
            CONTINUE;
        END IF;

        IF NOT pg_catalog.pg_has_role(current_user, v_owner, 'MEMBER') THEN
            CONTINUE;
        END IF;

        FOREACH v_grantee IN ARRAY v_grantees
        LOOP
            FOREACH v_object_type IN ARRAY ARRAY['TABLES', 'SEQUENCES', 'FUNCTIONS']
            LOOP
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM %s',
                    v_owner, v_object_type, v_grantee
                );
            END LOOP;
        END LOOP;
    END LOOP;
END
$akay_deferred_revoke$;
SQL, $this->defaultPrivilegeTokens());
    }

    /**
     * Stage 3. The phase-closing assertion.
     *
     * Unlike steps 1 to 3, nothing here is scoped: no unsafe stored entry may
     * remain at any scope owned by anyone, and the effective defaults of both
     * object-creating roles must be safe. Passing this is what allows Phase 2B
     * to be recorded as complete rather than partial.
     */
    private function assertDefaultPrivilegesSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_deferred_assertions$
DECLARE
    v_failures text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Future objects. The effective default is the stored entry when one
    -- exists and the built-in default otherwise, so both are resolved here.
    FOR v_row IN
        SELECT pg_catalog.pg_get_userbyid(owners.roleoid) AS owner_name,
               owners.objtype,
               CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_name,
               acl.privilege_type
        FROM (
            SELECT rol.oid AS roleoid, t.objtype
            FROM pg_catalog.pg_roles AS rol
            CROSS JOIN (VALUES ('r'), ('S'), ('f')) AS t(objtype)
            WHERE rol.rolname IN ('postgres', 'supabase_admin')
        ) AS owners
        CROSS JOIN LATERAL (
            SELECT COALESCE(
                (SELECT def.defaclacl
                 FROM pg_catalog.pg_default_acl AS def
                 JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
                 WHERE def.defaclrole = owners.roleoid
                   AND def.defaclobjtype = owners.objtype
                   AND ns.nspname = 'public'),
                acldefault(owners.objtype, owners.roleoid)
            ) AS effective_acl
        ) AS resolved
        CROSS JOIN LATERAL aclexplode(resolved.effective_acl) AS acl
        WHERE {{UNSAFE_EFFECTIVE_DEFAULT}}
        ORDER BY 1, 2, 3
    LOOP
        v_failures := v_failures || format(
            'future %s created by %s would hand %s to %s',
            v_row.objtype, v_row.owner_name, v_row.privilege_type,
            v_row.grantee_name
        );
    END LOOP;

    -- Any remaining unsafe stored entry, at any scope, owned by anyone.
    FOR v_row IN
        SELECT pg_catalog.pg_get_userbyid(def.defaclrole) AS owner_name,
               COALESCE(ns.nspname, '(all schemas)') AS schema_scope,
               def.defaclobjtype AS objtype,
               CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee_name
        FROM pg_catalog.pg_default_acl AS def
        LEFT JOIN pg_catalog.pg_namespace AS ns ON ns.oid = def.defaclnamespace
        CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
        WHERE {{UNSAFE_STORED_DEFAULT}}
        ORDER BY 1, 2, 3, 4
    LOOP
        v_failures := v_failures || format(
            'default privileges owned by %s in %s still hand %s objects to %s',
            v_row.owner_name, v_row.schema_scope, v_row.objtype,
            v_row.grantee_name
        );
    END LOOP;

    IF array_length(v_failures, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AKAY_CONTAINMENT_ASSERTION_FAILED',
            DETAIL = array_to_string(v_failures, E'\n'),
            HINT = 'Every privilege change in containment step 4 has been '
                   'rolled back. See docs/database-exposure-containment.md, '
                   '"Assertion failures".';
    END IF;
END
$akay_deferred_assertions$;
SQL, $this->defaultPrivilegeTokens());
    }
};
