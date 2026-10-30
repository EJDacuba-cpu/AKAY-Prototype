<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Opt in with AKAY_TEST_PG_URL pointing to a disposable PostgreSQL database. */
class HouseholdFsnPostgresConcurrencyTest extends TestCase
{
    public function test_independent_postgres_writers_allocate_and_override_without_duplicates(): void
    {
        if (! getenv('AKAY_TEST_PG_URL')) {
            $this->markTestSkipped('AKAY_TEST_PG_URL is required for actual PostgreSQL concurrency verification.');
        }
        $schema = 'akay_fsn_test_'.bin2hex(random_bytes(8));
        config(['database.connections.fsn_test' => ['driver' => 'pgsql', 'url' => getenv('AKAY_TEST_PG_URL'), 'charset' => 'utf8', 'prefix' => '', 'search_path' => $schema, 'sslmode' => 'prefer']]);
        DB::purge('fsn_test');
        $db = DB::connection('fsn_test');
        // The random, test-owned schema is the only namespace mutated. Public
        // tables and the production migration history are never touched.
        $db->statement('CREATE SCHEMA "'.$schema.'"');
        $workers = [];
        try {
            $db->statement('SET search_path TO "'.$schema.'"');
            $db->statement('CREATE TABLE households (id bigserial primary key, barangay_health_center_id bigint NOT NULL, serial_number varchar(100) NOT NULL, UNIQUE(barangay_health_center_id, serial_number))');
            $db->statement('CREATE TABLE patients (id bigserial primary key, barangay_health_center_id bigint, household_id bigint, family_serial_number varchar(100))');
            $db->statement('CREATE TABLE household_fsn_counters (barangay_health_center_id bigint NOT NULL, year integer NOT NULL, last_number bigint NOT NULL DEFAULT 0, PRIMARY KEY(barangay_health_center_id, year))');
            $db->unprepared(file_get_contents(database_path('sql/allocate_household_fsn.sql')));
            foreach (['auto', 'auto', 'manual', 'auto', 'manual', 'auto'] as $mode) {
                $process = new Process([PHP_BINARY, base_path('tests/Support/household_fsn_pg_worker.php'), $schema, $mode], base_path(), null, null, 30);
                $process->start();
                $workers[] = $process;
            }
            foreach ($workers as $worker) {
                $worker->wait();
                $this->assertTrue($worker->isSuccessful(), 'PostgreSQL worker failed: '.$worker->getErrorOutput());
            }
            $this->assertSame(5, $db->table('households')->count());
            $this->assertSame(5, $db->table('households')->distinct()->count('serial_number'));
            $this->assertSame(1, $db->table('households')->where('serial_number', 'FSN-'.now('Asia/Manila')->year.'-0050')->count());
            $this->assertGreaterThanOrEqual(50, $db->table('household_fsn_counters')->value('last_number'));
            // Counter increments are transactional: a rolled-back allocation
            // is available to the next successful transaction.
            $before = (int) $db->table('household_fsn_counters')->value('last_number');
            $db->beginTransaction();
            $db->select('SELECT akay_allocate_household_fsn(1, ?) AS serial', [now('Asia/Manila')->year]);
            $db->rollBack();
            $this->assertSame($before, (int) $db->table('household_fsn_counters')->value('last_number'));
        } finally {
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop();
                }
            }
            $db->statement('DROP SCHEMA "'.$schema.'" CASCADE');
            DB::purge('fsn_test');
        }
    }
}
