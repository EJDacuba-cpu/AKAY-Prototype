<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PatientDirectorySearchTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private BarangayHealthCenter $otherBhc;

    private User $bhcStaff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Search BHC', 'status' => 'active']);
        $this->otherBhc = BarangayHealthCenter::create(['name' => 'Other Search BHC', 'status' => 'active']);
        $this->bhcStaff = User::create([
            'name' => 'Search Midwife',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'bhc',
            'staff_role' => 'midwife',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);
    }

    private function asBhc(): static
    {
        Sanctum::actingAs($this->bhcStaff, ['akay:access']);

        return $this;
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'Testing',
            'middle_name' => 'T',
            'last_name' => 'Bee',
            'sex' => 'Male',
            'birthdate' => '2000-08-24',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            ...$attributes,
        ]);
    }

    private function search(string $query)
    {
        return $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'search' => $query,
            'per_page' => 10,
        ]));
    }

    public function test_patient_name_search_is_case_insensitive_for_partial_and_full_names(): void
    {
        $patient = $this->patient();

        foreach (['Testing', 'testing', 'TESTING', 'TeStInG', '  testing  ', 'bee', 'BEE', 'testing bee', 'TESTING T BEE'] as $query) {
            $this->search($query)
                ->assertOk()
                ->assertJsonPath('data.data.0.id', $patient->id);
        }
    }

    public function test_patient_search_supports_id_and_rejects_nonexistent_names(): void
    {
        $patient = $this->patient(['first_name' => 'Known', 'last_name' => 'Resident']);

        $this->search((string) $patient->id)
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $patient->id);

        $this->search('Nobody Here')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_patient_search_escapes_sql_wildcards_and_stays_facility_scoped(): void
    {
        $local = $this->patient(['first_name' => 'Ma_ia', 'last_name' => 'Literal']);
        $this->patient([
            'first_name' => 'Maria',
            'last_name' => 'Elsewhere',
            'barangay_health_center_id' => $this->otherBhc->id,
        ]);
        Patient::create([
            'first_name' => 'Percent',
            'last_name' => 'Match',
            'sex' => 'Female',
            'birthdate' => '1999-01-01',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
        ]);

        $this->search('Ma_ia')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $local->id);

        $this->search('%')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');

        $this->search('Elsewhere')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }
}
