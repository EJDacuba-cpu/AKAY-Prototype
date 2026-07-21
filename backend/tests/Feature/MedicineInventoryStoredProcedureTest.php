<?php

namespace Tests\Feature;

use App\Services\MedicineStockService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use PDOException;
use ReflectionMethod;
use Tests\TestCase;

class MedicineInventoryStoredProcedureTest extends TestCase
{
    private string $sql;
    private string $ledgerMigration;

    protected function setUp(): void
    {
        parent::setUp();

        $path = database_path('migrations/2026_07_21_000002_create_akay_inventory_functions.php');
        $this->sql = file_get_contents($path);
        $this->ledgerMigration = file_get_contents(
            database_path('migrations/2026_07_21_000001_create_medicine_inventory_transactions_table.php')
        );
    }

    public function test_migration_defines_all_inventory_functions_as_security_invoker(): void
    {
        foreach ([
            'akay_inventory_opening_balance',
            'akay_inventory_restock',
            'akay_inventory_adjust',
            'akay_inventory_dispense_batch',
        ] as $function) {
            $this->assertStringContainsString("FUNCTION public.{$function}", $this->sql);
        }

        $this->assertSame(6, substr_count($this->sql, 'SECURITY INVOKER'));
        $this->assertStringNotContainsString('SECURITY DEFINER', $this->sql);
        $this->assertSame(6, substr_count($this->sql, 'SET search_path = pg_catalog, public'));
    }

    public function test_migration_revokes_public_and_browser_role_execution_without_grants(): void
    {
        $this->assertStringContainsString('REVOKE ALL ON FUNCTION public.', $this->sql);
        $this->assertStringContainsString("ARRAY['anon', 'authenticated']", $this->sql);
        $this->assertStringNotContainsString('GRANT EXECUTE', $this->sql);
        $this->assertStringNotContainsString('service_role', $this->sql);
        $this->assertStringContainsString('medicine_inventory_transactions_append_only', $this->sql);
        $this->assertStringContainsString('akay_inventory_actor_has_facility', $this->sql);
    }

    public function test_batch_function_locks_in_order_validates_before_updates_and_has_explicit_down_signatures(): void
    {
        $batchStart = strpos($this->sql, 'CREATE OR REPLACE FUNCTION public.akay_inventory_dispense_batch');
        $batchSql = substr($this->sql, $batchStart);

        $this->assertStringContainsString("ORDER BY (item.value ->> 'medicine_id')::bigint", $batchSql);
        $this->assertStringContainsString('FOR UPDATE;', $batchSql);
        $this->assertLessThan(
            strpos($batchSql, 'UPDATE public.medicines AS m'),
            strpos($batchSql, "MESSAGE = 'INSUFFICIENT_STOCK'")
        );
        $this->assertStringContainsString('DROP FUNCTION IF EXISTS public.', $this->sql);
        $this->assertStringContainsString('bigint,text,bigint,text,bigint,text,jsonb', $this->sql);
    }

    public function test_functions_use_schema_qualified_inventory_tables_and_no_clinical_payload_fields(): void
    {
        $this->assertStringContainsString('public.medicines', $this->sql);
        $this->assertStringContainsString('public.medicine_inventory_transactions', $this->sql);
        $this->assertStringNotContainsString('patient_name', $this->sql);
        $this->assertStringNotContainsString('diagnosis', $this->sql);
        $this->assertStringNotContainsString('bearer', strtolower($this->sql));
        $this->assertStringNotContainsString('qr_token', strtolower($this->sql));
    }

    public function test_operation_key_is_required_and_composite_unique(): void
    {
        $this->assertStringContainsString("\$table->string('operation_key', 120);", $this->ledgerMigration);
        $this->assertStringNotContainsString("\$table->string('operation_key', 120)->nullable()", $this->ledgerMigration);
        $this->assertStringContainsString("['operation_key', 'medicine_id']", $this->ledgerMigration);
        $this->assertStringContainsString(
            'medicine_inventory_transactions_operation_medicine_unique',
            $this->ledgerMigration
        );
    }

    public function test_duplicate_checks_follow_row_locks_and_precede_quantity_updates(): void
    {
        foreach ([
            'akay_inventory_opening_balance',
            'akay_inventory_restock',
            'akay_inventory_adjust',
            'akay_inventory_dispense_batch',
        ] as $function) {
            $section = $this->functionSection($function);
            $lock = strpos($section, 'FOR UPDATE;');
            $duplicate = strpos($section, "MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED'");
            $update = strpos($section, 'UPDATE public.medicines AS m');

            $this->assertNotFalse($lock, "{$function} must lock medicine rows.");
            $this->assertNotFalse($duplicate, "{$function} must detect duplicate operations.");
            $this->assertNotFalse($update, "{$function} must update through the controlled path.");
            $this->assertLessThan($duplicate, $lock);
            $this->assertLessThan($update, $duplicate);
        }

        $batch = $this->functionSection('akay_inventory_dispense_batch');
        $this->assertLessThan(
            strpos($batch, "MESSAGE = 'INSUFFICIENT_STOCK'"),
            strpos($batch, "MESSAGE = 'INVENTORY_OPERATION_ALREADY_APPLIED'")
        );
    }

