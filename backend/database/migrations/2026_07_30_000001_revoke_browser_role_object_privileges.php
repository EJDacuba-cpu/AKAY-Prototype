<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 2B step 1 - revoke browser-facing role privileges on existing objects.
 *
 * Supabase provisions the browser-facing "anon" and "authenticated" roles with
 * broad privileges on every table, sequence and function in the public schema,
 * and installs default privileges that hand the same access to future objects.
 * AKAY never uses the Supabase Data API: every request is authorised by the
 * Laravel backend. The browser-facing roles therefore need no access at all.
 *
 * SCOPE
 * -----
 * This migration is the first of four, split out of the original single-file
 * 2026_07_25_000001_revoke_browser_role_database_access so that work the
 * connected role is actually permitted to perform is no longer held hostage by
 * work only a Supabase platform administrator can perform. It covers:
 *
 *   - every existing table, view, materialised view, foreign table, sequence
 *     and akay_* routine in public; and
 *   - default privileges owned by a role the connected role can act as.
 *
 * Default privileges owned by an unreachable role - supabase_admin on a managed
 * Supabase project - are explicitly OUT of scope here and are deferred to
 * database/migrations/deferred/2026_07_30_000004_deferred_supabase_admin_defaults.
 * They are reported by name at the end of stage 2 so the deferral is recorded in
 * the migration output rather than being silent.
 *
 * This migration only touches PUBLIC, anon and authenticated. The Laravel
 * connection owns these objects, and an owner's implicit privileges cannot be
 * removed by REVOKE ... FROM PUBLIC/anon/authenticated, so the running
 * application is unaffected. Nothing here reads application rows.
 *
 * FAIL-CLOSED CONTRACT
 * --------------------
 * Containment within this migration's scope is all-or-nothing. Three ordered
 * stages run inside one transaction:
 *
 *   1. PRECONDITIONS - prove that every revocation this migration needs to make
 *      is actually permitted, and RAISE EXCEPTION listing what is missing if
 *      not. No privilege is changed in this stage.
 *   2. REVOCATION    - remove object and in-scope default privileges.
 *   3. ASSERTION     - re-read the catalog and RAISE EXCEPTION unless the
 *      browser-facing grantees have been left with no effective access at all
 *      within this migration's scope.
 *
 * There is deliberately no warn-and-continue path and no override flag. A
 * partially contained database that reports a successful migration is the
 * failure mode this design exists to prevent.
 */
