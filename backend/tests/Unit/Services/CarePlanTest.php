<?php

namespace Tests\Unit\Services;

use App\Services\CarePlan;
use PHPUnit\Framework\TestCase;

class CarePlanTest extends TestCase
{
    public function test_predicates(): void
    {
        $this->assertTrue(CarePlan::monitors('monitor'));
        $this->assertTrue(CarePlan::monitors('monitor_refer'));
        $this->assertFalse(CarePlan::monitors('refer'));
        $this->assertFalse(CarePlan::monitors(null));
        $this->assertTrue(CarePlan::refers('refer'));
        $this->assertTrue(CarePlan::refers('monitor_refer'));
        $this->assertFalse(CarePlan::refers('none'));
    }

    public function test_any_helpers_read_diagnosis_entries(): void
    {
        $diagnoses = [['name' => 'A', 'carePlan' => 'none'], ['name' => 'B', 'carePlan' => 'monitor_refer'], 'junk'];
        $this->assertTrue(CarePlan::monitorsAny($diagnoses));
        $this->assertTrue(CarePlan::refersAny($diagnoses));
        $this->assertFalse(CarePlan::monitorsAny([['name' => 'A']]));
    }
}
