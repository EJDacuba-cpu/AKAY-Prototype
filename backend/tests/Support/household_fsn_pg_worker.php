<?php

use App\Services\HouseholdSerialAllocator;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// Standalone process used only by HouseholdFsnPostgresConcurrencyTest.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$schema = $argv[1] ?? '';
if (! preg_match('/^akay_fsn_test_[a-f0-9]{16}$/', $schema) || ! getenv('AKAY_TEST_PG_URL')) {
    exit(2);
}
config(['database.default' => 'fsn_test', 'database.connections.fsn_test' => ['driver' => 'pgsql', 'url' => getenv('AKAY_TEST_PG_URL'), 'charset' => 'utf8', 'prefix' => '', 'search_path' => $schema, 'sslmode' => 'prefer']]);
DB::purge('fsn_test');
$db = DB::connection('fsn_test');
$allocator = $app->make(HouseholdSerialAllocator::class);
try {
    $serial = $db->transaction(function () use ($db, $allocator, $argv) {
        $serial = ($argv[2] ?? '') === 'manual'
            ? $allocator->manual(1, 'FSN-'.now('Asia/Manila')->year.'-0050', 'serial_number')
            : $allocator->allocate(1);
        $db->table('households')->insert(['barangay_health_center_id' => 1, 'serial_number' => $serial]);
        // Hold the transaction briefly so independent writers actually overlap.
        $db->select('SELECT pg_sleep(0.05)');

        return $serial;
    });
    echo $serial;
} catch (ValidationException $exception) {
    echo 'occupied';
} catch (Throwable $exception) {
    // Never expose DSN, credentials or query bindings in child-process output.
    fwrite(STDERR, get_class($exception));
    exit(1);
}
