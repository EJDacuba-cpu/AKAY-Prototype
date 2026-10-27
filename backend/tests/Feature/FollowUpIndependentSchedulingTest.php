<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\PrenatalEnrollment;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FollowUpIndependentSchedulingTest extends TestCase
{
    use RefreshDatabase;

    private User $worker;

    private Patient $patient;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Independent RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Independent BHC', 'rural_health_unit_id' => $this->rhu->id]);
        $this->worker = User::create([
            'name' => 'Independent Worker',
            'email' => 'independent@example.test',
            'password' => 'password123',
            'role' => 'bhc',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'birthdate' => '2000-01-01',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->worker->id,
        ]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function saveV2(array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
            'chief_complaint' => 'Visit',
            'category' => 'General Consultation',
            ...$extra,
        ]);
    }

    private function card(string $id, string $outcome, string $name): array
    {
        return [
            'id' => $id,
            'name' => $name,
            'reportIn' => ['morbidity'],
            'clinicalOutcome' => $outcome,
            ...($outcome === 'refer_to_rhu' ? ['referral' => [
                'urgencyLevel' => 'Routine',
                'receivingRhuId' => $this->rhu->id,
                'reasonForReferral' => 'Assessment for '.$name,
            ]] : []),
        ];
    }

    private function schedule(string $key, string $purpose, string $date, array $extra = []): array
    {
        return ['purposeKey' => $key, 'purpose' => $purpose, 'date' => $date, ...$extra];
    }

    private function pendingTask(array $attributes = []): array
    {
        $parent = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->bhc->id,
            'chief_complaint' => 'Original wound',
            'assessment_notes' => 'Dressing applied',
            'monitoring_data' => ['followUpReason' => 'Wound reassessment', 'consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2],
        ]);
        $task = FollowUpTask::create([
            'health_record_id' => $parent->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'purpose' => 'Wound reassessment',
            'purpose_key' => 'entry:wound',
            ...$attributes,
        ]);

        return [$parent, $task];
    }

    public function test_new_consultation_can_complete_care_without_a_follow_up(): void
    {
        $id = $this->saveV2(['care_plan' => ['condition_cards' => true], 'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')]])
            ->assertCreated()->json('data.id');
        $this->assertDatabaseCount('follow_up_tasks', 0);
        $this->assertFalse(HealthRecord::findOrFail($id)->monitoring_data['bhcFollowUp']);
    }

    public function test_locally_managed_condition_can_schedule_its_own_return(): void
    {
        $date = now()->addDays(4)->toDateString();
        $id = $this->saveV2([
            'care_plan' => ['condition_cards' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => ['followUpSchedules' => [$this->schedule('entry:c1', 'Wound reassessment', $date, ['sourceEntryId' => 'c1'])]],
        ])->assertCreated()->json('data.id');
        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('Wound reassessment', $task->purpose);
        $this->assertSame('entry:c1', $task->purpose_key);
        $this->assertSame($date, $task->due_date->toDateString());
        $this->assertNull($task->due_time);
    }

    public function test_two_follow_ups_from_one_consultation_keep_distinct_dates(): void
    {
        $wound = now()->addDays(4)->toDateString();
        $prenatal = now()->addDays(12)->toDateString();
        $id = $this->saveV2([
            'care_plan' => ['condition_cards' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'prenatalIntent' => PrenatalEnrollment::INTENT_ENROLL,
                'followUpSchedules' => [
                    $this->schedule('entry:c1', 'Wound reassessment', $wound, ['sourceEntryId' => 'c1']),
                    $this->schedule('service:maternal', 'Prenatal follow-up', $prenatal),
                ],
            ],
            'maternal_data' => ['lmp' => '2026-03-01'],
            'category' => 'Maternal',
        ])->assertCreated()->json('data.id');
        $tasks = FollowUpTask::where('health_record_id', $id)->orderBy('due_date')->get();
        $this->assertCount(2, $tasks);
        $this->assertSame(['Wound reassessment', 'Prenatal follow-up'], $tasks->pluck('purpose')->all());
        $this->assertSame([$wound, $prenatal], $tasks->map(fn ($task) => $task->due_date->toDateString())->all());
    }

    public function test_selected_follow_up_is_fulfilled_without_a_successor(): void
    {
        [$parent, $task] = $this->pendingTask();
        $id = $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['condition_cards' => true, 'continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertCreated()->json('data.id');
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        $this->assertSame($id, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertSame(0, FollowUpTask::where('health_record_id', $id)->count());
    }

    public function test_selected_follow_up_can_create_a_successor_linked_to_today(): void
    {
        [$parent, $task] = $this->pendingTask();
        $next = now()->addWeek()->toDateString();
        $id = $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['condition_cards' => true, 'continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'bhc_follow_up']]],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpSchedules' => [$this->schedule('entry:wound', 'Wound reassessment', $next, [
                    'predecessorTaskId' => $task->id,
                ])],
            ],
        ])->assertCreated()->json('data.id');
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        $successor = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame($task->id, $successor->predecessor_task_id);
        $this->assertSame('entry:wound', $successor->purpose_key);
        $this->assertSame($next, $successor->due_date->toDateString());
    }

    public function test_new_concern_during_follow_up_can_be_referred_without_confirming_a_diagnosis(): void
    {
        [$parent, $task] = $this->pendingTask();
        $id = $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'needs_referral' => true,
            'care_plan' => ['condition_cards' => true, 'continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'diagnoses' => [
                $this->card('c1', 'managed_at_bhc', 'Wound'),
                $this->card('c2', 'refer_to_rhu', 'Suspected hypertension'),
            ],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertCreated()->json('data.id');
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertDatabaseCount('patient_conditions', 0);
        $this->assertSame(0, FollowUpTask::where('health_record_id', $id)->count());
    }

    public function test_completing_one_follow_up_leaves_an_unrelated_appointment_pending(): void
    {
        [$parent, $wound] = $this->pendingTask();
        $prenatalRecord = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'Maternal',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $prenatal = FollowUpTask::create([
            'health_record_id' => $prenatalRecord->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->addDays(7)->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'purpose' => 'Prenatal follow-up',
            'purpose_key' => 'service:maternal',
        ]);

        $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['condition_cards' => true, 'continued_follow_up_task_ids' => [$wound->id], 'continued_concerns' => [['taskId' => $wound->id, 'careOutcome' => 'managed_at_bhc']]],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => ['followUpTaskId' => $wound->id],
        ])->assertCreated();

        $this->assertSame(FollowUpTask::STATE_FULFILLED, $wound->fresh()->state);
        $this->assertSame(FollowUpTask::STATE_PENDING, $prenatal->fresh()->state);
        $this->assertNull($prenatal->fresh()->fulfilled_at);
    }

    public function test_two_explicitly_selected_follow_ups_are_fulfilled_together(): void
    {
        [$parent, $wound] = $this->pendingTask();
        $otherRecord = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $headache = FollowUpTask::create([
            'health_record_id' => $otherRecord->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'purpose' => 'Headache review',
            'purpose_key' => 'entry:headache',
        ]);

        $id = $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['condition_cards' => true, 'continued_follow_up_task_ids' => [$wound->id, $headache->id], 'continued_concerns' => [['taskId' => $wound->id, 'careOutcome' => 'managed_at_bhc'], ['taskId' => $headache->id, 'careOutcome' => 'managed_at_bhc']]],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound'), $this->card('c2', 'managed_at_bhc', 'Headache')],
            'monitoring_data' => ['followUpTaskId' => $wound->id],
        ])->assertCreated()->json('data.id');

        $this->assertSame($id, $wound->fresh()->fulfilled_by_health_record_id);
        $this->assertSame($id, $headache->fresh()->fulfilled_by_health_record_id);
    }

    public function test_reschedule_keeps_the_original_due_date_as_history(): void
    {
        [, $task] = $this->pendingTask();
        $response = $this->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
            'due_date' => now()->addDays(3)->toDateString(),
            'notes' => 'Patient asked to move the visit.',
        ])->assertOk();
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $task->fresh()->state);
        $this->assertSame(now()->toDateString(), $task->fresh()->due_date->toDateString());
        $this->assertNotNull($task->fresh()->rescheduled_to_id);
        $new = FollowUpTask::findOrFail($response->json('data.id'));
        $this->assertSame('Wound reassessment', $new->purpose);
        $this->assertSame('entry:wound', $new->purpose_key);
        $this->assertSame('Patient asked to move the visit.', $new->notes);
        $this->assertNull($new->rescheduled_to_id);
    }

    public function test_no_show_and_cancelled_tasks_are_not_fulfilled(): void
    {
        [, $noShow] = $this->pendingTask();
        $this->patchJson("/api/follow-up-tasks/{$noShow->id}/no-show", ['notes' => 'Did not attend'])->assertOk();
        $this->assertSame(FollowUpTask::STATE_NO_SHOW, $noShow->fresh()->state);
        $this->assertNull($noShow->fresh()->fulfilled_at);

        [, $cancelled] = $this->pendingTask(['purpose_key' => 'entry:other', 'purpose' => 'Other']);
        $this->patchJson("/api/follow-up-tasks/{$cancelled->id}/cancel", ['notes' => 'Moved away'])->assertOk();
        $this->assertSame(FollowUpTask::STATE_CANCELLED, $cancelled->fresh()->state);
        $this->assertNull($cancelled->fresh()->fulfilled_at);
    }

    public function test_stale_selected_follow_up_is_rejected_and_saves_nothing(): void
    {
        [$parent, $task] = $this->pendingTask();
        $other = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $task->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $other->id,
        ]);

        $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertStatus(409)->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');
        $this->assertSame(2, HealthRecord::count());
    }

    public function test_concurrent_completion_of_the_same_task_rejects_the_second_save(): void
    {
        [$parent, $task] = $this->pendingTask();
        $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertCreated();

        $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertStatus(409)->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');
        $this->assertSame(1, FollowUpTask::where('state', FollowUpTask::STATE_FULFILLED)->count());
    }

    public function test_idempotent_retry_does_not_duplicate_consultation_or_appointment(): void
    {
        $key = (string) Str::uuid();
        $payload = [
            'patient_id' => $this->patient->id,
            'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
            'chief_complaint' => 'Wound and prenatal',
            'category' => 'General Consultation',
            'care_plan' => ['condition_cards' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => ['followUpSchedules' => [
                $this->schedule('entry:c1', 'Wound reassessment', now()->addDays(4)->toDateString(), ['sourceEntryId' => 'c1']),
                $this->schedule('service:maternal', 'Prenatal follow-up', now()->addDays(12)->toDateString()),
            ]],
        ];
        $id = $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)->assertCreated()->json('data.id');
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)
            ->assertOk()->assertJsonPath('idempotent_replay', true)->assertJsonPath('data.id', $id);
        $this->assertSame(1, HealthRecord::count());
        $this->assertSame(2, FollowUpTask::count());
    }

    public function test_unaddressed_rhu_monitoring_is_left_unchanged(): void
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $condition = PatientCondition::create([
            'patient_id' => $this->patient->id,
            'condition_name' => 'Hypertension',
            'condition_identity' => 'hypertension',
            'status' => 'active',
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
        ]);
        $monitoring = ConditionMonitoring::create([
            'patient_id' => $this->patient->id,
            'patient_condition_id' => $condition->id,
            'barangay_health_center_id' => $this->bhc->id,
            'condition_key' => 'hypertension',
            'condition_name' => 'Hypertension',
            'condition_identity' => 'hypertension',
            'status' => 'active',
            'started_health_record_id' => $record->id,
            'started_at' => now()->subWeek(),
        ]);

        $this->saveV2(['care_plan' => ['condition_cards' => true], 'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')]])->assertCreated();
        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame('active', $condition->fresh()->status);
        $this->assertSame(0, $monitoring->visits()->count());
    }

    public function test_legacy_single_follow_up_records_remain_readable_and_schedulable(): void
    {
        $id = $this->saveV2([
            'care_plan' => ['bhc_follow_up' => true],
            'monitoring_data' => ['followUpDate' => now()->addWeek()->toDateString(), 'followUpReason' => 'Recheck cough'],
        ])->assertCreated()->json('data.id');
        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('visit', $task->purpose_key);
        $this->assertSame('Recheck cough', $task->purpose);
        $overview = $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk();
        $overview->assertJsonPath('data.pending_follow_ups.0.id', $task->id)
            ->assertJsonPath('data.pending_follow_ups.0.reason', 'Recheck cough')
            ->assertJsonPath('data.pending_follow_ups.0.purpose_key', 'visit');
    }

    public function test_cross_facility_follow_up_access_is_denied(): void
    {
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other BHC', 'rural_health_unit_id' => $this->rhu->id]);
        $otherPatient = Patient::create([
            'first_name' => 'Other',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $otherBhc->id,
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $record = HealthRecord::create(['patient_id' => $otherPatient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $otherBhc->id]);
        $task = FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $otherPatient->id,
            'barangay_health_center_id' => $otherBhc->id,
            'due_date' => now()->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'purpose_key' => 'visit',
        ]);

        $this->getJson("/api/follow-up-tasks/{$task->id}")->assertForbidden();
        $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $record->id,
            'care_plan' => ['continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertForbidden();
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
    }

    public function test_draft_save_does_not_fulfill_or_create_follow_ups(): void
    {
        [$parent, $task] = $this->pendingTask();
        $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id,
            'classification' => 'General Consultation',
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'chiefComplaint' => 'Draft follow-up',
                'carePlan' => ['continuedFollowUpTaskIds' => [$task->id], 'bhcFollowUp' => true],
                'followUpDate' => now()->addWeek()->toDateString(),
                'followUpSchedules' => [$this->schedule('entry:wound', 'Wound reassessment', now()->addWeek()->toDateString())],
            ],
        ])->assertCreated();
        $this->assertDatabaseCount('health_records', 1);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertSame(1, FollowUpTask::count());
        $this->assertSame(1, HealthRecordDraft::count());
    }

    public function test_unauthorized_staff_cannot_finalize_a_follow_up(): void
    {
        $encoder = User::create([
            'name' => 'Encoder',
            'email' => 'encoder-independent@example.test',
            'password' => 'password123',
            'role' => 'bhc',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('encoder'),
        ]);
        Sanctum::actingAs($encoder, ['akay:access']);
        [$parent, $task] = $this->pendingTask();
        $this->saveV2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'care_plan' => ['continued_follow_up_task_ids' => [$task->id], 'continued_concerns' => [['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc']]],
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertForbidden();
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
    }
}
