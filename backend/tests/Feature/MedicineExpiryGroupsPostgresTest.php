<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** No application migrations: every object lives in a randomly named disposable schema. */
class MedicineExpiryGroupsPostgresTest extends TestCase
{
    /** Static boundary guard only; the integration test below requires PostgreSQL. */
    public function test_expiry_uses_wall_clock_after_acquiring_group_locks(): void
    {
        $sql = file_get_contents(database_path('sql/medicine_expiry_group_operations.sql'));
        $lock = strpos($sql, 'ORDER BY id FOR UPDATE;');
        $clock = strpos($sql, "today := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;");
        $this->assertNotFalse($clock, 'Transaction-start time can become stale while waiting across midnight.');
        $this->assertGreaterThan($lock, $clock);
        $this->assertStringNotContainsString("CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'", $sql);
    }

    public function test_group_operations_preserve_physical_balances_and_audit_history(): void
    {
        if (! getenv('AKAY_TEST_PG_URL')) {
            $this->markTestSkipped('AKAY_TEST_PG_URL is required for PostgreSQL expiry-group verification.');
        }
        $schema = 'akay_expiry_test_'.bin2hex(random_bytes(8));
        config(['database.connections.expiry_test' => ['driver' => 'pgsql', 'url' => getenv('AKAY_TEST_PG_URL'), 'charset' => 'utf8', 'prefix' => '', 'search_path' => $schema, 'sslmode' => 'prefer']]);
        DB::purge('expiry_test');
        $db = DB::connection('expiry_test');
        $db->statement('CREATE SCHEMA "'.$schema.'"');
        try {
            $db->statement('SET search_path TO "'.$schema.'"');
            $db->unprepared(<<<'SQL'
                CREATE TABLE medicines (id bigserial PRIMARY KEY, quantity integer NOT NULL DEFAULT 0, item_type text NOT NULL DEFAULT 'medicine', expiration_date date, barangay_health_center_id bigint, rural_health_unit_id bigint, is_active boolean DEFAULT true, reconciliation_required boolean DEFAULT false, low_stock_threshold integer DEFAULT 10, availability_status text, updated_by bigint, updated_at timestamp);
                CREATE TABLE health_records (id bigint PRIMARY KEY, barangay_health_center_id bigint);
                INSERT INTO health_records VALUES (1,1);
                CREATE TABLE medicine_inventory_transactions (id bigserial PRIMARY KEY, medicine_id bigint REFERENCES medicines, actor_user_id bigint, transaction_type text, quantity_delta integer, quantity_before bigint, quantity_after bigint, discrepancy integer DEFAULT 0, source_type text, source_id bigint, reason text, operation_key varchar(120), created_at timestamp, UNIQUE(operation_key,medicine_id));
                CREATE TABLE medicine_expiry_groups (id bigserial PRIMARY KEY, medicine_id bigint REFERENCES medicines, expiration_date date, expiry_not_applicable boolean NOT NULL DEFAULT false, available_quantity integer NOT NULL DEFAULT 0, quarantined_quantity integer NOT NULL DEFAULT 0, created_at timestamp, updated_at timestamp);
                CREATE TABLE medicine_inventory_allocations (id bigserial PRIMARY KEY, transaction_id bigint REFERENCES medicine_inventory_transactions, expiry_group_id bigint REFERENCES medicine_expiry_groups, available_before integer, available_delta integer, available_after integer, quarantined_before integer, quarantined_delta integer, quarantined_after integer, created_at timestamp);
                SQL);
            // Actor authorization is separately covered by existing role/assignment tests.
            $db->unprepared('CREATE FUNCTION '.$schema.'.akay_inventory_actor_has_facility(bigint,text,bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = 1 AND $2 = \'bhc\' AND $3 = 1 $$');
            foreach (['medicine_expiry_group_constraints.sql', 'medicine_expiry_group_operations.sql'] as $file) {
                $sql = str_replace(['public.', 'pg_catalog, public'], [$schema.'.', 'pg_catalog, '.$schema], file_get_contents(database_path('sql/'.$file)));
                $db->unprepared($sql);
            }
            $db->table('medicines')->insert(['id' => 1, 'barangay_health_center_id' => 1, 'quantity' => 7]);
            $operation = function (string $action, int $quantity, array $options = [], ?string $key = null, int $medicine = 1) use ($db) {
                return json_decode($db->selectOne('SELECT akay_inventory_group_operation(?,1,\'bhc\',1,?,?,?, ?,?::jsonb) AS result', [$medicine, $action, $quantity, 'Physical inventory test', $key ?? bin2hex(random_bytes(8)), json_encode($options)])->result, true);
            };
            $date = now('Asia/Manila')->addDays(2)->toDateString();
            $operation('restock', 10, ['expiration_date' => $date]);
            $operation('restock', 5, ['expiration_date' => $date]);
            $this->assertSame(1, $db->table('medicine_expiry_groups')->count());
            $group = (int) $db->table('medicine_expiry_groups')->value('id');
            $quarantine = $operation('quarantine', 4, ['expiry_group_id' => $group]);
            $this->assertSame(0, $quarantine['quantity_delta']);
            $operation('release', 1, ['expiry_group_id' => $group]);
            $operation('quarantine_disposal', 2, ['expiry_group_id' => $group]);
            $db->select('SELECT * FROM akay_inventory_dispense_batch(1,\'bhc\',1,\'health_record\',1,\'dispense-test\',?::jsonb)', [json_encode([['medicine_id' => 1, 'quantity' => 20]])]);
            $this->assertSame(8, (int) $db->table('medicines')->value('quantity')); // 7 unassigned + 1 quarantined.
            $ledger = $db->table('medicine_inventory_transactions')->where('transaction_type', 'dispense')->first();
            $this->assertSame(-20, (int) $ledger->quantity_delta);
            $this->assertSame(-8, (int) $ledger->discrepancy);
            $this->assertSame((int) $ledger->quantity_before + (int) $ledger->quantity_delta, (int) $ledger->quantity_after + (int) $ledger->discrepancy);
            foreach ([
                "SELECT * FROM akay_inventory_restock(1,1,'bhc',1,1,'test','unsafe')",
                'UPDATE medicine_inventory_allocations SET available_delta = 0',
                'UPDATE medicine_expiry_groups SET available_quantity = -1',
            ] as $unsafe) {
                try {
                    $db->statement($unsafe);
                    $this->fail('Unsafe mutation was accepted.');
                } catch (QueryException $exception) {
                    $this->assertNotEmpty($exception->getCode());
                }
            }
            $this->assertSame(6, $db->table('medicine_inventory_transactions')->count());

            $expected = [['id' => $group, 'available_quantity' => 0, 'quarantined_quantity' => 1]];
            $verification = ['groups' => [['id' => $group, 'available_quantity' => 2, 'quarantined_quantity' => 1]], 'unassigned_quantity' => 6, 'expected_groups' => $expected, 'expected_unassigned_quantity' => 7];
            $operation('verify_stock', 0, $verification);
            $this->assertFalse((bool) $db->table('medicines')->where('id', 1)->value('reconciliation_required'));
            try {
                $operation('verify_stock', 0, $verification);
                $this->fail('Stale verification accepted.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('INVENTORY_SNAPSHOT_CONFLICT', $exception->getMessage());
            }

            $db->table('medicines')->insert(['id' => 2, 'barangay_health_center_id' => 1, 'item_type' => 'health_supply']);
            $operation('restock', 5, ['expiration_date' => now('Asia/Manila')->addDays(3)->toDateString()], null, 2);
            $operation('restock', 5, ['expiration_date' => now('Asia/Manila')->toDateString()], null, 2);
            $operation('restock', 5, ['expiry_not_applicable' => true], null, 2);
            $db->select('SELECT * FROM akay_inventory_dispense_batch(1,\'bhc\',1,\'health_record\',1,\'fefo-test\',?::jsonb)', [json_encode([['medicine_id' => 2, 'quantity' => 7]])]);
            $supplyGroups = $db->table('medicine_expiry_groups')->where('medicine_id', 2)->orderBy('id')->get();
            $this->assertSame([3, 0, 5], $supplyGroups->map(fn ($row) => (int) $row->available_quantity)->all());
            $db->select('SELECT * FROM akay_inventory_dispense_batch(1,\'bhc\',1,\'health_record\',1,\'explicit-empty\',?::jsonb)', [json_encode([['medicine_id' => 2, 'quantity' => 4, 'allocations' => [], 'override_reason' => 'Actual unrecorded supply']])]);
            $this->assertSame(8, (int) $db->table('medicines')->where('id', 2)->value('quantity'));
            $this->assertSame(-4, (int) $db->table('medicine_inventory_transactions')->where('operation_key', 'explicit-empty')->value('discrepancy'));
            try {
                $db->select('SELECT * FROM akay_inventory_dispense_batch(1,\'bhc\',1,\'health_record\',1,\'overdraw-test\',?::jsonb)', [json_encode([['medicine_id' => 2, 'quantity' => 4, 'allocations' => [['expiry_group_id' => $supplyGroups[0]->id, 'quantity' => 4]], 'override_reason' => 'Overdraw test']])]);
                $this->fail('Overdrawn manual allocation accepted.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('INVENTORY_CONFLICT', $exception->getMessage());
            }
            $this->assertSame(0, $db->table('medicine_inventory_transactions')->where('operation_key', 'overdraw-test')->count());

            // Real independent sessions contend for the same medicine and same new date.
            $db->table('medicines')->insert(['id' => 3, 'barangay_health_center_id' => 1]);
            $workerCode = <<<'PHP'
                require 'vendor/autoload.php';
                $app = require 'bootstrap/app.php';
                $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
                config(['database.connections.expiry_worker' => ['driver'=>'pgsql','url'=>getenv('AKAY_TEST_PG_URL'),'charset'=>'utf8','prefix'=>'','search_path'=>$argv[1],'sslmode'=>'prefer']]);
                $db = Illuminate\Support\Facades\DB::connection('expiry_worker');
                try {
                    if (($argv[3] ?? '') === 'dispense') {
                        $db->select('SELECT * FROM akay_inventory_dispense_batch(1,\'bhc\',1,\'health_record\',1,?,?::jsonb)', [$argv[2],json_encode([['medicine_id'=>3,'quantity'=>15]])]);
                    } elseif (in_array($argv[3] ?? '', ['quarantine', 'quarantine_disposal'], true)) {
                        $groupId = $db->table('medicine_expiry_groups')->where('medicine_id', 3)->value('id');
                        $db->select('SELECT akay_inventory_group_operation(3,1,\'bhc\',1,?,5,\'Concurrent disposition\',?,?::jsonb)', [$argv[3],$argv[2],json_encode(['expiry_group_id'=>$groupId])]);
                    } else {
                        $db->select('SELECT akay_inventory_group_operation(3,1,\'bhc\',1,\'restock\',10,\'Concurrent receipt\',?,?::jsonb)', [$argv[2],json_encode(['expiration_date'=>'2099-01-01'])]);
                    }
                } catch (Throwable $error) { fwrite(STDERR, 'PostgreSQL worker failed.'); exit(1); }
                PHP;
            $workers = [];
            try {
                // Hold the shared medicine lock until both writers have started.
                $db->beginTransaction();
                $db->select('SELECT id FROM medicines WHERE id = 3 FOR UPDATE');
                foreach (['parallel-a', 'parallel-b'] as $key) {
                    $worker = new Process([PHP_BINARY, '-r', $workerCode, $schema, $key], base_path(), null, null, 30);
                    $worker->start();
                    $workers[] = $worker;
                }
                $db->commit();
                foreach ($workers as $worker) {
                    $worker->wait();
                    $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
                }
                $this->assertSame(1, $db->table('medicine_expiry_groups')->where('medicine_id', 3)->count());
                $this->assertSame(20, (int) $db->table('medicines')->where('id', 3)->value('quantity'));
                try {
                    $operation('restock', 10, ['expiration_date' => '2099-01-01'], 'parallel-a', 3);
                    $this->fail('Receipt replay mutated stock.');
                } catch (QueryException $exception) {
                    $this->assertStringContainsString('INVENTORY_OPERATION_ALREADY_APPLIED', $exception->getMessage());
                }
                $this->assertSame(20, (int) $db->table('medicines')->where('id', 3)->value('quantity'));
                $db->beginTransaction();
                $db->select('SELECT id FROM medicines WHERE id = 3 FOR UPDATE');
                foreach (['parallel-dispense-a', 'parallel-dispense-b'] as $key) {
                    $worker = new Process([PHP_BINARY, '-r', $workerCode, $schema, $key, 'dispense'], base_path(), null, null, 30);
                    $worker->start();
                    $workers[] = $worker;
                }
                $db->commit();
                foreach (array_slice($workers, 2) as $worker) {
                    $worker->wait();
                    $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
                }
                $this->assertSame(0, (int) $db->table('medicines')->where('id', 3)->value('quantity'));
                $this->assertSame(0, (int) $db->table('medicine_expiry_groups')->where('medicine_id', 3)->value('available_quantity'));
                $this->assertSame(-10, (int) $db->table('medicine_inventory_transactions')->where('medicine_id', 3)->sum('discrepancy'));

                // Each pair has sufficient physical pools in either lock order.
                // Dispensing may record shortage; quarantined stock is never substituted.
                foreach (['quarantine', 'quarantine_disposal'] as $disposition) {
                    $operation('restock', 20, ['expiration_date' => '2099-01-01'], null, 3);
                    $pair = [];
                    $db->beginTransaction();
                    $db->select('SELECT id FROM medicines WHERE id = 3 FOR UPDATE');
                    foreach (['dispense', $disposition] as $mode) {
                        $worker = new Process([PHP_BINARY, '-r', $workerCode, $schema, $disposition.'-'.$mode, $mode], base_path(), null, null, 30);
                        $worker->start();
                        $pair[] = $worker;
                        $workers[] = $worker;
                    }
                    $db->commit();
                    foreach ($pair as $worker) {
                        $worker->wait();
                        $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput());
                    }
                    $physical = $db->table('medicine_expiry_groups')->where('medicine_id', 3)->first();
                    $this->assertSame((int) $physical->available_quantity + (int) $physical->quarantined_quantity, (int) $db->table('medicines')->where('id', 3)->value('quantity'));
                    $this->assertSame($disposition === 'quarantine' ? 5 : 0, (int) $physical->quarantined_quantity);
                }
            } finally {
                if ($db->transactionLevel() > 0) {
                    $db->rollBack();
                }
                foreach ($workers as $worker) {
                    if ($worker->isRunning()) {
                        $worker->stop();
                    }
                }
            }
        } finally {
            $db->statement('DROP SCHEMA "'.$schema.'" CASCADE');
            DB::purge('expiry_test');
        }
    }
}