    public function test_unique_violation_is_mapped_without_raw_postgresql_details(): void
    {
        $databaseMessage = 'duplicate key value violates unique constraint '
            .'"medicine_inventory_transactions_operation_medicine_unique"';
        $previous = new PDOException($databaseMessage);
        $previous->errorInfo = ['23505', 7, $databaseMessage];
        $exception = new QueryException(
            'pgsql',
            'insert into private_schema.private_table values (?)',
            ['private-value'],
            $previous
        );
        $method = new ReflectionMethod(MedicineStockService::class, 'throwMappedDatabaseError');

        try {
            $method->invoke(app(MedicineStockService::class), $exception);
            $this->fail('Expected the unique violation to map to a safe inventory response.');
        } catch (HttpResponseException $mapped) {
            $payload = $mapped->getResponse()->getData(true);
            $encoded = json_encode($payload, JSON_THROW_ON_ERROR);

            $this->assertSame(409, $mapped->getResponse()->getStatusCode());
            $this->assertSame('INVENTORY_OPERATION_ALREADY_APPLIED', $payload['code']);
            $this->assertStringNotContainsString('private_schema', $encoded);
            $this->assertStringNotContainsString('private-value', $encoded);
            $this->assertStringNotContainsString('unique constraint', $encoded);
        }
    }

    public function test_adjust_direction_and_bhc_only_dispensing_are_explicit_in_sql(): void
    {
        $this->assertStringContainsString(
            "p_action = 'correction' AND COALESCE(p_direction, '') NOT IN ('in', 'out')",
            $this->sql
        );
        $this->assertStringContainsString(
            "p_action <> 'correction' AND btrim(COALESCE(p_direction, '')) <> ''",
            $this->sql
        );
        $this->assertStringContainsString("p_facility_type <> 'bhc'", $this->sql);
        $this->assertStringContainsString('hr.barangay_health_center_id = p_facility_id', $this->sql);
    }

    public function test_runtime_role_preflight_contains_privilege_checks_without_secrets(): void
    {
        $preflight = file_get_contents(base_path('../docs/medicine-inventory-preflight.sql'));
        $verification = file_get_contents(base_path('../docs/medicine-inventory-postgresql-verification.md'));
        $combined = $preflight."\n".$verification;

        foreach ([
            'current_database_user',
            'function_owner',
            'runtime_role_can_execute',
            'public_execute_is_revoked',
            "VALUES ('anon'), ('authenticated')",
            'has_table_privilege',
            'has_sequence_privilege',
            'runtime_role_placeholder',
        ] as $expected) {
            $this->assertStringContainsString($expected, $combined);
        }

        foreach (['DB_PASSWORD', 'DATABASE_URL=', 'postgres://', 'postgresql://'] as $secretPattern) {
            $this->assertStringNotContainsString($secretPattern, $combined);
        }
    }

    public function test_preflight_is_safe_before_and_after_phase_4a_migrations(): void
    {
        $preflight = file_get_contents(base_path('../docs/medicine-inventory-preflight.sql'));
        $postMigrationStart = strpos($preflight, '-- POST-MIGRATION VERIFICATION');

        $this->assertStringContainsString('-- PRE-MIGRATION CHECKS', $preflight);
        $this->assertNotFalse($postMigrationStart);

        $preMigration = substr($preflight, 0, $postMigrationStart);
        $postMigration = substr($preflight, $postMigrationStart);

        foreach ([
            'public.medicines',
            'public.health_record_medicines',
            'blocker_negative_medicine_quantities',
            'blocker_medicines_with_both_bhc_and_rhu',
            'blocker_medicines_with_neither_facility',
            'blocker_orphaned_health_record_medicine_references',
            'informational_expired_positive_stock',
        ] as $expected) {
            $this->assertStringContainsString($expected, $preMigration);
        }

        $this->assertStringNotContainsString('public.health_records', $preMigration);
        $this->assertStringNotContainsString('medicine_inventory_transactions', $preMigration);

        foreach ([
            "to_regclass('public.medicine_inventory_transactions')",
            'to_regprocedure(function_signature)',
            'SKIPPED: Phase 4A migrations pending',
            'DO $ledger_data_checks$',
            'null operation keys',
            'duplicate (operation_key, medicine_id) pairs',
            'UNIQUE (operation_key, medicine_id)',
            'append-only trigger',
            'SECURITY INVOKER',
            'runtime_role_can_execute',
            'public_execute_is_revoked',
            "VALUES ('anon'), ('authenticated')",
        ] as $expected) {
            $this->assertStringContainsString($expected, $postMigration);
        }

        $this->assertStringNotContainsString("\nFROM public.medicine_inventory_transactions", $postMigration);
        $this->assertStringNotContainsString('CREATE TEMP', strtoupper($preflight));
        $this->assertStringNotContainsString('INSERT INTO', strtoupper($preflight));
        $this->assertStringNotContainsString('UPDATE public.', $preflight);
        $this->assertStringNotContainsString('DELETE FROM', strtoupper($preflight));
    }

    private function functionSection(string $function): string
    {
        $start = strpos($this->sql, "CREATE OR REPLACE FUNCTION public.{$function}");
        $next = strpos($this->sql, 'CREATE OR REPLACE FUNCTION public.', $start + 1);

        return substr($this->sql, $start, $next === false ? null : $next - $start);
    }
}
