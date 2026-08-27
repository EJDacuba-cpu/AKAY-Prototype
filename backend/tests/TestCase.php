<?php

namespace Tests;

use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Seed one available provider for a receiving RHU.
     *
     * DOC-14 blocks referral submission whenever the receiving RHU has zero
     * available providers, so any test that creates a referral over HTTP must
     * establish availability first. Tests that specifically exercise the block
     * deliberately do NOT call this.
     */
    protected function seedAvailableProvider(
        RuralHealthUnit|int $rhu,
        string $name = 'Dr. Available'
    ): RhuProvider {
        return RhuProvider::create([
            'rural_health_unit_id' => $rhu instanceof RuralHealthUnit ? $rhu->id : $rhu,
            'name' => $name,
            'specialization' => 'General Practitioner',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'is_active' => true,
        ]);
    }
}
