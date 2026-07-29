<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Phase 2B step 3 - remove the browser-facing roles from schema public.
 *
 * Steps 1 and 2 removed privileges and added deny-by-default row filtering on
 * the objects that exist today. This step removes the browser-facing roles'
 * ability to resolve names in schema public at all. A role without USAGE on a
 * schema cannot use any object in it, present or future, whatever privileges it
 * may later be handed - which is why this is the single strongest containment
 * statement available here, and why it is what makes the deferred
 * supabase_admin default privileges (step 4) practically harmless in the
 * meantime: a default privilege on a future table is worthless to a role that
 * cannot see the schema the table lives in.
 *
 * WHY PUBLIC IS ALSO REVOKED, AND WHAT THAT COSTS
 * ----------------------------------------------
 * PostgreSQL hands USAGE on schema public to PUBLIC by default, and
 * has_schema_privilege() resolves privileges reaching a role through PUBLIC.
 * Revoking from anon and authenticated alone therefore changes nothing
 * measurable - both would still resolve names through PUBLIC. The pseudo-role
 * PUBLIC must be revoked too, and that is a change with a blast radius beyond
 * the two browser roles: every role that was relying on PUBLIC's USAGE rather
 * than a direct entry of its own loses it.
 *
 * Stage 1 therefore computes the post-revoke state for the roles the platform
 * and the application actually depend on, and refuses to proceed if any of them
 * would lose access. Roles outside that set that would lose USAGE are reported
 * by name so the blast radius is visible in the migration output rather than
 * discovered afterwards.
 *
 * This migration never re-grants anything: repairing a role that legitimately
 * needs USAGE is a reviewed, named change, not something a containment
 * migration performs on its own initiative. Nothing here reads application
 * rows.
 *
 * FAIL-CLOSED CONTRACT
 * --------------------
 *   1. PRECONDITIONS - prove the schema owner is reachable and that no
 *      depended-on role loses USAGE. Changes nothing.
 *   2. REVOCATION    - remove schema privileges from PUBLIC, anon and
 *      authenticated.
 *   3. ASSERTION     - re-read the catalog and RAISE EXCEPTION unless neither
 *      browser role retains any effective schema privilege and every
 *      depended-on role still holds USAGE.
 */
return new class extends Migration
{
    /**
     * REVOKE on a schema is transactional in PostgreSQL, so a failed stage 3
     * restores every schema privilege and the migrations table row is never
     * written.
     */
    public $withinTransaction = true;

    /**
     * Roles whose loss of USAGE on public is treated as a hard blocker.
     *
     * current_user is added at runtime and is the one that matters most: it is
     * the role Laravel connects as. postgres owns the application's objects.
     * service_role is the Supabase server-side role; AKAY does not use it, but
     * silently breaking it belongs to the separate, reviewed decision tracked
     * as residual exposure, not to this step.
     *
     * Deliberately NOT included: authenticator and the supabase_*_admin roles.
     * authenticator exists to switch into anon/authenticated for the Data API,
     * which Phase 2A disabled, and the *_admin roles operate in their own
     * schemas. Blocking containment on them would stall the phase for no
     * security or availability benefit - but they are still reported by name in
     * stage 2's blast-radius notice if they lose access.
     */
    private const DEPENDED_ON_ROLES = "('postgres', 'service_role')";

    private const BROWSER_ROLES = "('anon', 'authenticated')";

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $this->assertRunningInATransaction();

        // Order matters. Preconditions must be proven before anything changes,
        // and the assertions must run after everything has changed.
        DB::unprepared($this->preconditionsSql());
        DB::unprepared($this->revokeSchemaUsageSql());
        DB::unprepared($this->assertSchemaUsageSql());
    }

    /**
     * Deliberately non-reopening.
     *
     * Restoring USAGE on schema public to anon and authenticated re-opens the
     * entire containment surface in one statement. A routine `migrate:rollback`
     * during an unrelated deployment must never be able to do that. The
     * reviewed manual procedure is in docs/database-exposure-containment.md.
     */
    public function down(): void
    {
        // No automatic re-opening. See the method docblock.
    }

    /**
     * Guards against the migration being executed outside a transaction - for
     * example by being invoked directly, or on a connection whose grammar does
     * not support schema transactions - which would allow stage 2 to leave the
     * schema partially revoked when stage 3 fails.
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
     * Whether role {{ROLE}} would still hold USAGE on schema public once the
     * entries for PUBLIC, anon and authenticated are gone.
     *
     * Three independent ways to retain it, resolved against the catalog rather
     * than assumed: the role is a superuser; the role can act as the schema
     * owner, whose privileges are implicit in ownership and carry no ACL entry;
     * or the role can act as some surviving grantee. The surviving-grantee test
     * is what makes this a prediction rather than a guess - it filters exactly
     * the entries stage 2 is about to remove.
     *
     * Inlined at each call site so the migration creates no database object of
     * its own.
     */
    private function retainsUsagePredicate(string $roleOid): string
    {
        return "(
            EXISTS (
                SELECT 1 FROM pg_catalog.pg_roles AS sup
                WHERE sup.oid = {$roleOid} AND sup.rolsuper
            )
            OR pg_catalog.pg_has_role({$roleOid}, ns.nspowner, 'USAGE')
            OR EXISTS (
                SELECT 1
                FROM aclexplode(
                    COALESCE(ns.nspacl, acldefault('n', ns.nspowner))
                ) AS surviving
                WHERE surviving.privilege_type = 'USAGE'
                  AND surviving.grantee <> 0
                  AND pg_catalog.pg_get_userbyid(surviving.grantee)
                      NOT IN ('anon', 'authenticated')
                  AND pg_catalog.pg_has_role({$roleOid}, surviving.grantee, 'USAGE')
            )
        )";
    }

    /**
     * @return array<string, string>
     */
    private function tokens(): array
    {
        return [
            '{{DEPENDED_ON_ROLES}}' => self::DEPENDED_ON_ROLES,
            '{{BROWSER_ROLES}}' => self::BROWSER_ROLES,
            '{{ROLE_RETAINS_USAGE}}' => $this->retainsUsagePredicate('rol.oid'),
        ];
    }

    /**
     * Stage 1. Changes nothing; raises if the schema cannot be closed safely.
     *
     * Two classes of blocker are detected:
     *
     *  - schema public is missing, or its owner is a role the connected role
     *    cannot act as, so REVOKE would fail outright;
     *  - a depended-on role - the connected role itself, postgres, or
     *    service_role - would lose USAGE. This is the check that stops this
     *    migration from being an outage.
     */
    private function preconditionsSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_schema_preconditions$
