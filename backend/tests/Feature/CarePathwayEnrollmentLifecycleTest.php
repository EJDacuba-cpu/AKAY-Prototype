<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\CarePathwayActivationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Completing/discontinuing an enrollment and removing a condition from it -
 * an extension of the same activation payload (CarePathwayActivationService),
 * never a standalone endpoint. See
 * docs/superpowers/specs/2026-09-28-care-pathway-architecture-design.md,
 * "Ending or changing an enrollment."
 */
class CarePathwayEnrollmentLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private HealthRecord $startRecord;

    private CarePathwayActivationService $service;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Life RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Life BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Y', 'last_name' => 'Z', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->startRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $this->user = User::create(['name' => 'Life User', 'email' => 'life-user@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id]);
        $this->service = app(CarePathwayActivationService::class);
        $this->service->activate($this->patient, $this->startRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [
                ['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []],
                ['condition_name' => 'Diabetes Mellitus', 'field_set_key' => 'diabetes_monitoring', 'diagnosis_ref' => 'd2', 'field_values' => []],
            ],
        ]], $this->user);
    }

    public function test_discontinuing_ends_the_enrollment_with_its_reason(): void
    {
        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);

        $this->service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [],
            'status' => 'discontinued',
            'end_reason' => 'Patient transferred to another facility.',
        ]], $this->user);

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame('discontinued', $enrollment->status);
        $this->assertSame($laterRecord->id, $enrollment->ended_health_record_id);
        $this->assertSame('Patient transferred to another facility.', $enrollment->end_reason);
        $this->assertNotNull($enrollment->ended_at);
    }

    public function test_removing_a_condition_soft_removes_it_without_ending_the_enrollment(): void
    {
        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);

        $this->service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [],
            'remove_condition_names' => ['Diabetes Mellitus'],
        ]], $this->user);

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame('active', $enrollment->status);
        $this->assertSame(['Hypertension'], $enrollment->activeConditionNames());
        $removed = $enrollment->conditions()->where('condition_name', 'Diabetes Mellitus')->sole();
        $this->assertSame($laterRecord->id, $removed->removed_health_record_id);
        $this->assertNotNull($removed->removed_at);
    }

    public function test_completing_one_pathway_does_not_touch_a_different_active_pathway_for_the_same_patient(): void
    {
        $this->service->activate($this->patient, $this->startRecord, [[
            'pathway_key' => 'tb_dots',
            'conditions' => [['condition_name' => 'Tuberculosis', 'field_set_key' => null, 'diagnosis_ref' => 'd3', 'field_values' => []]],
        ]], $this->user);

        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $this->service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [],
            'status' => 'completed',
            'end_reason' => 'Blood pressure and blood sugar stable for 6 months.',
        ]], $this->user);

        $ncd = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->sole();
        $tb = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'tb_dots')->sole();
        $this->assertSame('completed', $ncd->status);
        $this->assertSame('active', $tb->status);
    }

    public function test_ending_a_pathway_with_no_active_enrollment_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->activate($this->patient, $this->startRecord, [[
            'pathway_key' => 'tb_dots',
            'conditions' => [],
            'status' => 'discontinued',
            'end_reason' => 'No such enrollment exists yet.',
        ]], $this->user);
    }

    public function test_after_discontinuing_a_new_start_creates_a_fresh_enrollment(): void
    {
        $endRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $this->service->activate($this->patient, $endRecord, [[
            'pathway_key' => 'ncd', 'conditions' => [], 'status' => 'discontinued', 'end_reason' => 'Lost to follow-up.',
        ]], $this->user);

        $restartRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $this->service->activate($this->patient, $restartRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]], $this->user);

        $this->assertSame(2, CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->count());
        $active = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->where('status', 'active')->sole();
        $this->assertSame($restartRecord->id, $active->started_health_record_id);
    }
}
