<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Backend-relevant additions from the Health Record Forms Finalization
 * Checklist: Td1-Td5 (Maternal, separate from TT1-TT5), TB comorbidity
 * screening (Form 8), and PR/SpO2 vitals - confirms the store() endpoint
 * accepts and persists each rather than silently dropping them.
 */
class FormsFinalizationChecklistTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Checklist RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Checklist BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Checklist BHW',
            'email' => 'checklist-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Checklist',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    public function test_maternal_td_doses_are_accepted_and_persisted_separately_from_tt(): void
    {
        $recordId = $this->postChecklistRecord([
            'category' => 'Maternal',
            'maternal_data' => [
                'tetanusToxoidStatus' => ['tt1' => '2026-01-05'],
                'tetanusDiphtheriaStatus' => ['td1' => '2026-02-10', 'td2' => '2026-03-10'],
            ],
        ])->assertCreated()->json('result.health_record_id');

        $record = HealthRecord::findOrFail($recordId);
        $this->assertSame('2026-01-05', $record->maternal_data['tetanusToxoidStatus']['tt1']);
        $this->assertSame('2026-02-10', $record->maternal_data['tetanusDiphtheriaStatus']['td1']);
        $this->assertSame('2026-03-10', $record->maternal_data['tetanusDiphtheriaStatus']['td2']);
    }

    public function test_tb_comorbidity_screening_fields_are_accepted_and_persisted(): void
    {
        $recordId = $this->postChecklistRecord([
            'category' => 'TB DOTS',
            'tb_data' => [
                'comorbidities' => [
                    'hivStatus' => 'reactive',
                    'hivTestDate' => '2026-04-01',
                    'artStatus' => 'on_art',
                    'artStartDate' => '2026-04-05',
                    'cptStatus' => 'on_cpt',
                    'cptStartDate' => '2026-04-05',
                    'otherComorbidities' => 'Diabetes Mellitus',
                ],
            ],
        ])->assertCreated()->json('result.health_record_id');

        $record = HealthRecord::findOrFail($recordId);
        $this->assertSame('reactive', $record->tb_data['comorbidities']['hivStatus']);
        $this->assertSame('on_art', $record->tb_data['comorbidities']['artStatus']);
        $this->assertSame('on_cpt', $record->tb_data['comorbidities']['cptStatus']);
        $this->assertSame('Diabetes Mellitus', $record->tb_data['comorbidities']['otherComorbidities']);
    }

    public function test_pulse_and_spo2_vitals_are_accepted_and_persisted(): void
    {
        $recordId = $this->postChecklistRecord([
            'vital_signs' => [
                'summary' => 'BP: 120/80 | Temp: 36.5C | PR: 78 bpm | SpO2: 98% | Weight: 60 kg | Height: 165 cm',
                'systolicBp' => '120',
                'diastolicBp' => '80',
                'temperature' => '36.5',
                'pulse' => '78',
                'spo2' => '98',
                'weight' => '60',
                'height' => '165',
            ],
        ])->assertCreated()->json('result.health_record_id');

        $record = HealthRecord::findOrFail($recordId);
        $this->assertSame('78', $record->vital_signs['pulse']);
        $this->assertSame('98', $record->vital_signs['spo2']);
    }

    private function postChecklistRecord(array $overrides = [])
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'date_recorded' => '2026-04-05 09:00:00',
                'category' => 'General Consultation',
                'chief_complaint' => 'Checklist coverage',
                ...$overrides,
            ]);
    }
}
