<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\ConditionMonitoringVisit;
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

/** BHC monitoring starts only from an RHU-confirmed condition, never from a consultation concern. */
class MonitoringStartTest extends TestCase
{
    use RefreshDatabase;

    private const NOT_CONFIRMED = 'This condition is not confirmed as Active or Controlled for this patient.';

    private const ALREADY_MONITORED = 'This condition is already monitored at BHC.';

    private const PENDING_RHU = 'This monitoring is pending RHU verification and cannot be continued.';

    private Patient $patient;

    private Patient $otherPatient;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Start RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Start BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Start BHW', 'email' => 'start@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Start', 'last_name' => 'One', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
        $this->otherPatient = Patient::create(['first_name' => 'Start', 'last_name' => 'Two', 'sex' => 'Male', 'barangay_health_center_id' => $this->bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function save(array $carePlan = [], array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            'care_plan' => $carePlan,
            ...$extra,
        ]);
    }

    private function condition(string $name, string $identity, string $status = 'active', ?Patient $patient = null, bool $recommended = false): PatientCondition
    {
        return PatientCondition::create([
            'patient_id' => ($patient ?? $this->patient)->id,
            'condition_name' => $name,
            'condition_identity' => $identity,
            'status' => $status,
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
            'bhc_monitoring_recommended_at' => $recommended ? now() : null,
        ]);
    }

