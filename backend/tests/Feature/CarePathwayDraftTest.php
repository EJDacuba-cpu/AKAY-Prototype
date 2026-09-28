<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarePathwayDraftTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_care_pathways_round_trip_through_a_draft(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Draft RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Draft BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Draft BHW', 'email' => 'draft@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'W', 'last_name' => 'X', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $patient->id, 'classification' => 'NCD Monitoring',
            'payload' => [
                'chiefComplaint' => 'BP check',
                'activeCarePathways' => [[
                    'pathway_key' => 'ncd',
                    'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []]],
                ]],
                'followUpForPathways' => ['ncd'],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.activeCarePathways.0.pathway_key', 'ncd')
            ->assertJsonPath('data.payload.followUpForPathways.0', 'ncd');
    }
}
