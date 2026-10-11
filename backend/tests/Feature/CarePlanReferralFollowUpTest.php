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
use App\Services\StaffRoles;
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
        $user = User::create(['name' => 'Ref BHW', 'email' => 'ref@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Ref', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    /** @param  array<int, array<string, mixed>>  $diagnoses */
    private function save(array $diagnoses, array $monitoringData = [], array $carePlan = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Dizziness',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            'needs_referral' => true,
            // Same shape ConsultationWorkflowRevisionTest uses. With no RHU
            // doctor available the record still saves and a referral hold is
            // recorded - the follow-up behaviour is what this test checks.
            'referral' => ['reason_for_referral' => 'Uncontrolled BP', 'urgency_level' => 'Routine'],
            'monitoring_data' => $monitoringData ?: [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeeks(2)->toDateString(),
                'followUpReason' => 'BP recheck',
            ],
            'care_plan' => $carePlan,
        ]);
    }

    public function test_a_referral_keeps_the_follow_up_when_another_concern_is_set_to_follow_up(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'follow_up'],
            ['id' => 'd2', 'name' => 'Pneumonia', 'carePlan' => 'refer'],
        ])->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('pending', $task->state);
        $this->assertSame(0, ConditionMonitoring::count(), 'a follow-up never starts condition monitoring');
    }

    public function test_a_stale_recheck_concern_is_stored_as_follow_up_and_keeps_the_referral_follow_up(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'recheck'],
            ['id' => 'd2', 'name' => 'Pneumonia', 'carePlan' => 'refer'],
        ])->assertCreated()->json('data.id');

        $this->assertSame('follow_up', \App\Models\HealthRecord::findOrFail($id)->diagnoses[0]['carePlan']);
        $this->assertSame('pending', FollowUpTask::where('health_record_id', $id)->sole()->state);
    }

    public function test_a_follow_up_concern_with_a_referral_still_requires_the_follow_up_date(): void
    {
        $this->save([
            ['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'follow_up'],
            ['id' => 'd2', 'name' => 'Pneumonia', 'carePlan' => 'refer'],
        ], ['followUpStatus' => 'Follow-up Required', 'followUpReason' => 'BP recheck'])
            ->assertStatus(422)->assertJsonValidationErrors('monitoring_data.followUpDate');
    }

    public function test_referring_a_continued_condition_keeps_monitoring_without_a_follow_up(): void
    {
        $record = \App\Models\HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $condition = \App\Models\PatientCondition::create(['patient_id' => $this->patient->id, 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'confirmed_at' => now(), 'source_type' => \App\Models\PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1]);
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'patient_condition_id' => $condition->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'condition_key' => 'hypertension', 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeek()]);

        // Monitoring stays active, but that alone asks for no BHC date: the
        // referral hands the next visit to the RHU.
        $id = $this->save(
            [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer']],
            ['followUpStatus' => 'Follow-up Required'],
            ['continued_monitoring_ids' => [$monitoring->id]]
        )->assertCreated()->json('data.id');

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
        $this->assertNull(\App\Models\HealthRecord::findOrFail($id)->monitoring_data['followUpDate'] ?? null);
    }

    /** A vaccination visit (EPI selected) that also refers an unrelated diagnosis. */
    private function saveServiceVisit(?string $followUpDate)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'Immunization',
            'chief_complaint' => 'Vaccination Visit',
            'notes' => 'Vaccine deferred, referred for cough',
            'diagnosis' => 'Pneumonia',
            'diagnoses' => [['id' => 'd1', 'name' => 'Pneumonia', 'carePlan' => 'refer']],
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Referred for: Pneumonia', 'urgency_level' => 'Routine'],
            'monitoring_data' => [
                'selectedPrograms' => ['EPI'],
                'primaryProgram' => 'EPI',
                'followUpStatus' => $followUpDate ? 'Follow-up Required' : 'Completed',
                'followUpDate' => $followUpDate,
                'followUpReason' => $followUpDate ? 'Next dose' : null,
            ],
        ]);
    }

    public function test_a_service_visit_keeps_its_next_visit_follow_up_through_a_referral(): void
    {
        $date = now()->addWeeks(4)->toDateString();
        $id = $this->saveServiceVisit($date)->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('pending', $task->state);
        $this->assertSame($date, $task->due_date->toDateString());
        $record = \App\Models\HealthRecord::findOrFail($id);
        $this->assertSame($date, $record->monitoring_data['followUpDate']);
        $this->assertSame('Needs Referral', $record->monitoring_data['followUpStatus']);
        $this->assertSame(0, ConditionMonitoring::count());
    }

    public function test_a_service_visit_with_no_follow_up_date_has_nothing_to_keep(): void
    {
        $id = $this->saveServiceVisit(null)->assertCreated()->json('data.id');

        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->exists());
    }

    public function test_refer_without_monitoring_still_drops_the_follow_up(): void
    {
        $id = $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer']])->assertCreated()->json('data.id');

        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
        $this->assertSame(0, ConditionMonitoring::count());
    }
}