DECLARE
    v_blockers text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'public'
    ) THEN
        v_blockers := v_blockers || 'schema public does not exist';
    END IF;

    -- The connected role must be able to act as the schema owner.
    FOR v_row IN
        SELECT format('%I', ns.nspname) AS schema_name,
               pg_catalog.pg_get_userbyid(ns.nspowner) AS owner_name
        FROM pg_catalog.pg_namespace AS ns
        WHERE ns.nspname = 'public'
          AND NOT pg_catalog.pg_has_role(current_user, ns.nspowner, 'MEMBER')
        ORDER BY 1
    LOOP
        v_blockers := v_blockers || format(
            'schema %s is owned by %s, which %s cannot act as, so its '
            'privileges cannot be revoked',
            v_row.schema_name, v_row.owner_name, current_user
        );
    END LOOP;

    -- Roles that must not lose USAGE, including the one Laravel connects as.
    FOR v_row IN
        SELECT rol.rolname AS role_name
        FROM pg_catalog.pg_roles AS rol
        CROSS JOIN pg_catalog.pg_namespace AS ns
        WHERE ns.nspname = 'public'
          AND (
              rol.rolname IN {{DEPENDED_ON_ROLES}}
              OR rol.rolname = current_user
          )
          AND rol.rolname NOT IN {{BROWSER_ROLES}}
          AND NOT {{ROLE_RETAINS_USAGE}}
        ORDER BY 1
    LOOP
        v_blockers := v_blockers || format(
            'revoking schema public from PUBLIC would leave %s without USAGE, '
            'because it holds no direct entry of its own and is neither the '
            'schema owner nor a superuser',
            v_row.role_name
        );
    END LOOP;

    IF array_length(v_blockers, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AKAY_CONTAINMENT_PRECONDITION_FAILED',
            DETAIL = array_to_string(v_blockers, E'\n'),
            HINT = 'Containment step 3 was aborted before any schema privilege '
                   'was changed. A role reported here needs a direct, reviewed '
                   'entry of its own before the pseudo-role PUBLIC can be '
                   'revoked. See docs/database-exposure-containment.md, '
                   '"Precondition failures".';
    END IF;
END
$akay_schema_preconditions$;
SQL, $this->tokens());
    }

    /**
     * Stage 2. Remove schema privileges from the browser roles and from PUBLIC.
     *
     * ALL PRIVILEGES rather than USAGE alone: CREATE on schema public is handed
     * to PUBLIC on PostgreSQL 14 and earlier, and a browser role able to create
     * objects in public is a worse problem than one able to read them.
     *
     * Absent roles are reported and skipped - a self-hosted PostgreSQL server
     * with no anon or authenticated runs this cleanly - and every schema name is
     * built with format('%I', ...) rather than interpolated.
     */
    private function revokeSchemaUsageSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_schema_revoke$
DECLARE
    -- PUBLIC is a keyword, not a role, so it is never quote_ident()ed.
    v_grantees text[] := ARRAY['PUBLIC'];
    v_browser_role text;
    v_grantee text;
    v_schema text;
    v_collateral record;
