<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePlanReferralFollowUpTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Ref RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Ref BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Ref BHW', 'email' => 'ref@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Ref', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function save(string $carePlan, bool $needsReferral)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Dizziness',
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => $carePlan]],
            'needs_referral' => $needsReferral,
            // Same shape ConsultationWorkflowRevisionTest uses. With no RHU
            // doctor available the record still saves and a referral hold is
            // recorded - the follow-up behaviour is what this test checks.
            'referral' => ['reason_for_referral' => 'Uncontrolled BP', 'urgency_level' => 'Routine'],
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeeks(2)->toDateString(),
                'followUpReason' => 'BP recheck',
            ],
        ]);
    }

    public function test_monitor_and_refer_keeps_the_follow_up(): void
    {
        $id = $this->save('monitor_refer', true)->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('pending', $task->state);
        $this->assertTrue($task->conditionMonitorings()->where('condition_key', 'hypertension')->exists());
        $this->assertSame('active', ConditionMonitoring::sole()->status);
    }

    public function test_monitor_and_refer_still_requires_the_follow_up_date_when_one_is_asked_for(): void
    {
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Dizziness',
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor_refer']],
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Uncontrolled BP', 'urgency_level' => 'Routine'],
            'monitoring_data' => ['followUpStatus' => 'Follow-up Required'],
        ])->assertStatus(422)->assertJsonValidationErrors('monitoring_data.followUpDate');
    }

    public function test_refer_without_monitoring_still_drops_the_follow_up(): void
    {
        $id = $this->save('refer', true)->assertCreated()->json('data.id');

        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
        $this->assertSame(0, ConditionMonitoring::count());
    }
}
