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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
use Tests\TestCase;

class TbMonitoringTest extends TestCase
{
    use RefreshDatabase;

    private User $bhcUser;

    private User $doctor;

    private BarangayHealthCenter $bhc;

    private Patient $patient;

    private TbTreatmentCase $case;

    private TbCaseEndorsement $endorsement;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00', 'Asia/Manila'));
        $rhu = RuralHealthUnit::create(['name' => 'Monitoring RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'DOTS BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->doctor = User::create(['name' => 'Physician', 'email' => 'tb-monitor-doctor@example.test', 'password' => 'password123',
            'role' => 'rhu', 'staff_role' => 'doctor', 'status' => 'active', 'rural_health_unit_id' => $rhu->id,
            'permissions' => ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']]);
        $this->bhcUser = User::create(['name' => 'DOTS Recorder', 'email' => 'tb-monitor-bhc@example.test', 'password' => 'password123',
            'role' => 'bhc', 'staff_role' => 'midwife', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id,
            'permissions' => ['clinical.history', 'consultations.encode']]);
        $this->patient = Patient::create(['first_name' => 'Shared', 'last_name' => 'Patient', 'birthdate' => '1990-01-01',
            'sex' => 'Male', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id]);
        $source = HealthRecord::create(['patient_id' => $this->patient->id, 'rural_health_unit_id' => $rhu->id,
            'category' => 'General Consultation', 'finalized_at' => now(), 'finalized_by' => $this->doctor->id,
            'diagnoses' => [['name' => 'TB', 'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']]]]);
        $this->case = TbTreatmentCase::create(['patient_id' => $this->patient->id, 'rural_health_unit_id' => $rhu->id,
            'source_health_record_id' => $source->id, 'case_number' => 'TB-2026-0001', 'reporting_year' => 2026,
            'registered_by' => $this->doctor->id, 'registered_at' => now(), 'diagnosis_snapshot' => [],
            'card_data' => ['classification' => ['drugResistance' => 'drug_susceptible'],
                'regimen' => ['description' => 'Physician prescription', 'rows' => [['dateStart' => '2026-11-01']]]]]);
        $this->endorsement = TbCaseEndorsement::create(['tb_treatment_case_id' => $this->case->id,
            'receiving_bhc_id' => $this->bhc->id, 'linked_patient_id' => $this->patient->id,
            'patient_snapshot' => ['id' => $this->patient->id], 'note' => 'For DOTS', 'status' => 'accepted',
            'endorsed_by' => $this->doctor->id, 'endorsed_at' => now(), 'reviewed_by' => $this->bhcUser->id,
            'reviewed_at' => now(), 'version' => 1, 'request_key' => (string) Str::uuid(), 'request_hash' => str_repeat('a', 64)]);
    }

    private function url(?int $entry = null): string
    {
        return "/api/tb-cases/{$this->case->id}/monitoring".($entry ? "/$entry" : '');
    }

    private function body(array $changes = []): array
    {
        return array_replace(['observed_on' => '2026-11-10', 'dose_status' => 'taken', 'weight_kg' => 55.25,
            'notes' => 'Supervised at BHC', 'endorsement_id' => $this->endorsement->id,
            'endorsement_version' => $this->endorsement->version], $changes);
    }

    private function store(array $changes = [], ?string $key = null)
    {
        return $this->actingAs($this->bhcUser, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->postJson($this->url(), $this->body($changes));
    }

    private function correct(int $id, array $changes = [], ?string $key = null)
    {
        $body = $this->body(['version' => 1, 'correction_reason' => 'Corrected observation']);
        unset($body['observed_on']);
        $body = array_replace($body, $changes);

        return $this->actingAs($this->bhcUser, 'sanctum')->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())
            ->patchJson($this->url($id), $body);
    }

    public function test_bhc_records_directly_on_shared_case_and_rhu_reads_without_mutating_snapshots(): void
    {
        $source = $this->case->sourceHealthRecord->getRawOriginal();
        $card = $this->case->card_data;
        $id = $this->store()->assertCreated()->assertJsonPath('data.dose_status', 'taken')
            ->assertJsonPath('data.weight_kg', '55.25')->json('data.id');
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.can_write', true)
            ->assertJsonPath('data.entries.data.0.id', $id)->assertJsonPath('data.start_date', '2026-11-01');
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->url())->assertOk()->assertJsonPath('data.can_write', false);
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($this->url(), $this->body())->assertForbidden();
        $this->assertSame($card, $this->case->fresh()->card_data);
        $this->assertSame($source, $this->case->sourceHealthRecord->fresh()->getRawOriginal());
        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('tb_monitoring_revisions', 1);
        $this->assertSame(1, AuditLog::where('module', 'tb_monitoring')->count());
    }

    public function test_weight_only_and_explicit_non_supervised_statuses_do_not_invent_taken_doses(): void
    {
        $this->store(['dose_status' => null])->assertCreated()->assertJsonPath('data.dose_status', null);
        foreach (['missed', 'incomplete', 'on_hold', 'dispensed'] as $offset => $status) {
            $this->store(['observed_on' => '2026-11-0'.($offset + 1), 'dose_status' => $status, 'weight_kg' => null])
                ->assertCreated()->assertJsonPath('data.dose_status', $status)->assertJsonPath('data.weight_kg', null);
        }
        $this->assertDatabaseCount('tb_monitoring_entries', 5);
    }

    public function test_manila_dates_precision_and_empty_observations_are_validated(): void
    {
        foreach ([['observed_on' => '2026-11-11'], ['observed_on' => '2026-10-31'], ['observed_on' => '2026-11-31'],
            ['weight_kg' => 0], ['weight_kg' => 55.255], ['dose_status' => null, 'weight_kg' => null],
            ['dose_status' => 'on_hold', 'notes' => ''], ['dose_status' => 'cured']] as $changes) {
            $this->store($changes)->assertUnprocessable();
        }
        $this->case->update(['card_data' => ['regimen' => ['rows' => []]]]);
        $this->store()->assertUnprocessable();
        $this->assertDatabaseCount('tb_monitoring_entries', 0);
    }

    public function test_pending_closed_and_stale_endorsements_cannot_log(): void
    {
        $this->endorsement->update(['status' => 'pending_review']);
        $this->store()->assertStatus(409);
        $this->endorsement->update(['status' => 'accepted', 'version' => 2]);
        $this->store(['endorsement_version' => 1])->assertStatus(409);
        $this->case->update(['status' => 'closed']);
        $this->store()->assertStatus(409);
    }

    public function test_revocation_and_local_patient_movement_remove_monitoring_access(): void
    {
        $this->store()->assertCreated();
        $this->patient->update(['barangay_health_center_id' => null]);
        $this->getJson($this->url())->assertNotFound();
        $this->store()->assertNotFound();
        $this->patient->update(['barangay_health_center_id' => $this->bhc->id]);
        $this->endorsement->update(['status' => 'revoked']);
        $this->getJson($this->url())->assertNotFound();
        $this->store()->assertNotFound();
    }

    public function test_wrong_facility_inactive_patients_and_missing_duties_are_denied(): void
    {
        $other = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active', 'rural_health_unit_id' => $this->case->rural_health_unit_id]);
        $this->bhcUser->update(['barangay_health_center_id' => $other->id]);
        $this->store()->assertNotFound();
        $this->bhcUser->update(['barangay_health_center_id' => $this->bhc->id, 'permissions' => ['clinical.history']]);
        $this->store()->assertForbidden();
        $this->bhcUser->update(['permissions' => ['consultations.encode']]);
        $this->store()->assertForbidden();
        $this->bhcUser->update(['permissions' => ['clinical.history', 'consultations.encode']]);
        $this->patient->update(['status' => 'inactive']);
        $this->store()->assertNotFound();
        $this->patient->update(['status' => 'active']);
        $this->bhc->update(['status' => 'inactive']);
        $this->store()->assertForbidden();
    }

    public function test_duplicate_dates_and_uuid_payload_conflicts_do_not_duplicate_entries(): void
    {
        $key = (string) Str::uuid();
        $id = $this->store([], $key)->assertCreated()->json('data.id');
        $this->store([], $key)->assertOk()->assertJsonPath('data.id', $id);
        $this->store(['weight_kg' => 56], $key)->assertStatus(409);
        $this->store()->assertStatus(409);
        $this->assertDatabaseCount('tb_monitoring_entries', 1);
        $this->assertDatabaseCount('tb_monitoring_revisions', 1);
    }

    public function test_reasoned_corrections_keep_history_and_stale_writes_cannot_overwrite(): void
    {
        $createKey = (string) Str::uuid();
        $id = $this->store([], $createKey)->assertCreated()->json('data.id');
        $patchKey = (string) Str::uuid();
        $this->correct($id, ['dose_status' => 'missed', 'weight_kg' => null], $patchKey)->assertOk()->assertJsonPath('data.version', 2);
        $this->correct($id, ['dose_status' => 'missed', 'weight_kg' => null], $patchKey)->assertOk()->assertJsonPath('data.version', 2);
        $this->correct($id)->assertStatus(409);
        $this->correct($id, ['version' => 2, 'correction_reason' => ''])->assertUnprocessable();
        $this->store([], $createKey)->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.dose_status', 'missed');
        $this->getJson($this->url($id))->assertOk()->assertJsonPath('data.revisions.0.values.dose_status', 'taken')
            ->assertJsonPath('data.revisions.1.values.dose_status', 'missed')
            ->assertJsonPath('data.revisions.1.reason', 'Corrected observation');
        $this->assertDatabaseCount('tb_monitoring_revisions', 2);
    }

    public function test_void_and_restore_preserve_the_date_and_previous_revisions(): void
    {
        $id = $this->store()->assertCreated()->json('data.id');
        $this->correct($id, ['voided' => true, 'dose_status' => null, 'weight_kg' => null])->assertOk()
            ->assertJsonPath('data.voided', true)->assertJsonPath('data.observed_on', '2026-11-10');
        $this->store()->assertStatus(409);
        $this->correct($id, ['version' => 2, 'voided' => false, 'weight_kg' => 56])->assertOk()->assertJsonPath('data.version', 3);
        $this->assertDatabaseCount('tb_monitoring_revisions', 3);
        $this->deleteJson($this->url($id))->assertStatus(405);
    }

    public function test_clinical_fields_and_ownership_cannot_be_smuggled_into_monitoring(): void
    {
        foreach (['card_data', 'diagnosis_snapshot', 'patient_id', 'barangay_health_center_id', 'recorded_by', 'outcome', 'regimen'] as $key) {
            $this->store([$key => $key === 'card_data' ? ['classification' => []] : 'forged'])->assertUnprocessable();
        }
        $id = $this->store()->assertCreated()->json('data.id');
        $this->correct($id, ['observed_on' => '2026-11-09'])->assertUnprocessable();
    }

    public function test_retry_after_revocation_cannot_bypass_access_checks(): void
    {
        $key = (string) Str::uuid();
        $this->store([], $key)->assertCreated();
        $this->endorsement->update(['status' => 'revoked']);
        $this->store([], $key)->assertNotFound();
    }

    public function test_monitoring_schema_rollback_preserves_shared_case_and_registration_snapshot(): void
    {
        $this->store()->assertCreated();
        $card = $this->case->card_data;
        $migration = require database_path('migrations/2026_11_10_000005_create_tb_monitoring_entries.php');
        $migration->down();
        $migration->up();
        $this->assertSame($card, $this->case->fresh()->card_data);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
        $this->assertDatabaseCount('tb_monitoring_entries', 0);
    }

    public function test_shared_pdf_uses_current_nonvoid_observations_without_rewriting_registration_json(): void
    {
        $this->store(['notes' => 'Supervised daily dose'])->assertCreated();
        $id = $this->store(['observed_on' => '2026-11-09'])->assertCreated()->json('data.id');
        $this->correct($id, ['voided' => true, 'dose_status' => null, 'weight_kg' => null])->assertOk();
        $card = $this->case->card_data;
        $rendered = false;
        View::composer('pdf.tb-treatment-card', function ($view) use (&$rendered) {
            $rendered = true;
            $entries = $view->getData()['monitoringEntries'] ?? collect();
            $this->assertCount(1, $entries);
            $this->assertSame('55.25', $entries->first()->weight_kg);
            $this->assertSame('taken', $entries->first()->dose_status);
        });
        $this->actingAs($this->doctor, 'sanctum')->get("/api/tb-cases/{$this->case->id}/pdf")
            ->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertTrue($rendered);
        $this->assertSame($card, $this->case->fresh()->card_data);
    }

    public function test_reendorsement_carries_history_but_does_not_grant_cross_bhc_correction_authority(): void
    {
        $id = $this->store()->assertCreated()->json('data.id');
        $previous = $this->bhcUser;
        $target = BarangayHealthCenter::create(['name' => 'Next DOTS BHC', 'status' => 'active', 'rural_health_unit_id' => $this->case->rural_health_unit_id]);
        $receiver = $previous->replicate();
        $receiver->fill(['email' => 'next-dots@example.test', 'barangay_health_center_id' => $target->id])->save();
        $local = $this->patient->replicate();
        $local->barangay_health_center_id = $target->id;
        $local->save();
        $this->actingAs($this->doctor, 'sanctum')->postJson("/api/tb-endorsements/{$this->endorsement->id}/revoke", [
            'version' => 1, 'case_version' => $this->case->fresh()->version, 'reason' => 'Change treatment partner',
        ])->assertOk();
        $next = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson("/api/tb-cases/{$this->case->id}/endorsements", [
            'case_version' => $this->case->fresh()->version, 'receiving_bhc_id' => $target->id, 'note' => 'Continue DOTS',
        ])->assertCreated()->json('data.id');
        $this->actingAs($receiver, 'sanctum')->postJson("/api/tb-endorsements/$next/link", [
            'version' => 1, 'linked_patient_id' => $local->id, 'identity_confirmed' => true,
        ])->assertOk();
        $this->postJson("/api/tb-endorsements/$next/accept", ['version' => 2, 'confirmed' => true])->assertOk();
        $this->bhcUser = $receiver;
        $this->store(['observed_on' => '2026-11-09'])->assertStatus(409); // stale old handoff ID
        $this->endorsement = TbCaseEndorsement::findOrFail($next);
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.entries.data.0.can_correct', false);
        $this->correct($id)->assertForbidden();
        $this->store()->assertStatus(409); // same date remains owned by the prior BHC
        $this->store(['observed_on' => '2026-11-09'])->assertCreated();
        $this->getJson($this->url($id))->assertOk()->assertJsonPath('data.revisions.0.values.dose_status', 'taken');
        $this->actingAs($previous, 'sanctum')->getJson($this->url())->assertNotFound();
    }

    public function test_calendar_limits_use_manila_today_across_a_utc_date_boundary(): void
    {
        $this->travelTo(Carbon::parse('2026-11-10 17:00:00', 'UTC'));
        $this->store(['observed_on' => '2026-11-11'])->assertCreated();
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.today', '2026-11-11');
        $this->store(['observed_on' => '2026-11-12'])->assertUnprocessable();
    }
}
