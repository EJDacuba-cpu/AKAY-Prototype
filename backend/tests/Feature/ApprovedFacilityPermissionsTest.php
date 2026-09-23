<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApprovedFacilityPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function account(array $attributes = []): User
    {
        return User::create([...['name' => 'Personal Account', 'email' => uniqid().'@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active', 'barangay_health_center_id' => BarangayHealthCenter::create(['name' => 'Home'])->id], ...$attributes]);
    }

    public function test_encoder_cannot_browse_clinical_history_or_finalize_via_direct_api(): void
    {
        $user = $this->account();
        $patient = Patient::create(['first_name' => 'Ana', 'last_name' => 'Test', 'sex' => 'Female', 'barangay_health_center_id' => $user->barangay_health_center_id, 'medical_background' => ['allergies' => 'private history'], 'created_by' => $user->id]);
        Sanctum::actingAs($user, ['access']);
        $this->getJson('/api/patients/'.$patient->id)->assertOk()->assertJsonPath('data.first_name', 'Ana')->assertJsonMissingPath('data.medical_background')->assertJsonMissingPath('data.health_records');
        $this->getJson('/api/health-records')->assertForbidden();
        $this->getJson('/api/reports/bhw')->assertForbidden();
        $this->postJson('/api/health-records', [])->assertForbidden();
        $this->postJson('/api/referrals', [])->assertForbidden();
        $this->postJson('/api/medicines', [])->assertForbidden();
    }

    public function test_rhu_nurse_can_select_a_dated_bhc_assignment_without_changing_home(): void
    {
        $home = RuralHealthUnit::create(['name' => 'RHU Home']);
        $bhc = BarangayHealthCenter::create(['name' => 'Duty BHC']);
        $user = $this->account(['role' => 'rhu_staff', 'barangay_health_center_id' => null, 'rural_health_unit_id' => $home->id, 'professional_designation' => 'Nurse']);
        $assignment = $user->facilityAssignments()->create(['barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical'], 'starts_on' => today(), 'ends_on' => today()]);
        $patient = Patient::create(['first_name' => 'Duty', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id, 'created_by' => $user->id]);
        Sanctum::actingAs($user, ['access']);
        $this->getJson('/api/patients')->assertForbidden();
        $this->withHeader('X-Working-Facility', (string) $assignment->id)->getJson('/api/patients/'.$patient->id)->assertOk();
        $this->assertDatabaseHas('users', ['id' => $user->id, 'rural_health_unit_id' => $home->id, 'barangay_health_center_id' => null]);
        $assignment->update(['ends_on' => yesterday()]);
        $this->getJson('/api/patients/'.$patient->id)->assertForbidden();
    }

    public function test_other_users_assignment_and_cross_facility_patient_are_denied(): void
    {
        $user = $this->account();
        $other = $this->account();
        $assignment = $other->facilityAssignments()->create(['barangay_health_center_id' => $user->barangay_health_center_id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        Sanctum::actingAs($user, ['access']);
        $this->withHeader('X-Working-Facility', (string) $assignment->id)->getJson('/api/patients')->assertForbidden();
    }

    public function test_admin_has_no_automatic_clinical_finalization(): void
    {
        Sanctum::actingAs($this->account(['role' => 'admin', 'barangay_health_center_id' => null]), ['access']);
        $this->postJson('/api/health-records', [])->assertForbidden();
    }
}
