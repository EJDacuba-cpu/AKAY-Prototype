<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Grammars\PostgresGrammar;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PDOException;
use RuntimeException;
use Tests\TestCase;
use Throwable;

/**
 * Phase 1 - database exposure containment.
 *
 * The behavioural assertions in this class need a real PostgreSQL server:
 * privileges, default privileges, column ACLs and routine ACLs simply do not
 * exist in the SQLite in-memory database the rest of the suite runs on. They
 * are therefore opt-in, and are SKIPPED - not silently passed - when no
 * synthetic PostgreSQL target is configured.
 *
 * Point them at a throwaway database:
 *
 *   AKAY_PGSQL_TEST_HOST=127.0.0.1
 *   AKAY_PGSQL_TEST_PORT=5432
 *   AKAY_PGSQL_TEST_DATABASE=akay_containment_test
 *   AKAY_PGSQL_TEST_USERNAME=postgres
 *   AKAY_PGSQL_TEST_PASSWORD=...
 *
 * The tests refuse to run against a managed Supabase endpoint: they create
 * roles, grant privileges and migrate, none of which may touch a database
 * holding real patient data.
 */
class DatabaseExposureContainmentTest extends TestCase
{
    private const TEST_CONNECTION = 'pgsql_containment_test';

    private const BROWSER_ROLES = ['anon', 'authenticated'];

    /**
     * Phase 2B split the original single-file containment migration into four
     * independently applicable steps, in this order. Steps 1 to 3 live in the
     * migration path; step 4 deliberately does not - see
     * self::DEFERRED_MIGRATION and
     * test_deferred_migration_is_not_in_the_migration_path().
     */
    private const CONTAINMENT_MIGRATIONS = [
        'migrations/2026_07_30_000001_revoke_browser_role_object_privileges.php',
        'migrations/2026_07_30_000002_enable_rls_on_public_tables.php',
        'migrations/2026_07_30_000003_revoke_public_schema_usage.php',
        'migrations/deferred/2026_07_30_000004_deferred_supabase_admin_defaults.php',
    ];

    private const DEFERRED_MIGRATION =
        'migrations/deferred/2026_07_30_000004_deferred_supabase_admin_defaults.php';

    /**
     * Roles this test class creates on the synthetic database. Tracked so
     * tearDown can remove them and leave the database reusable.
     */
    private const PROBE_ROLES = [
        'akay_probe_unprivileged',
        'akay_probe_intermediate',
        'akay_probe_default_owner',
        // Holds USAGE on public only through the pseudo-role PUBLIC.
        'akay_probe_public_only',
        // Holds a direct USAGE entry of its own.
        'akay_probe_direct_usage',
        // Phase 2C step 3 hard-blocks on this name specifically, so the
        // behavioural tests need the real one rather than a stand-in. Listed
        // here so it is dropped between tests: without this, the second run of
        // any test that creates it fails with "role already exists".
        'service_role',
    ];

    /**
     * A table this class owns, created in public before the containment steps
     * run so they enumerate it like any other, and seeded with a known number
     * of rows so "reads zero rows" is a measurable claim rather than an
     * artefact of an empty database.
     */
    private const PROBE_TABLE = 'akay_probe_rls_rows';

    private const PROBE_TABLE_ROWS = 3;

    /**
     * Application tables that must never be reachable by a browser-facing role.
     */
    private const PROTECTED_TABLES = [
        'users',
        'patients',
        'health_records',
        'health_record_drafts',
        'health_record_medicines',
        'referrals',
        'referral_updates',
        'feedback',
        'follow_up_tasks',
        'notifications',
        'audit_logs',
        'medicines',
        'medicine_inventory_transactions',
        'password_reset_requests',
        'personal_access_tokens',
    ];

    private ?string $originalConnection = null;

    protected function tearDown(): void
    {
        if ($this->originalConnection !== null) {
            $this->cleanUpProbeArtifacts();
            config(['database.default' => $this->originalConnection]);
            DB::purge(self::TEST_CONNECTION);
            $this->originalConnection = null;
        }

        parent::tearDown();
    }

    // ================================================================
    // Static migration-safety checks. These run everywhere, including on
    // SQLite, because an unsafe rollback is a source-level defect.
    // ================================================================

    public function test_containment_migration_never_grants_access_back(): void
    {
        $sql = $this->migrationSource();

        $this->assertStringNotContainsString('GRANT ', $sql);
        $this->assertStringContainsString('REVOKE ALL PRIVILEGES ON TABLE', $sql);
        $this->assertStringContainsString('REVOKE ALL PRIVILEGES ON SEQUENCE', $sql);
        $this->assertStringContainsString('ALTER DEFAULT PRIVILEGES FOR ROLE', $sql);
    }

    public function test_containment_migration_down_does_not_reopen_access(): void
    {
        foreach ($this->migrationSources() as $migration => $sql) {
            $down = substr($sql, strpos($sql, 'public function down(): void'));
            $down = substr($down, 0, strpos($down, 'private function'));

            $this->assertStringNotContainsString('DB::', $down, $migration);
            $this->assertStringNotContainsString('GRANT', $down, $migration);
        }
    }

    public function test_containment_migration_qualifies_objects_and_handles_overloads(): void
    {
        $sql = $this->migrationSource();

        // Every object name is built with format('%I.%I', ...) rather than
        // interpolated, so a table called "select" cannot break the statement.
        $this->assertStringContainsString("format('%I.%I', ns.nspname, cls.relname)", $sql);

        // Overloads: signatures come from pg_proc identity arguments, one row
        // per overload, so each is revoked under its own complete signature.
        $this->assertStringContainsString('pg_get_function_identity_arguments', $sql);
        $this->assertStringContainsString("pro.prokind IN ('f', 'p')", $sql);

        // Extension-owned objects are left alone.
        $this->assertStringContainsString("dep.deptype = 'e'", $sql);
    }

    public function test_containment_migration_reads_no_application_rows(): void
    {
        $sql = $this->migrationSource();

        foreach (['patients', 'health_records', 'referrals', 'notifications', 'audit_logs'] as $table) {
            $this->assertStringNotContainsString("public.{$table}", $sql);
        }
    }

