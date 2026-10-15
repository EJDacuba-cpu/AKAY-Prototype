<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /patients/{id} suggests the environment last recorded for someone in the
 * same household (same Family Serial Number) - see decision D8 in
 * docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 */
class HouseholdEnvironmentTest extends TestCase
{
    use RefreshDatabase;

    private const WELL = ['waterSource' => 'Deep well', 'toilet' => 'Water-sealed', 'exposures' => ['Smoke'], 'notes' => 'Shared well'];

    private const PIPED = ['waterSource' => 'Piped', 'toilet' => 'Pit', 'exposures' => [], 'notes' => ''];

    private BarangayHealthCenter $bhc;

    private RuralHealthUnit $rhu;

    private User $clinician;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Household RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Household BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->clinician = $this->staff('clinician', $this->bhc, 'midwife');
    }

    private function staff(string $name, BarangayHealthCenter $bhc, string $role): User
    {
        return User::create([
            'name' => ucfirst($name), 'email' => "{$name}@example.test", 'password' => bcrypt('test-password'),
            'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id, 'permissions' => StaffRoles::defaults($role),
        ]);
    }

    private function member(string $first, ?string $fsn, ?array $environment = null, ?string $updated = null, ?BarangayHealthCenter $bhc = null): Patient
    {
        $social = $environment === null ? [] : ['environment' => $environment];

        return Patient::create([
            'first_name' => $first, 'last_name' => 'Cruz', 'sex' => 'Female',
            'family_serial_number' => $fsn,
            'barangay_health_center_id' => ($bhc ?? $this->bhc)->id,
            'medical_background' => [
                'personalSocial' => $social,
                'updatedAt' => $updated === null ? [] : ['social' => $updated],
            ],
        ]);
    }

    private function show(Patient $patient, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->clinician, 'sanctum')->getJson("/api/patients/{$patient->id}");
    }

    public function test_returns_latest_same_fsn_environment(): void
    {
        $patient = $this->member('Self', 'FSN-1');
        $this->member('Older', 'FSN-1', self::PIPED, '2026-01-05');
        $newest = $this->member('Newest', 'FSN-1', self::WELL, '2026-09-20');
        $this->member('NoEnvironment', 'FSN-1', null, '2026-10-10');
        $this->member('Stranger', 'FSN-2', self::PIPED, '2026-10-15');

        $this->show($patient)->assertOk()
            ->assertJsonPath('data.household_environment.environment', self::WELL)
            ->assertJsonPath('data.household_environment.patientId', $newest->id)
            ->assertJsonPath('data.household_environment.patientName', 'Newest Cruz')
            ->assertJsonPath('data.household_environment.date', '2026-09-20');
    }

    public function test_a_candidate_without_a_social_date_ranks_last(): void
    {
        $patient = $this->member('Self', 'FSN-1');
        $this->member('Undated', 'FSN-1', self::PIPED, null);
        $dated = $this->member('Dated', 'FSN-1', self::WELL, '2026-02-02');

        $this->show($patient)->assertOk()
            ->assertJsonPath('data.household_environment.patientId', $dated->id);
    }

    public function test_an_undated_candidate_is_still_suggested_when_alone(): void
    {
        $patient = $this->member('Self', 'FSN-1');
        $undated = $this->member('Undated', 'FSN-1', self::PIPED, null);

        $this->show($patient)->assertOk()
            ->assertJsonPath('data.household_environment.patientId', $undated->id)
            ->assertJsonPath('data.household_environment.date', null);
    }

    public function test_excludes_the_patient_themselves(): void
    {
        $patient = $this->member('Self', 'FSN-1', self::WELL, '2026-09-20');

        $this->show($patient)->assertOk()->assertJsonPath('data.household_environment', null);
    }

    public function test_null_without_a_matching_household(): void
    {
        $patient = $this->member('Self', 'FSN-1');
        $this->member('Stranger', 'FSN-2', self::WELL, '2026-09-20');

        $response = $this->show($patient)->assertOk();
        $this->assertArrayHasKey('household_environment', $response->json('data'));
        $this->assertNull($response->json('data.household_environment'));
    }

    public function test_null_when_fsn_is_empty(): void
    {
        $patient = $this->member('Self', null);
        $this->member('OtherNoFsn', null, self::WELL, '2026-09-20');
        $blank = $this->member('Blank', '', self::WELL, '2026-09-21');
        $this->member('BlankToo', '', self::WELL, '2026-09-22');

        $this->show($patient)->assertOk()->assertJsonPath('data.household_environment', null);
        $this->show($blank)->assertOk()->assertJsonPath('data.household_environment', null);
    }

    public function test_other_facility_patients_are_not_leaked(): void
    {
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $patient = $this->member('Self', 'FSN-1');
        $this->member('Elsewhere', 'FSN-1', self::WELL, '2026-09-20', $otherBhc);
        $local = $this->member('Local', 'FSN-1', self::PIPED, '2026-01-01');

        $this->show($patient)->assertOk()
            ->assertJsonPath('data.household_environment.patientId', $local->id);

        $outsider = $this->staff('outsider', $otherBhc, 'midwife');
        $lonely = $this->member('Lonely', 'FSN-9', null, null, $otherBhc);
        $this->show($lonely, $outsider)->assertOk()->assertJsonPath('data.household_environment', null);
    }

    public function test_users_without_clinical_history_get_no_household_environment(): void
    {
        $patient = $this->member('Self', 'FSN-1');
        $this->member('Other', 'FSN-1', self::WELL, '2026-09-20');
        $encoder = $this->staff('encoder', $this->bhc, 'encoder');

        $response = $this->show($patient, $encoder)->assertOk();
        $this->assertArrayNotHasKey('household_environment', $response->json('data'));
    }
}
