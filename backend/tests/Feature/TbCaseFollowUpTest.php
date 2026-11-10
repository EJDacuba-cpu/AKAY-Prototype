<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbCaseEndorsement;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbCaseFollowUpTest extends TestCase
{
    use RefreshDatabase;

    private User $doctor;

    private User $nurse;

    private User $bhcUser;

    private Patient $patient;

    private TbTreatmentCase $case;

    private TbCaseEndorsement $endorsement;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00', 'Asia/Manila'));
        $rhu = RuralHealthUnit::create(['name' => 'Follow-up RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'DOTS BHC', 'rural_health_unit_id' => $rhu->id, 'status' => 'active']);
        foreach (['doctor', 'nurse', 'bhcUser'] as $key) {
            $isBhc = $key === 'bhcUser';
            $this->$key = User::create(['name' => $key, 'email' => "$key@tb-followup.example.test", 'password' => 'password123',
                'role' => $isBhc ? 'bhc' : 'rhu', 'staff_role' => $isBhc ? 'midwife' : $key, 'status' => 'active',
                'rural_health_unit_id' => $isBhc ? null : $rhu->id, 'barangay_health_center_id' => $isBhc ? $bhc->id : null,
                'permissions' => ['clinical.history', 'records.correct', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']]);
        }
        $this->patient = Patient::create(['first_name' => 'Shared', 'last_name' => 'TB Patient', 'sex' => 'Male', 'status' => 'active', 'barangay_health_center_id' => $bhc->id]);
        $this->case = $this->newCase($this->patient);
        $this->endorsement = TbCaseEndorsement::create(['tb_treatment_case_id' => $this->case->id, 'receiving_bhc_id' => $bhc->id,
            'linked_patient_id' => $this->patient->id, 'patient_snapshot' => ['id' => $this->patient->id], 'note' => 'DOTS', 'status' => 'accepted',
            'version' => 1, 'endorsed_by' => $this->doctor->id, 'endorsed_at' => now(), 'request_key' => (string) Str::uuid(), 'request_hash' => str_repeat('a', 64)]);
    }

    private function newCase(Patient $patient, string $number = 'TB-2026-0001'): TbTreatmentCase
    {
        $source = HealthRecord::create(['patient_id' => $patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'category' => 'General Consultation', 'date_recorded' => '2026-01-01', 'finalized_by' => $this->doctor->id, 'finalized_at' => now(),
            'diagnoses' => [['name' => 'TB', 'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']]]]);

        return TbTreatmentCase::create(['patient_id' => $patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'source_health_record_id' => $source->id, 'reporting_year' => 2026, 'case_number' => $number, 'registered_by' => $this->doctor->id,
            'registered_at' => now(), 'version' => 1, 'diagnosis_snapshot' => [], 'card_data' => ['classification' => ['drugResistance' => 'drug_susceptible'],
                'regimen' => ['rows' => [['dateStart' => '2026-01-01']], 'description' => 'Physician prescription']]])->fresh();
    }

    private function url(string $suffix = 'follow-up'): string
    {
        return "/api/tb-cases/{$this->case->id}/$suffix";
    }

    private function labBody(array $changes = []): array
    {
        return array_replace(['milestone' => 'month_6', 'test_name' => 'DSSM sputum', 'due_on' => '2026-11-08', 'status' => 'result_available',
            'collection_on' => '2026-11-09', 'examination_on' => '2026-11-09', 'result' => 'Recorded sputum result', 'notes' => 'RHU follow-up laboratory'], $changes);
    }

    private function lab(array $changes = [], ?string $key = null, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->nurse, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->postJson($this->url('follow-up-labs'), $this->labBody($changes));
    }

    private function updateLab(int $id, array $changes = [], ?string $key = null)
    {
        return $this->actingAs($this->nurse, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->patchJson($this->url("follow-up-labs/$id"), $this->labBody(['version' => 1, 'correction_reason' => 'Corrected laboratory entry', ...$changes]));
    }

    private function closeBody(array $changes = []): array
    {
        return array_replace(['case_version' => $this->case->fresh()->version, 'outcome_status' => 'treatment_completed',
            'outcome_on' => '2026-11-10', 'note' => 'Physician reviewed the treatment course and available evidence', 'confirmed' => true, 'evidence_lab_ids' => []], $changes);
    }

    private function closeCase(array $changes = [], ?string $key = null, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->doctor, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->postJson($this->url('close'), $this->closeBody($changes));
    }

    private function reopen(array $changes = [], ?string $key = null)
    {
        return $this->actingAs($this->doctor, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())->postJson($this->url('reopen'),
            array_replace(['case_version' => $this->case->fresh()->version, 'note' => 'Physician-authorized clinical reconciliation', 'confirmed' => true], $changes));
    }

    public function test_rhu_records_case_labs_and_bhc_reads_without_changing_registered_diagnosis(): void
    {
        $before = $this->case->card_data;
        $source = $this->case->sourceHealthRecord->getRawOriginal();
        $id = $this->lab()->assertCreated()->assertJsonPath('data.lab.result', 'Recorded sputum result')->json('data.lab.id');
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.can_record_labs', true)->assertJsonPath('data.can_close', false);
        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->url())->assertOk()->assertJsonPath('data.labs.0.id', $id)
            ->assertJsonPath('data.can_record_labs', false)->assertJsonPath('data.can_close', false);
        $this->lab(user: $this->bhcUser)->assertForbidden();
        $this->closeCase(user: $this->nurse)->assertForbidden();
        $this->assertSame($before, $this->case->fresh()->card_data);
        $this->assertSame($source, $this->case->sourceHealthRecord->fresh()->getRawOriginal());
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_requested_month_milestones_have_explicit_dates_and_result_updates_keep_revisions(): void
    {
        foreach (['month_2', 'month_5', 'month_6'] as $milestone) {
            $id = $this->lab(['milestone' => $milestone, 'status' => 'requested', 'result' => null, 'examination_on' => null, 'collection_on' => null, 'due_on' => '2027-01-01'])
                ->assertCreated()->assertJsonPath('data.lab.status', 'requested')->json('data.lab.id');
            $this->updateLab($id)->assertOk()->assertJsonPath('data.lab.version', 2);
            $this->updateLab($id, ['version' => 2, 'status' => 'cancelled', 'result' => null, 'examination_on' => null, 'collection_on' => null])->assertOk();
        }
        $this->getJson($this->url())->assertOk()->assertJsonCount(3, 'data.labs')->assertJsonCount(9, 'data.events');
    }

    public function test_lab_dates_results_and_clinical_field_tampering_are_validated(): void
    {
        foreach ([['examination_on' => '2026-11-11'], ['collection_on' => '2026-11-10'], ['due_on' => '2025-12-31'], ['examination_on' => null],
            ['result' => ''], ['status' => 'requested'], ['milestone' => 'month_3'], ['patient_id' => 99], ['card_data' => ['outcome' => 'cured']]] as $changes) {
            $this->lab($changes)->assertUnprocessable();
        }
        $this->assertDatabaseCount('tb_follow_up_labs', 0);
    }

    public function test_physician_closure_pins_evidence_and_preserves_source_and_card(): void
    {
        $id = $this->lab()->assertCreated()->json('data.lab.id');
        $before = $this->case->card_data;
        $this->closeCase(['outcome_status' => 'cured', 'evidence_lab_ids' => [$id]])->assertOk()
            ->assertJsonPath('data.case.status', 'closed')->assertJsonPath('data.case.outcome_status', 'cured')
            ->assertJsonPath('data.event.snapshot.evidence_labs.0.result', 'Recorded sputum result');
        $this->assertSame($before, $this->case->fresh()->card_data);
        $this->assertNull($this->case->sourceHealthRecord->fresh()->tb_data);
        $this->lab()->assertStatus(409);
        $this->actingAs($this->bhcUser, 'sanctum')->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($this->url('monitoring'), [
            'observed_on' => '2026-11-10', 'dose_status' => 'taken', 'weight_kg' => null, 'notes' => '',
            'endorsement_id' => $this->endorsement->id, 'endorsement_version' => 1,
        ])->assertStatus(409);
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.case.outcome_status', 'cured')->assertJsonPath('data.can_close', false);
    }

    public function test_cured_requires_completed_selected_evidence_and_explicit_physician_confirmation(): void
    {
        $this->closeCase(['outcome_status' => 'cured'])->assertUnprocessable();
        $pending = $this->lab(['status' => 'awaiting_result', 'result' => null, 'examination_on' => null])->assertCreated()->json('data.lab.id');
        $this->closeCase(['outcome_status' => 'cured', 'evidence_lab_ids' => [$pending]])->assertUnprocessable();
        $this->closeCase(['confirmed' => false])->assertUnprocessable();
        $this->closeCase(['evidence_lab_ids' => [9999]])->assertUnprocessable();
        $this->closeCase(['outcome_on' => '2026-11-11'])->assertUnprocessable();
        $this->closeCase(['outcome_on' => '2025-12-31'])->assertUnprocessable();
        $this->closeCase(['outcome_status' => 'died'])->assertOk();
    }

    public function test_new_lab_or_dots_versions_force_physician_review_and_stale_lab_corrections_fail(): void
    {
        $id = $this->lab()->assertCreated()->json('data.lab.id');
        $reviewed = $this->case->fresh()->version;
        $this->updateLab($id, ['result' => 'New reviewed result'])->assertOk();
        $this->updateLab($id)->assertStatus(409);
        $this->closeCase(['case_version' => $reviewed])->assertStatus(409);
        $reviewed = $this->case->fresh()->version;
        $this->actingAs($this->bhcUser, 'sanctum')->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($this->url('monitoring'), [
            'observed_on' => '2026-11-10', 'dose_status' => 'taken', 'weight_kg' => 55, 'notes' => '',
            'endorsement_id' => $this->endorsement->id, 'endorsement_version' => 1,
        ])->assertCreated();
        $this->closeCase(['case_version' => $reviewed])->assertStatus(409);
        $this->closeCase()->assertOk()->assertJsonCount(1, 'data.event.snapshot.monitoring_versions');
    }

    public function test_close_reopen_retries_do_not_reapply_an_older_clinical_decision(): void
    {
        $body = $this->closeBody();
        $closeKey = (string) Str::uuid();
        $this->closeCase($body, $closeKey)->assertOk();
        $this->closeCase($body, $closeKey)->assertOk();
        $reopenBody = ['case_version' => $this->case->fresh()->version];
        $reopenKey = (string) Str::uuid();
        $this->reopen($reopenBody, $reopenKey)->assertOk()->assertJsonPath('data.case.status', 'active')->assertJsonPath('data.case.outcome_status', null);
        $this->closeCase($body, $closeKey)->assertOk()->assertJsonPath('data.case.status', 'active');
        $this->closeCase()->assertOk();
        $this->reopen($reopenBody, $reopenKey)->assertOk()->assertJsonPath('data.case.status', 'closed');
        $this->closeCase([...$body, 'outcome_status' => 'died'], $closeKey)->assertStatus(409);
        $this->assertDatabaseCount('tb_case_clinical_events', 3);
    }

    public function test_reopen_preserves_prior_closure_evidence_when_lab_is_corrected(): void
    {
        $id = $this->lab()->assertCreated()->json('data.lab.id');
        $this->closeCase(['evidence_lab_ids' => [$id]])->assertOk();
        $this->updateLab($id, ['result' => 'Premature update'])->assertStatus(409);
        $this->reopen()->assertOk();
        $this->updateLab($id, ['result' => 'Corrected after reopening'])->assertOk();
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.events.1.snapshot.evidence_labs.0.result', 'Recorded sputum result');
        $this->assertDatabaseHas('tb_follow_up_labs', ['id' => $id, 'result' => 'Corrected after reopening']);
    }

    public function test_reopen_cannot_overlap_a_new_active_episode_on_a_linked_registration(): void
    {
        $alias = $this->patient->replicate();
        $alias->save();
        $this->endorsement->update(['linked_patient_id' => $alias->id]);
        $this->closeCase()->assertOk();
        $this->newCase($alias, 'TB-2026-0002');
        $this->reopen()->assertStatus(409);
        $this->assertSame('closed', $this->case->fresh()->status);
    }

    public function test_role_duty_and_facility_boundaries_apply_to_lifecycle_and_lab_commands(): void
    {
        $this->closeCase(user: $this->bhcUser)->assertForbidden();
        foreach (['conditions.confirm', 'consultations.finalize', 'clinical.history'] as $missing) {
            $this->doctor->update(['permissions' => array_values(array_diff(['conditions.confirm', 'consultations.finalize', 'clinical.history'], [$missing]))]);
            $this->closeCase()->assertForbidden();
        }
        $this->nurse->update(['permissions' => ['clinical.history']]);
        $this->lab()->assertForbidden();
        $this->doctor->update(['permissions' => ['conditions.confirm', 'consultations.finalize', 'clinical.history']]);
        $other = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        $this->doctor->update(['rural_health_unit_id' => $other->id]);
        $this->closeCase()->assertNotFound();
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->url())->assertNotFound();
        $this->endorsement->update(['status' => 'revoked']);
        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->url())->assertNotFound();
    }

    public function test_lab_uuid_retry_preserves_latest_revision_without_duplicate_side_effects(): void
    {
        $key = (string) Str::uuid();
        $id = $this->lab(key: $key)->assertCreated()->json('data.lab.id');
        $this->lab(key: $key)->assertOk()->assertJsonPath('data.lab.id', $id);
        $this->lab(['result' => 'Different result'], $key)->assertStatus(409);
        $this->updateLab($id, ['result' => 'Corrected result'])->assertOk();
        $this->lab(key: $key)->assertOk()->assertJsonPath('data.lab.version', 2);
        $this->assertDatabaseCount('tb_follow_up_labs', 1);
        $this->assertDatabaseCount('tb_case_clinical_events', 2);
    }

    public function test_pdf_projects_final_outcome_and_follow_up_labs_without_editing_registered_json(): void
    {
        $id = $this->lab()->assertCreated()->json('data.lab.id');
        $this->closeCase(['outcome_status' => 'cured', 'evidence_lab_ids' => [$id]])->assertOk();
        $before = $this->case->card_data;
        $rendered = false;
        View::composer('pdf.tb-treatment-card', function ($view) use (&$rendered) {
            $rendered = true;
            $this->assertSame('cured', $view->getData()['tb']['outcome']['status']);
            $this->assertCount(1, $view->getData()['followUpLabs']);
        });
        $this->actingAs($this->bhcUser, 'sanctum')->get($this->url('pdf'))->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertTrue($rendered);
        $this->assertSame($before, $this->case->fresh()->card_data);
    }

    public function test_migration_rollback_preserves_case_source_and_prior_monitoring_tables(): void
    {
        $before = $this->case->card_data;
        $this->lab()->assertCreated();
        $this->closeCase()->assertOk();
        $migration = require database_path('migrations/2026_11_10_000007_create_tb_case_follow_up.php');
        $migration->down();
        $migration->up();
        $this->assertSame($before, $this->case->fresh()->card_data);
        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('tb_case_endorsements', 1);
        $this->assertDatabaseCount('tb_follow_up_labs', 0);
    }
}