return new class extends Migration
{
    /**
     * PostgreSQL applies REVOKE and ALTER DEFAULT PRIVILEGES transactionally,
     * and Migrator::runMigration() wraps up() in $connection->transaction()
     * whenever the grammar supports schema transactions - which the PostgreSQL
     * grammar does - and this property is true. Any RAISE EXCEPTION below
     * therefore rolls this step back, and the migrations table row is never
     * written. The other three steps are separate migrations and therefore
     * separate transactions, which is the entire point of the split.
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
        DB::unprepared($this->revokeObjectPrivilegesSql());
        DB::unprepared($this->revokeDefaultPrivilegesSql());
        DB::unprepared($this->assertContainmentSql());
    }

    /**
     * Deliberately non-reopening.
     *
     * Rolling a security containment migration back must never hand table,
     * sequence or function access back to PUBLIC, anon or authenticated: a
     * routine `migrate:rollback` during an unrelated deployment would silently
     * re-expose every patient row to anyone holding the public anon key.
     *
     * If a restore is genuinely required, capture the pre-migration ACLs first
     * (see docs/database-exposure-containment-preflight.sql, "PRE-MIGRATION
     * PRIVILEGE SNAPSHOT") and replay only the reviewed privileges from that
     * snapshot by hand, under the manual rollback procedure documented in
     * docs/database-exposure-containment.md.
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
     * Stage 1. Changes nothing; raises if containment cannot be completed
     * WITHIN THIS MIGRATION'S SCOPE.
     *
     * Two classes of blocker are detected:
     *
     *  - relations and routines whose owner the connected role cannot act as,
     *    so REVOKE would fail or silently leave privileges in place;
     *  - the postgres role specifically, which is treated as required whenever
     *    it owns objects in public or holds an unsafe default-privilege entry,
     *    because PostgreSQL's built-in default hands EXECUTE on new functions to
     *    PUBLIC even when pg_default_acl holds no row at all.
     *
     * Unreachable default-privilege owners are deliberately NOT blockers here.
     * The original single-file migration treated them as such, which meant one
     * unreachable platform role aborted every revocation this migration is
     * fully permitted to perform. They are deferred to step 4 instead, and
     * stage 3 below scopes its assertions to match so the deferral cannot be
     * mistaken for containment.
     *
     * pg_has_role(..., 'MEMBER') is the correct test: ALTER DEFAULT PRIVILEGES
     * FOR ROLE x and REVOKE on an object owned by x both require membership in
     * x, which is satisfied by a non-inheriting (SET ROLE) membership too.
     */
    private function preconditionsSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_objects_preconditions$
DECLARE
    v_blockers text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Relations this migration must revoke on.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name,
               pg_catalog.pg_get_userbyid(cls.relowner) AS owner_name
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
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
            'relation %s is owned by %s, which %s cannot act as',
            v_row.object_name, v_row.owner_name, current_user
        );
    END LOOP;

    -- Routines this migration must revoke on.
    FOR v_row IN
        SELECT format(
                   '%I.%I(%s)', ns.nspname, pro.proname,
                   pg_catalog.pg_get_function_identity_arguments(pro.oid)
               ) AS object_name,
               pg_catalog.pg_get_userbyid(pro.proowner) AS owner_name
        FROM pg_catalog.pg_proc AS pro
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
        WHERE ns.nspname = 'public'
          AND pro.proname LIKE 'akay\_%'
          AND pro.prokind IN ('f', 'p')
          AND NOT EXISTS (
              SELECT 1 FROM pg_catalog.pg_depend AS dep
              WHERE dep.classid = 'pg_catalog.pg_proc'::regclass
                AND dep.objid = pro.oid AND dep.deptype = 'e'
          )
          AND NOT pg_catalog.pg_has_role(current_user, pro.proowner, 'MEMBER')
        ORDER BY 1
    LOOP
        v_blockers := v_blockers || format(
            'routine %s is owned by %s, which %s cannot act as',
            v_row.object_name, v_row.owner_name, current_user
        );
    END LOOP;

    -- postgres creates the application's objects in public. If it is relevant
    -- here, its default privileges MUST be modifiable, because the built-in
    -- default hands EXECUTE on new functions to PUBLIC even when pg_default_acl
    -- holds no row at all. supabase_admin is deliberately absent from this
    -- check; step 4 owns it.
    FOR v_row IN
        SELECT rol.rolname AS owner_name
        FROM pg_catalog.pg_roles AS rol
        WHERE rol.rolname = 'postgres'
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
            HINT = 'Containment step 1 was aborted before any privilege was '
                   'changed. Resolve every listed blocker - see '
                   'docs/database-exposure-containment.md, "Precondition '
                   'failures" - then re-run the migration.';
    END IF;
