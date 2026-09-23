<?php

namespace Tests\Feature;

use App\Models\{AuditLog, BarangayHealthCenter, Patient, RuralHealthUnit, User};
use App\Services\VisitPurpose;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class VisitPurposeTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private User $worker;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Purpose Test RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Purpose Test BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->worker = User::create(['name' => 'Test BHW', 'email' => 'purpose@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => 'active', 'barangay_health_center_id' => $bhc->id]);
        $this->patient = Patient::create(['first_name' => 'Synthetic', 'last_name' => 'Purpose', 'sex' => 'Female', 'birthdate' => '2010-01-01', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($this->worker, 'sanctum');
    }

    private function payload(array $services, array $purpose = []): array
    {
        $programs = VisitPurpose::programs($services);
        $primary = $programs[0] ?? null;
        return [
            'patient_id' => $this->patient->id, 'date_recorded' => '2026-09-23 09:00:00',
            'category' => $primary ? \App\Services\ConsultationPrograms::CLASSIFICATIONS[$primary] : 'General Consultation',
            'monitoring_data' => ['selectedPrograms' => $programs, 'primaryProgram' => $primary, 'visitPurpose' => [
                'version' => 1, 'services' => $services, 'overrideReason' => '', 'pregnancyConfirmed' => '', ...$purpose,
            ]],
        ];
    }

    private function save(array $payload)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', $payload);
    }

    public function test_general_plus_postpartum_requires_general_fields_and_saves_one_record(): void
    {
        $payload = $this->payload(['General', 'Postpartum']);
        $this->save($payload)->assertUnprocessable()->assertJsonValidationErrors(['chief_complaint', 'history_of_present_illness']);
        $payload += ['chief_complaint' => 'Test concern', 'history_of_present_illness' => 'Test history', 'physical_exam' => 'Test findings', 'diagnosis' => 'Test assessment', 'maternal_data' => ['para' => '1']];
        $this->save($payload)->assertCreated()->assertJsonPath('data.monitoring_data.visitPurpose.services', ['General', 'Postpartum']);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_postpartum_only_does_not_require_general_or_pregnancy_fields(): void
    {
        $this->save($this->payload(['Postpartum']))->assertCreated()->assertJsonPath('data.chief_complaint', null);
    }

    public function test_teenage_confirmation_round_trips_without_automatic_referral_or_diagnosis(): void
    {
        foreach (['Yes', 'No', ''] as $answer) {
            $response = $this->save($this->payload(['Prenatal'], ['pregnancyConfirmed' => $answer]))->assertCreated();
            $this->getJson('/api/health-records/'.$response->json('data.id'))->assertOk()
                ->assertJsonPath('data.monitoring_data.visitPurpose.pregnancyConfirmed', $answer === '' ? null : $answer)
                ->assertJsonPath('data.diagnosis', null);
        }
        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_age_override_is_required_and_audited(): void
    {
        $this->patient->update(['birthdate' => '2018-01-01']);
        $this->save($this->payload(['Prenatal']))->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.visitPurpose.overrideReason']);
        $this->save($this->payload(['Prenatal'], ['overrideReason' => 'Synthetic approved exception']))->assertCreated();
        $this->assertSame(1, AuditLog::where('action', 'eligibility_override')->where('user_id', $this->worker->id)->count());
    }

    public function test_infant_cannot_override_maternal_but_can_save_epi_without_cc(): void
    {
        $this->patient->update(['birthdate' => '2025-09-23']);
        $this->save($this->payload(['Prenatal'], ['overrideReason' => 'Invalid exception']))->assertUnprocessable();
        $this->save($this->payload(['EPI']) + ['notes' => 'No vaccine given at this visit'])->assertCreated();
    }

    public function test_mismatched_programs_and_nonteen_confirmation_are_rejected(): void
    {
        $payload = $this->payload(['Prenatal']);
        $payload['monitoring_data']['selectedPrograms'] = ['EPI'];
        $this->save($payload)->assertUnprocessable();
        $this->save($this->payload(['Postpartum'], ['pregnancyConfirmed' => 'Yes']))->assertUnprocessable();
        $this->patient->update(['birthdate' => '2000-01-01']);
        $this->save($this->payload(['Prenatal'], ['pregnancyConfirmed' => 'Yes']))->assertUnprocessable();
    }

    public function test_purpose_and_answer_survive_draft_resume_without_general_validation(): void
    {
        $purpose = $this->payload(['General', 'Prenatal'], ['pregnancyConfirmed' => 'No'])['monitoring_data']['visitPurpose'];
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'Maternal',
            'payload' => ['visitPurpose' => $purpose, 'selectedPrograms' => ['Maternal'], 'primaryProgram' => 'Maternal', 'wizardPhase' => 'form', 'formStep' => 'program:Maternal'],
        ])->assertCreated()->json('data.id');
        $this->getJson('/api/health-record-drafts/'.$draft)->assertOk()
            ->assertJsonPath('data.payload.visitPurpose.services', ['General', 'Prenatal'])
            ->assertJsonPath('data.payload.visitPurpose.pregnancyConfirmed', 'No');
    }

    public function test_rhu_legacy_save_contract_stays_unchanged(): void
    {
        $rhu = RuralHealthUnit::first();
        $this->patient->update(['rural_health_unit_id' => $rhu->id]);
        $staff = User::create(['name' => 'Test RHU', 'email' => 'rhu-purpose@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_RHU_STAFF, 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->actingAs($staff, 'sanctum');
        $this->save(['patient_id' => $this->patient->id, 'category' => 'General Consultation'])->assertCreated();
        $this->save($this->payload(['General']))->assertUnprocessable();
    }
}
