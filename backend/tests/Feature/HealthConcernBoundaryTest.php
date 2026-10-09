<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
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
        $user = User::create(['name' => 'Boundary BHW', 'email' => 'boundary@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
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

    public function test_add_to_conditions_is_rejected(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'addToConditions' => true]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.addToConditions']);
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'addToConditions' => false]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.addToConditions']);
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

    public function test_old_monitor_and_none_values_are_rejected_on_a_new_save(): void
    {
        foreach (['monitor', 'none', 'monitor_refer'] as $legacy) {
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

        $this->assertNull(HealthRecord::findOrFail($id)->diagnoses[0]['carePlan'] ?? null);
    }

    public function test_recheck_and_follow_up_need_the_follow_up_date(): void
    {
        foreach (['recheck', 'follow_up'] as $action) {
            $response = $this->save([['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => $action]])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['monitoring_data.followUpDate']);
            $this->assertSame(
                ['Set the follow-up date for the concerns marked Recheck or Follow-up.'],
                $response->json('errors')['monitoring_data.followUpDate']
            );
        }

        $this->save([['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => 'recheck']], $this->followUp())->assertCreated();
        $this->save([['id' => 'd1', 'name' => 'Elevated BP', 'carePlan' => 'follow_up']], $this->followUp())->assertCreated();
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
