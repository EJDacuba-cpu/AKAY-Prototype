<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\HealthRecordMedicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The patient profile's Medications dropdown reads the medicines dispensed on
 * each of a patient's visits from the records list, so that list carries them
 * when it is filtered to one patient. The unfiltered list stays lean.
 */
class HealthRecordPatientMedicinesTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Medicines RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Medicines BHC',
            'status' => 'active',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Medicines BHW',
            'email' => 'medicines-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => ['clinical.history'],
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Medicines',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    public function test_patient_filtered_records_list_includes_dispensed_medicines(): void
    {
        $record = $this->record();
        HealthRecordMedicine::create([
            'health_record_id' => $record->id,
            'medicine_name_snapshot' => 'Paracetamol',
            'quantity' => 10,
            'unit' => 'tablets',
            'barangay_health_center_id' => $this->bhc->id,
        ]);

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/health-records?patient_id='.$this->patient->id)
            ->assertOk();

        $medicines = $response->json('data.data.0.dispensed_medicines');
        $this->assertCount(1, $medicines);
        $this->assertSame('Paracetamol', $medicines[0]['medicine_name_snapshot']);
        $this->assertSame(10, $medicines[0]['quantity']);
        $this->assertSame('tablets', $medicines[0]['unit']);
    }

    public function test_patient_filtered_records_list_gives_an_empty_list_when_nothing_was_dispensed(): void
    {
        $this->record();

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/health-records?patient_id='.$this->patient->id)
            ->assertOk()
            ->assertJsonPath('data.data.0.dispensed_medicines', []);
    }

    public function test_unfiltered_records_list_does_not_load_medicines(): void
    {
        $record = $this->record();
        HealthRecordMedicine::create([
            'health_record_id' => $record->id,
            'medicine_name_snapshot' => 'Paracetamol',
            'quantity' => 10,
            'barangay_health_center_id' => $this->bhc->id,
        ]);

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/health-records')
            ->assertOk();

        $this->assertArrayNotHasKey('dispensed_medicines', $response->json('data.data.0'));
    }

    private function record(): HealthRecord
    {
        return HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'date_recorded' => now(),
        ]);
    }
}
