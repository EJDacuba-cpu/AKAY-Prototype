<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\LaboratoryAddendum;
use App\Models\LaboratoryTest;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbCaseRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private User $doctor;

    private User $nurse;

    private User $bhcUser;

    private Patient $patient;

    private HealthRecord $source;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Registration RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Registration BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Registration', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        foreach (['doctor', 'nurse', 'bhcUser'] as $key) {
            $isBhc = $key === 'bhcUser';
            $this->$key = User::create([
                'name' => $key, 'email' => "$key@registration.example.test", 'password' => 'password123',
                'role' => $isBhc ? 'bhc' : 'rhu', 'staff_role' => $isBhc ? 'midwife' : $key, 'status' => 'active',
                'rural_health_unit_id' => $isBhc ? null : $rhu->id, 'barangay_health_center_id' => $isBhc ? $bhc->id : null,
                'permissions' => ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm'],
            ]);
        }
        $this->source = $this->newSource();
    }

    private function diagnosis(array $assessment = []): array
    {
        return ['name' => 'Pulmonary TB', 'tbManagement' => [
            'diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible', ...$assessment,
        ]];
    }

    private function newSource(array $extra = []): HealthRecord
    {
        return HealthRecord::create([
            'patient_id' => $this->patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'category' => 'General Consultation', 'date_recorded' => '2026-11-10',
            'monitoring_data' => ['consultationWorkflow' => 'rhu_itr_v1'], 'vital_signs' => ['weight' => 55],
            'diagnoses' => [$this->diagnosis()], 'finalized_by' => $this->doctor->id, 'finalized_at' => now(), ...$extra,
        ]);
    }

    private function url(?HealthRecord $source = null): string
    {
        return '/api/health-records/'.($source ?? $this->source)->id.'/tb-registration';
    }

    private function payload(?HealthRecord $source = null): array
    {
        $revision = $this->actingAs($this->doctor, 'sanctum')->getJson($this->url($source))->assertOk()->json('data.source_revision');

        return [
            'reporting_year' => 2026, 'source_revision' => $revision, 'confirmed' => true,
            'card_data' => [
                'classification' => ['bacteriologicalStatus' => 'clinically_diagnosed', 'anatomicalSite' => 'pulmonary', 'registrationGroup' => 'new'],
                'regimen' => ['description' => 'Physician-entered regimen', 'weightKg' => 55, 'rows' => [
                    ['dateStart' => '2026-11-10', 'drug4fdc' => '4', 'strength' => 'Physician-entered strength', 'unit' => 'tablets/day'],
                ]],
            ],
        ];
    }

    private function submit(array $payload, ?string $key = null, ?HealthRecord $source = null, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->doctor, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->postJson($this->url($source), $payload);
    }

    public function test_preview_and_registration_pin_diagnostics_and_leave_the_consultation_unchanged(): void
    {
        $test = LaboratoryTest::create(['health_record_id' => $this->source->id, 'patient_id' => $this->patient->id,
            'client_id' => (string) Str::uuid(), 'created_by' => $this->nurse->id,
            'data' => ['testName' => 'GeneXpert', 'resultStatus' => 'Result Available', 'result' => 'Recorded laboratory result']]);
        $before = $this->source->fresh()->getRawOriginal();
        $preview = $this->actingAs($this->doctor, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('data.eligible', true)->assertJsonPath('data.can_register', true)
            ->assertJsonPath('data.card_data.diagnosis.diagnosisType', 'tb_disease')
            ->assertJsonPath('data.card_data.classification.drugResistance', 'drug_susceptible')
            ->assertJsonPath('data.card_data.caseFinding.diagnosingFacility', 'Registration RHU')
            ->assertJsonPath('data.card_data.regimen.weightKg', 55)
            ->assertJsonPath('data.laboratory_tests.0.recordId', $test->id);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $caseId = $this->submit($this->payload())->assertCreated()
            ->assertJsonPath('data.case_number', 'TB-2026-0001')->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.card_data.diagnosis.attendingPhysician', 'doctor')->json('data.id');
        $case = TbTreatmentCase::findOrFail($caseId);
        $this->assertSame($this->doctor->id, $case->registered_by);
        $this->assertSame('drug_susceptible', $case->diagnosis_snapshot['diagnosis']['tbManagement']['drugResistance']);
        $this->assertSame('Recorded laboratory result', $case->diagnosis_snapshot['laboratory_tests'][0]['result']);
        $this->assertSame($before, $this->source->fresh()->getRawOriginal());
        $this->assertNull($this->source->fresh()->tb_data);
        $this->assertDatabaseHas('audit_logs', ['module' => 'tb_treatment_cases', 'action' => 'created', 'user_id' => $this->doctor->id]);
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.case.id', $caseId)->assertJsonPath('data.eligible', false);
    }

    public function test_only_an_authorized_owning_rhu_physician_can_register(): void
    {
        $payload = $this->payload();
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@registration.example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active']);
        foreach ([$this->nurse, $this->bhcUser, $admin] as $user) {
            $this->submit($payload, user: $user)->assertForbidden();
        }
        $otherRhu = RuralHealthUnit::create(['name' => 'Foreign RHU', 'status' => 'active']);
        $foreign = $this->newSource(['rural_health_unit_id' => $otherRhu->id]);
        $this->submit($payload, source: $foreign)->assertForbidden();
        foreach (['conditions.confirm', 'consultations.finalize', 'clinical.history'] as $missing) {
            $this->doctor->update(['permissions' => array_values(array_diff(['conditions.confirm', 'consultations.finalize', 'clinical.history'], [$missing]))]);
            $this->submit($payload)->assertForbidden();
        }
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->assertDatabaseCount('tb_case_number_counters', 0);
    }

    public function test_nurse_can_preview_without_authorizing_a_case(): void
    {
        $this->actingAs($this->nurse, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('data.eligible', true)->assertJsonPath('data.can_register', false);
        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->url())->assertForbidden();
    }

    public function test_nonfinalized_nonphysician_and_ambiguous_assessments_cannot_register(): void
    {
        foreach ([
            ['finalized_at' => null], ['finalized_by' => $this->nurse->id], ['diagnoses' => []],
            ['diagnoses' => [$this->diagnosis(), $this->diagnosis(['drugResistance' => 'rr_tb'])]],
            ['diagnoses' => [['name' => 'Asthma', 'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']]]],
        ] as $override) {
            $source = $this->newSource($override);
            $this->submit($this->payload($source), source: $source)->assertUnprocessable();
        }
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_infection_and_every_dr_tb_classification_are_blocked(): void
    {
        foreach (['rr_tb', 'mdr_tb', 'clinically_mdr_tb', 'xdr_tb', 'other', ''] as $resistance) {
            $source = $this->newSource(['diagnoses' => [$this->diagnosis(['drugResistance' => $resistance])]]);
            $this->submit($this->payload($source), source: $source)->assertUnprocessable();
        }
        $source = $this->newSource(['diagnoses' => [$this->diagnosis(['diagnosisType' => 'tb_infection', 'drugResistance' => ''])]]);
        $this->submit($this->payload($source), source: $source)->assertUnprocessable();
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_forged_clinical_ownership_outcome_and_dots_fields_are_rejected(): void
    {
        $base = $this->payload();
        foreach ([
            ['diagnosis', ['diagnosisType' => 'tb_infection']], ['classification', ['drugResistance' => 'rr_tb']],
            ['laboratory', ['xpert' => ['result' => 'Invented']]], ['outcome', ['status' => 'cured']],
            ['doseCalendar', ['adherencePercent' => 100]], ['adverseEvents', [['specificAe' => 'Invented']]],
        ] as [$key, $value]) {
            $payload = $base;
            $payload['card_data'][$key] = [...($payload['card_data'][$key] ?? []), ...$value];
            $this->submit($payload)->assertUnprocessable();
        }
        $this->submit([...$base, 'patient_id' => $this->patient->id, 'registered_by' => $this->nurse->id])->assertUnprocessable();
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_registration_requires_manual_regimen_weight_dosage_and_review_confirmation(): void
    {
        $base = $this->payload();
        foreach (['description', 'weightKg', 'rows'] as $field) {
            $payload = $base;
            unset($payload['card_data']['regimen'][$field]);
            $this->submit($payload)->assertUnprocessable();
        }
        foreach ([[], ['drug4fdc' => '0'], ['drug4fdc' => '-1'], ['drug4fdc' => 'many']] as $doses) {
            $payload = $base;
            $payload['card_data']['regimen']['rows'][0] = ['dateStart' => '2026-11-10', 'strength' => 'Specified', 'unit' => 'tablets', ...$doses];
            $this->submit($payload)->assertUnprocessable();
        }
        $this->submit([...$base, 'confirmed' => false])->assertUnprocessable();
        $this->submit($base, key: 'invalid')->assertUnprocessable();
        $this->assertDatabaseCount('tb_case_number_counters', 0);
    }

    public function test_identical_retry_returns_the_same_case_without_a_second_audit_or_number(): void
    {
        $payload = $this->payload();
        $key = (string) Str::uuid();
        $id = $this->submit($payload, $key)->assertCreated()->json('data.id');
        $this->submit($payload, $key)->assertOk()->assertJsonPath('data.id', $id);
        $changed = $payload;
        $changed['card_data']['regimen']['description'] = 'Different regimen';
        $this->submit($changed, $key)->assertStatus(409);
        $this->submit($payload)->assertStatus(409);
        $other = $this->newSource();
        $this->submit($this->payload($other), $key, $other)->assertStatus(409);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
        $this->assertSame(1, DB::table('tb_case_number_counters')->value('last_number'));
        $this->assertSame(1, AuditLog::where('module', 'tb_treatment_cases')->count());
    }

    public function test_supplied_numbers_are_normalized_and_conflicts_do_not_consume_generated_numbers(): void
    {
        $payload = [...$this->payload(), 'case_number' => ' tb-2026-0001 '];
        $first = $this->submit($payload)->assertCreated()->json('data.id');
        TbTreatmentCase::findOrFail($first)->update(['status' => 'closed']);
        $other = $this->newSource();
        $this->submit([...$this->payload($other), 'case_number' => 'TB-2026-0001'], source: $other)->assertUnprocessable();
        $this->submit($this->payload($other), source: $other)->assertCreated()->assertJsonPath('data.case_number', 'TB-2026-0002');
    }

    public function test_active_episode_blocks_a_different_consultation_until_closed(): void
    {
        $id = $this->submit($this->payload())->assertCreated()->json('data.id');
        $other = $this->newSource();
        $payload = $this->payload($other);
        $this->submit($payload, source: $other)->assertStatus(409);
        TbTreatmentCase::findOrFail($id)->update(['status' => 'closed']);
        $this->submit($payload, source: $other)->assertCreated();
    }

    public function test_lab_addendum_after_preview_requires_review_and_saved_evidence_stays_pinned(): void
    {
        $lab = LaboratoryTest::create(['health_record_id' => $this->source->id, 'patient_id' => $this->patient->id,
            'client_id' => (string) Str::uuid(), 'created_by' => $this->nurse->id, 'data' => ['testName' => 'DSSM', 'result' => 'Original']]);
        $stale = $this->payload();
        LaboratoryAddendum::create(['laboratory_test_id' => $lab->id, 'created_by' => $this->doctor->id, 'reason' => 'Correction', 'data' => ['testName' => 'DSSM', 'result' => 'Corrected']]);
        $this->submit($stale)->assertStatus(409);
        $payload = $this->payload();
        $id = $this->submit($payload)->assertCreated()->json('data.id');
        LaboratoryAddendum::create(['laboratory_test_id' => $lab->id, 'created_by' => $this->doctor->id, 'reason' => 'Later correction', 'data' => ['testName' => 'DSSM', 'result' => 'Later']]);
        $this->submit($payload, key: TbTreatmentCase::findOrFail($id)->registration_key)->assertOk();
        $this->assertSame('Corrected', TbTreatmentCase::findOrFail($id)->diagnosis_snapshot['laboratory_tests'][0]['result']);
    }

    public function test_unclosed_legacy_numbered_card_requires_reconciliation_but_recorded_terminal_outcome_allows_later_episode(): void
    {
        $legacy = $this->newSource(['tb_data' => ['diagnosis' => ['tbCaseNumber' => 'OLD-1']]]);
        $payload = $this->payload();
        $this->submit($payload)->assertStatus(409);
        $legacy->update(['tb_data' => ['diagnosis' => ['tbCaseNumber' => 'OLD-1'], 'outcome' => ['status' => 'cured', 'date' => '2025-01-01']]]);
        $this->submit($payload)->assertCreated();
        $this->assertSame('OLD-1', $legacy->fresh()->tb_data['diagnosis']['tbCaseNumber']);
    }

    public function test_real_finalized_tb_assessment_remains_authorized_after_physician_reassignment(): void
    {
        $visit = RhuVisitQueueEntry::create(['patient_id' => $this->patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => (string) Str::uuid()]);
        $this->actingAs($this->doctor, 'sanctum');
        $uuid = $this->postJson("/api/rhu-visits/{$visit->id}/start")->assertOk()->json('data.consultation_uuid');
        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id, 'consultation_workflow' => 'rhu_itr_v1', 'rhu_visit_id' => $visit->id,
            'consultation_uuid' => $uuid, 'category' => 'General Consultation', 'chief_complaint' => 'Cough', 'diagnoses' => [$this->diagnosis()],
        ])->assertCreated()->json('data.id');
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $source = HealthRecord::findOrFail($id);
        $sourceRhu = $this->doctor->rural_health_unit_id;
        $otherRhu = RuralHealthUnit::create(['name' => 'Reassigned RHU', 'status' => 'active']);
        $this->doctor->update(['rural_health_unit_id' => $otherRhu->id]);
        $this->doctor = User::create([
            'name' => 'Successor physician', 'email' => 'successor@registration.example.test', 'password' => 'password123',
            'role' => 'rhu', 'staff_role' => 'doctor', 'status' => 'active', 'rural_health_unit_id' => $sourceRhu,
            'permissions' => ['clinical.history', 'consultations.finalize', 'conditions.confirm'],
        ]);
        $this->submit($this->payload($source), source: $source)->assertCreated();
        $this->assertNull($source->fresh()->tb_data);
    }

    public function test_shared_case_pdf_uses_the_registered_card_and_remains_unavailable_to_bhc(): void
    {
        $id = $this->submit($this->payload())->assertCreated()->json('data.id');
        $response = $this->get("/api/tb-cases/$id/pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->assertNull($this->source->fresh()->tb_data);
        $case = TbTreatmentCase::findOrFail($id);
        $html = view('pdf.tb-treatment-card', ['record' => $this->source, 'patient' => $this->patient,
            'tb' => $case->card_data, 'universalLaboratoryTests' => $case->diagnosis_snapshot['laboratory_tests']])->render();
        $this->assertStringContainsString('Physician-entered regimen', $html);
        $this->assertStringContainsString('55', $html);
        $this->actingAs($this->bhcUser, 'sanctum')->getJson("/api/tb-cases/$id/pdf")->assertNotFound();
    }

    public function test_registration_migration_rollbacks_preserve_cases_sources_and_duplicate_guards(): void
    {
        $id = $this->submit($this->payload())->assertCreated()->json('data.id');
        $case = TbTreatmentCase::findOrFail($id);
        $card = $case->card_data;
        $diagnoses = $this->source->fresh()->diagnoses;
        $identity = require database_path('migrations/2026_11_10_000002_add_tb_registration_identity.php');
        $authority = require database_path('migrations/2026_11_10_000003_add_tb_assessment_authority.php');
        $authority->down();
        $identity->down();
        $identity->up();
        $authority->up();
        $this->assertSame($card, $case->fresh()->card_data);
        $this->assertSame($diagnoses, $this->source->fresh()->diagnoses);
        $other = $this->newSource();
        $this->expectException(QueryException::class);
        TbTreatmentCase::create([
            'patient_id' => $this->patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'source_health_record_id' => $other->id, 'reporting_year' => 2026, 'case_number' => 'TB-2026-0002',
            'registered_by' => $this->doctor->id, 'registered_at' => now(), 'diagnosis_snapshot' => [], 'card_data' => [],
        ]);
    }
}
