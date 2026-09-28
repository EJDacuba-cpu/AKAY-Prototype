<?php
// backend/tests/Feature/CarePathwayEnrollmentControllerTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarePathwayEnrollmentControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_active_conditions_for_the_patients_enrollments(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Enr RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Enr BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = \App\Models\User::create(['name' => 'Enr BHW', 'email' => 'enr@example.test', 'password' => bcrypt('test-password'), 'role' => \App\Models\User::ROLE_BHW, 'status' => \App\Models\User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'I', 'last_name' => 'J', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $enrollment = CarePathwayEnrollment::create([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
        $enrollment->conditions()->create(['condition_name' => 'Hypertension', 'added_health_record_id' => $record->id]);
        $enrollment->conditions()->create([
            'condition_name' => 'Removed One', 'added_health_record_id' => $record->id,
            'removed_health_record_id' => $record->id, 'removed_at' => now(),
        ]);
        $this->actingAs($user, 'sanctum');

        $this->getJson("/api/patients/{$patient->id}/care-pathway-enrollments")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.pathway_key', 'ncd')
            ->assertJsonPath('data.0.status', 'active')
            ->assertJsonCount(1, 'data.0.conditions')
            ->assertJsonPath('data.0.conditions.0.condition_name', 'Hypertension');
    }

    public function test_a_patient_outside_the_users_facility_is_forbidden(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Enr RHU 2', 'status' => 'active']);
        $bhcA = BarangayHealthCenter::create(['name' => 'Enr BHC A', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $bhcB = BarangayHealthCenter::create(['name' => 'Enr BHC B', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = \App\Models\User::create(['name' => 'Outside BHW', 'email' => 'outside@example.test', 'password' => bcrypt('test-password'), 'role' => \App\Models\User::ROLE_BHW, 'status' => \App\Models\User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhcA->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'K', 'last_name' => 'L', 'sex' => 'Male', 'barangay_health_center_id' => $bhcB->id]);
        $this->actingAs($user, 'sanctum');

        $this->getJson("/api/patients/{$patient->id}/care-pathway-enrollments")->assertForbidden();
    }
}