END
$akay_objects_preconditions$;
SQL, $this->defaultPrivilegeTokens());
    }

    /**
     * Stage 2a. Existing tables, sequences and akay_* routines in public.
     *
     * Objects are resolved from the catalog rather than a hard-coded list so
     * that drift and function overloads are covered, and extension-owned
     * objects are excluded so installing pgcrypto or similar is not broken.
     *
     * REVOKE ALL PRIVILEGES ON TABLE also removes column-level grants from the
     * same grantee (PostgreSQL revokes matching pg_attribute.attacl entries
     * alongside the table-level ones); stage 3 verifies that it did.
     *
     * Unchanged from the original single-file migration.
     */
    private function revokeObjectPrivilegesSql(): string
    {
        return <<<'SQL'
DO $akay_objects_revoke$
DECLARE
    -- PUBLIC is a keyword, not a role, so it is never quote_ident()ed.
    v_grantees text[] := ARRAY['PUBLIC'];
    v_browser_role text;
    v_grantee text;
    v_relation record;
    v_sequence record;
    v_routine record;
BEGIN
    FOREACH v_browser_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_browser_role
        ) THEN
            v_grantees := v_grantees || pg_catalog.quote_ident(v_browser_role);
        ELSE
            RAISE NOTICE
                'AKAY containment: role % is absent; nothing to revoke from it.',
                v_browser_role;
        END IF;
    END LOOP;

    FOREACH v_grantee IN ARRAY v_grantees
    LOOP
        FOR v_relation IN
            SELECT format('%I.%I', ns.nspname, cls.relname) AS qualified_name
            FROM pg_catalog.pg_class AS cls
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = 'public'
              AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND cls.relpersistence <> 't'
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_depend AS dep
                  WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                    AND dep.objid = cls.oid AND dep.deptype = 'e'
              )
            ORDER BY cls.relname
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE %s FROM %s',
                v_relation.qualified_name, v_grantee
            );
        END LOOP;

        FOR v_sequence IN
            SELECT format('%I.%I', ns.nspname, cls.relname) AS qualified_name
            FROM pg_catalog.pg_class AS cls
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = 'public'
              AND cls.relkind = 'S'
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_depend AS dep
                  WHERE dep.classid = 'pg_catalog.pg_class'::regclass
                    AND dep.objid = cls.oid AND dep.deptype = 'e'
              )
            ORDER BY cls.relname
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %s',
                v_sequence.qualified_name, v_grantee
            );
        END LOOP;

        -- One row per pg_proc entry, so every overload is revoked separately
        -- under its own complete identity signature.
        FOR v_routine IN
            SELECT
                CASE WHEN pro.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END
                    AS routine_kind,
                format(
                    '%I.%I(%s)', ns.nspname, pro.proname,
                    pg_catalog.pg_get_function_identity_arguments(pro.oid)
                ) AS qualified_signature
            FROM pg_catalog.pg_proc AS pro
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
            WHERE ns.nspname = 'public'
              AND pro.proname LIKE 'akay\_%'
              AND pro.prokind IN ('f', 'p')
              AND NOT EXISTS (
                  SELECT 1 FROM pg_catalog.pg_depend AS dep
                  WHERE dep.classid = 'pg_catalog.pg_proc'::regclass
                    AND dep.objid = pro.oid AND dep.deptype = 'e'
              )
            ORDER BY pro.proname, qualified_signature
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON %s %s FROM %s',
                v_routine.routine_kind, v_routine.qualified_signature, v_grantee
            );
        END LOOP;
    END LOOP;
END
$akay_objects_revoke$;
SQL;
    }

    /**
     * Stage 2b. Objects created later, for every owner the connected role can
     * act as.
     *
     * Every reachable pg_default_acl entry with an unsafe grantee is revoked at
     * its own scope - schema-qualified entries with IN SCHEMA, global entries
     * without - because the two are stored and applied separately.
     *
     * postgres is additionally revoked in schema public unconditionally.
     * pg_default_acl holds no row until a default is modified, so the built-in
     * default (EXECUTE on new functions to PUBLIC) is invisible to the
     * enumeration above and has to be overridden explicitly.
     *
     * Unreachable owners are enumerated and reported by name as deferred to
     * step 4. This is a NOTICE, not a WARNING: nothing here is being skipped
     * silently, and stage 3 excludes exactly the same set from its assertions
     * so no unreachable owner can be mistaken for a contained one.
     *
     * TYPES are left alone: removing PUBLIC USAGE on types has no security
     * benefit here and breaks ordinary schema use.
     */
    private function revokeDefaultPrivilegesSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_objects_default_privileges$
