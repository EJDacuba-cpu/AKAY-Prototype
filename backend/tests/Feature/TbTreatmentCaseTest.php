<?php

namespace Tests\Feature;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TbTreatmentCaseTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private Patient $patient;

    private User $doctor;

    private HealthRecord $source;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Case RHU', 'status' => 'active']);
        $this->patient = Patient::create(['first_name' => 'Case', 'last_name' => 'Patient', 'sex' => 'Male', 'rural_health_unit_id' => $this->rhu->id]);
        $this->doctor = User::create([
            'name' => 'Doctor', 'email' => 'case-doctor@example.test', 'password' => 'password123',
            'role' => 'rhu', 'staff_role' => 'doctor', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->source = $this->source();
    }

    private function source(?Patient $patient = null, ?RuralHealthUnit $rhu = null): HealthRecord
    {
        return HealthRecord::create([
            'patient_id' => ($patient ?? $this->patient)->id, 'rural_health_unit_id' => ($rhu ?? $this->rhu)->id,
            'category' => 'General Consultation', 'finalized_by' => $this->doctor->id, 'finalized_at' => now(),
            'diagnoses' => [['name' => 'TB', 'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']]],
        ]);
    }

    private function attributes(array $overrides = []): array
    {
        return [
            'patient_id' => $this->patient->id, 'rural_health_unit_id' => $this->rhu->id,
            'source_health_record_id' => $this->source->id, 'reporting_year' => 2026, 'case_number' => 'TB-2026-0001',
            'registered_by' => $this->doctor->id, 'registered_at' => now(),
            'diagnosis_snapshot' => $this->source->diagnoses[0],
            'card_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-2026-0001']], ...$overrides,
        ];
    }

    private function rejectConstraint(callable $write): void
    {
        try {
            DB::transaction($write);
            $this->fail('Conflicting clinical identity was accepted.');
        } catch (QueryException) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_shared_identity_round_trips_without_changing_the_source_consultation(): void
    {
        $this->assertTrue(Schema::hasTable('tb_treatment_cases'), 'Shared TB cases need persistent identity.');
        $original = $this->source->fresh()->getRawOriginal();
        $case = TbTreatmentCase::create($this->attributes());
        $stored = $case->fresh();

        $this->assertSame('active', $stored->status);
        $this->assertSame(1, $stored->version);
        $this->assertSame(2026, $stored->reporting_year);
        $this->assertSame('TB-2026-0001', $stored->card_data['diagnosis']['tbCaseNumber']);
        $this->assertSame('drug_susceptible', $stored->diagnosis_snapshot['tbManagement']['drugResistance']);
        $this->assertTrue($stored->sourceHealthRecord->is($this->source));
        $this->assertTrue($stored->patient->is($this->patient));
        $this->assertTrue($stored->ruralHealthUnit->is($this->rhu));
        $this->assertTrue($stored->registeredBy->is($this->doctor));
        $this->assertTrue($this->patient->tbTreatmentCases()->sole()->is($case));
        $this->assertTrue($this->source->tbTreatmentCase()->sole()->is($case));
        $this->assertSame($original, $this->source->fresh()->getRawOriginal());
    }

    public function test_number_uniqueness_is_case_insensitive_within_rhu_and_reporting_year(): void
    {
        TbTreatmentCase::create($this->attributes(['status' => 'closed']));
        $source = $this->source();
        // Raw DB insert deliberately bypasses model normalization.
        $attributes = $this->attributes(['source_health_record_id' => $source->id, 'case_number' => ' tb-2026-0001 ']);
        $attributes['diagnosis_snapshot'] = json_encode($attributes['diagnosis_snapshot']);
        $attributes['card_data'] = json_encode($attributes['card_data']);
        $this->rejectConstraint(fn () => DB::table('tb_treatment_cases')->insert($attributes));

        TbTreatmentCase::create($this->attributes(['source_health_record_id' => $source->id, 'reporting_year' => 2027]));
        $otherRhu = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        $otherSource = $this->source(rhu: $otherRhu);
        TbTreatmentCase::create($this->attributes([
            'source_health_record_id' => $otherSource->id, 'rural_health_unit_id' => $otherRhu->id, 'status' => 'closed',
        ]));
        $this->assertDatabaseCount('tb_treatment_cases', 3);
    }

    public function test_source_consultation_cannot_register_twice_even_after_case_closure(): void
    {
        TbTreatmentCase::create($this->attributes(['status' => 'closed']));
        $this->rejectConstraint(fn () => TbTreatmentCase::create($this->attributes(['case_number' => 'TB-2026-0002'])));
    }

    public function test_only_one_active_case_per_patient_across_rhus_but_a_later_episode_is_allowed(): void
    {
        $first = TbTreatmentCase::create($this->attributes());
        $otherRhu = RuralHealthUnit::create(['name' => 'Second RHU', 'status' => 'active']);
        $source = $this->source(rhu: $otherRhu);
        $next = $this->attributes(['source_health_record_id' => $source->id, 'rural_health_unit_id' => $otherRhu->id]);
        $this->rejectConstraint(fn () => TbTreatmentCase::create($next));
        $first->update(['status' => 'closed']);
        TbTreatmentCase::create($next);
        $this->assertDatabaseCount('tb_treatment_cases', 2);
    }

    public function test_source_cannot_belong_to_another_patient_or_rhu(): void
    {
        $otherPatient = Patient::create(['first_name' => 'Other', 'last_name' => 'Patient', 'sex' => 'Female']);
        $otherRhu = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        foreach ([['patient_id' => $otherPatient->id], ['rural_health_unit_id' => $otherRhu->id]] as $override) {
            $this->rejectConstraint(fn () => TbTreatmentCase::create($this->attributes($override)));
        }
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_clinical_provenance_cannot_be_deleted_while_a_case_references_it(): void
    {
        TbTreatmentCase::create($this->attributes());
        foreach ([$this->source, $this->patient, $this->rhu, $this->doctor] as $model) {
            $this->rejectConstraint(fn () => $model->delete());
        }
        $this->assertDatabaseCount('tb_treatment_cases', 1);
    }

    public function test_migration_up_down_up_preserves_legacy_json_without_creating_cases(): void
    {
        $legacy = ['diagnosis' => ['tbCaseNumber' => 'OLD-7'], 'doseCalendar' => ['months' => [['days' => ['AB']]]]];
        $this->source->update(['tb_data' => $legacy]);
        $before = $this->source->fresh()->getRawOriginal();
        $path = database_path('migrations/2026_11_10_000001_create_tb_treatment_cases.php');
        $this->assertFileExists($path);
        $migration = require $path;
        $migration->down();
        $this->assertFalse(Schema::hasTable('tb_treatment_cases'));
        $this->assertSame($before, $this->source->fresh()->getRawOriginal());
        $migration->up();
        $this->assertSame($legacy, $this->source->fresh()->tb_data);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->assertDatabaseCount('tb_case_number_counters', 0);
    }
}