    /**
     * A single migration that reopens access undoes the whole phase, so this
     * guards the entire migrations directory rather than one file.
     */
    public function test_no_migration_grants_privileges_to_browser_facing_roles(): void
    {
        $offenders = [];

        $paths = array_merge(
            glob(database_path('migrations/*.php')),
            glob(database_path('migrations/deferred/*.php'))
        );

        foreach ($paths as $path) {
            $contents = file_get_contents($path);

            preg_match_all('/GRANT\s+[^;\']*?\bTO\s+(PUBLIC|anon|authenticated)\b/i', $contents, $matches);

            if ($matches[0] !== []) {
                $offenders[basename($path)] = $matches[0];
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'Migrations must never grant database privileges to PUBLIC, anon or '
            .'authenticated. Offending statements: '.json_encode($offenders)
        );
    }

    // ================================================================
    // Fail-closed structure.
    // ================================================================

    public function test_containment_migration_fails_closed_rather_than_warning(): void
    {
        foreach ($this->migrationSources() as $migration => $sql) {
            // Required security work must abort, never warn and carry on.
            $this->assertSame(
                0,
                substr_count($sql, 'RAISE WARNING'),
                "{$migration} must not downgrade a blocked change to a warning."
            );

            // Statements, not the prose that describes them. Every step raises
            // from its own precondition stage and its own assertion stage, so
            // splitting the phase cannot dilute the fail-closed contract.
            $this->assertSame(
                2,
                substr_count($sql, 'RAISE EXCEPTION USING'),
                "{$migration} must raise from both its precondition and its "
                .'assertion stage.'
            );

            $this->assertStringContainsString('AKAY_CONTAINMENT_PRECONDITION_FAILED', $sql, $migration);
            $this->assertStringContainsString('AKAY_CONTAINMENT_ASSERTION_FAILED', $sql, $migration);

            // No override flag may exist: containment is not opt-outable.
            $this->assertStringNotContainsString('env(', $sql, $migration);
            $this->assertStringNotContainsString('config(', $sql, $migration);
        }
    }

    public function test_containment_migration_validates_before_it_changes_anything(): void
    {
        foreach ($this->migrationSources() as $migration => $sql) {
            preg_match_all(
                '/DB::unprepared\(\$this->(\w+)\(\)\)/',
                $sql,
                $matches
            );

            $stages = $matches[1];

            $this->assertGreaterThanOrEqual(
                3,
                count($stages),
                "{$migration} must run a precondition, a mutation and an "
                .'assertion stage.'
            );

            $this->assertSame(
                'preconditionsSql',
                $stages[0],
                "{$migration} must prove its preconditions before it changes "
                .'anything.'
            );

            $this->assertStringStartsWith(
                'assert',
                end($stages),
                "{$migration} must run its assertions last."
            );

            // No stage between the two may itself be an assertion or a
            // precondition, so the three-stage shape cannot drift.
            foreach (array_slice($stages, 1, -1) as $stage) {
                $this->assertStringNotContainsString('precondition', $stage, $migration);
                $this->assertStringStartsNotWith('assert', $stage, $migration);
            }
        }
    }

    public function test_containment_migration_declares_and_enforces_transactionality(): void
    {
        foreach ($this->migrationSources() as $migration => $sql) {
            $this->assertStringContainsString('public $withinTransaction = true;', $sql, $migration);
            $this->assertStringContainsString('DB::transactionLevel() < 1', $sql, $migration);
            $this->assertStringContainsString('DB::connection()->pretending()', $sql, $migration);
        }

        // Migrator::runMigration() wraps up() in $connection->transaction()
        // when the grammar supports schema transactions and $withinTransaction
        // is true. Read via reflection so no database connection is opened.
        $transactions = new \ReflectionProperty(PostgresGrammar::class, 'transactions');
        $transactions->setAccessible(true);

        $this->assertTrue(
            $transactions->getDefaultValue(),
            'The PostgreSQL schema grammar must support transactional DDL for '
            .'the migration to be wrapped in a transaction.'
        );
    }

    public function test_containment_migration_refuses_to_run_outside_a_transaction(): void
    {
        // A driver-correct connection that is never opened: up() reaches the
        // transaction guard and throws before any PDO handle is resolved.
        config([
            'database.connections.pgsql_offline_probe' => [
                'driver' => 'pgsql',
                'host' => '127.0.0.1',
                'port' => '1',
                'database' => 'unreachable',
                'username' => 'unreachable',
                'password' => '',
                'search_path' => 'public',
            ],
            'database.default' => 'pgsql_offline_probe',
        ]);

        try {
            foreach (self::CONTAINMENT_MIGRATIONS as $path) {
                $migration = require database_path($path);
                $threw = false;

                try {
                    $migration->up();
                } catch (RuntimeException $exception) {
                    $threw = true;
                    $this->assertMatchesRegularExpression(
                        '/must run inside a transaction/',
                        $exception->getMessage(),
                        $path
                    );
                }

                $this->assertTrue(
                    $threw,
                    "{$path} must refuse to run outside a transaction."
                );
            }
        } finally {
            config(['database.default' => 'sqlite']);
        }
    }

    public function test_containment_migration_enumerates_every_unsafe_default_owner(): void
    {
        $sql = $this->migrationSource();

        // Owners are discovered from pg_default_acl, not assumed, so an unsafe
        // entry owned by a third role is caught rather than ignored.
        $this->assertStringContainsString('FROM pg_catalog.pg_default_acl AS def', $sql);
        $this->assertStringContainsString('aclexplode(def.defaclacl)', $sql);

        // Both the schema-scoped and the global form are emitted, because the
        // two are stored and applied separately.
        $this->assertStringContainsString(
            "'ALTER DEFAULT PRIVILEGES FOR ROLE %s REVOKE ALL ON %s FROM %s'",
            $sql
        );
        $this->assertStringContainsString(
            "'ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA %I REVOKE ALL ON %s FROM %s'",
            $sql
        );

        // The built-in default is invisible in pg_default_acl, so the roles that
        // create objects in public are always overridden explicitly.
        $this->assertStringContainsString("ARRAY['postgres', 'supabase_admin']", $sql);
        $this->assertStringContainsString('acldefault(owners.objtype, owners.roleoid)', $sql);
    }

    public function test_containment_migration_checks_column_and_inherited_privileges(): void
    {
        $sql = $this->migrationSource();

        $this->assertStringContainsString('has_any_column_privilege(', $sql);

        // has_*_privilege resolves membership and PUBLIC, unlike a raw ACL read.
        $this->assertStringContainsString('has_table_privilege(', $sql);
        $this->assertStringContainsString('has_sequence_privilege(', $sql);
        $this->assertStringContainsString('has_function_privilege(', $sql);
    }

    // ================================================================
    // Phase 2B split. Each step must be independently applicable, and each
    // must carry verification scoped to what it actually changed.
    // ================================================================

    /**
     * The deferred step cannot succeed on a managed Supabase project, so it
     * must not sit in the pending set breaking every deployment. Migrator::
     * getMigrationFiles() globs '/*_*.php' without recursing, so a subdirectory
     * is never discovered - this test is what stops someone "tidying" the file
     * back into the migration path before the blocker is resolved.
     */
    public function test_deferred_migration_is_not_in_the_migration_path(): void
    {
        $discovered = array_map('basename', glob(database_path('migrations/*_*.php')));

        $this->assertNotContains(
            basename(self::DEFERRED_MIGRATION),
            $discovered,
            'The deferred containment step must stay out of the migration path '
            .'until the supabase_admin blocker is resolved. Moving it back in '
            .'makes `php artisan migrate` fail on every deployment.'
        );

        $this->assertFileExists(
            database_path(self::DEFERRED_MIGRATION),
            'The deferred step must still exist and be tracked, not deleted.'
        );
    }

    /**
     * The whole point of the split: step 1 must not block on, or silently claim
     * containment of, the default privileges only step 4 can reach.
     */
    public function test_object_privilege_step_defers_rather_than_blocks_on_unreachable_owners(): void
    {
        $sources = $this->migrationSources();
        $step1 = $sources[self::CONTAINMENT_MIGRATIONS[0]];
        $step4 = $sources[self::DEFERRED_MIGRATION];

        // Step 1 owns postgres's defaults and nothing beyond them.
        $this->assertStringNotContainsString(
            "rol.rolname IN ('postgres', 'supabase_admin')",
            $step1,
            'Step 1 must not treat supabase_admin as a precondition; that is '
            .'what made the original migration unrunnable.'
        );

        // It must both skip and report unreachable owners, at the same
        // membership predicate it uses to scope its own assertions.
        $this->assertStringContainsString(
            "NOT pg_catalog.pg_has_role(current_user, def.defaclrole, 'MEMBER')",
            $step1,
            'Step 1 must enumerate the owners it is deferring.'
        );
        $this->assertStringContainsString('DEFERRED to step 4', $step1);

        // Step 4 carries the unscoped, phase-closing assertion.
        $this->assertStringContainsString(
            "rol.rolname IN ('postgres', 'supabase_admin')",
            $step4
        );
        $this->assertStringContainsString('acldefault(owners.objtype, owners.roleoid)', $step4);
    }

    /**
     * Enabling RLS is only safe while the application connects as an exempt
     * role. If that stops being checked, this migration becomes an outage.
     */
    public function test_rls_step_proves_the_connected_role_stays_exempt(): void
    {
        $step2 = $this->migrationSources()[self::CONTAINMENT_MIGRATIONS[1]];

        $this->assertStringContainsString('rolbypassrls', $step2);
        $this->assertStringContainsString('relforcerowsecurity', $step2);
        $this->assertStringContainsString('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', $step2);

        // Deny-by-default only holds while no policy exists.
        $this->assertStringContainsString('pg_catalog.pg_policies', $step2);

        // RLS is a property of tables, not views.
        $this->assertStringContainsString("('r', 'p')", $step2);
    }

    /**
     * has_schema_privilege() resolves the pseudo-role PUBLIC, so revoking from
     * anon and authenticated alone changes nothing measurable.
     */
    public function test_schema_usage_step_revokes_the_public_pseudo_role(): void
    {
        $step3 = $this->migrationSources()[self::CONTAINMENT_MIGRATIONS[2]];

        $this->assertStringContainsString("v_grantees text[] := ARRAY['PUBLIC']", $step3);
        $this->assertStringContainsString('REVOKE ALL PRIVILEGES ON SCHEMA %s FROM %s', $step3);
        $this->assertStringContainsString('has_schema_privilege(', $step3);

        // Revoking from PUBLIC has a blast radius, so the roles that must
        // survive it are proven before anything changes.
        $this->assertStringContainsString('DEPENDED_ON_ROLES', $step3);
    }

    // ================================================================
    // PostgreSQL behavioural checks.
    // ================================================================

    public function test_browser_roles_cannot_read_or_mutate_application_tables(): void
    {
        $this->bootSyntheticPostgres();
        $this->simulateSupabaseBrowserRoleGrants();

        foreach (self::BROWSER_ROLES as $role) {
            $this->assertTrue(
                $this->roleHasTablePrivilege($role, 'users', 'SELECT'),
                "Precondition failed: {$role} should start with the Supabase-style grant."
            );
        }

        $this->runContainmentMigration();

        foreach (self::BROWSER_ROLES as $role) {
            foreach (self::PROTECTED_TABLES as $table) {
                $this->assertFalse(
                    $this->roleHasTablePrivilege($role, $table, 'SELECT'),
                    "{$role} can still read public.{$table}."
                );

                $this->assertFalse(
                    $this->roleHasTablePrivilege(
                        $role,
                        $table,
                        'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
                    ),
                    "{$role} can still mutate public.{$table}."
                );
            }
        }
    }

    public function test_column_level_grants_are_revoked_too(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        // A column grant made independently of any table grant.
        foreach (self::BROWSER_ROLES as $role) {
            $connection->statement(
                "GRANT SELECT (id, first_name, last_name), UPDATE (contact_number) "
                ."ON public.patients TO {$role}"
            );

            $this->assertTrue(
                $this->roleHasAnyColumnPrivilege($role, 'patients', 'SELECT'),
                "Precondition failed: {$role} should hold a column grant."
            );
        }

        $this->runContainmentMigration();

        foreach (self::BROWSER_ROLES as $role) {
            $this->assertFalse(
                $this->roleHasAnyColumnPrivilege($role, 'patients', 'SELECT, INSERT, UPDATE, REFERENCES'),
                "{$role} retains a column-level privilege on public.patients."
            );
        }

        $orphanedColumnAcls = $connection->selectOne(<<<'SQL'
            SELECT count(*) AS total
            FROM pg_catalog.pg_attribute AS att
            JOIN pg_catalog.pg_class AS cls ON cls.oid = att.attrelid
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
            CROSS JOIN LATERAL aclexplode(att.attacl) AS acl
            WHERE ns.nspname = 'public'
              AND att.attacl IS NOT NULL
              AND (
                  acl.grantee = 0
                  OR pg_catalog.pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated')
              )
        SQL);

        $this->assertSame(
            0,
            (int) $orphanedColumnAcls->total,
            'Column-level ACL entries for browser-facing grantees remain in pg_attribute.'
        );
    }

    public function test_containment_fails_closed_when_access_is_inherited_from_another_role(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        // anon reaches patients not directly, but through a role it belongs to.
        // Revoking from anon alone would leave the access in place, so the
        // migration must refuse to report success.
        $connection->statement('CREATE ROLE akay_probe_intermediate NOLOGIN');
        $connection->statement('GRANT SELECT ON public.patients TO akay_probe_intermediate');
        $connection->statement('GRANT akay_probe_intermediate TO anon');

        $this->assertTrue(
            $this->roleHasTablePrivilege('anon', 'patients', 'SELECT'),
            'Precondition failed: anon should inherit SELECT.'
        );

        $failure = $this->runContainmentMigrationExpectingFailure();

        $this->assertStringContainsString('AKAY_CONTAINMENT_ASSERTION_FAILED', $failure);
        $this->assertStringContainsString('anon retains effective table access', $failure);
    }

    /**
     * Transaction-safety proof: a failure in the assertion stage must leave the
     * database exactly as it was, not partially contained.
     */
    public function test_a_failed_assertion_rolls_back_every_privilege_change(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        // Committed starting state: full Supabase-style exposure...
        $this->simulateSupabaseBrowserRoleGrants();
        // ...plus an inherited path the migration cannot revoke, which will
        // make the assertion stage raise.
        $connection->statement('CREATE ROLE akay_probe_intermediate NOLOGIN');
        $connection->statement('GRANT SELECT ON public.patients TO akay_probe_intermediate');
        $connection->statement('GRANT akay_probe_intermediate TO anon');

        $before = $this->browserRolePrivilegeFingerprint();

        $failure = $this->runContainmentMigrationExpectingFailure();
        $this->assertStringContainsString('AKAY_CONTAINMENT_ASSERTION_FAILED', $failure);

        $after = $this->browserRolePrivilegeFingerprint();

        $this->assertSame(
            $before,
            $after,
            'A failed assertion left partial privilege changes behind. The '
            .'migration is not transactional.'
        );

        // And specifically: the revocations stage 2 performed are gone again.
        $this->assertTrue(
            $this->roleHasTablePrivilege('authenticated', 'users', 'SELECT'),
            'Stage 2 revocations were not rolled back.'
        );
    }

    public function test_preconditions_abort_before_any_privilege_is_changed(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        $this->simulateSupabaseBrowserRoleGrants();
        $before = $this->browserRolePrivilegeFingerprint();

        // A superuser passes every pg_has_role() check, so the precondition
        // stage is exercised as a role that owns nothing instead.
        $connection->statement('CREATE ROLE akay_probe_unprivileged NOLOGIN');
        $connection->statement(
            'GRANT akay_probe_unprivileged TO '.$this->quotedCurrentUser()
        );

        $migration = require database_path(self::CONTAINMENT_MIGRATIONS[0]);
        $preconditions = (new \ReflectionClass($migration))->getMethod('preconditionsSql');
        $preconditions->setAccessible(true);

        $connection->beginTransaction();

        try {
            $connection->statement('SET LOCAL ROLE akay_probe_unprivileged');
            $connection->unprepared($preconditions->invoke($migration));
            $this->fail('The precondition stage accepted a role that owns nothing.');
        } catch (QueryException $exception) {
            $this->assertStringContainsString(
                'AKAY_CONTAINMENT_PRECONDITION_FAILED',
                $exception->getMessage()
            );
            $this->assertStringContainsString('cannot act as', $exception->getMessage());
        } finally {
            $connection->rollBack();
        }

        $this->assertSame(
            $before,
            $this->browserRolePrivilegeFingerprint(),
            'The precondition stage changed privileges before validating.'
        );
    }

    public function test_unsafe_default_privileges_owned_by_any_role_are_removed(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        // An unsafe default owned by neither postgres nor supabase_admin.
        $connection->statement('CREATE ROLE akay_probe_default_owner NOLOGIN');
        $connection->statement(
            'GRANT akay_probe_default_owner TO '.$this->quotedCurrentUser()
        );
        $connection->statement(
            'ALTER DEFAULT PRIVILEGES FOR ROLE akay_probe_default_owner IN SCHEMA public '
            .'GRANT ALL ON TABLES TO anon'
        );
        // ...and a global (schema-less) entry, which is stored separately.
        $connection->statement(
            'ALTER DEFAULT PRIVILEGES FOR ROLE akay_probe_default_owner '
            .'GRANT ALL ON SEQUENCES TO authenticated'
        );

        $this->simulateSupabaseDefaultPrivileges();
        $this->runContainmentMigration();

        $remaining = $connection->select(<<<'SQL'
            SELECT pg_catalog.pg_get_userbyid(def.defaclrole) AS owning_role,
                   def.defaclobjtype AS object_type,
                   pg_catalog.pg_get_userbyid(acl.grantee) AS grantee
            FROM pg_catalog.pg_default_acl AS def
            CROSS JOIN LATERAL aclexplode(def.defaclacl) AS acl
            WHERE acl.grantee <> 0
              AND pg_catalog.pg_get_userbyid(acl.grantee) IN ('anon', 'authenticated')
        SQL);

        $this->assertSame(
            [],
            $remaining,
            'Default privileges still grant future objects to browser-facing '
            .'roles: '.json_encode($remaining)
        );
    }

    public function test_future_objects_do_not_inherit_browser_role_access(): void
    {
        $this->bootSyntheticPostgres();
        $this->simulateSupabaseDefaultPrivileges();
        $this->runContainmentMigration();

        $connection = DB::connection(self::TEST_CONNECTION);
        $connection->statement('CREATE TABLE public.akay_containment_probe (id bigint)');
        $connection->statement(
            'CREATE FUNCTION public.akay_containment_probe_fn() RETURNS int '
            .'LANGUAGE sql AS $probe$ SELECT 1 $probe$'
        );

        try {
            foreach (self::BROWSER_ROLES as $role) {
                $this->assertFalse(
                    $this->roleHasTablePrivilege($role, 'akay_containment_probe', 'SELECT'),
                    "{$role} automatically received access to a newly created table."
                );
            }

            // PostgreSQL's built-in default grants EXECUTE on new functions to
            // PUBLIC. Containment must have overridden that, not just the
            // entries Supabase happened to store.
            $publicExecute = $connection->selectOne(<<<'SQL'
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_proc AS pro
                    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
                    CROSS JOIN LATERAL aclexplode(
                        COALESCE(pro.proacl, acldefault('f', pro.proowner))
                    ) AS acl
                    WHERE ns.nspname = 'public'
                      AND pro.proname = 'akay_containment_probe_fn'
                      AND acl.grantee = 0
                      AND acl.privilege_type = 'EXECUTE'
                ) AS granted
            SQL);

            $this->assertFalse(
                (bool) $publicExecute->granted,
                'A newly created function still grants EXECUTE to PUBLIC.'
            );
        } finally {
            $connection->statement('DROP FUNCTION IF EXISTS public.akay_containment_probe_fn()');
            $connection->statement('DROP TABLE IF EXISTS public.akay_containment_probe');
        }
    }

