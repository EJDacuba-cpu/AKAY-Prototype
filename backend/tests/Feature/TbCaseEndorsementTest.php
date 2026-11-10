<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbCaseEndorsement;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbCaseEndorsementTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private BarangayHealthCenter $secondBhc;

    private User $doctor;

    private User $nurse;

    private User $receiver;

    private User $otherReceiver;

    private Patient $patient;

    private TbTreatmentCase $case;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Endorsing RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Receiving BHC', 'rural_health_unit_id' => $this->rhu->id, 'status' => 'active']);
        $this->secondBhc = BarangayHealthCenter::create(['name' => 'Second BHC', 'rural_health_unit_id' => $this->rhu->id, 'status' => 'active']);
        foreach (['doctor', 'nurse', 'receiver', 'otherReceiver'] as $key) {
            $isBhc = in_array($key, ['receiver', 'otherReceiver']);
            $this->$key = User::create([
                'name' => $key, 'email' => "$key@tb-endorsement.example.test", 'password' => 'password123',
                'role' => $isBhc ? 'bhc' : 'rhu', 'staff_role' => $isBhc ? 'midwife' : $key, 'status' => 'active',
                'rural_health_unit_id' => $isBhc ? null : $this->rhu->id,
                'barangay_health_center_id' => $isBhc ? ($key === 'receiver' ? $this->bhc->id : $this->secondBhc->id) : null,
                'permissions' => ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm'],
            ]);
        }
        $this->patient = $this->newPatient($this->bhc->id);
        $this->case = $this->newCase($this->patient);
    }

    private function newPatient(?int $bhcId): Patient
    {
        return Patient::create(['first_name' => 'Shared', 'last_name' => 'TB Patient', 'sex' => 'Male',
            'birthdate' => '1990-01-01', 'status' => 'active', 'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $bhcId ? null : $this->rhu->id]);
    }

    private function newCase(Patient $patient, string $number = 'TB-2026-0001'): TbTreatmentCase
    {
        $source = $this->source($patient);

        return TbTreatmentCase::create([
            'patient_id' => $patient->id, 'source_health_record_id' => $source->id, 'rural_health_unit_id' => $this->rhu->id,
            'reporting_year' => 2026, 'case_number' => $number, 'registered_by' => $this->doctor->id, 'registered_at' => now(),
            'diagnosis_snapshot' => ['laboratory_tests' => [['testName' => 'GeneXpert', 'resultStatus' => 'Result Available', 'result' => 'Pinned diagnostic evidence']]],
            'card_data' => ['diagnosis' => ['diagnosisType' => 'tb_disease', 'tbCaseNumber' => $number],
                'classification' => ['drugResistance' => 'drug_susceptible'], 'regimen' => ['description' => 'Physician prescription', 'weightKg' => 55]],
        ]);
    }

    private function source(Patient $patient): HealthRecord
    {
        return HealthRecord::create(['patient_id' => $patient->id, 'rural_health_unit_id' => $this->rhu->id,
            'barangay_health_center_id' => $patient->barangay_health_center_id, 'category' => 'General Consultation',
            'monitoring_data' => ['consultationWorkflow' => 'rhu_itr_v1'], 'finalized_by' => $this->doctor->id, 'finalized_at' => now(),
            'diagnoses' => [['name' => 'TB', 'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']]]]);
    }

    private function payload(?int $bhc = null): array
    {
        return ['case_version' => $this->case->fresh()->version, 'receiving_bhc_id' => $bhc ?? $this->bhc->id, 'note' => 'Endorsed for DOTS at receiving BHC.'];
    }

    private function endorse(?array $payload = null, ?string $key = null, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->doctor, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->postJson("/api/tb-cases/{$this->case->id}/endorsements", $payload ?? $this->payload());
    }

    private function act(int $id, string $action, array $body = [], ?User $user = null)
    {
        return $this->actingAs($user ?? $this->receiver, 'sanctum')->postJson("/api/tb-endorsements/$id/$action", $body);
    }

    public function test_physician_endorsement_shares_the_same_card_and_bhc_acceptance_does_not_change_clinical_data(): void
    {
        $source = $this->case->sourceHealthRecord->getRawOriginal();
        $card = $this->case->card_data;
        $id = $this->endorse()->assertCreated()->assertJsonPath('data.status', 'pending_review')
            ->assertJsonPath('data.linked_patient.id', $this->patient->id)->json('data.id');
        $this->assertSame(2, $this->case->fresh()->version);
        $this->actingAs($this->receiver, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}")->assertOk()
            ->assertJsonPath('data.card_data.classification.drugResistance', 'drug_susceptible');
        $this->getJson("/api/patients/{$this->patient->id}/tb-cases")->assertOk()->assertJsonPath('data.data.0.id', $this->case->id);
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true])->assertOk()->assertJsonPath('data.status', 'accepted');
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true])->assertOk()->assertJsonPath('data.version', 2);
        $this->get("/api/tb-cases/{$this->case->id}/pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->patchJson("/api/tb-cases/{$this->case->id}", ['card_data' => ['classification' => ['drugResistance' => 'rr_tb']]])->assertStatus(405);
        $this->assertSame($card, $this->case->fresh()->card_data);
        $this->assertSame($source, $this->case->sourceHealthRecord->fresh()->getRawOriginal());
        $this->assertSame(2, AuditLog::where('module', 'tb_case_endorsements')->count());
    }

    public function test_rhu_only_walk_in_needs_explicit_local_identity_link_without_changing_original_ownership(): void
    {
        $this->patient->update(['barangay_health_center_id' => null, 'rural_health_unit_id' => $this->rhu->id]);
        $local = $this->newPatient($this->bhc->id);
        $id = $this->endorse()->assertCreated()->assertJsonPath('data.status', 'linkage_needed')->json('data.id');
        $this->actingAs($this->receiver, 'sanctum')->getJson('/api/tb-endorsements')->assertOk()->assertJsonPath('data.data.0.id', $id);
        $this->getJson("/api/tb-endorsements/$id")->assertOk()->assertJsonMissingPath('data.card_data')->assertJsonMissingPath('data.diagnosis_snapshot');
        $this->getJson("/api/tb-cases/{$this->case->id}")->assertNotFound();
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true])->assertOk()->assertJsonPath('data.status', 'pending_review');
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true])->assertOk()->assertJsonPath('data.version', 2);
        $this->getJson("/api/tb-cases/{$this->case->id}")->assertOk();
        $this->getJson("/api/patients/{$local->id}/tb-cases")->assertOk()->assertJsonPath('data.data.0.id', $this->case->id);
        $this->act($id, 'accept', ['version' => 2, 'confirmed' => true])->assertOk();
        $this->getJson("/api/health-records/{$this->case->source_health_record_id}")->assertForbidden();
        $this->assertSame($this->patient->id, $this->case->fresh()->patient_id);
        $this->assertNull($this->patient->fresh()->barangay_health_center_id);
        $this->assertSame($this->bhc->id, $local->fresh()->barangay_health_center_id);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_patient_home_bhc_is_a_valid_return_target_even_when_attached_to_another_rhu(): void
    {
        $other = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        $this->bhc->update(['rural_health_unit_id' => $other->id]);
        $this->actingAs($this->doctor, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}/endorsements")
            ->assertOk()->assertJsonFragment(['id' => $this->bhc->id, 'name' => 'Receiving BHC']);
        $this->endorse()->assertCreated()->assertJsonPath('data.status', 'pending_review');
        $outside = BarangayHealthCenter::create(['name' => 'Unrelated', 'status' => 'active', 'rural_health_unit_id' => $other->id]);
        $this->endorse($this->payload($outside->id))->assertUnprocessable();
    }

    public function test_only_the_owning_physician_can_issue_or_revoke_with_proper_duties(): void
    {
        $payload = $this->payload();
        foreach ([$this->nurse, $this->receiver] as $actor) {
            $this->endorse($payload, user: $actor)->assertForbidden();
        }
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@tb-endorsement.example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active']);
        $this->endorse($payload, user: $admin)->assertForbidden();
        foreach (['conditions.confirm', 'consultations.finalize', 'clinical.history'] as $missing) {
            $this->doctor->update(['permissions' => array_values(array_diff(['conditions.confirm', 'consultations.finalize', 'clinical.history'], [$missing]))]);
            $this->endorse($payload)->assertForbidden();
        }
        $this->assertDatabaseCount('tb_case_endorsements', 0);
    }

    public function test_creation_retries_preserve_identity_and_changed_payload_or_stale_version_cannot_overwrite(): void
    {
        $payload = $this->payload();
        $key = (string) Str::uuid();
        $id = $this->endorse($payload, $key)->assertCreated()->json('data.id');
        $this->endorse($payload, $key)->assertOk()->assertJsonPath('data.id', $id);
        $this->endorse([...$payload, 'note' => 'Different'], $key)->assertStatus(409);
        $this->endorse($payload)->assertStatus(409);
        $this->act($id, 'revoke', ['version' => 1, 'case_version' => 2, 'reason' => 'Transfer treatment partner'], $this->doctor)->assertOk();
        $this->endorse($payload, $key)->assertOk()->assertJsonPath('data.status', 'revoked');
        $this->endorse($payload)->assertStatus(409);
        $this->assertDatabaseCount('tb_case_endorsements', 1);
        $this->assertSame(3, $this->case->fresh()->version);
    }

    public function test_revocation_immediately_removes_old_bhc_card_and_pdf_access_before_reassignment(): void
    {
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true])->assertOk();
        $this->act($id, 'revoke', ['version' => 1, 'case_version' => 2, 'reason' => 'Stale'], $this->doctor)->assertStatus(409);
        $body = ['version' => 2, 'case_version' => 3, 'reason' => 'BHC transfer'];
        $this->act($id, 'revoke', $body, $this->doctor)->assertOk()->assertJsonPath('data.status', 'revoked');
        $this->act($id, 'revoke', $body, $this->doctor)->assertOk();
        $this->actingAs($this->receiver, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}")->assertNotFound();
        $this->getJson("/api/tb-cases/{$this->case->id}/pdf")->assertNotFound();
        $this->getJson("/api/patients/{$this->patient->id}/tb-cases")->assertOk()->assertJsonPath('data.total', 0);
        $this->endorse($this->payload($this->secondBhc->id))->assertCreated()->assertJsonPath('data.status', 'linkage_needed');
        $this->actingAs($this->doctor, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}/endorsements")->assertOk()->assertJsonCount(2, 'data.history');
    }

    public function test_recipient_cannot_link_wrong_facility_or_inactive_registration_or_skip_confirmation(): void
    {
        $this->patient->update(['barangay_health_center_id' => null]);
        $local = $this->newPatient($this->bhc->id);
        $wrong = $this->newPatient($this->secondBhc->id);
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $wrong->id, 'identity_confirmed' => true])->assertForbidden();
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => false])->assertUnprocessable();
        $local->update(['status' => 'inactive']);
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true])->assertUnprocessable();
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true])->assertStatus(409);
    }

    public function test_wrong_bhc_and_read_only_staff_cannot_receive_or_mutate_endorsements(): void
    {
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->actingAs($this->otherReceiver, 'sanctum')->getJson("/api/tb-endorsements/$id")->assertNotFound();
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true], $this->otherReceiver)->assertNotFound();
        $this->receiver->update(['permissions' => ['clinical.history']]);
        $this->actingAs($this->receiver, 'sanctum')->getJson("/api/tb-endorsements/$id")->assertOk()->assertJsonPath('data.can_accept', false);
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true])->assertForbidden();
        $this->receiver->update(['permissions' => ['consultations.encode']]);
        $this->actingAs($this->receiver, 'sanctum')->getJson('/api/tb-endorsements')->assertForbidden();
        $this->getJson("/api/tb-cases/{$this->case->id}")->assertForbidden();
    }

    public function test_clinical_fields_cannot_be_smuggled_through_endorsement_actions(): void
    {
        $payload = $this->payload();
        $this->endorse([...$payload, 'card_data' => ['outcome' => ['status' => 'cured']]])->assertUnprocessable();
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true, 'status' => 'accepted', 'card_data' => ['classification' => ['drugResistance' => 'rr_tb']]])->assertUnprocessable();
        $this->assertSame('drug_susceptible', $this->case->fresh()->card_data['classification']['drugResistance']);
        $this->assertSame('pending_review', TbCaseEndorsement::findOrFail($id)->status);
    }

    public function test_decline_is_terminal_and_stale_accept_does_not_restore_access(): void
    {
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'decline', ['version' => 1, 'reason' => 'Unable to provide treatment support'])->assertOk()->assertJsonPath('data.status', 'declined');
        $this->act($id, 'decline', ['version' => 1, 'reason' => 'Unable to provide treatment support'])->assertOk();
        $this->act($id, 'accept', ['version' => 1, 'confirmed' => true])->assertStatus(409);
        $this->actingAs($this->receiver, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}")->assertNotFound();
        $this->endorse()->assertCreated();
    }

    public function test_local_patient_movement_or_deactivation_does_not_grant_another_facility_case_access(): void
    {
        $this->endorse()->assertCreated();
        $this->patient->update(['barangay_health_center_id' => $this->secondBhc->id]);
        foreach ([$this->receiver, $this->otherReceiver] as $user) {
            $this->actingAs($user, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}")->assertNotFound();
        }
        $this->patient->update(['barangay_health_center_id' => $this->bhc->id, 'status' => 'inactive']);
        $this->actingAs($this->receiver, 'sanctum')->getJson("/api/tb-cases/{$this->case->id}/pdf")->assertNotFound();
    }

    public function test_closed_case_or_inactive_target_cannot_receive_a_new_endorsement(): void
    {
        $this->case->update(['status' => 'closed']);
        $this->endorse()->assertUnprocessable();
        $this->case->update(['status' => 'active']);
        $this->bhc->update(['status' => 'inactive']);
        $this->endorse()->assertUnprocessable();
        $this->assertDatabaseCount('tb_case_endorsements', 0);
    }

    public function test_linking_cannot_join_two_active_cases_for_the_same_local_identity(): void
    {
        $this->patient->update(['barangay_health_center_id' => null]);
        $local = $this->newPatient($this->bhc->id);
        $this->newCase($local, 'TB-2026-0002');
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true])->assertStatus(409);
    }

    public function test_registration_cannot_create_an_overlapping_case_after_a_cross_registration_identity_link(): void
    {
        $this->patient->update(['barangay_health_center_id' => null]);
        $local = $this->newPatient($this->bhc->id);
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true])->assertOk();
        $this->act($id, 'revoke', ['version' => 2, 'case_version' => 3, 'reason' => 'Change treatment partner'], $this->doctor)->assertOk();
        $source = $this->source($local);
        $preview = $this->actingAs($this->doctor, 'sanctum')->getJson("/api/health-records/{$source->id}/tb-registration")->assertOk()->assertJsonPath('data.eligible', false);
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson("/api/health-records/{$source->id}/tb-registration", [
            'reporting_year' => 2026, 'source_revision' => $preview->json('data.source_revision'), 'confirmed' => true,
            'card_data' => ['classification' => ['bacteriologicalStatus' => 'clinically_diagnosed', 'anatomicalSite' => 'pulmonary', 'registrationGroup' => 'new'],
                'regimen' => ['description' => 'Prescription', 'weightKg' => 55, 'rows' => [['dateStart' => '2026-11-10', 'drug4fdc' => '4', 'strength' => 'Specified', 'unit' => 'tablets/day']]]],
        ])->assertStatus(409);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
    }

    public function test_historical_identity_links_block_a_new_case_in_both_directions_across_treatment_episodes(): void
    {
        $original = $this->patient;
        $original->update(['barangay_health_center_id' => null]);
        $local = $this->newPatient($this->bhc->id);
        $nextLocal = $this->newPatient($this->secondBhc->id);
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true])->assertOk();
        // Closing an episode must not erase an explicitly confirmed patient identity.
        $this->case->update(['status' => 'closed']);
        $this->case = $this->newCase($local, 'TB-2026-0002');
        $id = $this->endorse($this->payload($this->secondBhc->id))->assertCreated()->json('data.id');
        $this->act($id, 'link', ['version' => 1, 'linked_patient_id' => $nextLocal->id, 'identity_confirmed' => true], $this->otherReceiver)->assertOk();
        $this->case->update(['status' => 'closed']);
        $this->newCase($nextLocal, 'TB-2026-0003');

        $source = $this->source($original);
        $preview = $this->actingAs($this->doctor, 'sanctum')->getJson("/api/health-records/{$source->id}/tb-registration")->assertOk();
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson("/api/health-records/{$source->id}/tb-registration", [
            'reporting_year' => 2026, 'source_revision' => $preview->json('data.source_revision'), 'confirmed' => true,
            'card_data' => ['classification' => ['bacteriologicalStatus' => 'clinically_diagnosed', 'anatomicalSite' => 'pulmonary', 'registrationGroup' => 'new'],
                'regimen' => ['description' => 'Prescription', 'weightKg' => 55, 'rows' => [['dateStart' => '2026-11-10', 'drug4fdc' => '4', 'strength' => 'Specified', 'unit' => 'tablets/day']]]],
        ])->assertStatus(409);
        $preview->assertJsonPath('data.eligible', false);
        $this->assertDatabaseCount('tb_treatment_cases', 3);
    }

    public function test_endorsement_migration_does_not_change_registered_card_or_source_data(): void
    {
        $card = $this->case->card_data;
        $id = $this->endorse()->assertCreated()->json('data.id');
        $this->assertNotNull(TbCaseEndorsement::find($id));
        $migration = require database_path('migrations/2026_11_10_000004_create_tb_case_endorsements.php');
        $migration->down();
        $migration->up();
        $this->assertSame($card, $this->case->fresh()->card_data);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
        $this->assertDatabaseCount('tb_case_endorsements', 0);
        $this->assertNull($this->case->sourceHealthRecord->fresh()->tb_data);
    }

    public function test_inbox_case_filter_does_not_return_unrelated_cases(): void
    {
        $this->endorse()->assertCreated();
        $this->actingAs($this->receiver, 'sanctum')->getJson('/api/tb-endorsements?case_id=9999')->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_database_rejects_a_second_current_endorsement_even_if_service_is_bypassed(): void
    {
        $id = $this->endorse()->assertCreated()->json('data.id');
        $copy = TbCaseEndorsement::findOrFail($id)->replicate();
        $copy->request_key = (string) Str::uuid();
        $this->expectException(QueryException::class);
        $copy->save();
    }

    public function test_identical_creation_retry_does_not_reissue_an_endorsement_when_target_becomes_inactive(): void
    {
        $payload = $this->payload();
        $key = (string) Str::uuid();
        $id = $this->endorse($payload, $key)->assertCreated()->json('data.id');
        $this->bhc->update(['status' => 'inactive']);
        $this->endorse($payload, $key)->assertOk()->assertJsonPath('data.id', $id);
        $this->assertDatabaseCount('tb_case_endorsements', 1);
    }
}
