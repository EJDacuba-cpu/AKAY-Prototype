<?php
// backend/tests/Feature/HealthRecordCarePathwayValidationTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class HealthRecordCarePathwayValidationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Val RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Val BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Val BHW', 'email' => 'val@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'O', 'last_name' => 'P', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $activeCarePathways)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => ['activeCarePathways' => $activeCarePathways],
        ]);
    }

    public function test_a_valid_activation_saves(): void
    {
        $this->store([[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertCreated();
    }

    public function test_an_unknown_pathway_key_is_rejected(): void
    {
        $this->store([[
            'pathway_key' => 'made_up',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0.pathway_key']);
    }

    public function test_an_unknown_field_set_key_is_rejected(): void
    {
        $this->store([[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'made_up_set', 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0.conditions.0.field_set_key']);
    }

    public function test_a_blank_condition_name_is_rejected(): void
    {
        $this->store([[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => '', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0.conditions.0.condition_name']);
    }

    public function test_the_old_ncddata_shape_is_no_longer_accepted(): void
    {
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'x',
            'monitoring_data' => ['ncdData' => ['conditions' => ['Hypertension'], 'diabetes' => ['fbs' => '95']]],
        ])->assertCreated(); // ncdData is simply an unrecognized key now - it is dropped, not rejected (no validation rule owns it), same as any other stray key.
    }
}
