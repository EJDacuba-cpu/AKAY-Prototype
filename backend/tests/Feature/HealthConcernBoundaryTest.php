<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\FollowUpTaskSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use App\Services\StaffRoles;
use Tests\TestCase;

/**
 * The BHC clinical boundary: a barangay consultation records Health Concerns
 * with an optional next action and never creates, confirms or changes a patient
 * condition. Only the RHU confirms conditions (PatientConditions).
 */
class HealthConcernBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private array $background;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Boundary RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Boundary BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Boundary BHW', 'email' => 'boundary@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->background = [
            'allergies' => 'Penicillin',
            'currentDiseases' => [['name' => 'Asthma', 'status' => 'Active']],
            'revisions' => ['medical' => 3],
        ];
        $this->patient = Patient::create(['first_name' => 'Con', 'last_name' => 'Cern', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id, 'medical_background' => $this->background]);
        $this->actingAs($user, 'sanctum');
    }

    private function save(array $diagnoses, array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Dizziness',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            ...$extra,
        ]);
    }

    private function followUp(array $extra = []): array
    {
        return [
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
                ...$extra,
            ],
        ];
    }

    private function referral(): array
    {
        return [
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Uncontrolled BP', 'urgency_level' => 'Routine'],
        ];
    }

    public function test_finalizing_concerns_never_creates_or_changes_a_condition(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'refer'],
            ['id' => 'd2', 'name' => 'TB', 'carePlan' => 'recheck'],
            ['id' => 'd3', 'name' => 'Elevated BP', 'carePlan' => null],
        ], [...$this->referral(), ...$this->followUp()])->assertCreated()->json('data.id');

        $this->assertSame(0, PatientCondition::count());
        $this->assertSame(0, ConditionMonitoring::count());
        $this->assertSame($this->background, $this->patient->fresh()->medical_background);
        $this->assertNull(HealthRecord::findOrFail($id)->background_changes);
        $this->assertCount(3, HealthRecord::findOrFail($id)->diagnoses);
    }

    public function test_add_to_conditions_true_is_rejected(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'addToConditions' => true]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.addToConditions']);
        $this->assertSame(0, PatientCondition::count());
    }

    public function test_a_stale_client_sending_add_to_conditions_false_is_accepted_and_ignored(): void
    {
        foreach ([false, 0, '0', 'false', null] as $falsy) {
            $id = $this->save([['id' => 'd1', 'name' => 'Asthma', 'addToConditions' => $falsy]])
                ->assertCreated()->json('data.id');
            $this->assertArrayNotHasKey('addToConditions', HealthRecord::findOrFail($id)->diagnoses[0]);
        }
        $this->assertSame(0, PatientCondition::count());
    }

    public function test_a_condition_status_on_a_concern_is_rejected(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'conditionStatus' => 'Active']])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.conditionStatus']);
    }

    public function test_monitoring_status_updates_are_rejected(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma']], [
            'care_plan' => ['monitoring_status_updates' => [['monitoring_id' => 1, 'status' => 'Controlled']]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_status_updates']);
    }

    public function test_old_monitor_values_are_rejected_on_a_new_save(): void
    {
        foreach (['monitor', 'monitor_refer'] as $legacy) {
            $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => $legacy]])
                ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.carePlan']);
        }
        $this->assertSame(0, ConditionMonitoring::count());
    }

    public function test_a_concern_may_have_no_next_action(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => null],
            ['id' => 'd2', 'name' => 'Headache'],
        ])->assertCreated()->json('data.id');

        foreach (HealthRecord::findOrFail($id)->diagnoses as $concern) {
            $this->assertEmpty($concern['carePlan'] ?? null);
        }
    }

    public function test_a_recheck_concern_with_a_date_but_no_status_still_schedules_the_task(): void
    {
        $date = now()->addWeek()->toDateString();
        $id = $this->save(
            [['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => 'recheck']],
            ['monitoring_data' => ['followUpDate' => $date]]
        )->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('pending', $task->state);
        $this->assertSame($date, $task->due_date->toDateString());
        $this->assertSame('Follow-up Required', HealthRecord::findOrFail($id)->monitoring_data['followUpStatus']);
    }

    public function test_a_legacy_referral_record_keeps_its_follow_up_task_on_resync(): void
    {
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'needs_referral' => true,
            'diagnoses' => [
                ['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor'],
                ['id' => 'd2', 'name' => 'Pneumonia', 'carePlan' => 'refer'],
            ],
            'monitoring_data' => ['followUpStatus' => 'Needs Referral', 'followUpDate' => now()->addWeeks(2)->toDateString()],
        ]);
        $task = FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'due_date' => now()->addWeeks(2)->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
        ]);

        app(FollowUpTaskSyncService::class)->syncRecord($record->fresh());

        $this->assertSame('pending', $task->fresh()->state);
    }

    public function test_recheck_and_follow_up_need_the_follow_up_date(): void
    {
        foreach (['recheck', 'follow_up'] as $action) {
            $response = $this->save(
                [['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => $action]],
                ['monitoring_data' => ['followUpReason' => 'Reassess wound']]
            )
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['monitoring_data.followUpDate']);
            $this->assertSame(
                ['Set the follow-up date for the concerns that schedule a BHC follow-up.'],
                $response->json('errors')['monitoring_data.followUpDate']
            );
        }

        $id = $this->save([['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => 'recheck']], $this->followUp())->assertCreated()->json('data.id');
        $this->assertSame('follow_up', HealthRecord::findOrFail($id)->diagnoses[0]['carePlan']);
        $this->save([['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => 'follow_up']], $this->followUp(['followUpReason' => 'Reassess wound']))->assertCreated();
    }

    public function test_none_action_saves_with_no_task_and_no_referral(): void
    {
        $id = $this->save([['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'none']])->assertCreated()->json('data.id');

        $this->assertSame('none', HealthRecord::findOrFail($id)->diagnoses[0]['carePlan']);
        $this->assertSame(0, FollowUpTask::count());
        $this->assertSame(0, Referral::count() + \App\Models\ReferralHold::count());
    }

    public function test_follow_up_requires_a_reason(): void
    {
        $diagnoses = [['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'follow_up']];

        $response = $this->save($diagnoses, $this->followUp())->assertUnprocessable();
        $this->assertSame(['Follow-up reason is required.'], $response->json('errors')['monitoring_data.followUpReason']);

        $this->save($diagnoses, $this->followUp(['followUpReason' => '   ']))
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpReason']);

        $this->save($diagnoses, $this->followUp(['followUpReason' => 'Reassess wound']))->assertCreated();
        $this->assertSame(1, FollowUpTask::count());
    }

    public function test_flagged_referral_keeps_its_follow_up_and_needs_date_and_reason(): void
    {
        $diagnoses = [['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'refer', 'bhcFollowUp' => true]];

        $response = $this->save($diagnoses, [...$this->referral(), 'monitoring_data' => ['followUpReason' => 'Check cough']])
            ->assertUnprocessable();
        $this->assertSame(
            ['Set the follow-up date for the concerns that schedule a BHC follow-up.'],
            $response->json('errors')['monitoring_data.followUpDate']
        );

        $this->save($diagnoses, [...$this->referral(), ...$this->followUp()])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpReason']);

        $id = $this->save($diagnoses, [...$this->referral(), ...$this->followUp(['followUpReason' => 'Check cough'])])
            ->assertCreated()->json('data.id');

        // No RHU doctor is available in this setup, so the referral is held.
        $this->assertSame(1, Referral::count() + \App\Models\ReferralHold::count());
        $this->assertSame(1, FollowUpTask::where('health_record_id', $id)->where('state', 'pending')->count());
        $this->assertTrue(HealthRecord::findOrFail($id)->diagnoses[0]['bhcFollowUp']);
    }

    public function test_bhc_follow_up_string_one_is_honoured(): void
    {
        $diagnoses = [['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'refer', 'bhcFollowUp' => '1']];

        // Honoured: the flagged referral needs the follow-up date and reason...
        $this->save($diagnoses, [...$this->referral(), 'monitoring_data' => ['followUpReason' => 'Check cough']])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpDate']);

        // ...keeps its BHC follow-up task, and is stored as a real boolean.
        $id = $this->save($diagnoses, [...$this->referral(), ...$this->followUp(['followUpReason' => 'Check cough'])])
            ->assertCreated()->json('data.id');
        $this->assertSame(1, FollowUpTask::where('health_record_id', $id)->where('state', 'pending')->count());
        $this->assertTrue(HealthRecord::findOrFail($id)->diagnoses[0]['bhcFollowUp']);

        // "0" is false: a plain referral with no BHC follow-up.
        $plain = $this->save(
            [['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'refer', 'bhcFollowUp' => '0']],
            [...$this->referral(), ...$this->followUp()]
        )->assertCreated()->json('data.id');
        $this->assertFalse(HealthRecord::findOrFail($plain)->diagnoses[0]['bhcFollowUp']);
        $this->assertSame(0, FollowUpTask::where('health_record_id', $plain)->count());
    }

    public function test_unflagged_referral_clears_the_follow_up(): void
    {
        $id = $this->save(
            [['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'refer']],
            [...$this->referral(), ...$this->followUp()]
        )->assertCreated()->json('data.id');

        $this->assertNull(HealthRecord::findOrFail($id)->monitoring_data['followUpDate']);
        $this->assertSame(0, FollowUpTask::count());
    }

    public function test_bhc_follow_up_flag_is_dropped_unless_refer(): void
    {
        $id = $this->save([['id' => 'd1', 'name' => 'Cough', 'carePlan' => 'none', 'bhcFollowUp' => true]])
            ->assertCreated()->json('data.id');

        $this->assertArrayNotHasKey('bhcFollowUp', HealthRecord::findOrFail($id)->diagnoses[0]);
    }

    public function test_transition_recheck_post_saves_as_follow_up_with_prefix(): void
    {
        $id = $this->save([['name' => 'Elevated BP', 'carePlan' => 'recheck']], $this->followUp())
            ->assertCreated()->json('data.id');

        $this->assertSame('follow_up', HealthRecord::findOrFail($id)->diagnoses[0]['carePlan']);
        $this->assertSame('pending', FollowUpTask::where('health_record_id', $id)->sole()->state);
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonPath('data.pending_follow_ups.0.reason', 'Recheck: Elevated BP');
    }

    public function test_service_visit_follow_up_stays_exempt_from_the_reason(): void
    {
        $this->save([], [
            'category' => 'Immunization',
            'diagnosis' => 'Vaccination visit',
            'notes' => 'Vaccine deferred',
            'monitoring_data' => [
                'selectedPrograms' => ['EPI'],
                'primaryProgram' => 'EPI',
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ])->assertCreated();
    }

    public function test_recheck_reason_lists_the_concerns(): void
    {
        $this->save([
            ['id' => 'd1', 'name' => '  Elevated BP ', 'carePlan' => 'recheck'],
            ['id' => 'd2', 'name' => 'Headache', 'carePlan' => 'follow_up'],
        ], $this->followUp(['followUpReason' => 'bring BP log']))->assertCreated();

        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonPath('data.pending_follow_ups.0.reason', 'Recheck: Elevated BP — bring BP log');
    }

    public function test_recheck_reason_without_a_typed_reason_is_just_the_concerns(): void
    {
        $this->save([
            ['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => 'recheck'],
            ['id' => 'd2', 'name' => 'Cough', 'carePlan' => 'recheck'],
        ], $this->followUp(['followUpReason' => '  ']))->assertCreated();

        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonPath('data.pending_follow_ups.0.reason', 'Recheck: Elevated BP; Cough');
    }

    public function test_reporting_flags_on_concerns_still_drive_the_visit_report(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'Asthma', 'reportAs' => 'morbidity'],
            ['id' => 'd2', 'name' => 'Dengue fever', 'reportAs' => 'notifiable'],
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame('notifiable', $record->monitoring_data['morbidityReportingStatus']);
        $this->assertTrue($record->monitoring_data['includeInMorbidityReport']);
        $this->assertTrue($record->monitoring_data['isNotifiableDisease']);
        $this->assertSame(0, PatientCondition::count());
    }
}
