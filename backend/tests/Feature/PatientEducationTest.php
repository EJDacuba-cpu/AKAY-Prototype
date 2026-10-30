<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientEducationTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Education BHC', 'status' => 'active']);
        $registrar = User::create(['name' => 'Registrar', 'email' => 'registrar@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => ['patients.register']]);
        $this->actingAs($registrar, 'sanctum');
    }

    public function test_registration_persists_education_and_identity_read_exposes_it_without_clinical_access(): void
    {
        $id = $this->postJson('/api/patients', ['first_name' => 'Student', 'last_name' => 'Patient', 'sex' => 'Female', 'education_level' => 'College', 'education_completed' => 'Level'])->assertCreated()->assertJsonPath('data.education_level', 'College')->json('data.id');
        $this->getJson('/api/patients/'.$id)->assertOk()->assertJsonPath('data.education_level', 'College')->assertJsonPath('data.education_completed', 'Level')->assertJsonMissingPath('data.medical_background');
    }

    public function test_invalid_education_is_inline_validation_error(): void
    {
        $this->postJson('/api/patients', ['first_name' => 'Student', 'last_name' => 'Patient', 'sex' => 'Female', 'education_level' => 'Invalid', 'education_completed' => 'Invalid'])->assertUnprocessable()->assertJsonValidationErrors(['education_level', 'education_completed']);
    }

    public function test_explicit_clear_keeps_legacy_json_without_reviving_it(): void
    {
        $background = ['personalSocial' => ['education' => ['level' => 'College', 'completed' => 'Graduate'], 'pastOccupations' => 'Farmer']];
        $patient = Patient::create(['first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id, 'education_level' => 'College', 'education_completed' => 'Graduate', 'medical_background' => $background]);
        $this->patchJson('/api/patients/'.$patient->id, ['education_level' => null, 'education_completed' => null])->assertOk()->assertJsonPath('data.education_level', null)->assertJsonPath('data.education_completed', null);
        $this->getJson('/api/patients/'.$patient->id)->assertOk()->assertJsonPath('data.education_level', null);
        $this->assertSame($background, $patient->fresh()->medical_background);
    }

    public function test_migration_backfills_only_compatible_legacy_education_and_retains_json(): void
    {
        $migration = require database_path('migrations/2026_10_16_100000_add_patient_background_changes_and_education.php');
        $migration->down();
        $background = ['personalSocial' => ['education' => ['level' => 'High School', 'completed' => 'Graduate']]];
        $patient = Patient::create(['first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Female', 'medical_background' => $background]);
        $invalid = Patient::create(['first_name' => 'Old', 'last_name' => 'Patient', 'sex' => 'Male', 'medical_background' => ['personalSocial' => ['education' => ['level' => 'Unknown', 'completed' => 'Unknown']]]]);
        $migration->up();
        $this->assertSame('High School', $patient->fresh()->education_level);
        $this->assertSame('Graduate', $patient->fresh()->education_completed);
        $this->assertSame($background, $patient->fresh()->medical_background);
        $this->assertNull($invalid->fresh()->education_level);
        $this->assertNull($invalid->fresh()->education_completed);
    }
}
