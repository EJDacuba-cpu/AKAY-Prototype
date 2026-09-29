<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * diagnoses.*.reportAs (the per-diagnosis Morbidity / Notifiable choice under
 * Records & Surveillance) and the visit-level morbidityReportingStatus
 * mirrors HealthRecordController::normalizeDiagnosisReporting derives from it.
 */
class DiagnosisReportingTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Rep RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Rep BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Rep BHW', 'email' => 'rep@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'CC', 'last_name' => 'DD', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $diagnoses, array $monitoringData = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Fever',
            'diagnoses' => $diagnoses,
            'monitoring_data' => $monitoringData,
        ]);
    }

    public function test_any_notifiable_diagnosis_makes_the_visit_notifiable(): void
    {
        $id = $this->store([
            ['id' => 'd1', 'name' => 'Asthma', 'reportAs' => 'morbidity'],
            ['id' => 'd2', 'name' => 'Dengue fever', 'reportAs' => 'notifiable'],
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame('notifiable', $record->monitoring_data['morbidityReportingStatus']);
        $this->assertSame('notifiable', $record->monitoring_data['morbidity_reporting_status']);
        $this->assertTrue($record->monitoring_data['includeInMorbidityReport']);
        $this->assertTrue($record->monitoring_data['isNotifiableDisease']);
        $this->assertSame('morbidity', $record->diagnoses[0]['reportAs']);
        $this->assertSame('notifiable', $record->diagnoses[1]['reportAs']);
    }

    public function test_morbidity_only_diagnoses_make_the_visit_morbidity(): void
    {
        $id = $this->store([
            ['id' => 'd1', 'name' => 'Asthma', 'reportAs' => 'morbidity'],
            ['id' => 'd2', 'name' => 'Allergic rhinitis', 'reportAs' => null],
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame('morbidity', $record->monitoring_data['morbidityReportingStatus']);
        $this->assertTrue($record->monitoring_data['includeInMorbidityReport']);
        $this->assertFalse($record->monitoring_data['isNotifiableDisease']);
    }

    public function test_unreported_diagnoses_override_a_stale_client_status(): void
    {
        // The per-diagnosis choice is authoritative over whatever visit-level
        // value the client also sent.
        $id = $this->store(
            [['id' => 'd1', 'name' => 'Asthma', 'reportAs' => null]],
            ['morbidityReportingStatus' => 'notifiable', 'isNotifiableDisease' => true]
        )->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame('not_included', $record->monitoring_data['morbidityReportingStatus']);
        $this->assertFalse($record->monitoring_data['includeInMorbidityReport']);
        $this->assertFalse($record->monitoring_data['isNotifiableDisease']);
    }

    public function test_diagnoses_without_report_as_leave_the_visit_status_as_sent(): void
    {
        // The follow-up form's free-text assessment (no structured list) and
        // older clients set the visit-level status directly.
        $id = $this->store([], ['morbidityReportingStatus' => 'morbidity'])->assertCreated()->json('data.id');
        $this->assertSame('morbidity', HealthRecord::findOrFail($id)->monitoring_data['morbidityReportingStatus']);

        $id = $this->store(
            [['id' => 'd1', 'name' => 'Asthma', 'addToConditions' => false]],
            ['morbidityReportingStatus' => 'notifiable']
        )->assertCreated()->json('data.id');
        $this->assertSame('notifiable', HealthRecord::findOrFail($id)->monitoring_data['morbidityReportingStatus']);
    }

    public function test_an_unknown_report_type_is_rejected(): void
    {
        $this->store([['id' => 'd1', 'name' => 'Asthma', 'reportAs' => 'surveillance']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['diagnoses.0.reportAs']);
    }

    public function test_report_as_round_trips_through_a_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => [
                'chiefComplaint' => 'Fever',
                'diagnoses' => [['id' => 'd1', 'name' => 'Dengue fever', 'addToConditions' => false, 'reportAs' => 'notifiable']],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.diagnoses.0.reportAs', 'notifiable');
    }
}