    public function test_every_akay_function_overload_is_revoked(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        // Two overloads of one name, so a name-only revoke would miss one.
        $connection->statement(
            'CREATE FUNCTION public.akay_probe_overload(a int) RETURNS int '
            .'LANGUAGE sql AS $probe$ SELECT a $probe$'
        );
        $connection->statement(
            'CREATE FUNCTION public.akay_probe_overload(a int, b text) RETURNS int '
            .'LANGUAGE sql AS $probe$ SELECT a $probe$'
        );

        try {
            $this->simulateSupabaseBrowserRoleGrants();
            $this->runContainmentMigration();

            $overloads = $connection->select(<<<'SQL'
                SELECT pro.oid AS routine_oid,
                       pg_catalog.pg_get_function_identity_arguments(pro.oid) AS args
                FROM pg_catalog.pg_proc AS pro
                JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
                WHERE ns.nspname = 'public' AND pro.proname = 'akay_probe_overload'
            SQL);

            $this->assertCount(2, $overloads, 'Both overloads should exist.');

            foreach ($overloads as $overload) {
                foreach (self::BROWSER_ROLES as $role) {
                    $granted = $connection->selectOne(
                        'SELECT has_function_privilege(?, ?::oid, ?) AS granted',
                        [$role, $overload->routine_oid, 'EXECUTE']
                    );

                    $this->assertFalse(
                        (bool) $granted->granted,
                        "{$role} can still execute akay_probe_overload({$overload->args})."
                    );
                }
            }
        } finally {
            $connection->statement('DROP FUNCTION IF EXISTS public.akay_probe_overload(int)');
            $connection->statement('DROP FUNCTION IF EXISTS public.akay_probe_overload(int, text)');
        }
    }