DECLARE
    v_grantees text[] := ARRAY['PUBLIC'];
    v_browser_role text;
    v_grantee text;
    v_object_type text;
    v_entry record;
    v_deferred record;
BEGIN
    FOREACH v_browser_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_browser_role
        ) THEN
            v_grantees := v_grantees || pg_catalog.quote_ident(v_browser_role);
        END IF;
    END LOOP;

    -- Existing unsafe entries, at whatever scope and owner they were made,
    -- limited to owners this role can act as.
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
          AND pg_catalog.pg_has_role(current_user, def.defaclrole, 'MEMBER')
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

    -- Override the built-in defaults for the role that creates this
    -- application's objects. Stage 1 has already proven membership.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres')
       AND pg_catalog.pg_has_role(current_user, 'postgres', 'MEMBER') THEN
        FOREACH v_grantee IN ARRAY v_grantees
        LOOP
            FOREACH v_object_type IN ARRAY ARRAY['TABLES', 'SEQUENCES', 'FUNCTIONS']
            LOOP
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM %s',
                    'postgres', v_object_type, v_grantee
                );
            END LOOP;
        END LOOP;
    END IF;

    -- Record what this migration is knowingly leaving for step 4.
    FOR v_deferred IN
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
        RAISE NOTICE
            'AKAY containment step 1: default privileges owned by % in % are '
            'out of scope for this step and are DEFERRED to step 4 '
            '(deferred_supabase_admin_defaults). % cannot act as that role.',
            v_deferred.owner_name, v_deferred.schema_scope, current_user;
    END LOOP;
END
$akay_objects_default_privileges$;
SQL, $this->defaultPrivilegeTokens());
    }

    /**
     * Stage 3. Prove containment within this migration's scope, or roll the
     * whole step back.
     *
     * These are effective-privilege checks, not ACL-entry checks:
     * has_table_privilege / has_any_column_privilege / has_function_privilege
     * resolve privileges granted directly, privileges inherited through role
     * membership, and privileges handed to PUBLIC. A browser-facing role that
     * still reaches a table by being a member of some third role - something
     * revoking from anon directly would never fix - fails here.
     *
     * SCOPING: the effective-default check covers postgres only, and the
     * stored-entry check covers only owners this role can act as. Both
     * deliberately exclude the deferred set, which step 4 asserts on. An
     * unreachable owner must not be able to fail this step - that was the
     * original design's defect - and equally must not be able to pass it by
     * omission, which is why step 4 exists and is documented as required.
     */
    private function assertContainmentSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_objects_assertions$
