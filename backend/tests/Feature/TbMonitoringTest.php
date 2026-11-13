<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbCaseEndorsement;
use App\Models\TbMonitoringEntry;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Daily DOTS observation writes are retired. Historical reads and access
 * scoping remain covered here.
 */
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

    private function seedEntry(array $attrs = []): TbMonitoringEntry
    {
        return TbMonitoringEntry::create(array_merge([
            'tb_treatment_case_id' => $this->case->id,
            'tb_case_endorsement_id' => $this->endorsement->id,
            'barangay_health_center_id' => $this->bhc->id,
            'recorded_by' => $this->bhcUser->id,
            'recorder_name' => $this->bhcUser->name,
            'recorded_at' => now(),
            'observed_on' => '2026-11-10',
            'dose_status' => 'taken',
            'weight_kg' => '55.25',
            'notes' => 'Historical supervised dose',
            'voided' => false,
            'version' => 1,
        ], $attrs));
    }

    public function test_dots_writes_are_retired_while_reads_remain_available(): void
    {
        $source = $this->case->sourceHealthRecord->getRawOriginal();
        $card = $this->case->card_data;
        $entry = $this->seedEntry();

        $this->store()->assertStatus(410);
        $this->actingAs($this->bhcUser, 'sanctum')->withHeader('Idempotency-Key', (string) Str::uuid())
            ->patchJson($this->url($entry->id), array_replace($this->body(['version' => 1, 'correction_reason' => 'n/a']), ['observed_on' => null]))
            ->assertStatus(410);

        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->url())->assertOk()
            ->assertJsonPath('data.can_write', false)
            ->assertJsonPath('data.entries.data.0.id', $entry->id)
            ->assertJsonPath('data.start_date', '2026-11-01');
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->url())->assertOk()->assertJsonPath('data.can_write', false);
        $this->assertSame($card, $this->case->fresh()->card_data);
        $this->assertSame($source, $this->case->sourceHealthRecord->fresh()->getRawOriginal());
    }

    public function test_revocation_and_local_patient_movement_remove_monitoring_read_access(): void
    {
        $this->seedEntry();
        $this->patient->update(['barangay_health_center_id' => null]);
        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->url())->assertNotFound();
        $this->store()->assertStatus(410);
        $this->patient->update(['barangay_health_center_id' => $this->bhc->id]);
        $this->endorsement->update(['status' => 'revoked']);
        $this->getJson($this->url())->assertNotFound();
    }

    public function test_wrong_facility_cannot_read_case_monitoring(): void
    {
        $this->seedEntry();
        $other = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active', 'rural_health_unit_id' => $this->case->rural_health_unit_id]);
        $this->bhcUser->update(['barangay_health_center_id' => $other->id]);
        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->url())->assertNotFound();
        $this->store()->assertStatus(410);
    }

    public function test_shared_pdf_uses_historical_nonvoid_observations_without_rewriting_registration_json(): void
    {
        $this->seedEntry(['notes' => 'Supervised daily dose']);
        $voided = $this->seedEntry(['observed_on' => '2026-11-09', 'voided' => true, 'dose_status' => null, 'weight_kg' => null]);
        $this->assertNotNull($voided->id);
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

    public function test_monitoring_schema_rollback_preserves_shared_case_and_registration_snapshot(): void
    {
        $this->seedEntry();
        $card = $this->case->card_data;
        $migration = require database_path('migrations/2026_11_10_000005_create_tb_monitoring_entries.php');
        $migration->down();
        $migration->up();
        $this->assertSame($card, $this->case->fresh()->card_data);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
        $this->assertDatabaseCount('tb_monitoring_entries', 0);
    }
}