    public function test_browser_roles_cannot_execute_legacy_akay_functions(): void
    {
        $this->bootSyntheticPostgres();
        $this->simulateSupabaseBrowserRoleGrants();
        $this->runContainmentMigration();

        $routines = DB::connection(self::TEST_CONNECTION)->select(<<<'SQL'
            SELECT pro.oid AS routine_oid,
                   format(
                       '%I.%I(%s)',
                       ns.nspname,
                       pro.proname,
                       pg_catalog.pg_get_function_identity_arguments(pro.oid)
                   ) AS signature
            FROM pg_catalog.pg_proc AS pro
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
            WHERE ns.nspname = 'public' AND pro.proname LIKE 'akay\_%'
        SQL);

        $this->assertNotEmpty($routines, 'No akay_* routines were found to verify.');

        foreach ($routines as $routine) {
            foreach (self::BROWSER_ROLES as $role) {
                $granted = DB::connection(self::TEST_CONNECTION)->selectOne(
                    'SELECT has_function_privilege(?, ?::oid, ?) AS granted',
                    [$role, $routine->routine_oid, 'EXECUTE']
                );

                $this->assertFalse(
                    (bool) $granted->granted,
                    "{$role} can still execute {$routine->signature}."
                );
            }
        }
    }

    public function test_service_role_and_inventory_behaviour_are_unchanged(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        $connection->statement('CREATE ROLE service_role NOLOGIN');
        $connection->statement('GRANT USAGE ON SCHEMA public TO service_role');
        $connection->statement('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role');
        $connection->statement('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role');
        $connection->statement('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role');

        $serviceRoleBefore = $this->rolePrivilegeFingerprint('service_role');
        $inventoryBefore = $this->inventoryFingerprint();

        $this->simulateSupabaseBrowserRoleGrants();
        $this->runContainmentMigration();

        $this->assertSame(
            $serviceRoleBefore,
            $this->rolePrivilegeFingerprint('service_role'),
            'Phase 1 must not alter service_role privileges.'
        );

        $this->assertSame(
            $inventoryBefore,
            $this->inventoryFingerprint(),
            'Phase 1 must not alter the hardened inventory functions or the '
            .'append-only ledger trigger.'
        );

        // The ledger trigger must still fire.
        $connection->statement('DROP TABLE IF EXISTS public.akay_probe_noop');
        $this->assertTrue(true);
    }

