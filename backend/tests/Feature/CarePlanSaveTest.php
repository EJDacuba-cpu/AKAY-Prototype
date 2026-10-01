<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
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
        $user = User::create(['name' => 'Save BHW', 'email' => 'save@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
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

    private function active(): \Illuminate\Support\Collection
    {
        return ConditionMonitoring::where('patient_id', $this->patient->id)->where('status', 'active')->get();
    }

    public function test_monitor_starts_one_record_per_condition(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'HTN', 'carePlan' => 'monitor'],
            ['id' => 'd2', 'name' => 'Post-op wound care', 'carePlan' => 'monitor'],
            ['id' => 'd3', 'name' => 'Cough', 'carePlan' => 'none'],
        ])->assertCreated()->json('data.id');

        $this->assertEqualsCanonicalizing(['hypertension', 'name:post-op wound care'], $this->active()->pluck('condition_identity')->all());
        $this->assertSame('Hypertension', $this->active()->firstWhere('condition_key', 'hypertension')->condition_name);
        $this->assertSame(['started', 'started'], \App\Models\ConditionMonitoringVisit::where('health_record_id', $id)->pluck('action')->all());
    }

    public function test_same_condition_twice_in_one_visit_makes_one_record(): void
    {
        $this->save([
            ['id' => 'd1', 'name' => 'HTN', 'carePlan' => 'monitor'],
            ['id' => 'd2', 'name' => 'Hypertension', 'carePlan' => 'monitor_refer'],
        ], [], ['needs_referral' => false])->assertCreated();

        $this->assertCount(1, $this->active());
        $this->assertTrue($this->active()->first()->visits()->sole()->referred);
    }

    public function test_a_later_monitor_of_an_active_condition_continues_it(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']])->assertCreated();
        $this->save([['id' => 'd1', 'name' => 'HTN', 'carePlan' => 'monitor']])->assertCreated();

        $this->assertCount(1, $this->active());
        $this->assertSame(['started', 'continued'], $this->active()->first()->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_continued_monitoring_is_kept_active_without_a_diagnosis(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated();

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame(['started', 'continued'], $monitoring->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_stop_ends_monitoring_but_leaves_current_conditions_status(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();
        $statusBefore = collect($this->patient->fresh()->medical_background['currentDiseases'] ?? [])->firstWhere('conditionKey', 'hypertension')['status'] ?? null;

        $id = $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Transferred to another BHC']],
        ])->assertCreated()->json('data.id');

        $monitoring->refresh();
        $this->assertSame('stopped', $monitoring->status);
        $this->assertSame($id, $monitoring->stopped_health_record_id);
        $this->assertSame('Transferred to another BHC', $monitoring->stop_reason);
        $statusAfter = collect($this->patient->fresh()->medical_background['currentDiseases'] ?? [])->firstWhere('conditionKey', 'hypertension')['status'] ?? null;
        $this->assertSame($statusBefore, $statusAfter);
    }

    public function test_a_stop_must_target_a_continued_record(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();

        $this->save([], ['monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Resolved']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_stops.0.monitoring_id']);
        $this->assertSame('active', $monitoring->fresh()->status);
    }

    /** @return array{0: ConditionMonitoring, 1: int} */
    private function activeHypertension(): array
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']])->assertCreated();

        return [$this->active()->sole(), HealthRecord::count()];
    }

    public function test_a_continued_condition_marked_none_must_be_stopped_with_a_reason(): void
    {
        $this->assertEndingWithoutStopIsRejected('none');
    }

    public function test_a_continued_condition_marked_refer_must_be_stopped_with_a_reason(): void
    {
        $this->assertEndingWithoutStopIsRejected('refer');
    }

    private function assertEndingWithoutStopIsRejected(string $carePlan): void
    {
        [$monitoring, $before] = $this->activeHypertension();

        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => $carePlan]], ['continued_monitoring_ids' => [$monitoring->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_stops']);

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame($before, HealthRecord::count());
        $this->assertSame(1, $monitoring->visits()->count());
    }

    public function test_a_continued_condition_ended_in_the_diagnosis_is_stopped_when_a_reason_is_given(): void
    {
        [$monitoring] = $this->activeHypertension();

        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'none']], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Controlled, no tracking needed']],
        ])->assertCreated();

        $this->assertSame('stopped', $monitoring->fresh()->status);
        $this->assertSame(['started', 'stopped'], $monitoring->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_a_re_diagnosed_continued_condition_without_a_care_plan_is_continued(): void
    {
        [$monitoring] = $this->activeHypertension();

        $this->save([['id' => 'd1', 'name' => 'Hypertension']], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated();

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame(['started', 'continued'], $monitoring->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_stale_or_foreign_continued_monitoring_is_rejected_and_nothing_saves(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();
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
        $this->save([['id' => 'd1', 'name' => 'Tuberculosis', 'carePlan' => 'monitor']], [], [
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-001'], 'phases' => ['intensiveStart' => now()->toDateString()]],
        ])->assertCreated();
        $monitoring = $this->active()->sole();
        $this->assertSame('tuberculosis', $monitoring->condition_key);
        $before = HealthRecord::count();

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber']);
        $this->assertSame($before, HealthRecord::count());
    }

    public function test_follow_up_of_another_patient_is_rejected(): void
    {
        $record = HealthRecord::create(['patient_id' => $this->otherPatient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id]);
        $task = FollowUpTask::create(['health_record_id' => $record->id, 'patient_id' => $this->otherPatient->id, 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $this->save([], ['continued_follow_up_task_ids' => [$task->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_follow_up_task_ids.0']);
    }
}
