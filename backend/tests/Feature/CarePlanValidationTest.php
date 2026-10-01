<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePlanValidationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'CP RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'CP BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'CP BHW', 'email' => 'cp@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'CP', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $extra)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            ...$extra,
        ]);
    }

    public function test_unknown_care_plan_value_is_rejected(): void
    {
        $this->store(['diagnoses' => [['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'watch']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.carePlan']);
    }

    public function test_fbs_must_be_a_sane_number(): void
    {
        foreach (['abc', -5, 5000] as $value) {
            $this->store(['vital_signs' => ['fbs' => $value]])
                ->assertUnprocessable()->assertJsonValidationErrors(['vital_signs.fbs']);
        }
    }

    public function test_fbs_is_stored_and_nothing_is_derived_from_it(): void
    {
        $id = $this->store(['vital_signs' => ['fbs' => 250]])->assertCreated()->json('data.id');

        $record = \App\Models\HealthRecord::findOrFail($id);
        $this->assertEquals(250, $record->vital_signs['fbs']);
        $this->assertSame([], $record->diagnoses ?? []);
        $this->assertSame(0, \App\Models\ConditionMonitoring::count());
    }

    public function test_a_stop_needs_a_real_reason(): void
    {
        $this->store(['care_plan' => ['monitoring_stops' => [['monitoring_id' => 1, 'reason' => '   ']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_stops.0.reason']);
    }

    public function test_monitored_tb_requires_its_monitoring_details(): void
    {
        $this->store(['diagnoses' => [['id' => 'd1', 'name' => 'PTB', 'carePlan' => 'monitor']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart']);
    }

    public function test_tb_diagnosis_without_monitoring_needs_no_tb_card(): void
    {
        $this->store(['diagnoses' => [['id' => 'd1', 'name' => 'PTB', 'carePlan' => 'refer']], 'needs_referral' => false])
            ->assertCreated();
    }

    public function test_care_plan_round_trips_through_a_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => [
                'chiefComplaint' => 'Check-up',
                'fbs' => '126',
                'diagnoses' => [['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor', 'includeInSurveillance' => true]],
                'carePlan' => ['continuedFollowUpTaskIds' => [], 'continuedMonitoringIds' => [7], 'monitoringStops' => [['monitoringId' => 7, 'reason' => 'Moved away']]],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.fbs', '126')
            ->assertJsonPath('data.payload.diagnoses.0.carePlan', 'monitor')
            ->assertJsonPath('data.payload.diagnoses.0.includeInSurveillance', true)
            ->assertJsonPath('data.payload.carePlan.monitoringStops.0.reason', 'Moved away');
    }
}