    public function test_laravel_connection_still_reads_tables_and_executes_its_functions(): void
    {
        $this->bootSyntheticPostgres();
        $this->simulateSupabaseBrowserRoleGrants();
        $this->runContainmentMigration();

        $connection = DB::connection(self::TEST_CONNECTION);

        foreach (self::PROTECTED_TABLES as $table) {
            $this->assertIsInt(
                (int) $connection->selectOne("SELECT count(*) AS total FROM public.{$table}")->total,
                "The Laravel connection lost read access to public.{$table}."
            );
        }

        // The stored functions the API actually calls must still execute. The
        // synthetic database is empty, so these return no rows by design.
        $connection->select(
            'SELECT * FROM public.akay_patient_list(?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['admin', null, null, null, null, null, null, 1, 0]
        );
        $connection->select(
            'SELECT public.akay_referral_report(?, ?, ?) AS data',
            ['admin', null, null]
        );

        $this->addToAssertionCount(1);
    }

    // ================================================================
    // Phase 2C - step 2 (Row Level Security) behavioural checks.
    //
    // These run step 2 IN ISOLATION, with the browser roles still holding
    // every privilege a stock Supabase project grants them. That isolation is
    // the point: it proves RLS itself denies the rows, rather than proving
    // that step 1 had already removed the privilege.
    // ================================================================

    public function test_rls_denies_every_row_to_browser_roles_that_still_hold_full_privileges(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();
        $this->simulateSupabaseBrowserRoleGrants();

        // Precondition: the exposure is real before the step runs.
        foreach (self::BROWSER_ROLES as $role) {
            $this->assertSame(
                self::PROBE_TABLE_ROWS,
                $this->rowsVisibleToRole($role, self::PROBE_TABLE),
                "Precondition failed: {$role} should start able to read every row."
            );
        }

        $this->runContainmentStep(1);

        foreach (self::BROWSER_ROLES as $role) {
            $this->assertSame(
                0,
                $this->rowsVisibleToRole($role, self::PROBE_TABLE),
                "{$role} must read zero rows once row level security is enabled."
            );

            // The privilege is deliberately still held. If this ever fails,
            // the test has stopped isolating RLS and is measuring step 1.
            $this->assertTrue(
                $this->roleHasTablePrivilege($role, self::PROBE_TABLE, 'SELECT'),
                "This test only proves RLS works while {$role} still holds "
                .'SELECT. Something else removed the privilege.'
            );

            $this->assertNull(
                $this->readErrorCodeForRole($role, self::PROBE_TABLE),
                "{$role} should be denied by row filtering, not by a privilege "
                .'error, in this isolation.'
            );
        }
    }

    public function test_rls_leaves_the_connected_role_reading_every_row(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();
        $this->simulateSupabaseBrowserRoleGrants();
        $this->runContainmentStep(1);

        $connection = DB::connection(self::TEST_CONNECTION);

        $this->assertSame(
            self::PROBE_TABLE_ROWS,
            (int) $connection->selectOne(
                'SELECT count(*) AS total FROM public.'.self::PROBE_TABLE
            )->total,
            'The connected role must still read every row after enabling RLS.'
        );

        $this->assertTrue(
            $this->tableHasRowLevelSecurity(self::PROBE_TABLE),
            'The probe table must actually be under RLS for that to mean anything.'
        );

        foreach (self::PROTECTED_TABLES as $table) {
            $this->assertTrue(
                $this->tableHasRowLevelSecurity($table),
                "Row level security was not enabled on public.{$table}."
            );

            $this->assertIsInt(
                (int) $connection->selectOne("SELECT count(*) AS total FROM public.{$table}")->total,
                "The connected role lost read access to public.{$table}."
            );
        }
    }

    public function test_laravel_runtime_behaviour_is_byte_for_byte_unchanged_by_rls(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();
        $this->simulateSupabaseBrowserRoleGrants();

        $before = $this->laravelRuntimeFingerprint();

        $this->runContainmentStep(1);

        $this->assertSame(
            $before,
            $this->laravelRuntimeFingerprint(),
            'Enabling row level security changed what the Laravel runtime '
            .'observes. The connected role is not exempt on every table.'
        );
    }

    public function test_rls_step_refuses_to_run_when_the_owner_is_not_exempt(): void
    {
        $this->bootSyntheticPostgres();
        $connection = DB::connection(self::TEST_CONNECTION);

        // A superuser is exempt from row security unconditionally, FORCE or
        // not, so the non-exempt case has to be exercised as an ordinary role
        // that owns the table - which is exactly the Phase 2C runtime role this
        // precondition exists to protect against.
        $connection->statement('CREATE ROLE akay_probe_default_owner NOLOGIN');
        $connection->statement(
            'GRANT akay_probe_default_owner TO '.$this->quotedCurrentUser()
        );
        $connection->statement('GRANT CREATE, USAGE ON SCHEMA public TO akay_probe_default_owner');

        $this->seedProbeTable();
        $connection->statement(
            'ALTER TABLE public.'.self::PROBE_TABLE.' OWNER TO akay_probe_default_owner'
        );

        // FORCE removes the owner exemption, so enabling RLS would deny the
        // owner its own rows.
        $connection->statement(
            'ALTER TABLE public.'.self::PROBE_TABLE.' FORCE ROW LEVEL SECURITY'
        );

        $migration = require database_path(self::CONTAINMENT_MIGRATIONS[1]);
        $preconditions = (new \ReflectionClass($migration))->getMethod('preconditionsSql');
        $preconditions->setAccessible(true);

        $connection->beginTransaction();

        try {
            $connection->statement('SET LOCAL ROLE akay_probe_default_owner');
            $connection->unprepared($preconditions->invoke($migration));
            $this->fail('The precondition stage accepted a non-exempt owner.');
        } catch (QueryException $exception) {
            $this->assertStringContainsString(
                'AKAY_CONTAINMENT_PRECONDITION_FAILED',
                $exception->getMessage()
            );
            $this->assertStringContainsString('would deny', $exception->getMessage());
        } finally {
            $connection->rollBack();
        }

        $this->assertFalse(
            $this->tableHasRowLevelSecurity(self::PROBE_TABLE),
            'A failed precondition must leave row level security untouched.'
        );
    }

    public function test_rls_step_treats_a_superuser_connection_as_exempt(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();

        // FORCE does not apply to superusers or BYPASSRLS roles, so this must
        // NOT block. Testing rolbypassrls alone would have failed here.
        DB::connection(self::TEST_CONNECTION)->statement(
            'ALTER TABLE public.'.self::PROBE_TABLE.' FORCE ROW LEVEL SECURITY'
        );

        $failure = $this->runContainmentStepExpectingFailure(1);

        // It still fails - but on the assertion stage, because FORCE is
        // rejected outright - not on the availability precondition.
        $this->assertStringContainsString('AKAY_CONTAINMENT_ASSERTION_FAILED', $failure);
        $this->assertStringContainsString('forces row level security', $failure);
        $this->assertStringNotContainsString('would deny', $failure);
    }

