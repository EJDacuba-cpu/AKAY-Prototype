<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\HealthRecordDraftPayloadService;
use App\Services\HealthRecordDraftService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContinuedConcernOutcomeTest extends TestCase
{
    use RefreshDatabase;

    private User $worker;

    private Patient $patient;

    private RuralHealthUnit $rhu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Test RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Test BHC', 'rural_health_unit_id' => $this->rhu->id]);
        $this->worker = User::create(['name' => 'Worker', 'email' => 'continued@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '2000-01-01', 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $this->rhu->id, 'created_by' => $this->worker->id]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function task(array $attributes = []): FollowUpTask
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'chief_complaint' => 'Original wound', 'diagnoses' => [['id' => 'old-wound', 'name' => 'Wound', 'reportIn' => ['morbidity']]], 'morbidity_reporting_status' => 'morbidity']);

        return FollowUpTask::create(['health_record_id' => $record->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => FollowUpTask::STATE_PENDING, 'purpose_key' => 'entry:wound', 'purpose' => 'Wound review', ...$attributes]);
    }

    private function payload(array $decisions): array
    {
        return ['patient_id' => $this->patient->id, 'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2, 'category' => 'General Consultation', 'chief_complaint' => 'Reassessment', 'care_plan' => ['condition_cards' => true, 'shared_condition_referral' => true, 'continued_follow_up_task_ids' => array_column($decisions, 'taskId'), 'continued_concerns' => $decisions]];
    }

    private function save(array $payload, ?string $key = null)
    {
        return $this->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())->postJson('/api/health-records', $payload);
    }

    private function decision(FollowUpTask $task, string $outcome): array
    {
        return ['taskId' => $task->id, 'careOutcome' => $outcome];
    }

    private function schedule(FollowUpTask $task, array $extra = []): array
    {
        return ['purposeKey' => 'continued:'.$task->id, 'purpose' => 'Review wound again', 'date' => now()->addDays(5)->toDateString(), 'time' => '', 'predecessorTaskId' => $task->id, ...$extra];
    }

    private function refer(array $payload): array
    {
        $payload['needs_referral'] = true;
        $payload['care_plan']['refer_to_rhu'] = true;
        $payload['care_plan']['shared_referral_acknowledged'] = true;
        $payload['referral'] = ['rural_health_unit_id' => $this->rhu->id, 'urgency_level' => 'Routine', 'reason_for_referral' => 'Further assessment'];

        return $payload;
    }

    public function test_managed_preserves_history_and_does_not_create_a_new_reported_case(): void
    {
        $task = $this->task();
        $before = $task->healthRecord->getRawOriginal();
        $id = $this->save($this->payload([$this->decision($task, 'managed_at_bhc')]))->assertCreated()->json('data.id');
        $record = HealthRecord::findOrFail($id);
        $this->assertSame($id, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertSame([['taskId' => $task->id, 'careOutcome' => 'managed_at_bhc', 'sourceHealthRecordId' => $task->health_record_id, 'purpose' => 'Wound review']], $record->monitoring_data['continuedConcerns']);
        $this->assertEmpty($record->diagnoses);
        $this->assertSame('not_included', $record->monitoring_data['morbidityReportingStatus']);
        $this->assertSame($before, $task->healthRecord->fresh()->getRawOriginal());
        $this->assertDatabaseCount('follow_up_tasks', 1);
    }

    public function test_missing_decision_cannot_silently_fulfill_selected_task(): void
    {
        $task = $this->task();
        $payload = $this->payload([]);
        $payload['care_plan']['continued_follow_up_task_ids'] = [$task->id];
        $this->save($payload)->assertUnprocessable()->assertJsonValidationErrors('care_plan.continued_concerns');
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_follow_up_requires_its_own_schedule_and_keeps_blank_time_null(): void
    {
        $task = $this->task();
        $payload = $this->payload([$this->decision($task, 'bhc_follow_up')]);
        $this->save($payload)->assertUnprocessable();
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task)];
        $id = $this->save($payload)->assertCreated()->json('data.id');
        $next = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame($task->id, $next->predecessor_task_id);
        $this->assertNull($next->due_time);
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
    }

    public function test_shared_referral_uses_existing_hold_and_replays_without_duplicates(): void
    {
        $first = $this->task();
        $second = $this->task();
        $payload = $this->refer($this->payload([$this->decision($first, 'refer_to_rhu'), $this->decision($second, 'refer_to_rhu')]));
        $key = (string) Str::uuid();
        $id = $this->save($payload, $key)->assertCreated()->json('data.id');
        $this->save($payload, $key)->assertSuccessful();
        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertSame($id, $first->fresh()->fulfilled_by_health_record_id);
        $this->assertSame($id, $second->fresh()->fulfilled_by_health_record_id);
        $this->assertSame('Wound review', HealthRecord::findOrFail($id)->monitoring_data['pendingReferral']['initial_diagnosis']);
    }

    public function test_multiple_outcomes_and_new_concern_remain_independent(): void
    {
        $managed = $this->task();
        $return = $this->task();
        $refer = $this->task();
        $payload = $this->refer($this->payload([$this->decision($managed, 'managed_at_bhc'), $this->decision($return, 'bhc_follow_up'), $this->decision($refer, 'refer_to_rhu')]));
        $payload['diagnoses'] = [['id' => 'new', 'name' => 'Headache', 'reportIn' => ['morbidity'], 'clinicalOutcome' => 'managed_at_bhc']];
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($return), ['purposeKey' => 'entry:new', 'purpose' => 'Headache review', 'date' => now()->addDays(2)->toDateString(), 'sourceEntryId' => 'new']];
        $id = $this->save($payload)->assertCreated()->json('data.id');
        $tasks = FollowUpTask::where('health_record_id', $id)->get();
        $this->assertCount(2, $tasks);
        $this->assertSame($return->id, $tasks->firstWhere('purpose_key', 'continued:'.$return->id)->predecessor_task_id);
        $this->assertNull($tasks->firstWhere('purpose_key', 'entry:new')->predecessor_task_id);
        $this->assertCount(1, HealthRecord::findOrFail($id)->diagnoses);
        foreach ([$managed, $return, $refer] as $task) {
            $this->assertSame($id, $task->fresh()->fulfilled_by_health_record_id);
        }
    }

    public function test_unlinked_decision_and_conflicting_successor_are_rejected(): void
    {
        $task = $this->task();
        $payload = $this->payload([$this->decision($task, 'managed_at_bhc')]);
        $payload['care_plan']['continued_follow_up_task_ids'] = [];
        $this->save($payload)->assertUnprocessable();
        $payload['care_plan']['continued_follow_up_task_ids'] = [$task->id];
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task)];
        $this->save($payload)->assertUnprocessable();
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
    }

    public function test_draft_schema_preserves_decisions_and_optional_time(): void
    {
        $payload = ['carePlan' => ['continuedFollowUpTaskIds' => [7], 'continuedConcerns' => [['taskId' => 7, 'careOutcome' => 'bhc_follow_up']]], 'followUpSchedules' => [['purposeKey' => 'continued:7', 'purpose' => 'Review', 'date' => '2026-11-01', 'time' => '', 'predecessorTaskId' => 7]]];
        $this->assertSame($payload, app(HealthRecordDraftPayloadService::class)->sanitize($payload));
    }

    public function test_inferred_follow_up_visit_and_legacy_task_aliases_cannot_skip_decisions(): void
    {
        $task = $this->task();
        foreach (['followUpTaskId', 'follow_up_task_id', 'followUpId', 'follow_up_id'] as $field) {
            $payload = $this->payload([]);
            $payload['parent_health_record_id'] = $task->health_record_id;
            $payload['monitoring_data'][$field] = $task->id;
            $this->save($payload)->assertUnprocessable();
        }
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_invalid_times_missing_dates_and_reasons_and_duplicate_successors_fail_atomically(): void
    {
        $task = $this->task();
        $payload = $this->payload([$this->decision($task, 'bhc_follow_up')]);
        foreach ([['date' => ''], ['purpose' => ''], ['time' => '25:30']] as $invalid) {
            $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task, $invalid)];
            $this->save($payload)->assertUnprocessable();
        }
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task), $this->schedule($task, ['purposeKey' => 'duplicate'])];
        $this->save($payload)->assertUnprocessable();
        $this->assertDatabaseCount('health_records', 1);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task, ['time' => '09:30'])];
        $id = $this->save($payload)->assertCreated()->json('data.id');
        $this->assertSame('09:30', substr(FollowUpTask::where('health_record_id', $id)->sole()->due_time, 0, 5));
    }

    public function test_cancelled_fulfilled_and_superseded_tasks_reject_the_entire_multi_task_save(): void
    {
        foreach ([FollowUpTask::STATE_CANCELLED, FollowUpTask::STATE_FULFILLED, FollowUpTask::STATE_RESCHEDULED] as $state) {
            $valid = $this->task();
            $invalid = $this->task(['state' => $state]);
            if ($state === FollowUpTask::STATE_RESCHEDULED) {
                $invalid->update(['rescheduled_to_id' => $this->task()->id]);
            }
            $count = HealthRecord::count();
            $payload = $this->payload([$this->decision($valid, 'bhc_follow_up'), $this->decision($invalid, 'managed_at_bhc')]);
            $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($valid)];
            $this->save($payload)->assertConflict()->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');
            $this->assertDatabaseCount('health_records', $count);
            $this->assertSame(FollowUpTask::STATE_PENDING, $valid->fresh()->state);
        }
    }

    public function test_new_referral_and_continued_return_share_one_atomic_visit(): void
    {
        $this->seedAvailableProvider($this->rhu);
        $task = $this->task();
        $payload = $this->refer($this->payload([$this->decision($task, 'bhc_follow_up')]));
        $payload['diagnoses'] = [['id' => 'new', 'name' => 'Headache', 'reportIn' => ['morbidity'], 'clinicalOutcome' => 'refer_to_rhu']];
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task)];
        $key = (string) Str::uuid();
        $id = $this->save($payload, $key)->assertCreated()->json('data.id');
        $this->save($payload, $key)->assertSuccessful();
        $this->assertDatabaseCount('referrals', 1);
        $this->assertSame($task->id, FollowUpTask::where('health_record_id', $id)->sole()->predecessor_task_id);
        $this->assertSame('Headache', Referral::sole()->initial_diagnosis);
    }

    public function test_continued_referrals_need_shared_confirmation_and_authorized_facility(): void
    {
        $one = $this->task();
        $two = $this->task();
        $payload = $this->refer($this->payload([$this->decision($one, 'refer_to_rhu'), $this->decision($two, 'refer_to_rhu')]));
        $payload['care_plan']['shared_referral_acknowledged'] = false;
        $this->save($payload)->assertUnprocessable()->assertJsonValidationErrors('care_plan.shared_referral_acknowledged');
        $payload['care_plan']['shared_referral_acknowledged'] = true;
        $other = RuralHealthUnit::create(['name' => 'Unauthorized RHU', 'status' => 'active']);
        $payload['referral']['rural_health_unit_id'] = $other->id;
        $this->save($payload)->assertUnprocessable();
        $this->assertSame(FollowUpTask::STATE_PENDING, $one->fresh()->state);
        $this->assertDatabaseCount('health_records', 2);
        $this->assertDatabaseCount('referral_holds', 0);
    }

    public function test_draft_round_trip_preserves_outcomes_without_processing_tasks(): void
    {
        $task = $this->task();
        $decisions = [$this->decision($task, 'bhc_follow_up')];
        $response = $this->postJson('/api/health-record-drafts', ['patient_id' => $this->patient->id, 'classification' => 'General Consultation', 'payload' => ['consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2, 'chiefComplaint' => 'Review', 'carePlan' => ['continuedFollowUpTaskIds' => [$task->id], 'continuedConcerns' => $decisions], 'followUpSchedules' => [$this->schedule($task)]]])->assertCreated();
        $draft = HealthRecordDraft::sole();
        $stored = app(HealthRecordDraftService::class)->payload($draft);
        $this->assertSame($decisions, $stored['carePlan']['continuedConcerns']);
        $this->assertNull($stored['followUpSchedules'][0]['time']);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertDatabaseCount('follow_up_tasks', 1);
        $this->getJson('/api/health-record-drafts/'.$response->json('data.id'))->assertOk()
            ->assertJsonPath('data.payload.carePlan.continuedConcerns', $decisions);
        $payload = $this->payload($stored['carePlan']['continuedConcerns']);
        $payload['monitoring_data']['followUpSchedules'] = $stored['followUpSchedules'];
        $this->withHeader('X-Health-Record-Draft-ID', $draft->public_id)->withHeader('X-Draft-Version', (string) $draft->version);
        $key = (string) Str::uuid();
        $id = $this->save($payload, $key)->assertCreated()->json('data.id');
        $this->save($payload, $key)->assertOk()->assertJsonPath('data.id', $id);
        $this->assertSame($id, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertSame(1, FollowUpTask::where('health_record_id', $id)->count());
    }

    public function test_unselected_primary_hint_cannot_authorize_a_successor(): void
    {
        $task = $this->task();
        $payload = $this->payload([]);
        $payload['visit_type'] = 'initial_consultation';
        $payload['monitoring_data'] = ['followUpTaskId' => $task->id, 'followUpSchedules' => [$this->schedule($task)]];
        $this->save($payload)->assertUnprocessable();
        $this->assertDatabaseCount('follow_up_tasks', 1);
    }

    public function test_schedule_aliases_are_subject_to_the_same_validation(): void
    {
        $task = $this->task();
        $payload = $this->payload([$this->decision($task, 'bhc_follow_up')]);
        $payload['monitoring_data']['follow_up_schedules'] = [['purpose_key' => 'continued:'.$task->id, 'reason' => 'Review', 'due_date' => '2026-11-01', 'due_time' => '25:99', 'predecessor_task_id' => $task->id]];
        $this->save($payload)->assertUnprocessable()->assertJsonValidationErrors('monitoring_data.followUpSchedules.0.time');
        unset($payload['monitoring_data']['follow_up_schedules']);
        $payload['monitoring_data']['followUpSchedules'] = [$this->schedule($task, ['time' => null, 'dueTime' => '25:99'])];
        $this->save($payload)->assertUnprocessable()->assertJsonValidationErrors('monitoring_data.followUpSchedules.0.time');
        $this->assertDatabaseCount('follow_up_tasks', 1);
    }

    public function test_managed_concern_and_new_same_named_problem_keep_independent_schedule_and_report(): void
    {
        $task = $this->task();
        $payload = $this->payload([$this->decision($task, 'managed_at_bhc')]);
        $payload['visit_type'] = 'follow_up_visit';
        $payload['parent_health_record_id'] = $task->health_record_id;
        $payload['monitoring_data'] = ['followUpTaskId' => $task->id, 'followUpSchedules' => [['purposeKey' => 'entry:new', 'purpose' => 'New wound review', 'date' => now()->addWeek()->toDateString(), 'sourceEntryId' => 'new']]];
        $payload['diagnoses'] = [['id' => 'new', 'name' => 'Wound', 'reportIn' => ['morbidity'], 'clinicalOutcome' => 'managed_at_bhc']];
        $id = $this->save($payload)->assertCreated()->json('data.id');
        $successor = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertNull($successor->predecessor_task_id);
        $this->assertSame('new', $successor->source_entry_id);
        $this->assertSame($id, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertSame('morbidity', HealthRecord::findOrFail($id)->monitoring_data['morbidityReportingStatus']);
    }

    public function test_continued_concern_keeps_prenatal_family_planning_and_epi_data(): void
    {
        $task = $this->task();
        $payload = $this->payload([$this->decision($task, 'managed_at_bhc')]);
        $payload['category'] = 'Maternal';
        $payload['monitoring_data'] = ['selectedPrograms' => ['Maternal', 'Family Planning', 'EPI'], 'primaryProgram' => 'Maternal', 'prenatalIntent' => 'enroll'];
        $payload['maternal_data'] = ['lmp' => now()->subWeeks(12)->toDateString()];
        $payload['family_planning_data'] = ['methodUsed' => 'Condom'];
        $payload['immunization_data'] = ['remarks' => 'Reviewed immunization history'];
        $payload['notes'] = 'Immunization history reviewed; no vaccine given at this visit.';
        $id = $this->save($payload)->assertCreated()->json('data.id');
        $this->getJson('/api/health-records/'.$id)->assertOk()
            ->assertJsonPath('data.monitoring_data.selectedPrograms', ['Maternal', 'Family Planning', 'EPI'])
            ->assertJsonPath('data.family_planning_data.methodUsed', 'Condom')
            ->assertJsonPath('data.immunization_data.remarks', 'Reviewed immunization history');
        $this->assertSame($payload['maternal_data']['lmp'], HealthRecord::findOrFail($id)->maternal_data['lmp']);
    }

    public function test_managed_task_does_not_close_rhu_confirmed_condition_or_monitoring(): void
    {
        $task = $this->task();
        $condition = PatientCondition::create(['patient_id' => $this->patient->id, 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'confirmed_at' => now(), 'source_type' => PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1]);
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'patient_condition_id' => $condition->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'condition_key' => 'hypertension', 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'started_health_record_id' => $task->health_record_id, 'started_at' => now()]);
        $this->save($this->payload([$this->decision($task, 'managed_at_bhc')]))->assertCreated();
        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame('active', $condition->fresh()->status);
    }
}
