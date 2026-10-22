<?php

namespace Tests;

use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Seed one official available provider for a receiving RHU.
     *
     * DOC-14 blocks referral submission whenever the receiving RHU has zero
     * available official doctors, so any test that creates a referral over HTTP
     * must establish availability first. Tests that specifically exercise the
     * block deliberately do NOT call this.
     */
    protected function seedAvailableProvider(
        RuralHealthUnit|int $rhu,
        string $name = 'Dr. Available',
        string $status = RhuProvider::STATUS_AVAILABLE
    ): RhuProvider {
        $rhuId = $rhu instanceof RuralHealthUnit ? $rhu->id : $rhu;
        $slug = strtolower((string) preg_replace('/[^a-z0-9]+/i', '.', $name));
        $user = User::create([
            'name' => $name,
            'email' => $slug.'.'.$rhuId.'.'.str_replace('.', '', uniqid('', true)).'@example.test',
            'password' => 'password123',
            'role' => User::ROLE_RHU,
            'staff_role' => 'doctor',
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhuId,
        ]);

        return RhuProvider::create([
            'rural_health_unit_id' => $rhuId,
            'user_id' => $user->id,
            'name' => $name,
            'specialization' => 'General Practitioner',
            'availability_status' => $status,
            'availability_status_set_at' => now(),
            'is_active' => true,
        ]);
    }
}