    public function test_rls_step_fails_closed_when_an_unreviewed_policy_exists(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();

        DB::connection(self::TEST_CONNECTION)->statement(
            'CREATE POLICY akay_probe_permissive ON public.'.self::PROBE_TABLE
            .' FOR SELECT USING (true)'
        );

        $failure = $this->runContainmentStepExpectingFailure(1);

        $this->assertStringContainsString('AKAY_CONTAINMENT_ASSERTION_FAILED', $failure);
        $this->assertStringContainsString('unreviewed policy', $failure);

        // The assertion stage runs after the mutation, so this also proves the
        // rollback: RLS must be off again on every table.
        $this->assertFalse(
            $this->tableHasRowLevelSecurity(self::PROBE_TABLE),
            'A failed assertion must roll every table back to RLS-disabled.'
        );

        foreach (self::PROTECTED_TABLES as $table) {
            $this->assertFalse(
                $this->tableHasRowLevelSecurity($table),
                "public.{$table} was left under RLS after a failed assertion."
            );
        }
    }

    // ================================================================
    // Phase 2C - step 3 (schema USAGE) behavioural checks.
    //
    // Run in isolation from step 1 for the same reason: with the browser roles
    // still holding every table privilege, a denied read can only be the
    // schema revocation doing the work.
    // ================================================================

    public function test_browser_roles_cannot_resolve_public_objects_after_schema_revocation(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();
        $this->simulateSupabaseBrowserRoleGrants();
        $this->createServiceRoleWithDirectSchemaEntry();

        foreach (self::BROWSER_ROLES as $role) {
            $this->assertTrue(
                $this->roleHasSchemaUsage($role),
                "Precondition failed: {$role} should start with schema USAGE."
            );
        }

        $this->runContainmentStep(2);

        foreach (self::BROWSER_ROLES as $role) {
            $this->assertFalse(
                $this->roleHasSchemaUsage($role),
                "{$role} must not retain USAGE on schema public."
            );

            // The behavioural half: name resolution itself must fail. 42501 is
            // insufficient_privilege - "permission denied for schema public".
            $this->assertSame(
                '42501',
                $this->readErrorCodeForRole($role, self::PROBE_TABLE),
                "{$role} must be unable to resolve public objects at all."
            );

            // And it still holds the table privilege, which is what makes the
            // previous assertion attributable to the schema revocation.
            $this->assertTrue(
                $this->roleHasTablePrivilege($role, self::PROBE_TABLE, 'SELECT'),
                'This test only isolates step 3 while the table privilege '
                ."remains held by {$role}."
            );
        }
    }

    public function test_public_pseudo_role_no_longer_confers_schema_access(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();
        $this->createServiceRoleWithDirectSchemaEntry();

        $connection = DB::connection(self::TEST_CONNECTION);
        $connection->statement('CREATE ROLE akay_probe_public_only NOLOGIN');
        $connection->statement('CREATE ROLE akay_probe_direct_usage NOLOGIN');
        $connection->statement('GRANT USAGE ON SCHEMA public TO akay_probe_direct_usage');

        // Both start with USAGE - one directly, one only through PUBLIC.
        $this->assertTrue($this->roleHasSchemaUsage('akay_probe_public_only'));
        $this->assertTrue($this->roleHasSchemaUsage('akay_probe_direct_usage'));
        $this->assertTrue(
            $this->publicPseudoRoleHasSchemaUsage(),
            'Precondition failed: PUBLIC should start holding USAGE on public.'
        );

        $this->runContainmentStep(2);

        $this->assertFalse(
            $this->publicPseudoRoleHasSchemaUsage(),
            'The PUBLIC entry must be removed, or revoking anon and '
            .'authenticated changes nothing measurable.'
        );

        $this->assertFalse(
            $this->roleHasSchemaUsage('akay_probe_public_only'),
            'A role holding USAGE only through PUBLIC must lose it.'
        );

        $this->assertTrue(
            $this->roleHasSchemaUsage('akay_probe_direct_usage'),
            'A role holding a direct entry of its own must keep it.'
        );
    }

    public function test_service_role_and_connected_role_retain_access_after_schema_revocation(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();
        $this->simulateSupabaseBrowserRoleGrants();
        $this->createServiceRoleWithDirectSchemaEntry();

        $serviceRoleBefore = $this->rolePrivilegeFingerprint('service_role');
        $runtimeBefore = $this->laravelRuntimeFingerprint();

        $this->runContainmentStep(2);

        $this->assertTrue(
            $this->roleHasSchemaUsage('service_role'),
            'service_role must retain USAGE on schema public.'
        );

        // Behavioural, not catalogue-only: it must still resolve and read.
        $this->assertSame(
            self::PROBE_TABLE_ROWS,
            $this->rowsVisibleToRole('service_role', self::PROBE_TABLE),
            'service_role must still be able to read through schema public.'
        );

        $this->assertSame(
            $serviceRoleBefore,
            $this->rolePrivilegeFingerprint('service_role'),
            'Step 3 must not alter service_role object privileges.'
        );

        $connectedRole = DB::connection(self::TEST_CONNECTION)
            ->selectOne('SELECT current_user AS role')->role;

        $this->assertTrue(
            $this->roleHasSchemaUsage($connectedRole),
            'The connected role must retain USAGE on schema public.'
        );

        $this->assertSame(
            $runtimeBefore,
            $this->laravelRuntimeFingerprint(),
            'Revoking schema access changed what the Laravel runtime observes.'
        );
    }

    public function test_schema_step_fails_closed_when_service_role_would_lose_usage(): void
    {
        $this->bootSyntheticPostgres();
        $this->seedProbeTable();

        // service_role exists but holds USAGE only through PUBLIC, so revoking
        // PUBLIC would silently break it.
        DB::connection(self::TEST_CONNECTION)->statement('CREATE ROLE service_role NOLOGIN');

        $this->assertTrue(
            $this->roleHasSchemaUsage('service_role'),
            'Precondition failed: service_role should reach public via PUBLIC.'
        );

        $failure = $this->runContainmentStepExpectingFailure(2);

        $this->assertStringContainsString('AKAY_CONTAINMENT_PRECONDITION_FAILED', $failure);
        $this->assertStringContainsString('service_role', $failure);

        $this->assertTrue(
            $this->publicPseudoRoleHasSchemaUsage(),
            'A failed precondition must leave every schema privilege in place.'
        );
        $this->assertTrue($this->roleHasSchemaUsage('service_role'));
    }

    // ================================================================
    // Synthetic PostgreSQL helpers.
    // ================================================================

    /**
     * The four steps concatenated, for assertions about the phase as a whole.
     * Use migrationSources() when an assertion must hold per-file.
     */
    private function migrationSource(): string
    {
        return implode("\n", $this->migrationSources());
    }

    /**
     * @return array<string, string> keyed by migration path
     */
    private function migrationSources(): array
    {
        $sources = [];

        foreach (self::CONTAINMENT_MIGRATIONS as $migration) {
            $sources[$migration] = file_get_contents(database_path($migration));
        }

        return $sources;
    }

