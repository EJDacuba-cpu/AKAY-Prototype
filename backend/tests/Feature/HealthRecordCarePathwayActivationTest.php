<?php
// backend/tests/Feature/HealthRecordCarePathwayActivationTest.php

namespace Tests\Feature;

use App\Http\Controllers\Api\HealthRecordController;
use App\Models\BarangayHealthCenter;
use App\Models\CarePathwayEnrollment;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PDOException;
use ReflectionMethod;
use Tests\TestCase;

class HealthRecordCarePathwayActivationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Wire RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Wire BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Wire BHW', 'email' => 'wire@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Q', 'last_name' => 'R', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    public function test_saving_a_consultation_with_an_activation_creates_the_enrollment_in_the_same_request(): void
    {
        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => ['activeCarePathways' => [[
                'pathway_key' => 'ncd',
                'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => 'hypertension_monitoring', 'diagnosis_ref' => 'd1', 'field_values' => []]],
            ]]],
        ])->assertCreated()->json('data.id');

        $enrollment = CarePathwayEnrollment::where('patient_id', $this->patient->id)->sole();
        $this->assertSame($id, $enrollment->started_health_record_id);
        $this->assertSame(['Hypertension'], $enrollment->activeConditionNames());
    }

    public function test_a_user_without_care_pathways_manage_cannot_activate_one(): void
    {
        // EnforceActionPermissions gates POST /health-records itself on
        // consultations.finalize, which the 'encoder' preset lacks - using it
        // here would 403 at the middleware, before ever reaching
        // CarePathwayActivationService::assertAllowed. This user keeps every
        // other 'clinical' permission (so the request clears the middleware
        // and normal save flow) and drops only care_pathways.manage, isolating
        // the check this task wires in.
        $permissions = array_values(array_diff(ActionPermissions::PRESETS['clinical'], ['care_pathways.manage']));
        $encoder = User::create(['name' => 'Encoder', 'email' => 'encoder@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'permissions' => $permissions]);
        $this->actingAs($encoder, 'sanctum');

        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'monitoring_data' => ['activeCarePathways' => [[
                'pathway_key' => 'ncd',
                'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
            ]]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.activeCarePathways.0']);

        $this->assertDatabaseCount('care_pathway_enrollments', 0);
    }

    public function test_a_mid_transaction_failure_leaves_no_enrollment_or_record_behind(): void
    {
        // Unlike a validation error (rejected before DB::transaction() ever
        // opens, so it trivially leaves nothing behind), MedicineStockService::
        // dispense() discovers this failure INSIDE the transaction, after
        // HealthRecord::create() and after CarePathwayActivationService::
        // activate() have already run - the same mid-transaction shape
        // HealthRecordIdempotencyTest's own
        // test_medicine_is_deducted_once_and_failure_rolls_back_record
        // exercises for medicine stock alone. This proves the whole
        // transaction, enrollment included, rolls back together.
        //
        // The brief's insufficient-stock trigger only maps to a mapped 409
        // via the pgsql stored procedure (MedicineStockService::
        // postgresDispense() / throwMappedDatabaseError()); this suite runs
        // on sqlite, where sqliteDispense() has no stock-sufficiency check at
        // all - it clamps to zero and flags reconciliation instead. An
        // expired medicine hits MEDICINE_NOT_DISPENSABLE instead, which IS
        // checked identically on both drivers (MedicineStockService.php
        // sqliteDispense(), same check the codebase's own
        // MedicineStockConcurrencyTest/MedicineInventoryWorkflowTest rely on
        // for this exact scenario) and is still raised deep inside this same
        // transaction, after both HealthRecord::create() and
        // CarePathwayActivationService::activate() - so it proves the same
        // rollback.
        $medicine = Medicine::create([
            'name' => 'Rollback Test Medicine', 'category' => 'Medicine', 'quantity' => 5,
            'unit' => 'tablet', 'availability_status' => 'Available',
            'expiration_date' => now()->subDay()->toDateString(),
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
        ]);

        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'NCD Monitoring',
            'chief_complaint' => 'Follow-up',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'addToConditions' => false]],
            'monitoring_data' => ['activeCarePathways' => [[
                'pathway_key' => 'ncd',
                'conditions' => [['condition_name' => 'Hypertension', 'field_set_key' => null, 'diagnosis_ref' => 'd1', 'field_values' => []]],
            ]]],
            'dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 1, 'confirmed_given' => true]],
        ])->assertUnprocessable()->assertJsonPath('code', 'MEDICINE_NOT_DISPENSABLE');

        $this->assertSame(5, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('care_pathway_enrollments', 0);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_a_concurrent_enrollment_race_is_mapped_to_a_clean_conflict_not_a_500(): void
    {
        // A true concurrent race (two overlapping transactions both finding
        // no active enrollment, both inserting) is impractical to simulate
        // reliably in this synchronous test suite. Instead, this constructs
        // the exact QueryException Postgres/SQLite raise when
        // care_pathway_enrollments_one_active_idx is violated, the same
        // technique this codebase already uses for an analogous unique-
        // violation mapping test - see
        // MedicineInventoryStoredProcedureTest::test_unique_violation_is_mapped_without_raw_postgresql_details.
        $databaseMessage = 'duplicate key value violates unique constraint '
            .'"care_pathway_enrollments_one_active_idx"';
        $previous = new PDOException($databaseMessage);
        $previous->errorInfo = ['23505', 7, $databaseMessage];
        $exception = new QueryException(
            'pgsql',
            'insert into care_pathway_enrollments (...) values (...)',
            [],
            $previous
        );

        $method = new ReflectionMethod(HealthRecordController::class, 'isCarePathwayEnrollmentConflict');
        $this->assertTrue($method->invoke(app(HealthRecordController::class), $exception));

        // A different unique-constraint message (e.g. the unrelated
        // idempotency_key one) must not match.
        $unrelated = new PDOException('duplicate key value violates unique constraint "health_records_idempotency_key_unique"');
        $unrelated->errorInfo = ['23505', 7, $unrelated->getMessage()];
        $unrelatedException = new QueryException('pgsql', 'insert into health_records (...) values (...)', [], $unrelated);
        $this->assertFalse($method->invoke(app(HealthRecordController::class), $unrelatedException));
    }
}
