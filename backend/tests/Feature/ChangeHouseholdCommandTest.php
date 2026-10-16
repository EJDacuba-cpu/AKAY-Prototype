<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChangeHouseholdCommandTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Change BHC']);
    }

    private function actAs(array $permissions = ['patients.register', 'families.view', 'families.manage'], ?BarangayHealthCenter $facility = null): User
    {
        $user = User::create(['name' => 'Staff', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => ($facility ?? $this->bhc)->id, 'permissions' => $permissions]);
        Sanctum::actingAs($user, ['akay:access']);

        return $user;
    }

    private function newHead(string $street): array
    {
        return $this->postJson('/api/patients', ['first_name' => 'Head', 'last_name' => 'Of '.$street, 'sex' => 'Male', 'birthdate' => '1980-01-01', 'household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => ['streetAddress' => $street, 'purokArea' => 'Zone 1', 'barangay' => 'Local', 'municipality' => 'Bulakan']]])->assertCreated()->json('data');
    }

    private function join(array $head, string $label, array $extra = []): array
    {
        return $this->postJson('/api/patients', [...['first_name' => 'Member', 'last_name' => 'Test', 'sex' => 'Female', 'birthdate' => '2001-02-03'], ...$extra, 'household' => ['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => $label]])->assertCreated()->json('data');
    }

    private function command(int $householdId, string $label, array $more = []): array
    {
        return ['household' => ['kind' => 'existing', 'household_id' => $householdId, 'relationship' => $label, 'version' => Household::find($householdId)->version, ...$more]];
    }

    public function test_a_move_keeps_identity_and_clinical_data_and_takes_the_new_address(): void
    {
        $this->actAs();
        [$one, $two] = [$this->newHead('First road'), $this->newHead('Second road')];
        $member = $this->join($one, 'Daughter', ['first_name' => 'Ana', 'occupation' => 'Nurse']);
        Patient::whereKey($member['id'])->update(['medical_background' => ['allergies' => ['penicillin']]]);
        $this->patchJson('/api/patients/'.$member['id'], $this->command($two['household_id'], 'Niece'))->assertOk();
        $fresh = Patient::find($member['id']);
        $this->assertSame('Ana', $fresh->first_name);
        $this->assertSame('Nurse', $fresh->occupation);
        $this->assertSame('2001-02-03', $fresh->birthdate->toDateString());
        $this->assertSame(['allergies' => ['penicillin']], $fresh->medical_background);
        $this->assertSame((int) $two['household_id'], $fresh->household_id);
        $this->assertSame('Second road', $fresh->street_address);
        $this->assertSame(Household::find($two['household_id'])->serial_number, $fresh->family_serial_number);
        $this->assertSame('Niece', $fresh->relationship_to_household_head);
    }

    public function test_another_facility_or_stale_version_or_bad_label_changes_nothing(): void
    {
        $this->actAs();
        [$one, $two] = [$this->newHead('First road'), $this->newHead('Second road')];
        $member = $this->join($one, 'Daughter');
        $other = BarangayHealthCenter::create(['name' => 'Foreign BHC']);
        $this->actAs(['patients.register', 'families.view', 'families.manage'], $other);
        $foreignHead = $this->newHead('Foreign road');
        $this->actAs();
        $this->patchJson('/api/patients/'.$member['id'], $this->command($foreignHead['household_id'], 'Niece'))->assertNotFound();
        $this->patchJson('/api/patients/'.$member['id'], $this->command($two['household_id'], 'Niece', ['version' => 99]))->assertConflict();
        $this->patchJson('/api/patients/'.$member['id'], $this->command($two['household_id'], 'Son / Daughter'))->assertUnprocessable()->assertJsonValidationErrors('household.relationship');
        $this->assertSame((int) $one['household_id'], Patient::find($member['id'])->household_id);
    }

    public function test_a_head_cannot_leave_without_a_replacement_and_the_household_stays_intact(): void
    {
        $this->actAs();
        [$one, $two] = [$this->newHead('First road'), $this->newHead('Second road')];
        $this->join($one, 'Wife');
        $this->patchJson('/api/patients/'.$one['id'], $this->command($two['household_id'], 'Brother'))->assertUnprocessable()->assertJsonValidationErrors('head_replacement');
        $this->assertSame((int) $one['household_id'], Patient::find($one['id'])->household_id);
        $this->assertSame($one['id'], Household::find($one['household_id'])->head_patient_id);
    }

    public function test_only_users_with_registration_permission_can_change_a_household(): void
    {
        $this->actAs();
        [$one, $two] = [$this->newHead('First road'), $this->newHead('Second road')];
        $member = $this->join($one, 'Daughter');
        $this->actAs(['families.view', 'families.manage']);
        $this->patchJson('/api/patients/'.$member['id'], $this->command($two['household_id'], 'Niece'))->assertForbidden();
        $this->assertSame((int) $one['household_id'], Patient::find($member['id'])->household_id);
    }
}