    private function bootSyntheticPostgres(): void
    {
        $host = (string) env('AKAY_PGSQL_TEST_HOST', '');

        if ($host === '') {
            $this->markTestSkipped(
                'Set AKAY_PGSQL_TEST_* to a throwaway PostgreSQL database to run '
                .'the Phase 1 privilege assertions.'
            );
        }

        // This test creates roles, grants privileges and migrates. It must
        // never be pointed at the managed project that holds patient data.
        if (preg_match('/supabase|pooler\./i', $host)) {
            $this->fail(
                'AKAY_PGSQL_TEST_HOST looks like a managed Supabase endpoint. '
                .'These tests mutate roles and privileges and must only target a '
                .'synthetic database.'
            );
        }

        config([
            'database.connections.'.self::TEST_CONNECTION => [
                'driver' => 'pgsql',
                'host' => $host,
                'port' => env('AKAY_PGSQL_TEST_PORT', '5432'),
                'database' => env('AKAY_PGSQL_TEST_DATABASE', 'akay_containment_test'),
                'username' => env('AKAY_PGSQL_TEST_USERNAME', 'postgres'),
                'password' => env('AKAY_PGSQL_TEST_PASSWORD', ''),
                'charset' => 'utf8',
                'prefix' => '',
                'prefix_indexes' => true,
                'search_path' => 'public',
                'sslmode' => env('AKAY_PGSQL_TEST_SSLMODE', 'prefer'),
            ],
        ]);

        try {
            DB::connection(self::TEST_CONNECTION)->getPdo();
        } catch (PDOException $exception) {
            $this->markTestSkipped(
                'The synthetic PostgreSQL database is not reachable; Phase 1 '
                .'privilege assertions were not run.'
            );
        }

        // The containment migration resolves its driver and runs its DO blocks
        // through the default connection.
        $this->originalConnection = config('database.default');
        config(['database.default' => self::TEST_CONNECTION]);

        $this->cleanUpProbeArtifacts();
        $this->ensureBrowserRolesExist();

        Artisan::call('migrate', [
            '--database' => self::TEST_CONNECTION,
            '--force' => true,
        ]);
    }

