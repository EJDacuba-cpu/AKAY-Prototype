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

    public function test_directory_paginates_and_caps_per_page(): void
    {
        foreach (range(1, 30) as $index) {
            $this->patient([
                'first_name' => 'Paged'.$index,
                'last_name' => 'Resident',
            ]);
        }

        $first = $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'page' => 1,
            'per_page' => 25,
        ]))->assertOk();

        $first->assertJsonPath('data.current_page', 1);
        $first->assertJsonPath('data.per_page', 25);
        $first->assertJsonPath('data.total', 30);
        $first->assertJsonPath('data.last_page', 2);
        $this->assertCount(25, $first->json('data.data'));

        $second = $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'page' => 2,
            'per_page' => 25,
        ]))->assertOk();
        $this->assertCount(5, $second->json('data.data'));

        $capped = $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'page' => 1,
            'per_page' => 500,
        ]))->assertOk();
        $capped->assertJsonPath('data.per_page', 100);
        $this->assertCount(30, $capped->json('data.data'));
    }

    public function test_directory_filters_sex_age_group_and_date_registered(): void
    {
        $child = $this->patient([
            'first_name' => 'Child',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'birthdate' => now()->subYears(10)->toDateString(),
            'civil_status' => 'Single',
        ]);
        $adultMale = $this->patient([
            'first_name' => 'Adult',
            'last_name' => 'Male',
            'sex' => 'Male',
            'birthdate' => now()->subYears(30)->toDateString(),
            'civil_status' => 'Married',
        ]);
        $this->patient([
            'first_name' => 'Senior',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'birthdate' => now()->subYears(70)->toDateString(),
        ]);

        $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'sex' => 'Male',
            'per_page' => 50,
        ]))
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $adultMale->id);

        $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'age_group' => 'Child',
            'per_page' => 50,
        ]))
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $child->id);

        $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'civil_status' => 'Married',
            'per_page' => 50,
        ]))
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.id', $adultMale->id);

        $today = now()->toDateString();
        $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'date_registered' => $today,
            'per_page' => 50,
        ]))
            ->assertOk()
            ->assertJsonPath('data.total', 3);
    }

    public function test_directory_stays_facility_scoped_when_paging(): void
    {
        $local = $this->patient(['first_name' => 'Local', 'last_name' => 'Only']);
        $this->patient([
            'first_name' => 'Foreign',
            'last_name' => 'Patient',
            'barangay_health_center_id' => $this->otherBhc->id,
        ]);

        $response = $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'page' => 1,
            'per_page' => 25,
        ]))->assertOk();

        $response->assertJsonPath('data.total', 1);
        $response->assertJsonPath('data.data.0.id', $local->id);
    }

    public function test_directory_filter_options_are_facility_wide_and_opt_in(): void
    {
        foreach (range(1, 26) as $index) {
            $this->patient([
                'first_name' => $index === 1 ? 'AlphaOnly' : 'Paged'.$index,
                'last_name' => 'Resident',
                'barangay' => $index === 26 ? 'Sitio Far' : 'Poblacion',
                'civil_status' => $index === 26 ? 'Widowed' : 'Single',
            ]);
        }
        $this->patient([
            'first_name' => 'Other',
            'last_name' => 'Facility',
            'barangay' => 'Hidden Barangay',
            'civil_status' => 'Separated',
            'barangay_health_center_id' => $this->otherBhc->id,
        ]);

        $without = $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'page' => 1,
            'per_page' => 25,
        ]))->assertOk();
        $this->assertArrayNotHasKey('filter_options', $without->json());

        $with = $this->asBhc()->getJson('/api/patients?'.http_build_query([
            'page' => 1,
            'per_page' => 25,
            'include_filter_options' => 1,
            'search' => 'AlphaOnly',
        ]))->assertOk();

        // Facets ignore the search filter so Sitio Far remains selectable.
        $with->assertJsonPath('data.total', 1);
        $barangays = $with->json('filter_options.barangays');
        $civilStatuses = $with->json('filter_options.civil_statuses');
        $this->assertContains('Poblacion', $barangays);
        $this->assertContains('Sitio Far', $barangays);
        $this->assertNotContains('Hidden Barangay', $barangays);
        $this->assertContains('Single', $civilStatuses);
        $this->assertContains('Widowed', $civilStatuses);
        $this->assertNotContains('Separated', $civilStatuses);
    }
}
