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

    private function cleanupMigration(): object
    {
        return require database_path('migrations/2026_10_16_000002_reset_background_for_itr_history.php');
    }

    private function withEnvironment(string $environment, ?string $flag, callable $callback): void
    {
        $originalEnv = $this->app['env'];
        $this->app['env'] = $environment;
        if ($flag === null) {
            unset($_ENV['ITR_HISTORY_RESET_CONFIRMED'], $_SERVER['ITR_HISTORY_RESET_CONFIRMED']);
            putenv('ITR_HISTORY_RESET_CONFIRMED');
        } else {
            $_ENV['ITR_HISTORY_RESET_CONFIRMED'] = $_SERVER['ITR_HISTORY_RESET_CONFIRMED'] = $flag;
            putenv('ITR_HISTORY_RESET_CONFIRMED='.$flag);
        }

        try {
            $callback();
        } finally {
            $this->app['env'] = $originalEnv;
            unset($_ENV['ITR_HISTORY_RESET_CONFIRMED'], $_SERVER['ITR_HISTORY_RESET_CONFIRMED']);
            putenv('ITR_HISTORY_RESET_CONFIRMED');
        }
    }

    public function test_cleanup_refuses_to_run_outside_testing_without_confirmation(): void
    {
        $patient = $this->patient(['allergies' => 'Dust']);

        $thrown = null;
        $this->withEnvironment('production', null, function () use (&$thrown) {
            try {
                $this->cleanupMigration()->up();
            } catch (\RuntimeException $e) {
                $thrown = $e;
            }
        });

        $this->assertNotNull($thrown, 'The cleanup migration ran without ITR_HISTORY_RESET_CONFIRMED.');
        $this->assertStringContainsString('ITR_HISTORY_RESET_CONFIRMED=1', $thrown->getMessage());
        $this->assertStringContainsString('medical_background', $thrown->getMessage());
        $this->assertStringContainsString('background_changes', $thrown->getMessage());

        $this->assertSame('Dust', Patient::findOrFail($patient->id)->medical_background['allergies']);
    }

    public function test_cleanup_runs_outside_testing_when_confirmed(): void
    {
        $patient = $this->patient(['allergies' => 'Dust', 'revisions' => ['medical' => 1]]);

        $this->withEnvironment('production', '1', fn () => $this->cleanupMigration()->up());

        $background = Patient::findOrFail($patient->id)->medical_background;
        $this->assertArrayNotHasKey('allergies', $background);
        $this->assertSame(['medical' => 1], $background['revisions']);
    }

    public function test_cleanup_stores_null_when_no_background_keys_remain(): void
    {
        $patient = $this->patient(['allergies' => 'Dust', 'updatedAt' => ['medical' => '2026-01-01']]);

        $this->cleanupMigration()->up();

        $this->assertNull(\Illuminate\Support\Facades\DB::table('patients')->where('id', $patient->id)->value('medical_background'));
    }
}
