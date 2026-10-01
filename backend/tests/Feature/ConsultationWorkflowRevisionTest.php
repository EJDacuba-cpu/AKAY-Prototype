<?php
namespace Tests\Feature;

use App\Models\{BarangayHealthCenter, RuralHealthUnit, Patient, User, Medicine};
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationWorkflowRevisionTest extends TestCase
{
    use RefreshDatabase;
    private User $worker;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Revision RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Revision BHC', 'rural_health_unit_id' => $rhu->id]);
        $this->worker = User::create(['name' => 'Reviewer', 'email' => 'revision@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '2000-01-01', 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $rhu->id, 'created_by' => $this->worker->id]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function save(array $extra = [], ?string $key = null)
    {
        return $this->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())->postJson('/api/health-records', [...['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Routine visit'], ...$extra]);
    }

    public function test_optional_hpi_and_vitals_do_not_block_finalization(): void
    {
        $this->save()->assertCreated();
    }

    public function test_followup_requires_assessment_and_schedule(): void
    {
        $this->save(['monitoring_data' => ['followUpStatus' => 'Follow-up Required']])->assertUnprocessable()->assertJsonValidationErrors(['diagnosis', 'monitoring_data.followUpDate']);
    }

    public function test_zero_doctors_finalizes_without_submitting_referral(): void
    {
        $this->save(['needs_referral' => true, 'diagnosis' => 'Needs RHU assessment', 'referral' => ['reason_for_referral' => 'Further assessment', 'urgency_level' => 'Routine']])->assertCreated()->assertJsonPath('data.monitoring_data.referralStatus', 'Awaiting Doctor Availability');
        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('referral_holds', 1);
    }

    public function test_shortage_records_actual_quantity_once_on_retry(): void
    {
        $medicine = Medicine::create(['name' => 'Test item', 'category' => 'Supplies', 'quantity' => 6, 'unit' => 'pieces', 'availability_status' => 'Available', 'barangay_health_center_id' => $this->worker->barangay_health_center_id, 'created_by' => $this->worker->id]);
        $payload = ['dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 10, 'confirmed_given' => true]]];
        $key = (string) Str::uuid();
        $this->save($payload, $key)->assertCreated();
        $this->save($payload, $key)->assertOk();
        $this->assertSame(0, $medicine->fresh()->quantity);
        $this->assertTrue($medicine->fresh()->reconciliation_required);
        $this->assertDatabaseCount('medicine_inventory_transactions', 1);
        $this->assertDatabaseHas('medicine_inventory_transactions', ['quantity_delta' => -10, 'discrepancy' => -4]);
    }

    public function test_planned_item_does_not_deduct_stock(): void
    {
        $medicine = Medicine::create(['name' => 'Planned item', 'quantity' => 6, 'barangay_health_center_id' => $this->worker->barangay_health_center_id, 'created_by' => $this->worker->id]);
        $this->save(['dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 2]]])->assertCreated();
        $this->assertSame(6, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_encoder_can_submit_incomplete_forms_and_reviewer_can_correct_without_returning(): void
    {
        $encoder = User::create(['name' => 'Encoder', 'email' => 'encoder@example.test', 'password' => 'password123', 'role' => 'bhw', 'status' => 'active', 'barangay_health_center_id' => $this->worker->barangay_health_center_id, 'permissions' => ActionPermissions::PRESETS['encoder']]);
        Sanctum::actingAs($encoder, ['akay:access']);
        $payload = ['chiefComplaint' => 'Concern', 'selectedPrograms' => ['Family Planning'], 'primaryProgram' => 'Family Planning'];
        $data = ['patient_id' => $this->patient->id, 'classification' => 'Family Planning', 'payload' => $payload];
        $draft = $this->postJson('/api/health-record-drafts', $data)->assertCreated()->json('data');
        $path = '/api/health-record-drafts/'.$draft['id'];
        $review = $this->postJson($path.'/transition', ['action' => 'submit', 'version' => $draft['version']])->assertOk()->json('data');
        $this->getJson($path)->assertOk()->assertJsonPath('data.can_edit', false);
        $this->postJson($path.'/transition', ['action' => 'claim', 'version' => $review['version']])->assertForbidden();
        Sanctum::actingAs($this->worker, ['akay:access']);
        $claimed = $this->postJson($path.'/transition', ['action' => 'claim', 'version' => $review['version']])->assertOk()->json('data');
        $data['payload']['chiefComplaint'] = 'Corrected concern';
        $this->putJson($path, [...$data, 'version' => $claimed['version']])->assertOk()->assertJsonPath('data.review_state', 'review');
        $this->assertDatabaseHas('consultation_events', ['action' => 'edited', 'actor_id' => $this->worker->id]);
        $this->assertDatabaseHas('notifications', ['user_id' => $this->worker->id, 'type' => 'consultation_review']);
        $version = $claimed['version'] + 1;
        $this->postJson($path.'/transition', ['action' => 'return', 'version' => $version])->assertUnprocessable();
        $returned = $this->postJson($path.'/transition', ['action' => 'return', 'version' => $version, 'note' => 'Please verify the TB case number.'])->assertOk()->json('data');
        Sanctum::actingAs($encoder, ['akay:access']);
        $this->postJson($path.'/transition', ['action' => 'claim', 'version' => $returned['version']])->assertOk()->assertJsonPath('data.review_state', 'encoding');
    }

    public function test_vaccine_administered_posts_once_and_duplicate_manual_entry_is_rejected(): void
    {
        $medicine = Medicine::create(['name' => 'Test vaccine', 'quantity' => 5, 'unit' => 'dose', 'availability_status' => 'Available', 'barangay_health_center_id' => $this->worker->barangay_health_center_id, 'created_by' => $this->worker->id]);
        $payload = ['immunization_data' => ['vaccineEntries' => [['vaccineName' => 'Test vaccine', 'medicineId' => $medicine->id, 'inventoryQuantity' => 1, 'confirmedGiven' => true]]]];
        $this->save([...$payload, 'dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 1, 'confirmed_given' => true]]])->assertUnprocessable()->assertJsonValidationErrors('dispensed_medicines');
        $this->save($payload)->assertCreated();
        $this->assertSame(4, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('medicine_inventory_transactions', 1);
    }

    public function test_incomplete_added_program_blocks_finalization(): void
    {
        $this->save(['diagnosis' => 'PTB', 'diagnoses' => [['id' => 'd1', 'name' => 'PTB', 'carePlan' => 'monitor']]])->assertUnprocessable()->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_finalization_does_not_grant_referral_or_dispensing_permission(): void
    {
        $this->worker->update(['permissions' => ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize']]);
        $this->save(['needs_referral' => true, 'diagnosis' => 'Needs review', 'referral' => ['reason_for_referral' => 'Further review', 'urgency_level' => 'Routine']])->assertForbidden();
        $medicine = Medicine::create(['name' => 'Restricted item', 'quantity' => 6, 'availability_status' => 'Available', 'barangay_health_center_id' => $this->worker->barangay_health_center_id, 'created_by' => $this->worker->id]);
        $this->save(['dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 1, 'confirmed_given' => true]]])->assertForbidden();
        $this->assertSame(6, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_physical_count_clears_reconciliation_without_erasing_discrepancy(): void
    {
        $this->worker->update(['permissions' => [...ActionPermissions::PRESETS['clinical'], 'inventory.manage']]);
        $medicine = Medicine::create(['name' => 'Counted item', 'quantity' => 6, 'availability_status' => 'Available', 'barangay_health_center_id' => $this->worker->barangay_health_center_id, 'created_by' => $this->worker->id]);
        $this->save(['dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 10, 'confirmed_given' => true]]])->assertCreated();
        $this->postJson('/api/medicines/'.$medicine->id.'/adjust', ['action' => 'physical_count', 'quantity' => 3, 'reason' => 'Verified physical count'])->assertOk();
        $this->assertSame(3, $medicine->fresh()->quantity);
        $this->assertFalse($medicine->fresh()->reconciliation_required);
        $this->assertDatabaseHas('medicine_inventory_transactions', ['medicine_id' => $medicine->id, 'discrepancy' => -4]);
    }
}
