<?php

namespace Tests\Unit\Models;

use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarePathwayEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_condition_names_excludes_removed_conditions(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'M RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'M BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'E', 'last_name' => 'F', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);

        $enrollment = CarePathwayEnrollment::create([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
        $enrollment->conditions()->create([
            'condition_name' => 'Hypertension', 'added_health_record_id' => $record->id,
        ]);
        $enrollment->conditions()->create([
            'condition_name' => 'Diabetes Mellitus', 'field_set_key' => 'diabetes_monitoring',
            'added_health_record_id' => $record->id, 'removed_health_record_id' => $record->id,
            'removed_at' => now(),
        ]);

        $this->assertSame(['Hypertension'], $enrollment->activeConditionNames());
    }

    public function test_patient_and_follow_up_task_relations_resolve(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'N RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'N BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'G', 'last_name' => 'H', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $enrollment = CarePathwayEnrollment::create([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);

        $this->assertTrue($patient->carePathwayEnrollments->contains($enrollment));

        $task = \App\Models\FollowUpTask::create([
            'health_record_id' => $record->id, 'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id, 'due_date' => now()->addWeek(),
            'state' => 'pending',
        ]);
        $task->carePathwayEnrollments()->attach($enrollment->id);

        $this->assertTrue($task->fresh()->carePathwayEnrollments->contains($enrollment));
    }
}