    private function legacyMonitoring(string $name, ?string $key, string $identity): ConditionMonitoring
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'condition_key' => $key, 'condition_name' => $name, 'condition_identity' => $identity, 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeek()]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    private function referral(): array
    {
        return [
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Referred for: Hypertension', 'urgency_level' => 'Routine'],
        ];
    }

    public function test_starting_monitoring_links_the_confirmed_condition(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension', 'controlled');

        $id = $this->save(['start_monitoring_condition_ids' => [$condition->id]])->assertCreated()->json('data.id');

        $monitoring = ConditionMonitoring::where('patient_id', $this->patient->id)->sole();
        $this->assertSame($condition->id, $monitoring->patient_condition_id);
        $this->assertFalse($monitoring->isLegacy());
        $this->assertSame('Hypertension', $monitoring->condition_name);
        $this->assertSame('hypertension', $monitoring->condition_identity);
        $this->assertSame('hypertension', $monitoring->condition_key);
        $this->assertSame('active', $monitoring->status);
        $this->assertSame($id, $monitoring->started_health_record_id);
        $this->assertSame(['started'], $monitoring->visits()->pluck('action')->all());
        $this->assertSame('controlled', $condition->fresh()->status, 'a BHC visit never changes the RHU-confirmed status');
    }

    public function test_a_free_text_confirmed_condition_starts_without_a_registry_key(): void
    {
        $condition = $this->condition('Post-op wound care', 'name:post-op wound care');

        $this->save(['start_monitoring_condition_ids' => [$condition->id]])->assertCreated();

        $monitoring = ConditionMonitoring::sole();
        $this->assertNull($monitoring->condition_key);
        $this->assertSame('name:post-op wound care', $monitoring->condition_identity);
    }

    public function test_start_is_rejected_for_under_evaluation_resolved_ruled_out_or_another_patients_condition(): void
    {
        $rejected = [
            $this->condition('Asthma', 'name:asthma', 'under_evaluation'),
            $this->condition('Pneumonia', 'name:pneumonia', 'resolved'),
            $this->condition('Dengue', 'name:dengue', 'ruled_out'),
            $this->condition('Hypertension', 'hypertension', 'active', $this->otherPatient),
        ];
        $before = HealthRecord::count();

        foreach ($rejected as $condition) {
            $this->save(['start_monitoring_condition_ids' => [$condition->id]])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.0'])
                ->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.0' => self::NOT_CONFIRMED]);
        }
        $this->save(['start_monitoring_condition_ids' => [999999]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.0']);

        $this->assertSame($before, HealthRecord::count());
        $this->assertSame(0, ConditionMonitoring::count());
        $this->assertSame(0, ConditionMonitoringVisit::count());
    }

    public function test_one_bad_condition_in_the_list_saves_nothing(): void
    {
        $good = $this->condition('Hypertension', 'hypertension');
        $bad = $this->condition('Asthma', 'name:asthma', 'resolved');

        $this->save(['start_monitoring_condition_ids' => [$good->id, $bad->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.1']);

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame(0, ConditionMonitoring::count());
    }

    public function test_an_already_monitored_condition_cannot_be_started_again(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension');
        $this->legacyMonitoring('Hypertension', 'hypertension', 'hypertension');
        $before = HealthRecord::count();

        $this->save(['start_monitoring_condition_ids' => [$condition->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.0' => self::ALREADY_MONITORED]);

        $this->assertSame($before, HealthRecord::count());
        $this->assertSame(1, ConditionMonitoring::count());

        // Once started from the confirmed condition, a second start is refused too.
        $other = $this->condition('Asthma', 'name:asthma');
        $this->save(['start_monitoring_condition_ids' => [$other->id]])->assertCreated();
        $this->save(['start_monitoring_condition_ids' => [$other->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.0' => self::ALREADY_MONITORED]);
    }

    public function test_the_same_condition_twice_in_one_start_is_rejected(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension');

        $this->save(['start_monitoring_condition_ids' => [$condition->id, $condition->id]])
            ->assertUnprocessable();
        $this->assertSame(0, ConditionMonitoring::count());
        $this->assertSame(0, HealthRecord::count());
    }

    public function test_a_started_recommendation_leaves_the_overview(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension', 'active', null, true);
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(1, 'data.monitoring_recommendations')
            ->assertJsonPath('data.monitoring_recommendations.0.condition_id', $condition->id);

        $this->save(['start_monitoring_condition_ids' => [$condition->id]])->assertCreated();

        $overview = $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk();
        $overview->assertJsonCount(0, 'data.monitoring_recommendations')
            ->assertJsonCount(1, 'data.monitoring_without_follow_up')
            ->assertJsonPath('data.monitoring_without_follow_up.0.condition_status', 'active')
            ->assertJsonPath('data.monitoring_without_follow_up.0.legacy', false);
    }

    public function test_starting_monitoring_clears_the_recommendation_and_a_later_stop_does_not_bring_it_back(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension', 'active', null, true);
        $condition->update(['bhc_monitoring_recommended_by' => null]);

        $this->save(['start_monitoring_condition_ids' => [$condition->id]])->assertCreated();

        $condition->refresh();
        $this->assertNull($condition->bhc_monitoring_recommended_at);
        $this->assertNull($condition->bhc_monitoring_recommended_by);

        $monitoring = ConditionMonitoring::sole();
        $this->save(['continued_monitoring_ids' => [$monitoring->id], 'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Resolved']]])
            ->assertCreated();
        $this->assertSame('stopped', $monitoring->fresh()->status);

        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(0, 'data.monitoring_recommendations')
            ->assertJsonCount(0, 'data.monitoring_without_follow_up');
    }
    public function test_a_monitoring_save_locks_the_patient_before_the_condition_rows(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension');
        $queries = [];
        $inTransaction = false;
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Database\Events\TransactionBeginning::class, function () use (&$inTransaction): void {
            $inTransaction = true;
        });
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$queries, &$inTransaction): void {
            if ($inTransaction) {
                $queries[] = $query->sql;
            }
        });

        $this->save(['start_monitoring_condition_ids' => [$condition->id]])->assertCreated();

        $firstOf = fn (string $table) => collect($queries)->search(fn (string $sql) => str_starts_with($sql, 'select') && str_contains($sql, "from \"$table\""));
        $patientLock = $firstOf('patients');
        $this->assertNotFalse($patientLock);
        $this->assertLessThan($firstOf('patient_conditions'), $patientLock);
    }
    public function test_starting_tb_requires_its_monitoring_details(): void
    {
        $condition = $this->condition('Tuberculosis', 'tuberculosis');
        $before = HealthRecord::count();

        $this->save(['start_monitoring_condition_ids' => [$condition->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber']);
        $this->assertSame($before, HealthRecord::count());

        $this->save(['start_monitoring_condition_ids' => [$condition->id]], [
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-001'], 'phases' => ['intensiveStart' => now()->toDateString()]],
        ])->assertCreated();
        $this->assertSame('tuberculosis', ConditionMonitoring::sole()->condition_key);
    }

    public function test_a_start_only_visit_may_schedule_its_follow_up(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension');
        $date = now()->addWeeks(2)->toDateString();

        $id = $this->save(['start_monitoring_condition_ids' => [$condition->id]], [
            'monitoring_data' => ['followUpStatus' => 'Follow-up Required', 'followUpDate' => $date, 'followUpReason' => 'First monitoring check'],
        ])->assertCreated()->json('data.id');

        $monitoring = ConditionMonitoring::sole();
        $this->assertSame($condition->id, $monitoring->patient_condition_id);
        $this->assertSame($id, $monitoring->started_health_record_id);
        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('pending', $task->state);
        $this->assertSame($date, $task->due_date->toDateString());
        $this->assertSame([$monitoring->id], $task->conditionMonitorings()->pluck('condition_monitorings.id')->all());
    }

    public function test_a_start_only_visit_still_needs_a_reason_to_refer(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension');

        $this->save(['start_monitoring_condition_ids' => [$condition->id]], $this->referral())
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnosis']);
        $this->assertSame(0, ConditionMonitoring::count());
    }

    public function test_a_diagnosis_cannot_start_monitoring(): void
    {
        $this->save([], [
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']],
        ])->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.carePlan']);

        $this->save([], [
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'recheck']],
            'monitoring_data' => ['followUpStatus' => 'Follow-up Required', 'followUpDate' => now()->addWeek()->toDateString(), 'followUpReason' => 'BP'],
        ])->assertCreated();
        $this->assertSame(0, ConditionMonitoring::count());
    }

    public function test_legacy_monitoring_cannot_be_continued(): void
    {
        $asthma = $this->legacyMonitoring('Asthma', null, 'name:asthma');
        $this->assertTrue($asthma->isLegacy());
        $before = HealthRecord::count();

        $this->save(['continued_monitoring_ids' => [$asthma->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.continued_monitoring_ids.0' => self::PENDING_RHU]);
        $this->assertSame($before, HealthRecord::count());
        $this->assertSame('active', $asthma->fresh()->status);

        // General Consultation and referral are never blocked by a legacy row.
        $this->save([], [...$this->referral(), 'diagnosis' => 'Hypertension'])->assertCreated();
        $this->save()->assertCreated();
    }

    public function test_a_linked_monitoring_continues_refers_and_stops(): void
    {
        $condition = $this->condition('Hypertension', 'hypertension');
        $this->save(['start_monitoring_condition_ids' => [$condition->id]])->assertCreated();
        $htn = ConditionMonitoring::where('patient_condition_id', $condition->id)->sole();

        $continued = $this->save(['continued_monitoring_ids' => [$htn->id]])->assertCreated()->json('data.id');
        $this->assertSame('continued', $htn->visits()->where('health_record_id', $continued)->sole()->action);

        $referred = $this->save(['continued_monitoring_ids' => [$htn->id], 'monitoring_referrals' => [$htn->id]], $this->referral())
            ->assertCreated()->json('data.id');
        $this->assertSame('active', $htn->fresh()->status, 'a referral never ends BHC monitoring');
        $this->assertTrue($htn->visits()->where('health_record_id', $referred)->sole()->referred);

        $stopped = $this->save([
            'continued_monitoring_ids' => [$htn->id],
            'monitoring_stops' => [['monitoring_id' => $htn->id, 'reason' => 'Resolved']],
        ])->assertCreated()->json('data.id');
        $htn->refresh();
        $this->assertSame('stopped', $htn->status);
        $this->assertSame($stopped, $htn->stopped_health_record_id);
        $this->assertSame('Resolved', $htn->stop_reason);
    }

    public function test_a_visit_can_continue_a_linked_monitoring_and_start_a_confirmed_condition(): void
    {
        $linked = $this->condition('Asthma', 'name:asthma');
        $this->save(['start_monitoring_condition_ids' => [$linked->id]])->assertCreated();
        $asthma = ConditionMonitoring::where('patient_condition_id', $linked->id)->sole();
        $condition = $this->condition('Hypertension', 'hypertension');

        $id = $this->save(['continued_monitoring_ids' => [$asthma->id], 'start_monitoring_condition_ids' => [$condition->id]])
            ->assertCreated()->json('data.id');

        $this->assertSame(2, ConditionMonitoring::where('status', 'active')->count());
        $this->assertEqualsCanonicalizing(['continued', 'started'], ConditionMonitoringVisit::where('health_record_id', $id)->pluck('action')->all());
    }
}
