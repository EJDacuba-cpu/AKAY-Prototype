<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use App\Services\StaffRoles;
use Tests\TestCase;

class CarePlanSaveTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private Patient $otherPatient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Save RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Save BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Save BHW', 'email' => 'save@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Save', 'last_name' => 'One', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->otherPatient = Patient::create(['first_name' => 'Save', 'last_name' => 'Two', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function save(array $diagnoses, array $carePlan = [], array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            'care_plan' => $carePlan,
            ...$extra,
        ]);
    }

    /** A Refer care plan is only accepted with a referral (no RHU doctor: a referral hold). */
    private function referral(): array
    {
        return [
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Referred for: Hypertension', 'urgency_level' => 'Routine'],
        ];
    }

    private function active(): \Illuminate\Support\Collection
    {
        return ConditionMonitoring::where('patient_id', $this->patient->id)->where('status', 'active')->get();
    }

    /** Continued monitoring: an RHU-confirmed condition linked to the row (legacy rows cannot be continued). */
    private function verifiedMonitoring(string $name, ?string $key = null, ?Patient $patient = null): ConditionMonitoring
    {
        $patient ??= $this->patient;
        $condition = PatientCondition::create([
            'patient_id' => $patient->id,
            'condition_name' => $name,
            'condition_identity' => $key ?? 'name:'.strtolower($name),
            'status' => 'active',
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
        ]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $patient->barangay_health_center_id]);
        $monitoring = ConditionMonitoring::create([
            'patient_id' => $patient->id,
            'patient_condition_id' => $condition->id,
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'condition_key' => $key,
            'condition_name' => $name,
            'condition_identity' => $key ?? 'name:'.strtolower($name),
            'status' => 'active',
            'started_health_record_id' => $record->id,
            'started_at' => now()->subWeek(),
        ]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    private function confirmedCondition(string $name, string $identity): PatientCondition
    {
        return PatientCondition::create([
            'patient_id' => $this->patient->id,
            'condition_name' => $name,
            'condition_identity' => $identity,
            'status' => 'active',
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
        ]);
    }

    public function test_continued_monitoring_is_kept_active_without_a_diagnosis(): void
    {
        $monitoring = $this->verifiedMonitoring('Asthma');

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated();

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame(['started', 'continued'], $monitoring->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_a_follow_up_of_continued_monitoring_needs_no_new_diagnosis(): void
    {
        $monitoring = $this->verifiedMonitoring('Asthma');

        $id = $this->save([], ['continued_monitoring_ids' => [$monitoring->id]], [
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addDays(14)->toDateString(),
                'followUpReason' => 'Repeat check',
            ],
        ])->assertCreated()->json('data.id');

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertTrue($monitoring->visits()->where('health_record_id', $id)->where('action', 'continued')->exists());
    }

    public function test_a_follow_up_without_diagnosis_or_continued_monitoring_is_still_rejected(): void
    {
        $this->save([], [], [
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addDays(14)->toDateString(),
                'followUpReason' => 'Repeat check',
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors(['diagnosis']);
    }

    public function test_a_follow_up_whose_continued_monitoring_is_all_stopped_still_needs_a_diagnosis(): void
    {
        $monitoring = $this->verifiedMonitoring('Asthma');

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Resolved']],
        ], [
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addDays(14)->toDateString(),
                'followUpReason' => 'Repeat check',
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors(['diagnosis']);
    }

    public function test_a_referral_without_a_diagnosis_is_rejected_even_when_continuing_monitoring(): void
    {
        $monitoring = $this->verifiedMonitoring('Asthma');

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]], $this->referral())
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnosis']);
    }

    public function test_stop_ends_monitoring_but_leaves_the_confirmed_condition_status(): void
    {
        $condition = $this->confirmedCondition('Hypertension', 'hypertension');
        $this->save([], ['start_monitoring_condition_ids' => [$condition->id]])->assertCreated();
        $monitoring = $this->active()->sole();

        $id = $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Transferred to another BHC']],
        ])->assertCreated()->json('data.id');

        $monitoring->refresh();
        $this->assertSame('stopped', $monitoring->status);
        $this->assertSame($id, $monitoring->stopped_health_record_id);
        $this->assertSame('Transferred to another BHC', $monitoring->stop_reason);
        $this->assertSame('active', $condition->fresh()->status, 'only the RHU changes a confirmed condition status');
    }

    public function test_a_stop_must_target_a_continued_record(): void
    {
        $monitoring = $this->verifiedMonitoring('Asthma');

        $this->save([], ['monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Resolved']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_stops.0.monitoring_id']);
        $this->assertSame('active', $monitoring->fresh()->status);
    }

    /** @return array{0: ConditionMonitoring, 1: int} */
    private function activeHypertension(): array
    {
        $monitoring = $this->verifiedMonitoring('Hypertension', 'hypertension');

        return [$monitoring, HealthRecord::count()];
    }

    public function test_referring_a_continued_condition_keeps_its_monitoring_active(): void
    {
        [$monitoring] = $this->activeHypertension();
        // No stop entry: a referral never ends monitoring by itself. The visit's
        // referral of the followed condition is the monitoring_referrals entry.
        $id = $this->save(
            [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer']],
            ['continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id], 'shared_referral_acknowledged' => true],
            $this->referral()
        )->assertCreated()->json('data.id');

        $this->assertSame('active', $monitoring->fresh()->status);
        $visit = $monitoring->visits()->where('health_record_id', $id)->sole();
        $this->assertSame('continued', $visit->action);
        $this->assertTrue($visit->referred);
    }

    public function test_stale_or_foreign_continued_monitoring_is_rejected_and_nothing_saves(): void
    {
        $monitoring = $this->verifiedMonitoring('Asthma');
        $monitoring->update(['status' => 'stopped', 'stopped_at' => now()]);
        $before = HealthRecord::count();

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_monitoring_ids.0']);
        $this->assertSame($before, HealthRecord::count());
    }

    public function test_several_continued_follow_ups_are_all_fulfilled_by_the_new_itr(): void
    {
        $first = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $second = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $taskA = FollowUpTask::create(['health_record_id' => $first->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);
        $taskB = FollowUpTask::create(['health_record_id' => $second->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $id = $this->save([], ['continued_follow_up_task_ids' => [$taskA->id, $taskB->id]], [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $first->id,
            'monitoring_data' => ['followUpTaskId' => $taskA->id],
        ])->assertCreated()->json('data.id');

        $this->assertSame($id, $taskA->fresh()->fulfilled_by_health_record_id);
        $this->assertSame($id, $taskB->fresh()->fulfilled_by_health_record_id);
        $this->assertSame('fulfilled', $taskB->fresh()->state);
    }

    public function test_an_already_fulfilled_continued_follow_up_is_a_conflict(): void
    {
        $source = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $done = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $task = FollowUpTask::create(['health_record_id' => $source->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'fulfilled', 'fulfilled_at' => now(), 'fulfilled_by_health_record_id' => $done->id]);
        $other = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $primary = FollowUpTask::create(['health_record_id' => $other->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $this->save([], ['continued_follow_up_task_ids' => [$primary->id, $task->id]], [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $other->id,
            'monitoring_data' => ['followUpTaskId' => $primary->id],
        ])->assertStatus(409)->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');
        $this->assertSame('pending', $primary->fresh()->state);
    }

    public function test_a_continued_tb_monitoring_record_requires_its_monitoring_details(): void
    {
        $monitoring = $this->verifiedMonitoring('Tuberculosis', 'tuberculosis');
        $before = HealthRecord::count();

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber']);
        $this->assertSame($before, HealthRecord::count());
    }

    public function test_a_concurrent_start_of_the_same_monitoring_is_a_409_and_nothing_saves(): void
    {
        $condition = $this->confirmedCondition('Hypertension', 'hypertension');
        // A concurrent save commits an active Hypertension monitoring between
        // this save's "already monitored?" check and its insert. Simulated by
        // inserting that competing row (bypassing the model) just before the
        // insert, so the partial unique index is what rejects the save.
        ConditionMonitoring::creating(function (ConditionMonitoring $monitoring): void {
            \Illuminate\Support\Facades\DB::table('condition_monitorings')->insert([
                ...$monitoring->getAttributes(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
        $before = HealthRecord::count();

        $this->save([], ['start_monitoring_condition_ids' => [$condition->id]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'CONDITION_MONITORING_CONFLICT');

        $this->assertSame($before, HealthRecord::count());
        $this->assertSame(0, ConditionMonitoring::count());
        $this->assertSame(0, \App\Models\ConditionMonitoringVisit::count());
    }

    public function test_a_replayed_save_with_a_care_plan_writes_nothing_twice(): void
    {
        [$monitoring] = $this->activeHypertension();
        $key = (string) Str::uuid();
        $payload = [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'BP check',
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'recheck']],
            'monitoring_data' => ['followUpStatus' => 'Follow-up Required', 'followUpDate' => now()->addWeek()->toDateString(), 'followUpReason' => 'BP recheck'],
            'care_plan' => ['continued_monitoring_ids' => [$monitoring->id]],
        ];

        $id = $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)
            ->assertCreated()->json('data.id');
        $records = HealthRecord::count();
        $visits = \App\Models\ConditionMonitoringVisit::count();

        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('data.id', $id);
        $this->assertSame($records, HealthRecord::count());
        $this->assertSame($visits, \App\Models\ConditionMonitoringVisit::count());
        $this->assertSame(1, ConditionMonitoring::count());

        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', [
            ...$payload,
            'care_plan' => [
                'continued_monitoring_ids' => [$monitoring->id],
                'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Controlled']],
            ],
        ])->assertStatus(409)->assertJsonPath('code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
        $this->assertSame($records, HealthRecord::count());
        $this->assertSame('active', $monitoring->fresh()->status);
    }

    public function test_another_patients_active_monitoring_cannot_be_continued(): void
    {
        $foreign = $this->verifiedMonitoring('Asthma', null, $this->otherPatient);
        $before = HealthRecord::count();

        $this->save([], ['continued_monitoring_ids' => [$foreign->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_monitoring_ids.0']);
        $this->assertSame($before, HealthRecord::count());
        $this->assertSame(1, $foreign->visits()->count());
    }

    public function test_continued_follow_ups_are_validated_against_the_order_the_client_sent(): void
    {
        $first = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $foreignRecord = HealthRecord::create(['patient_id' => $this->otherPatient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id]);
        $foreign = FollowUpTask::create(['health_record_id' => $foreignRecord->id, 'patient_id' => $this->otherPatient->id, 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);
        $second = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $primary = FollowUpTask::create(['health_record_id' => $first->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);
        $own = FollowUpTask::create(['health_record_id' => $second->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        // Locked in ascending id order (the foreign task first), but the error
        // still names the position the client sent it at.
        $this->save([], ['continued_follow_up_task_ids' => [$primary->id, $own->id, $foreign->id]], [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $first->id,
            'monitoring_data' => ['followUpTaskId' => $primary->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_follow_up_task_ids.2']);
        $this->assertSame('pending', $own->fresh()->state);
    }

    public function test_the_completed_follow_up_reported_is_the_parent_records_task(): void
    {
        $other = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $parent = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        // The additional task has the LOWER id; the parent's task must still win.
        $additional = FollowUpTask::create(['health_record_id' => $other->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);
        $primary = FollowUpTask::create(['health_record_id' => $parent->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $this->save([], ['continued_follow_up_task_ids' => [$primary->id, $additional->id]], [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'monitoring_data' => ['followUpTaskId' => $primary->id],
        ])->assertCreated()->assertJsonPath('result.completed_follow_up_task_id', $primary->id);
    }

    public function test_follow_up_of_another_patient_is_rejected(): void
    {
        $record = HealthRecord::create(['patient_id' => $this->otherPatient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id]);
        $task = FollowUpTask::create(['health_record_id' => $record->id, 'patient_id' => $this->otherPatient->id, 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $this->save([], ['continued_follow_up_task_ids' => [$task->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_follow_up_task_ids.0']);
    }
}
