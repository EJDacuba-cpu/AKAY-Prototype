<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePathwayFollowUpLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_scheduled_follow_up_links_only_the_ticked_pathways(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Link RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Link BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Link BHW', 'email' => 'link@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'S', 'last_name' => 'T', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => [
                'activeCarePathways' => [[
                    'pathway_key' => 'ncd',
                    'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
                ]],
                'followUpForPathways' => ['ncd'],
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ])->assertCreated()->json('data.id');

        $enrollment = CarePathwayEnrollment::where('patient_id', $patient->id)->sole();
        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertTrue($task->carePathwayEnrollments->contains($enrollment));
    }

    public function test_an_unticked_pathway_is_not_linked(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Link RHU 2', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Link BHC 2', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Link BHW 2', 'email' => 'link2@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'U', 'last_name' => 'V', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => [
                'activeCarePathways' => [[
                    'pathway_key' => 'ncd',
                    'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
                ]],
                'followUpForPathways' => [],
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ])->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertCount(0, $task->carePathwayEnrollments);
    }
}
