<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\MedicineController;
use ReflectionMethod;
use Tests\TestCase;

class MedicineCatalogAdvisoryLockTest extends TestCase
{
    public function test_advisory_lock_keys_fit_postgres_int4(): void
    {
        $method = new ReflectionMethod(MedicineController::class, 'advisoryLockKey');

        // The failing production key was an unsigned crc32 above int4 max.
        $overflowing = $method->invoke(null, 'medicine-catalog:bhc:1:overflow-probe:medicine:tablet');
        $this->assertIsInt($overflowing);
        $this->assertGreaterThanOrEqual(-2147483648, $overflowing);
        $this->assertLessThanOrEqual(2147483647, $overflowing);

        // Known unsigned crc32 that previously blew up pg_advisory_xact_lock.
        $crc = crc32('medicine-catalog:bhc:1:paracetamol:medicine:tablet');
        if ($crc > 0x7FFFFFFF) {
            $signed = $method->invoke(null, 'medicine-catalog:bhc:1:paracetamol:medicine:tablet');
            $this->assertSame($crc - 0x100000000, $signed);
        }

        $namespace = $method->invoke(null, 'akay-medicine-catalog');
        $this->assertSame(92330641, $namespace);
    }
}
