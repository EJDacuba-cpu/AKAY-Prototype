<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** ITR patient history: per-visit informant / similar illness columns and the one-time background cleanup. */
class ItrHistoryMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function patient(array $background = []): Patient
    {
        $rhu = RuralHealthUnit::create(['name' => 'Test RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Test BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);

        return Patient::create([
            'first_name' => 'Sample', 'last_name' => 'Patient', 'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'medical_background' => $background,
        ]);
    }

    private function record(Patient $patient, array $attrs = []): HealthRecord
    {
        return HealthRecord::create([
            'patient_id' => $patient->id, 'category' => 'General Consultation',
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'date_recorded' => now(),
            ...$attrs,
        ]);
    }

    public function test_health_record_round_trips_informant_and_similar_illness(): void
    {
        $informant = ['relation' => 'Mother', 'name' => 'Juana', 'patientId' => null];
        $similar = ['answer' => 'Yes', 'who' => 'Sibling', 'note' => 'cough'];

        $record = $this->record($this->patient(), ['informant' => $informant, 'similar_illness' => $similar]);

        $fresh = HealthRecord::findOrFail($record->id);
        $this->assertSame($informant, $fresh->informant);
        $this->assertSame($similar, $fresh->similar_illness);
    }

    public function test_cleanup_keeps_only_patient_reported_conditions_and_resets_old_fields(): void
    {
        $reported = ['name' => 'Asthma', 'note' => 'Mild', 'source' => 'Patient-reported', 'firstRecorded' => '2026-05-05', 'status' => null, 'conditionKey' => null];
        $consulted = ['name' => 'Hypertension', 'note' => '', 'source' => 'Consultation', 'firstRecorded' => '2026-06-01', 'status' => 'Confirmed', 'conditionKey' => 'hypertension'];
        $revisions = ['medical' => 2, 'family' => 1];

        $patient = $this->patient([
            'currentDiseases' => [$reported, $consulted],
            'allergies' => 'Dust',
            'hospitalizations' => 'Appendectomy 2020',
            'surgeries' => 'Appendectomy',
            'familyHistory' => ['chronicIllness' => 'Diabetes'],
            'personalSocial' => ['smoking' => 'Never'],
            'updatedAt' => ['medical' => '2026-01-01', 'family' => '2026-01-02'],
            'revisions' => $revisions,
        ]);
        $record = $this->record($patient, [
            'background_changes' => [['section' => 'family', 'source' => 'consultation']],
        ]);

        $migration = require database_path('migrations/2026_10_16_000002_reset_background_for_itr_history.php');
        $migration->up();

        $background = Patient::findOrFail($patient->id)->medical_background;
        $this->assertSame([$reported], $background['currentDiseases']);
        foreach (['allergies', 'hospitalizations', 'surgeries', 'familyHistory', 'personalSocial', 'updatedAt'] as $key) {
            $this->assertArrayNotHasKey($key, $background);
        }
        $this->assertSame($revisions, $background['revisions']);
        $this->assertNull(HealthRecord::findOrFail($record->id)->background_changes);
    }
}
