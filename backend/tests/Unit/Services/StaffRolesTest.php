<?php

namespace Tests\Unit\Services;

use App\Services\ActionPermissions;
use App\Services\StaffRoles;
use PHPUnit\Framework\TestCase;

class StaffRolesTest extends TestCase
{
    public function test_every_default_is_available_at_its_tier_and_carries_its_prerequisites(): void
    {
        foreach (StaffRoles::ROLES as $key => $role) {
            $this->assertSame([], array_values(array_diff($role['defaults'], StaffRoles::available($role['tier']))), $key);
            $this->assertSame([], ActionPermissions::missingRequirements($role['defaults']), $key);
        }
    }

    public function test_allowed_at(): void
    {
        $this->assertFalse(StaffRoles::allowedAt('nurse', 'bhc'));
        $this->assertFalse(StaffRoles::allowedAt('midwife', 'rhu'));
        $this->assertFalse(StaffRoles::allowedAt('encoder', 'rhu'));
        $this->assertTrue(StaffRoles::allowedAt('encoder', 'bhc'));
        $this->assertTrue(StaffRoles::allowedAt('doctor', 'rhu'));
        $this->assertFalse(StaffRoles::allowedAt('midwife', null));
    }

    public function test_licensed_grants(): void
    {
        $this->assertSame(['consultations.finalize'], StaffRoles::licensedGrants('encoder', ['patients.register', 'consultations.finalize', 'clinical.history']));
        $this->assertSame([], StaffRoles::licensedGrants('midwife', ['consultations.finalize']));
    }

    public function test_from_designation(): void
    {
        $this->assertSame('nurse', StaffRoles::fromDesignation(' Nurse '));
        $this->assertSame('bhw', StaffRoles::fromDesignation('BHW'));
        foreach (['Logistics', 'MHO', 'Other', '', null] as $designation) {
            $this->assertNull(StaffRoles::fromDesignation($designation));
        }
    }

    public function test_for_api_shape(): void
    {
        $api = StaffRoles::forApi();

        $this->assertSame(['roles', 'available'], array_keys($api));
        $this->assertCount(5, $api['roles']);
        $this->assertSame(['midwife', 'bhw', 'encoder', 'nurse', 'doctor'], array_column($api['roles'], 'key'));
        $midwife = $api['roles'][0];
        $this->assertSame(['key' => 'midwife', 'label' => 'Midwife', 'tier' => 'bhc', 'licensed' => true], array_intersect_key($midwife, array_flip(['key', 'label', 'tier', 'licensed'])));
        $this->assertCount(10, $midwife['defaults']);
        $this->assertSame(['bhc', 'rhu'], array_keys($api['available']));
    }

    public function test_rhu_clinical_duties_are_available_and_not_default(): void
    {
        foreach (['consultations.encode', 'consultations.finalize', 'records.correct', 'rhu.intake', 'followups.manage'] as $duty) {
            $this->assertContains($duty, StaffRoles::available('rhu'));
            $this->assertNotContains($duty, StaffRoles::defaults('nurse'));
            $this->assertNotContains($duty, StaffRoles::defaults('doctor'));
        }
        $this->assertNotContains('items.dispense', StaffRoles::available('rhu'));
    }

    public function test_labels_and_defaults_for_unknown_roles(): void
    {
        $this->assertSame('Encoder', StaffRoles::label('encoder'));
        $this->assertNull(StaffRoles::label(null));
        $this->assertSame([], StaffRoles::defaults(null));
        $this->assertSame([], StaffRoles::available('admin'));
        $this->assertFalse(StaffRoles::isLicensed('bhw'));
        $this->assertTrue(StaffRoles::isLicensed('doctor'));
    }
}
