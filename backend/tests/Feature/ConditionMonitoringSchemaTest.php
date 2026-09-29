<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConditionMonitoringSchemaTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $rhu = RuralHealthUnit::create(['name' => 'Mon RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Mon BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'Mon', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $bhc->id]);

        return [$patient, $record];
    }

    private function monitoring(Patient $patient, HealthRecord $record, string $status = 'active'): ConditionMonitoring
    {
        return ConditionMonitoring::create([
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'condition_key' => 'hypertension',
            'condition_name' => 'Hypertension',
            'condition_identity' => 'hypertension',
            'status' => $status,
            'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
    }

    public function test_only_one_active_record_per_patient_and_condition(): void
    {
        [$patient, $record] = $this->fixture();
        $this->monitoring($patient, $record);

        $this->expectException(QueryException::class);
        $this->monitoring($patient, $record);
    }

    public function test_a_stopped_record_does_not_block_a_new_active_one(): void
    {
        [$patient, $record] = $this->fixture();
        $this->monitoring($patient, $record, 'stopped');

        $this->assertSame('active', $this->monitoring($patient, $record)->status);
    }

    public function test_history_rows_and_follow_up_links(): void
    {
        [$patient, $record] = $this->fixture();
        $monitoring = $this->monitoring($patient, $record);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => true, 'created_at' => now()]);

        $this->assertTrue($monitoring->visits()->sole()->referred);
    }
}