BEGIN
    SELECT format('%I', ns.nspname) INTO v_schema
    FROM pg_catalog.pg_namespace AS ns
    WHERE ns.nspname = 'public';

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
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON SCHEMA %s FROM %s', v_schema, v_grantee
        );
    END LOOP;

    -- Blast radius: every other role that just lost USAGE because it was
    -- relying on the pseudo-role PUBLIC. Stage 1 has already proven that none
    -- of these is a depended-on role, so this is a record of what changed, not
    -- a suppressed failure.
    FOR v_collateral IN
        SELECT rol.rolname AS role_name
        FROM pg_catalog.pg_roles AS rol
        CROSS JOIN pg_catalog.pg_namespace AS ns
        WHERE ns.nspname = 'public'
          AND rol.rolname NOT IN {{BROWSER_ROLES}}
          AND rol.rolname NOT LIKE 'pg\_%'
          AND NOT has_schema_privilege(rol.oid, ns.oid, 'USAGE')
        ORDER BY 1
    LOOP
        RAISE NOTICE
            'AKAY containment step 3: role % no longer has USAGE on schema '
            'public. It was relying on the pseudo-role PUBLIC. If this role is '
            'needed, add a direct, reviewed entry for it out of band.',
            v_collateral.role_name;
    END LOOP;
END
$akay_schema_revoke$;
SQL, $this->tokens());
    }

    /**
     * Stage 3. Prove the schema is closed, or roll the whole step back.
     *
     * has_schema_privilege() is the right test rather than a raw nspacl read:
     * it resolves entries reaching a role directly, through membership of
     * another role, and through the pseudo-role PUBLIC. A browser role that
     * still resolves names in public by being a member of some third role
     * fails here, which revoking from anon directly would never have caught.
     *
     * The PUBLIC entry is checked separately against the raw ACL, because
     * PUBLIC has no pg_roles row to test against.
     */
    private function assertSchemaUsageSql(): string
    {
        return strtr(<<<'SQL'
DO $akay_schema_assertions$
DECLARE
    v_failures text[] := ARRAY[]::text[];
    v_row record;
BEGIN
    -- Neither browser role may retain any effective privilege on the schema.
    FOR v_row IN
        SELECT browser.rolname AS role_name,
               priv.privilege_type
        FROM pg_catalog.pg_roles AS browser
        CROSS JOIN pg_catalog.pg_namespace AS ns
        CROSS JOIN (VALUES ('USAGE'), ('CREATE')) AS priv(privilege_type)
        WHERE browser.rolname IN {{BROWSER_ROLES}}
          AND ns.nspname = 'public'
          AND has_schema_privilege(browser.oid, ns.oid, priv.privilege_type)
        ORDER BY 1, 2
    LOOP
        v_failures := v_failures || format(
            '%s retains effective %s on schema public',
            v_row.role_name, v_row.privilege_type
        );
    END LOOP;

    -- The pseudo-role PUBLIC, which has no pg_roles row to test against.
    FOR v_row IN
        SELECT acl.privilege_type
        FROM pg_catalog.pg_namespace AS ns
        CROSS JOIN LATERAL aclexplode(
            COALESCE(ns.nspacl, acldefault('n', ns.nspowner))
        ) AS acl
        WHERE ns.nspname = 'public'
          AND acl.grantee = 0
        ORDER BY 1
    LOOP
        v_failures := v_failures || format(
            'PUBLIC retains %s on schema public', v_row.privilege_type
        );
    END LOOP;

    -- The application and the platform roles it depends on must still be able
    -- to resolve names in the schema.
    FOR v_row IN
        SELECT rol.rolname AS role_name
        FROM pg_catalog.pg_roles AS rol
        CROSS JOIN pg_catalog.pg_namespace AS ns
        WHERE ns.nspname = 'public'
          AND (
              rol.rolname IN {{DEPENDED_ON_ROLES}}
              OR rol.rolname = current_user
          )
          AND rol.rolname NOT IN {{BROWSER_ROLES}}
          AND NOT has_schema_privilege(rol.oid, ns.oid, 'USAGE')
        ORDER BY 1
    LOOP
        v_failures := v_failures || format(
            '%s lost USAGE on schema public; the application or platform '
            'depends on it',
            v_row.role_name
        );
    END LOOP;

    IF array_length(v_failures, 1) > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AKAY_CONTAINMENT_ASSERTION_FAILED',
            DETAIL = array_to_string(v_failures, E'\n'),
            HINT = 'Every schema privilege change in containment step 3 has '
                   'been rolled back. See '
                   'docs/database-exposure-containment.md, "Assertion failures".';
    END IF;
END
$akay_schema_assertions$;
SQL, $this->tokens());
    }
};