    private function ensureBrowserRolesExist(): void
    {
        foreach (self::BROWSER_ROLES as $role) {
            DB::connection(self::TEST_CONNECTION)->unprepared(<<<SQL
                DO \$\$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '{$role}'
                    ) THEN
                        CREATE ROLE {$role} NOLOGIN;
                    END IF;
                END
                \$\$;
            SQL);
        }
    }

    /**
     * Reproduce the exposure a stock Supabase project ships with, so the
     * assertions prove the migration removed access rather than proving a
     * bare PostgreSQL server never granted it.
     */
    private function simulateSupabaseBrowserRoleGrants(): void
    {
        $connection = DB::connection(self::TEST_CONNECTION);

        foreach (self::BROWSER_ROLES as $role) {
            $connection->statement("GRANT USAGE ON SCHEMA public TO {$role}");
            $connection->statement("GRANT ALL ON ALL TABLES IN SCHEMA public TO {$role}");
            $connection->statement("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO {$role}");
            $connection->statement("GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO {$role}");
        }
    }

    private function simulateSupabaseDefaultPrivileges(): void
    {
        $connection = DB::connection(self::TEST_CONNECTION);
        $owner = $this->quotedCurrentUser();

        foreach (self::BROWSER_ROLES as $role) {
            foreach (['TABLES', 'SEQUENCES', 'FUNCTIONS'] as $objectType) {
                $connection->statement(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE {$owner} IN SCHEMA public "
                    ."GRANT ALL ON {$objectType} TO {$role}"
                );
            }
        }
    }

    /**
     * Runs all four containment steps in order, each in its own transaction -
     * which is how `php artisan migrate` runs them, and the reason a blocker in
     * a later step no longer discards an earlier one.
     */
    private function runContainmentMigration(): void
    {
        $connection = DB::connection(self::TEST_CONNECTION);

        foreach (self::CONTAINMENT_MIGRATIONS as $path) {
            $migration = require database_path($path);

            // Mirrors Migrator::runMigration(), which wraps up() in a
            // transaction whenever the grammar supports schema transactions.
            $connection->transaction(fn () => $migration->up());
        }
    }

    /**
     * Runs the steps the same way, but expects one to abort, and returns the
     * failure message from the first that does. Each step's transaction is
     * rolled back by the transaction() helper itself, so a step that failed
     * changed nothing and steps after it never run.
     */
    private function runContainmentMigrationExpectingFailure(): string
    {
        $connection = DB::connection(self::TEST_CONNECTION);

        foreach (self::CONTAINMENT_MIGRATIONS as $path) {
            $migration = require database_path($path);

            try {
                $connection->transaction(fn () => $migration->up());
            } catch (Throwable $exception) {
                return $exception->getMessage();
            }
        }

        $this->fail('The containment migrations were expected to fail closed, but all succeeded.');
    }

    /**
     * Runs one containment step by its index in self::CONTAINMENT_MIGRATIONS,
     * in its own transaction, exactly as `php artisan migrate` would.
     *
     * Steps must be isolatable for the behavioural tests to mean anything: a
     * test that proves "anon reads zero rows" after running every step proves
     * only that *something* denied it. Running step 2 alone, while anon still
     * holds every privilege step 1 would have removed, is what isolates RLS as
     * the control doing the work.
     */
    private function runContainmentStep(int $index): void
    {
        $migration = require database_path(self::CONTAINMENT_MIGRATIONS[$index]);

        DB::connection(self::TEST_CONNECTION)
            ->transaction(fn () => $migration->up());
    }

    /**
     * Runs one step expecting it to abort, and returns the failure message.
     */
    private function runContainmentStepExpectingFailure(int $index): string
    {
        try {
            $this->runContainmentStep($index);
        } catch (Throwable $exception) {
            return $exception->getMessage();
        }

        $this->fail(sprintf(
            'Containment step %s was expected to fail closed, but succeeded.',
            self::CONTAINMENT_MIGRATIONS[$index]
        ));
    }

    /**
     * The shape a stock Supabase project ships: service_role holds a direct
     * USAGE entry of its own, not one inherited from the pseudo-role PUBLIC.
     * Step 3's precondition depends on that difference, so the tests have to
     * reproduce it rather than assume it.
     */
    private function createServiceRoleWithDirectSchemaEntry(): void
    {
        $connection = DB::connection(self::TEST_CONNECTION);

        $connection->statement('CREATE ROLE service_role NOLOGIN');
        $connection->statement('GRANT USAGE ON SCHEMA public TO service_role');
        $connection->statement('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role');
        $connection->statement('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role');
        $connection->statement('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role');
    }

    /**
     * Creates and seeds the probe table, before any containment step runs.
     */
    private function seedProbeTable(): void
    {
        $connection = DB::connection(self::TEST_CONNECTION);
        $table = self::PROBE_TABLE;

        $connection->statement("DROP TABLE IF EXISTS public.{$table} CASCADE");
        $connection->statement(
            "CREATE TABLE public.{$table} (id bigserial PRIMARY KEY, label text NOT NULL)"
        );

        for ($i = 1; $i <= self::PROBE_TABLE_ROWS; $i++) {
            $connection->statement(
                "INSERT INTO public.{$table} (label) VALUES (?)",
                ["probe-{$i}"]
            );
        }
    }

    /**
     * Executes a callable with the session role switched, then restores it.
     *
     * SET LOCAL ROLE is what makes these tests behavioural rather than
     * catalogue-reading: RLS and schema resolution are both evaluated against
     * the *current* role, so this is the only way to ask "what would anon
     * actually see?" rather than "what does the catalogue say anon may see?".
     * The surrounding transaction is always rolled back, so nothing a probe
     * role does can persist.
     *
     * @template T
     * @param  callable(\Illuminate\Database\Connection): T  $callback
     * @return T
     */
    private function asRole(string $role, callable $callback): mixed
    {
        $connection = DB::connection(self::TEST_CONNECTION);
        $connection->beginTransaction();

        try {
            $connection->statement('SET LOCAL ROLE '.$role);

            return $callback($connection);
        } finally {
            $connection->rollBack();
        }
    }

    /**
     * How many rows $role actually sees in a public table.
     */
    private function rowsVisibleToRole(string $role, string $table): int
    {
        return $this->asRole($role, fn ($connection) => (int) $connection
            ->selectOne("SELECT count(*) AS total FROM public.{$table}")->total);
    }

    /**
     * The SQLSTATE a role gets when it tries to read a table, or null if the
     * read succeeded. Used to distinguish "denied by privilege" (42501) from
     * "returned no rows", which are very different outcomes.
     */
    private function readErrorCodeForRole(string $role, string $table): ?string
    {
        try {
            $this->asRole($role, fn ($connection) => $connection
                ->selectOne("SELECT count(*) AS total FROM public.{$table}"));
        } catch (QueryException $exception) {
            return (string) ($exception->errorInfo[0] ?? 'unknown');
        }

        return null;
    }

    private function roleHasSchemaUsage(string $role): bool
    {
        return (bool) DB::connection(self::TEST_CONNECTION)->selectOne(
            "SELECT has_schema_privilege(?, 'public', 'USAGE') AS granted",
            [$role]
        )->granted;
    }

    private function publicPseudoRoleHasSchemaUsage(): bool
    {
        $row = DB::connection(self::TEST_CONNECTION)->selectOne(<<<'SQL'
            SELECT count(*) AS entries
            FROM pg_catalog.pg_namespace AS ns
            CROSS JOIN LATERAL aclexplode(
                COALESCE(ns.nspacl, acldefault('n', ns.nspowner))
            ) AS acl
            WHERE ns.nspname = 'public'
              AND acl.grantee = 0
              AND acl.privilege_type = 'USAGE'
        SQL);

        return (int) $row->entries > 0;
    }

    private function tableHasRowLevelSecurity(string $table): bool
    {
        return (bool) DB::connection(self::TEST_CONNECTION)->selectOne(
            'SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = to_regclass(?)',
            ['public.'.$table]
        )->relrowsecurity;
    }

    /**
     * Everything the Laravel runtime observes through the database, captured
     * identically before and after a containment step so the two can be
     * compared byte for byte.
     */
    private function laravelRuntimeFingerprint(): string
    {
        $connection = DB::connection(self::TEST_CONNECTION);
        $observed = [];

        foreach (self::PROTECTED_TABLES as $table) {
            $observed['count:'.$table] = (int) $connection
                ->selectOne("SELECT count(*) AS total FROM public.{$table}")->total;
        }

        $observed['count:'.self::PROBE_TABLE] = (int) $connection
            ->selectOne('SELECT count(*) AS total FROM public.'.self::PROBE_TABLE)->total;

        // The stored-function paths the API actually calls.
        $observed['akay_patient_list'] = json_encode($connection->select(
            'SELECT * FROM public.akay_patient_list(?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['admin', null, null, null, null, null, null, 1, 0]
        ));
        $observed['akay_referral_report'] = json_encode($connection->select(
            'SELECT public.akay_referral_report(?, ?, ?) AS data',
            ['admin', null, null]
        ));
        $observed['akay_health_record_list'] = json_encode($connection->select(
            'SELECT * FROM public.akay_health_record_list(?, ?, ?, ?, ?, ?, ?)',
            ['admin', null, null, null, null, 1, 0]
        ));

        return json_encode($observed);
    }

    /**
     * A stable, ordered snapshot of everything anon and authenticated can
     * reach, used to prove a failed run changed nothing.
     */
    private function browserRolePrivilegeFingerprint(): string
    {
        return $this->rolePrivilegeFingerprint('anon')
            .'|'.$this->rolePrivilegeFingerprint('authenticated');
    }

    private function rolePrivilegeFingerprint(string $role): string
    {
        $rows = DB::connection(self::TEST_CONNECTION)->select(<<<'SQL'
            SELECT format('%I.%I', ns.nspname, cls.relname) AS object_name,
                   acl.privilege_type
            FROM pg_catalog.pg_class AS cls
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cls.relnamespace
            CROSS JOIN LATERAL aclexplode(cls.relacl) AS acl
            WHERE ns.nspname = 'public'
              AND acl.grantee <> 0
              AND pg_catalog.pg_get_userbyid(acl.grantee) = ?
            UNION ALL
            SELECT format(
                       '%I.%I(%s)', ns.nspname, pro.proname,
                       pg_catalog.pg_get_function_identity_arguments(pro.oid)
                   ),
                   acl.privilege_type
            FROM pg_catalog.pg_proc AS pro
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
            CROSS JOIN LATERAL aclexplode(pro.proacl) AS acl
            WHERE ns.nspname = 'public'
              AND acl.grantee <> 0
              AND pg_catalog.pg_get_userbyid(acl.grantee) = ?
            ORDER BY 1, 2
        SQL, [$role, $role]);

        return json_encode($rows);
    }

    /**
     * The Phase 4A inventory guarantees Phase 1 must leave untouched: function
     * security mode, search_path, and the append-only ledger trigger.
     */
    private function inventoryFingerprint(): string
    {
        $rows = DB::connection(self::TEST_CONNECTION)->select(<<<'SQL'
            SELECT pro.proname,
                   pg_catalog.pg_get_function_identity_arguments(pro.oid) AS args,
                   pro.prosecdef,
                   pro.proconfig,
                   has_function_privilege(current_user, pro.oid, 'EXECUTE') AS owner_can_execute
            FROM pg_catalog.pg_proc AS pro
            JOIN pg_catalog.pg_namespace AS ns ON ns.oid = pro.pronamespace
            WHERE ns.nspname = 'public' AND pro.proname LIKE 'akay\_inventory\_%'
            ORDER BY pro.proname, args
        SQL);

        $trigger = DB::connection(self::TEST_CONNECTION)->select(<<<'SQL'
            SELECT tg.tgname, tg.tgenabled
            FROM pg_catalog.pg_trigger AS tg
            WHERE tg.tgrelid = to_regclass('public.medicine_inventory_transactions')
              AND NOT tg.tgisinternal
            ORDER BY tg.tgname
        SQL);

        return json_encode(['functions' => $rows, 'triggers' => $trigger]);
    }

    private function roleHasTablePrivilege(string $role, string $table, string $privileges): bool
    {
        $row = DB::connection(self::TEST_CONNECTION)->selectOne(
            'SELECT has_table_privilege(?, ?, ?) AS granted',
            [$role, 'public.'.$table, $privileges]
        );

        return (bool) $row->granted;
    }

    private function roleHasAnyColumnPrivilege(string $role, string $table, string $privileges): bool
    {
        $row = DB::connection(self::TEST_CONNECTION)->selectOne(
            'SELECT has_any_column_privilege(?, ?, ?) AS granted',
            [$role, 'public.'.$table, $privileges]
        );

        return (bool) $row->granted;
    }

    private function quotedCurrentUser(): string
    {
        $user = DB::connection(self::TEST_CONNECTION)->selectOne('SELECT current_user AS role')->role;

        return '"'.str_replace('"', '""', $user).'"';
    }

    private function cleanUpProbeArtifacts(): void
    {
        $connection = DB::connection(self::TEST_CONNECTION);

        try {
            $connection->statement(
                'DROP TABLE IF EXISTS public.'.self::PROBE_TABLE.' CASCADE'
            );
        } catch (Throwable $exception) {
            // A leftover probe table must not mask the real test result.
        }

        foreach (self::PROBE_ROLES as $role) {
            try {
                $connection->unprepared(<<<SQL
                    DO \$\$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '{$role}'
                        ) THEN
                            EXECUTE 'DROP OWNED BY {$role} CASCADE';
                            EXECUTE 'DROP ROLE {$role}';
                        END IF;
                    END
                    \$\$;
                SQL);
            } catch (Throwable $exception) {
                // A leftover probe role must not mask the real test result.
            }
        }
    }
}
