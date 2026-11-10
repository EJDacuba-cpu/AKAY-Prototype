<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\LaboratoryTest;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbDrReferral;
use App\Models\TbTreatmentCase;
use App\Models\User;
use App\Services\TbClinicalAuthority;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbDrReferralTest extends TestCase
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
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00', 'Asia/Manila'));
        $rhu = RuralHealthUnit::create(['name' => 'Referring RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Home BHC', 'rural_health_unit_id' => $rhu->id, 'status' => 'active']);
        foreach (['doctor', 'nurse', 'bhcUser'] as $key) {
            $isBhc = $key === 'bhcUser';
            $this->$key = User::create(['name' => $key, 'email' => "$key@dr-referral.example.test", 'password' => 'password123',
                'role' => $isBhc ? 'bhc' : 'rhu', 'staff_role' => $isBhc ? 'midwife' : $key, 'status' => 'active',
                'rural_health_unit_id' => $isBhc ? null : $rhu->id, 'barangay_health_center_id' => $isBhc ? $bhc->id : null,
                'permissions' => ['clinical.history', 'conditions.confirm', 'consultations.finalize', 'referrals.submit']]);
        }
        $this->patient = Patient::create(['first_name' => 'Original', 'last_name' => 'Patient', 'sex' => 'Male', 'birthdate' => '1990-01-01',
            'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'contact_number' => '09123456789']);
        $this->source = $this->newSource();
    }

    private function newSource(string $resistance = 'rr_tb', string $type = 'tb_disease'): HealthRecord
    {
        $diagnoses = [['name' => 'Pulmonary TB', 'tbManagement' => ['diagnosisType' => $type, 'drugResistance' => $resistance]]];

        return HealthRecord::create(['patient_id' => $this->patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'category' => 'General Consultation', 'date_recorded' => '2026-11-10', 'diagnoses' => $diagnoses,
            'finalized_at' => now(), 'finalized_by' => $this->doctor->id,
            'tb_assessment_authority' => app(TbClinicalAuthority::class)->finalizationAttestation($this->doctor, $diagnoses)]);
    }

    private function url(?HealthRecord $source = null): string
    {
        return '/api/health-records/'.($source ?? $this->source)->id.'/tb-dr-referral';
    }

    private function payload(?HealthRecord $source = null): array
    {
        $preview = $this->actingAs($this->doctor, 'sanctum')->getJson($this->url($source))->assertOk();

        return ['source_revision' => $preview->json('data.source_revision'), 'destination_name' => 'External PMDT Facility',
            'destination_address' => 'External facility address', 'destination_contact' => 'Facility contact',
            'reason' => 'Physician-authorized specialized DR-TB evaluation', 'confirmed' => true];
    }

    private function issue(array $body, ?string $key = null, ?User $user = null, ?HealthRecord $source = null)
    {
        return $this->actingAs($user ?? $this->doctor, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())->postJson($this->url($source), $body);
    }

    private function changeStatus(int $id, array $changes = [], ?string $key = null, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->doctor, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->postJson("/api/tb-dr-referrals/$id/status", array_replace(['version' => 1, 'status' => 'sent', 'event_on' => '2026-11-10',
                'note' => 'Slip handed to patient; outbound contact recorded by RHU'], $changes));
    }

    public function test_physician_issues_a_frozen_outbound_referral_without_registering_or_modifying_a_case(): void
    {
        LaboratoryTest::create(['health_record_id' => $this->source->id, 'patient_id' => $this->patient->id, 'created_by' => $this->nurse->id,
            'client_id' => (string) Str::uuid(), 'data' => ['testName' => 'GeneXpert', 'resultStatus' => 'Result Available', 'result' => 'Original evidence']]);
        $before = $this->source->fresh()->getRawOriginal();
        $this->actingAs($this->nurse, 'sanctum')->getJson($this->url())->assertOk()->assertJsonPath('data.eligible', true)->assertJsonPath('data.can_authorize', false);
        $id = $this->issue($this->payload())->assertCreated()->assertJsonPath('data.status', 'issued')
            ->assertJsonPath('data.patient_snapshot.full_name', 'Original Patient')
            ->assertJsonPath('data.source_snapshot.diagnosis.tbManagement.drugResistance', 'rr_tb')
            ->assertJsonPath('data.source_snapshot.laboratory_tests.0.result', 'Original evidence')->json('data.id');
        $this->assertSame($before, $this->source->fresh()->getRawOriginal());
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->assertDatabaseCount('tb_dr_referral_events', 1);
        $this->assertDatabaseHas('audit_logs', ['module' => 'tb_dr_referrals', 'action' => 'created', 'user_id' => $this->doctor->id]);
        $this->actingAs($this->nurse, 'sanctum')->getJson("/api/tb-dr-referrals/$id")->assertOk()->assertJsonPath('data.can_update', false);
    }

    public function test_all_dr_variants_are_referrable_but_form_4b_remains_blocked(): void
    {
        foreach (['rr_tb', 'mdr_tb', 'clinically_mdr_tb', 'xdr_tb', 'other'] as $resistance) {
            $source = $this->newSource($resistance);
            $this->issue($this->payload($source), source: $source)->assertCreated();
            $preview = $this->getJson("/api/health-records/{$source->id}/tb-registration")->assertOk()->assertJsonPath('data.eligible', false);
            $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson("/api/health-records/{$source->id}/tb-registration", [
                'reporting_year' => 2026, 'source_revision' => $preview->json('data.source_revision'), 'confirmed' => true,
                'card_data' => ['classification' => ['bacteriologicalStatus' => 'clinically_diagnosed', 'anatomicalSite' => 'pulmonary', 'registrationGroup' => 'new'],
                    'regimen' => ['description' => 'Prescription', 'weightKg' => 55, 'rows' => [['dateStart' => '2026-11-10', 'drug4fdc' => '4', 'strength' => 'Specified', 'unit' => 'tablets/day']]]],
            ])->assertUnprocessable()->assertJsonPath('message', 'Form 4B requires TB Disease with drug-susceptible classification. TB Infection and DR-TB are not eligible.');
        }
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_ds_infection_draft_ambiguous_and_unverifiable_assessments_cannot_issue(): void
    {
        $ds = $this->newSource('drug_susceptible');
        $infection = $this->newSource('', 'tb_infection');
        $draft = $this->newSource();
        $draft->update(['finalized_at' => null]);
        $ambiguous = $this->newSource();
        $ambiguous->update(['diagnoses' => [$ambiguous->diagnoses[0], $ambiguous->diagnoses[0]]]);
        $unsigned = $this->newSource();
        $unsigned->update(['tb_assessment_authority' => null, 'finalized_by' => $this->nurse->id]);
        foreach ([$ds, $infection, $draft, $ambiguous, $unsigned] as $source) {
            $this->issue($this->payload($source), source: $source)->assertUnprocessable();
        }
        $this->patient->update(['status' => 'inactive']);
        $this->issue($this->payload())->assertUnprocessable();
        $this->assertDatabaseCount('tb_dr_referrals', 0);
    }

    public function test_only_current_owning_rhu_physician_with_all_duties_can_write(): void
    {
        $body = $this->payload();
        foreach ([$this->nurse, $this->bhcUser] as $user) {
            $this->issue($body, user: $user)->assertForbidden();
        }
        foreach (['clinical.history', 'conditions.confirm', 'consultations.finalize', 'referrals.submit'] as $missing) {
            $permissions = array_values(array_diff(['clinical.history', 'conditions.confirm', 'consultations.finalize', 'referrals.submit'], [$missing]));
            $this->doctor->update(['permissions' => $permissions]);
            $this->issue($body)->assertForbidden();
        }
        $this->doctor->update(['permissions' => ['clinical.history', 'conditions.confirm', 'consultations.finalize', 'referrals.submit']]);
        $other = RuralHealthUnit::create(['name' => 'Wrong RHU', 'status' => 'active']);
        $this->doctor->update(['rural_health_unit_id' => $other->id]);
        $this->issue($body)->assertForbidden();
        $this->doctor->update(['rural_health_unit_id' => $this->source->rural_health_unit_id]);
        $id = $this->issue($body)->assertCreated()->json('data.id');
        $this->changeStatus($id, user: $this->nurse)->assertForbidden();
        $this->actingAs($this->bhcUser, 'sanctum')->getJson("/api/tb-dr-referrals/$id")->assertNotFound();
        $this->get("/api/tb-dr-referrals/$id/pdf")->assertNotFound();
        $this->doctor->ruralHealthUnit()->update(['status' => 'inactive']);
        $this->issue($body)->assertForbidden();
    }

    public function test_source_or_new_laboratory_evidence_requires_a_fresh_preview(): void
    {
        $body = $this->payload();
        LaboratoryTest::create(['health_record_id' => $this->source->id, 'patient_id' => $this->patient->id, 'created_by' => $this->nurse->id,
            'client_id' => (string) Str::uuid(), 'data' => ['testName' => 'GeneXpert', 'resultStatus' => 'Result Available', 'result' => 'New evidence']]);
        $this->issue($body)->assertStatus(409);
        $this->issue($this->payload())->assertCreated();
        $this->assertDatabaseCount('tb_dr_referrals', 1);
    }

    public function test_issue_retries_return_current_state_without_duplicate_events_or_resurrection(): void
    {
        $body = $this->payload();
        $key = (string) Str::uuid();
        $id = $this->issue($body, $key)->assertCreated()->json('data.id');
        $this->issue($body, $key)->assertOk()->assertJsonPath('data.id', $id);
        $this->issue([...$body, 'destination_name' => 'Different facility'], $key)->assertStatus(409);
        $this->issue($this->payload())->assertStatus(409);
        $this->changeStatus($id, ['status' => 'cancelled', 'note' => 'Incorrect destination'])->assertOk();
        $this->issue($body, $key)->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertDatabaseCount('tb_dr_referrals', 1);
        $this->assertDatabaseCount('tb_dr_referral_events', 2);
    }

    public function test_status_versions_history_dates_and_retries_preserve_reported_disposition(): void
    {
        $id = $this->issue($this->payload())->assertCreated()->json('data.id');
        $key = (string) Str::uuid();
        $this->changeStatus($id, key: $key)->assertOk()->assertJsonPath('data.version', 2);
        $this->changeStatus($id, key: $key)->assertOk()->assertJsonPath('data.version', 2);
        $this->changeStatus($id, ['status' => 'cancelled'])->assertStatus(409);
        $this->changeStatus($id, ['version' => 2, 'status' => 'attendance_reported', 'note' => 'Patient reported attendance to RHU'])->assertOk()->assertJsonPath('data.version', 3);
        $this->changeStatus($id, ['version' => 3, 'status' => 'sent'])->assertStatus(409);
        $this->changeStatus($id, key: $key)->assertOk()->assertJsonPath('data.status', 'attendance_reported');
        $this->getJson("/api/tb-dr-referrals/$id")->assertOk()->assertJsonCount(3, 'data.events')->assertJsonPath('data.events.2.note', 'Patient reported attendance to RHU');
        $this->assertDatabaseCount('tb_dr_referral_events', 3);
    }

    public function test_cancellation_reissue_requires_fresh_workflow_revision_and_retains_history(): void
    {
        $body = $this->payload();
        $key = (string) Str::uuid();
        $old = $this->issue($body, $key)->assertCreated()->json('data.id');
        $stale = $this->payload();
        $this->changeStatus($old, ['status' => 'cancelled', 'note' => 'New destination needed'])->assertOk();
        $this->issue($stale)->assertStatus(409);
        $next = $this->issue($this->payload())->assertCreated()->json('data.id');
        $this->assertNotSame($old, $next);
        $this->issue($body, $key)->assertOk()->assertJsonPath('data.id', $old)->assertJsonPath('data.status', 'cancelled');
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.current.id', $next)->assertJsonCount(2, 'data.history');
    }

    public function test_validation_rejects_forged_clinical_identity_and_destination_mutation(): void
    {
        $body = $this->payload();
        foreach (['patient_id', 'rural_health_unit_id', 'source_snapshot', 'patient_snapshot', 'authorized_by', 'status', 'card_data'] as $key) {
            $this->issue([...$body, $key => 'forged'])->assertUnprocessable();
        }
        $this->issue([...$body, 'confirmed' => false])->assertUnprocessable();
        $id = $this->issue($body)->assertCreated()->json('data.id');
        foreach ([['destination_name' => 'Changed'], ['event_on' => '2026-11-11'], ['event_on' => '2026-11-09'], ['note' => ''], ['status' => 'cured']] as $changes) {
            $this->changeStatus($id, $changes)->assertUnprocessable();
        }
    }

    public function test_slip_uses_frozen_identity_authority_and_evidence_after_profile_changes(): void
    {
        $id = $this->issue($this->payload())->assertCreated()->json('data.id');
        $this->patient->update(['first_name' => 'Renamed']);
        $this->doctor->update(['name' => 'Renamed physician']);
        $rendered = false;
        View::composer('pdf.tb-dr-referral', function ($view) use (&$rendered) {
            $rendered = true;
            $referral = $view->getData()['referral'];
            $this->assertSame('Original Patient', $referral->patient_snapshot['full_name']);
            $this->assertSame('doctor', $referral->authorized_name);
            $this->assertSame('Referring RHU', $referral->source_snapshot['rhu_name']);
        });
        $this->actingAs($this->nurse, 'sanctum')->get("/api/tb-dr-referrals/$id/pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertTrue($rendered);
    }

    public function test_durable_diagnosis_attestation_survives_physician_reassignment(): void
    {
        $original = $this->doctor;
        $replacement = $original->replicate();
        $replacement->email = 'replacement-dr@example.test';
        $replacement->save();
        $original->update(['staff_role' => 'nurse']);
        $this->doctor = $replacement;
        $this->issue($this->payload())->assertCreated()->assertJsonPath('data.source_snapshot.physician_name', 'doctor');
    }

    public function test_referral_migration_rollback_preserves_source_and_existing_tb_tables(): void
    {
        $before = $this->source->fresh()->getRawOriginal();
        $this->issue($this->payload())->assertCreated();
        $dsSource = $this->newSource('drug_susceptible');
        $case = TbTreatmentCase::create(['patient_id' => $this->patient->id, 'rural_health_unit_id' => $this->doctor->rural_health_unit_id,
            'source_health_record_id' => $dsSource->id, 'reporting_year' => 2026, 'case_number' => 'TB-2026-0001',
            'registered_by' => $this->doctor->id, 'registered_at' => now(), 'diagnosis_snapshot' => ['preserved' => true], 'card_data' => ['preserved' => true]]);
        $migration = require database_path('migrations/2026_11_10_000006_create_tb_dr_referrals.php');
        $migration->down();
        $migration->up();
        $this->assertSame($before, $this->source->fresh()->getRawOriginal());
        $this->assertDatabaseCount('tb_dr_referrals', 0);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
        $this->assertSame(['preserved' => true], $case->fresh()->card_data);
    }

    public function test_database_prevents_two_noncancelled_referrals_for_the_same_consultation(): void
    {
        $id = $this->issue($this->payload())->assertCreated()->json('data.id');
        $copy = TbDrReferral::findOrFail($id)->replicate();
        $this->expectException(QueryException::class);
        $copy->save();
    }

    public function test_admin_reads_issued_document_but_cannot_authorize_and_other_rhu_cannot_read_it(): void
    {
        $body = $this->payload();
        $id = $this->issue($body)->assertCreated()->json('data.id');
        $admin = User::create(['name' => 'Admin', 'email' => 'dr-admin@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->getJson("/api/tb-dr-referrals/$id")->assertOk()->assertJsonPath('data.can_update', false);
        $this->issue($body, user: $admin)->assertForbidden();
        $other = RuralHealthUnit::create(['name' => 'Other owner', 'status' => 'active']);
        $this->doctor->update(['rural_health_unit_id' => $other->id]);
        $this->actingAs($this->doctor, 'sanctum')->getJson("/api/tb-dr-referrals/$id")->assertNotFound();
        $this->get("/api/tb-dr-referrals/$id/pdf")->assertNotFound();
        $this->changeStatus($id)->assertNotFound();
    }
}