DECLARE
    v_failures text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Effective table access, including privileges inherited from other roles.
    FOR v_row IN
        SELECT browser.rolname AS role_name,
               format('%I.%I', ns.nspname, cls.relname) AS object_name
        FROM pg_catalog.pg_roles AS browser
        CROSS JOIN pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE browser.rolname IN ('anon', 'authenticated')
          AND ns.nspname = 'public'
          AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND cls.relpersistence <> 't'
          AND has_table_privilege(
                  browser.oid, cls.oid,
                  'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
              )
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            '%s retains effective table access to %s',
            v_row.role_name, v_row.object_name
        );
    END LOOP;

    -- Column-level grants survive independently of table-level ones whenever
    -- they were granted separately, so they are checked separately.
    FOR v_row IN
        SELECT browser.rolname AS role_name,
               format('%I.%I', ns.nspname, cls.relname) AS object_name
        FROM pg_catalog.pg_roles AS browser
        CROSS JOIN pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE browser.rolname IN ('anon', 'authenticated')
          AND ns.nspname = 'public'
          AND cls.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND cls.relpersistence <> 't'
          AND has_any_column_privilege(
                  browser.oid, cls.oid, 'SELECT, INSERT, UPDATE, REFERENCES'
              )
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            '%s retains a column-level privilege on %s',
            v_row.role_name, v_row.object_name
        );
    END LOOP;

    -- Raw ACL entries for PUBLIC, which has no pg_roles row to test against.
    FOR v_row IN
        SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name,
               acl.privilege_type
        FROM pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        CROSS JOIN LATERAL aclexplode(
            COALESCE(cls.relacl, acldefault(
                CASE WHEN cls.relkind = 'S' THEN 's' ELSE 'r' END, cls.relowner
            ))
        ) AS acl
        WHERE ns.nspname = 'public'
          AND cls.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND cls.relpersistence <> 't'
          AND acl.grantee = 0
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            'PUBLIC retains %s on %s', v_row.privilege_type, v_row.object_name
        );
    END LOOP;

    -- Sequences, by effective privilege.
    FOR v_row IN
        SELECT browser.rolname AS role_name,
               format('%I.%I', ns.nspname, cls.relname) AS object_name
        FROM pg_catalog.pg_roles AS browser
        CROSS JOIN pg_catalog.pg_class AS cls
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
        WHERE browser.rolname IN ('anon', 'authenticated')
          AND ns.nspname = 'public'
          AND cls.relkind = 'S'
          AND has_sequence_privilege(browser.oid, cls.oid, 'USAGE, SELECT, UPDATE')
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            '%s retains effective access to sequence %s',
            v_row.role_name, v_row.object_name
        );
    END LOOP;

    -- Every akay_* overload, by effective privilege and by PUBLIC ACL entry.
    FOR v_row IN
        SELECT browser.rolname AS role_name,
               format(
                   '%I.%I(%s)', ns.nspname, pro.proname,
                   pg_catalog.pg_get_function_identity_arguments(pro.oid)
               ) AS object_name
        FROM pg_catalog.pg_roles AS browser
        CROSS JOIN pg_catalog.pg_proc AS pro
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
        WHERE browser.rolname IN ('anon', 'authenticated')
          AND ns.nspname = 'public'
          AND pro.proname LIKE 'akay\_%'
          AND has_function_privilege(browser.oid, pro.oid, 'EXECUTE')
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            '%s retains EXECUTE on %s', v_row.role_name, v_row.object_name
        );
    END LOOP;

    FOR v_row IN
        SELECT format(
                   '%I.%I(%s)', ns.nspname, pro.proname,
                   pg_catalog.pg_get_function_identity_arguments(pro.oid)
               ) AS object_name
        FROM pg_catalog.pg_proc AS pro
        JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
        CROSS JOIN LATERAL aclexplode(
            COALESCE(pro.proacl, acldefault('f', pro.proowner))
        ) AS acl
        WHERE ns.nspname = 'public'
          AND pro.proname LIKE 'akay\_%'
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
        ORDER BY 1
    LOOP
        v_failures := v_failures || format(
            'PUBLIC retains EXECUTE on %s', v_row.object_name
        );
    END LOOP;

    -- Future objects created by postgres. The effective default is the stored
    -- entry when one exists and the built-in default otherwise, so both are
    -- resolved here. supabase_admin is step 4's assertion, not this one's.
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
            WHERE rol.rolname = 'postgres'
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

    -- Any remaining unsafe stored entry owned by a role this one can act as.
    -- Unreachable owners are step 4's scope and are excluded here by the same
    -- predicate stage 2b used to defer them.
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
          AND pg_catalog.pg_has_role(current_user, def.defaclrole, 'MEMBER')
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
            HINT = 'Every privilege change in containment step 1 has been '
                   'rolled back. See docs/database-exposure-containment.md, '
                   '"Assertion failures".';
    END IF;
END
$akay_objects_assertions$;
SQL, $this->defaultPrivilegeTokens());
    }
};
