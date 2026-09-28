<?php
// backend/tests/Feature/CarePathwayActivationServiceTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\CarePathwayActivationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CarePathwayActivationServiceTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private HealthRecord $record;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Act RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Act BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'M', 'last_name' => 'N', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        // A real, persisted user - User has no HasFactory trait/factory
        // anywhere in this codebase, so every test here uses ::create().
        $this->user = User::create(['name' => 'Act User', 'email' => 'act-user@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id]);
    }

    public function test_starting_a_pathway_creates_enrollment_conditions_and_a_started_encounter(): void
    {
        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'ncd',
            'conditions' => [
                ['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []],
                ['condition_name' => 'Diabetes Mellitus', 'field_set_key' => 'diabetes_monitoring', 'diagnosis_ref' => 'd2', 'field_values' => ['fbs' => '126 mg/dL']],
            ],
        ]], $this->user);

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->sole();
        $this->assertSame('active', $enrollment->status);
        $this->assertSame($this->record->id, $enrollment->started_health_record_id);
        $this->assertEqualsCanonicalizing(['Hypertension', 'Diabetes Mellitus'], $enrollment->activeConditionNames());

        $encounter = $enrollment->encounters()->sole();
        $this->assertSame('started', $encounter->kind);
        $this->assertSame(['fbs' => '126 mg/dL'], $encounter->field_data['diabetes_monitoring'] ?? null);
    }

    public function test_a_second_start_for_an_already_active_pathway_reuses_it_as_continued(): void
    {
        $service = app(CarePathwayActivationService::class);
        $service->activate($this->patient, $this->record, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]], $this->user);

        $laterRecord = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $service->activate($this->patient, $laterRecord, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
        ]], $this->user);

        $this->assertSame(1, CarePathwayEnrollment::where('patient_id', $this->patient->id)->where('pathway_key', 'ncd')->count());
        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame(2, $enrollment->encounters()->count());
        $this->assertSame('continued', $enrollment->encounters()->latest('id')->first()->kind);
    }

    public function test_unknown_pathway_key_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'made_up',
            'conditions' => [['condition_name' => 'X', 'field_set_key' => null, 'diagnosis_ref' => null, 'field_values' => []]],
        ]], $this->user);
    }

    public function test_unknown_field_set_key_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'ncd',
            'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'made_up_set', 'diagnosis_ref' => null, 'field_values' => []]],
        ]], $this->user);
    }

    public function test_legacy_tb_records_can_be_linked_as_encounters_without_being_modified(): void
    {
        $legacyTb = HealthRecord::create([
            'patient_id' => $this->patient->id, 'category' => 'TB DOTS / TB Monitoring',
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'OLD-1']],
        ]);

        app(CarePathwayActivationService::class)->activate($this->patient, $this->record, [[
            'pathway_key' => 'tb_dots',
            'conditions' => [['condition_name' => 'Tuberculosis', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
            'link_legacy_health_record_ids' => [$legacyTb->id],
        ]], $this->user);

        $enrollment = CarePathwayEnrollment::where('pathway_key', 'tb_dots')->sole();
        $this->assertSame(2, $enrollment->encounters()->count());
        $legacyEncounter = $enrollment->encounters()->where('health_record_id', $legacyTb->id)->sole();
        $this->assertSame('legacy_linked', $legacyEncounter->kind);
        $this->assertNull($legacyEncounter->field_data);
        $this->assertSame('OLD-1', $legacyTb->fresh()->tb_data['diagnosis']['tbCaseNumber']);
    }

    public function test_assert_allowed_blocks_a_user_without_care_pathways_manage(): void
    {
        $bhw = User::create(['name' => 'No Perm', 'email' => 'noperm@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE]);
        $service = app(CarePathwayActivationService::class);
        if ($service->canManage($bhw)) {
            $this->markTestSkipped('The default BHW role has care_pathways.manage in this configuration.');
        }

        $this->expectException(ValidationException::class);
        $service->assertAllowed($bhw, [['pathway_key' => 'ncd', 'conditions' => []]]);
    }

    public function test_assert_allowed_is_silent_when_nothing_is_being_activated(): void
    {
        $bhw = User::create(['name' => 'No Perm 2', 'email' => 'noperm2@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE]);

        app(CarePathwayActivationService::class)->assertAllowed($bhw, []);
        $this->addToAssertionCount(1); // did not throw
    }
}
