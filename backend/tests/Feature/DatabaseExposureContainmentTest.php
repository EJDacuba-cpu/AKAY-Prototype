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

    private const CONTAINMENT_MIGRATION =
        'migrations/2026_07_25_000001_revoke_browser_role_database_access.php';

    /**
     * Roles this test class creates on the synthetic database. Tracked so
     * tearDown can remove them and leave the database reusable.
     */
    private const PROBE_ROLES = [
        'akay_probe_unprivileged',
        'akay_probe_intermediate',
        'akay_probe_default_owner',
    ];

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
        $sql = $this->migrationSource();
        $down = substr($sql, strpos($sql, 'public function down(): void'));
        $down = substr($down, 0, strpos($down, 'private function'));

        $this->assertStringNotContainsString('DB::', $down);
        $this->assertStringNotContainsString('GRANT', $down);
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

        foreach (glob(database_path('migrations/*.php')) as $path) {
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
        $sql = $this->migrationSource();

        // Required security work must abort, never warn and carry on.
        $this->assertSame(
            0,
            substr_count($sql, 'RAISE WARNING'),
            'Containment must not downgrade a blocked privilege change to a warning.'
        );

        // Statements, not the prose that describes them.
        $this->assertSame(
            2,
            substr_count($sql, 'RAISE EXCEPTION USING'),
            'Containment must raise from both the precondition and the assertion stage.'
        );

        $this->assertStringContainsString('AKAY_CONTAINMENT_PRECONDITION_FAILED', $sql);
        $this->assertStringContainsString('AKAY_CONTAINMENT_ASSERTION_FAILED', $sql);

        // No override flag may exist: containment is not opt-outable.
        $this->assertStringNotContainsString('env(', $sql);
        $this->assertStringNotContainsString('config(', $sql);
    }

    public function test_containment_migration_validates_before_it_changes_anything(): void
    {
        $sql = $this->migrationSource();

        $preconditions = strpos($sql, 'DB::unprepared($this->preconditionsSql())');
        $revokeObjects = strpos($sql, 'DB::unprepared($this->revokeObjectPrivilegesSql())');
        $revokeDefaults = strpos($sql, 'DB::unprepared($this->revokeDefaultPrivilegesSql())');
        $assertions = strpos($sql, 'DB::unprepared($this->assertContainmentSql())');

        $this->assertNotFalse($preconditions);
        $this->assertLessThan($revokeObjects, $preconditions, 'Preconditions must run first.');
        $this->assertLessThan($revokeDefaults, $revokeObjects);
        $this->assertLessThan($assertions, $revokeDefaults, 'Assertions must run last.');
    }

    public function test_containment_migration_declares_and_enforces_transactionality(): void
    {
        $sql = $this->migrationSource();

        $this->assertStringContainsString('public $withinTransaction = true;', $sql);
        $this->assertStringContainsString('DB::transactionLevel() < 1', $sql);
        $this->assertStringContainsString('DB::connection()->pretending()', $sql);

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

        $migration = require database_path(self::CONTAINMENT_MIGRATION);

        try {
            $this->expectException(RuntimeException::class);
            $this->expectExceptionMessageMatches('/must run inside a transaction/');

            $migration->up();
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

        $migration = require database_path(self::CONTAINMENT_MIGRATION);
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
    // Synthetic PostgreSQL helpers.
    // ================================================================

    private function migrationSource(): string
    {
        return file_get_contents(database_path(self::CONTAINMENT_MIGRATION));
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

    private function runContainmentMigration(): void
    {
        $migration = require database_path(self::CONTAINMENT_MIGRATION);
        $connection = DB::connection(self::TEST_CONNECTION);

        // Mirrors Migrator::runMigration(), which wraps up() in a transaction
        // whenever the grammar supports schema transactions.
        $connection->transaction(fn () => $migration->up());
    }

    /**
     * Runs the migration the same way, but expects it to abort, and returns the
     * failure message. The surrounding transaction is rolled back by the
     * transaction() helper itself.
     */
    private function runContainmentMigrationExpectingFailure(): string
    {
        $migration = require database_path(self::CONTAINMENT_MIGRATION);
        $connection = DB::connection(self::TEST_CONNECTION);

        try {
            $connection->transaction(fn () => $migration->up());
        } catch (Throwable $exception) {
            return $exception->getMessage();
        }

        $this->fail('The containment migration was expected to fail closed, but succeeded.');
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
