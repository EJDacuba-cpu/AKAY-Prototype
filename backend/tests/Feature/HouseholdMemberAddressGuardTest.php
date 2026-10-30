<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HouseholdMemberAddressGuardTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Guard BHC']);
    }

    private function actAs(array $permissions = ['patients.register', 'families.view', 'families.manage']): User
    {
        $user = User::create(['name' => 'Staff', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
        Sanctum::actingAs($user, ['akay:access']);

        return $user;
    }

    private function address(): array
    {
        return ['streetAddress' => 'Main street', 'purokArea' => 'Zone 1', 'barangay' => 'Local', 'municipality' => 'Bulakan'];
    }

    private function member(): array
    {
        $head = $this->postJson('/api/patients', ['first_name' => 'Head', 'last_name' => 'Cruz', 'sex' => 'Male', 'birthdate' => '1980-01-01', 'household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()]])->assertCreated()->json('data');

        return $this->postJson('/api/patients', ['first_name' => 'Child', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => '2010-02-03', 'household' => ['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Daughter']])->assertCreated()->json('data');
    }

    public function test_changed_household_address_is_rejected_and_nothing_changes(): void
    {
        $this->actAs();
        $member = $this->member();
        foreach (['street_address' => 'Other road', 'purok_area' => 'Zone 9', 'barangay' => 'Elsewhere', 'municipality' => 'Malolos'] as $field => $value) {
            $this->patchJson('/api/patients/'.$member['id'], [$field => $value])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->patchJson('/api/patients/'.$member['id'], ['first_name' => 'Renamed', 'street_address' => 'Other road'])->assertUnprocessable();
        $fresh = Patient::find($member['id']);
        $this->assertSame('Child', $fresh->first_name);
        $this->assertSame('Main street', $fresh->street_address);
    }

    public function test_resending_the_same_address_with_other_edits_saves(): void
    {
        $this->actAs();
        $member = $this->member();
        $this->patchJson('/api/patients/'.$member['id'], ['first_name' => 'Renamed', 'occupation' => 'Student', 'street_address' => ' Main street ', 'purok_area' => 'Zone 1', 'barangay' => 'Local', 'municipality' => 'Bulakan'])->assertOk();
        $this->assertSame('Renamed', Patient::find($member['id'])->first_name);
    }

    public function test_fsn_guard_and_non_member_address_edits_are_unchanged(): void
    {
        $this->actAs();
        $member = $this->member();
        $this->patchJson('/api/patients/'.$member['id'], ['family_serial_number' => 'OTHER-1'])->assertUnprocessable()->assertJsonValidationErrors('family_serial_number');
        $solo = Patient::create(['first_name' => 'Solo', 'last_name' => 'Walker', 'sex' => 'Male', 'barangay_health_center_id' => $this->bhc->id, 'street_address' => 'Old road']);
        $this->patchJson('/api/patients/'.$solo->id, ['street_address' => 'New road'])->assertOk();
        $this->assertSame('New road', $solo->fresh()->street_address);
    }

    public function test_moving_households_still_takes_the_new_household_address(): void
    {
        $this->actAs();
        $member = $this->member();
        $other = $this->postJson('/api/patients', ['first_name' => 'Other', 'last_name' => 'Head', 'sex' => 'Female', 'birthdate' => '1975-05-05', 'household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => ['streetAddress' => 'Far road', 'purokArea' => 'Zone 7', 'barangay' => 'Distant', 'municipality' => 'Bulakan']]])->assertCreated()->json('data');
        $version = Household::find($other['household_id'])->version;
        $this->patchJson('/api/patients/'.$member['id'], ['street_address' => 'Far road', 'purok_area' => 'Zone 7', 'barangay' => 'Distant', 'household' => ['kind' => 'existing', 'household_id' => $other['household_id'], 'relationship' => 'Niece', 'version' => $version]])->assertOk();
        $fresh = Patient::find($member['id']);
        $this->assertSame((int) $other['household_id'], $fresh->household_id);
        $this->assertSame('Far road', $fresh->street_address);
    }

    public function test_only_authorized_users_can_edit_a_member(): void
    {
        $this->actAs();
        $member = $this->member();
        $this->actAs(['families.view']);
        $this->patchJson('/api/patients/'.$member['id'], ['occupation' => 'Teacher'])->assertForbidden();
        $rhu = RuralHealthUnit::create(['name' => 'Guard RHU']);
        Sanctum::actingAs(User::create(['name' => 'RHU', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'permissions' => ['patients.register']]), ['akay:access']);
        $this->patchJson('/api/patients/'.$member['id'], ['occupation' => 'Teacher'])->assertForbidden();
        $this->assertNull(Patient::find($member['id'])->occupation);
    }
}
