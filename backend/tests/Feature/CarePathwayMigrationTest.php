<?php
// backend/tests/Feature/CarePathwayMigrationTest.php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CarePathwayMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_one_active_enrollment_per_patient_per_pathway_is_enforced(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'CP RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'CP BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'A', 'last_name' => 'B', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);

        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_completed_enrollment_does_not_block_a_new_active_one(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'CP RHU 2', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'CP BHC 2', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'C', 'last_name' => 'D', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'NCD Monitoring', 'barangay_health_center_id' => $bhc->id]);

        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'completed',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('care_pathway_enrollments')->insert([
            'patient_id' => $patient->id, 'pathway_key' => 'ncd', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'started_health_record_id' => $record->id,
            'started_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertDatabaseCount('care_pathway_enrollments', 2);
    }
}
