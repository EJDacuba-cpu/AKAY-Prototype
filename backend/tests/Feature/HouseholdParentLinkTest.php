<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The Family Serial Number is the household: patients sharing a serial are one
 * household, and a child's Mother / Father are linked from its members.
 */
class HouseholdParentLinkTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();

        $this->bhc = BarangayHealthCenter::create(['name' => 'Household BHC']);
        Sanctum::actingAs(User::create([
            'name' => 'Household BHW', 'email' => 'household@example.test',
            'password' => 'password123', 'status' => 'active', 'role' => 'bhw',
            'professional_designation' => 'Midwife',
            'permissions' => ['patients.register', 'clinical.history'],
            'barangay_health_center_id' => $this->bhc->id,
        ]), ['akay:access']);
    }

    private function member(array $attributes): Patient
    {
        return Patient::create([
            'last_name' => 'Cruz', 'family_serial_number' => 'FSN-100',
            'barangay_health_center_id' => $this->bhc->id, ...$attributes,
        ]);
    }

    public function test_household_lists_accessible_active_members_of_the_serial(): void
    {
        $mother = $this->member([
            'first_name' => 'Juana', 'sex' => 'Female',
            'birthdate' => now()->subYears(34)->toDateString(),
        ]);
        $this->member(['first_name' => 'Pedro', 'sex' => 'Male']);
        $this->member(['first_name' => 'Gone', 'sex' => 'Male', 'status' => 'inactive']);
        $this->member(['first_name' => 'Other', 'sex' => 'Male', 'family_serial_number' => 'FSN-200']);
        $this->member([
            'first_name' => 'Elsewhere', 'sex' => 'Female',
            'barangay_health_center_id' => BarangayHealthCenter::create(['name' => 'Other BHC'])->id,
        ]);

        $members = $this->getJson('/api/patients/household?serial=%20FSN-100%20')
            ->assertOk()
            ->json('data');

        $this->assertEqualsCanonicalizing(['Juana', 'Pedro'], array_column($members, 'first_name'));
        $juana = collect($members)->firstWhere('id', $mother->id);
        $this->assertSame('Juana Cruz', $juana['full_name']);
        $this->assertSame('Female', $juana['sex']);
        $this->assertSame(34, $juana['age']);
        $this->assertSame(now()->subYears(34)->toDateString(), $juana['birthdate']);
        $this->assertArrayNotHasKey('medical_background', $juana);
    }

    public function test_household_with_unknown_serial_is_empty(): void
    {
        $this->getJson('/api/patients/household?serial=FSN-NEW')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_household_requires_a_serial(): void
    {
        $this->getJson('/api/patients/household')->assertUnprocessable();
    }

    public function test_child_is_saved_with_both_parents_linked_and_birthdates(): void
    {
        $mother = $this->member(['first_name' => 'Juana', 'sex' => 'Female']);
        $father = $this->member(['first_name' => 'Pedro', 'sex' => 'Male']);

        $this->postJson('/api/patients', [
            'first_name' => 'Nene', 'last_name' => 'Cruz', 'sex' => 'Female',
            'registration_type' => 'child', 'family_serial_number' => 'FSN-100',
            'motherPatientId' => $mother->id, 'mother_name' => 'Juana Cruz',
            'motherBirthDate' => '1992-03-04',
            'fatherPatientId' => $father->id, 'father_name' => 'Pedro Cruz',
            'fatherBirthDate' => '1990-05-06',
        ])->assertCreated()
            ->assertJsonPath('data.mother_patient_id', $mother->id)
            ->assertJsonPath('data.father_patient_id', $father->id)
            ->assertJsonPath('data.father.first_name', 'Pedro')
            ->assertJsonPath('data.mother_birth_date', '1992-03-04')
            ->assertJsonPath('data.father_birth_date', '1990-05-06');
    }

    public function test_manually_entered_parents_keep_their_birthdates(): void
    {
        $this->postJson('/api/patients', [
            'first_name' => 'Nene', 'last_name' => 'Santos', 'sex' => 'Female',
            'registration_type' => 'child', 'family_serial_number' => 'FSN-NEW',
            'mother_name' => 'Maria Santos', 'motherBirthDate' => '1995-01-02',
            'father_name' => 'Jose Santos', 'fatherBirthDate' => '1994-07-08',
        ])->assertCreated()
            ->assertJsonPath('data.mother_patient_id', null)
            ->assertJsonPath('data.father_patient_id', null)
            ->assertJsonPath('data.mother_birth_date', '1995-01-02')
            ->assertJsonPath('data.father_birth_date', '1994-07-08');
    }

    public function test_parent_link_must_match_the_parents_sex(): void
    {
        $female = $this->member(['first_name' => 'Juana', 'sex' => 'Female']);
        $male = $this->member(['first_name' => 'Pedro', 'sex' => 'Male']);
        $child = ['first_name' => 'Nene', 'last_name' => 'Cruz', 'sex' => 'Female', 'registration_type' => 'child'];

        $this->postJson('/api/patients', [...$child, 'father_patient_id' => $female->id])
            ->assertUnprocessable();
        $this->postJson('/api/patients', [...$child, 'mother_patient_id' => $male->id])
            ->assertUnprocessable();
        $this->assertDatabaseCount('patients', 2);
    }

    public function test_parent_link_outside_the_facility_is_forbidden(): void
    {
        $outsider = $this->member([
            'first_name' => 'Elsewhere', 'sex' => 'Male',
            'barangay_health_center_id' => BarangayHealthCenter::create(['name' => 'Other BHC'])->id,
        ]);

        $this->postJson('/api/patients', [
            'first_name' => 'Nene', 'last_name' => 'Cruz', 'sex' => 'Female',
            'registration_type' => 'child', 'father_patient_id' => $outsider->id,
        ])->assertForbidden();
    }

    public function test_patient_cannot_be_linked_as_their_own_father(): void
    {
        $patient = $this->member(['first_name' => 'Pedro', 'sex' => 'Male']);

        $this->patchJson("/api/patients/{$patient->id}", ['father_patient_id' => $patient->id])
            ->assertUnprocessable();
    }
}
