<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class HealthRecordIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;
    private BarangayHealthCenter $bhc;
    private User $bhw;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Idempotency RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Idempotency BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->createUser('Primary BHW', 'idempotency-bhw@example.test');
        $this->createUser(
            'RHU Receiver',
            'idempotency-rhu@example.test',
            User::ROLE_RHU_STAFF,
            $this->rhu->id
        );
        $this->patient = $this->createPatient('Primary', 'Patient');
    }

    public function test_same_key_and_payload_returns_one_record_and_replay_metadata(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->payload();

        $first = $this->postRecord($payload, $key)
            ->assertCreated()
            ->assertJsonPath('idempotent_replay', false);
        $recordId = $first->json('result.health_record_id');

        $this->postRecord($payload, $key)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('result.health_record_id', $recordId)
            ->assertJsonPath('data.id', $recordId);

        $this->assertSame(1, HealthRecord::where('idempotency_key', $key)->count());
        $this->assertSame(1, AuditLog::where('module', 'health_records')->count());
    }

    public function test_same_key_rejects_material_payload_changes_without_mutation(): void
    {
        $key = (string) Str::uuid();
        $medicine = $this->medicine(20);
        $payload = $this->payload([
            'chief_complaint' => 'Original complaint',
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 2,
            ]],
        ]);

        $recordId = $this->postRecord($payload, $key)->assertCreated()->json('data.id');

        foreach ([
            ['chief_complaint' => 'Changed complaint'],
            ['dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 3,
            ]]],
            ['patient_id' => $this->createPatient('Second', 'Patient')->id],
        ] as $change) {
            $this->postRecord([...$payload, ...$change], $key)
                ->assertConflict()
                ->assertJsonPath('code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
        }

        $this->assertSame('Original complaint', HealthRecord::findOrFail($recordId)->chief_complaint);
        $this->assertSame(18, $medicine->fresh()->quantity);
        $this->assertSame(1, HealthRecord::where('idempotency_key', $key)->count());
    }

    public function test_missing_and_malformed_keys_are_rejected(): void
    {
        $this->actingAs($this->bhw, 'sanctum')
            ->postJson('/api/health-records', $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('idempotency_key');

        $this->postRecord($this->payload(), 'not-a-uuid')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('idempotency_key');

        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_another_user_cannot_replay_or_retrieve_a_submission_by_key(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->payload();
        $recordId = $this->postRecord($payload, $key)->assertCreated()->json('data.id');
        $otherBhw = $this->createUser('Other BHW', 'other-idempotency-bhw@example.test');

        $this->actingAs($otherBhw, 'sanctum')
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/health-records', $payload)
            ->assertConflict()
            ->assertJsonMissing(['id' => $recordId]);

        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_medicine_is_deducted_once_and_failure_rolls_back_record(): void
    {
        $medicine = $this->medicine(10);
        $payload = $this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 4,
            ]],
        ]);
        $key = (string) Str::uuid();

        $this->postRecord($payload, $key)->assertCreated();
        $this->postRecord($payload, $key)->assertOk();

        $this->assertSame(6, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 1);

        $this->postRecord($this->payload([
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 99,
            ]],
        ]), (string) Str::uuid())
            ->assertConflict()
            ->assertJsonPath('code', 'INSUFFICIENT_STOCK');

        $this->assertSame(6, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_follow_up_completion_and_next_task_are_replayed_once(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $payload = $this->followUpPayload($parent, $task, now()->addWeeks(2)->toDateString());
        $key = (string) Str::uuid();

        $first = $this->postRecord($payload, $key)->assertCreated();
        $recordId = $first->json('data.id');
        $nextTaskId = $first->json('result.next_follow_up_task_id');

        $this->postRecord($payload, $key)
            ->assertOk()
            ->assertJsonPath('result.completed_follow_up_task_id', $task->id)
            ->assertJsonPath('result.next_follow_up_task_id', $nextTaskId);

        $this->assertSame($recordId, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertSame(1, FollowUpTask::where('health_record_id', $recordId)->count());
    }

    public function test_final_epi_follow_up_creates_no_next_task_and_replays_once(): void
    {
        [$parent, $task] = $this->scheduledFollowUp('Immunization');
        $payload = $this->followUpPayload($parent, $task, null, [
            'immunization_data' => [
                'vaccineEntries' => [['vaccineName' => 'MCV 2', 'dateGiven' => now()->toDateString()]],
            ],
        ]);
        $key = (string) Str::uuid();

        $first = $this->postRecord($payload, $key)
            ->assertCreated()
            ->assertJsonPath('result.next_follow_up_task_id', null);
        $recordId = $first->json('data.id');

        $this->postRecord($payload, $key)
            ->assertOk()
            ->assertJsonPath('result.next_follow_up_task_id', null);

        $this->assertSame($recordId, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertSame(1, HealthRecord::where('parent_health_record_id', $parent->id)->count());
    }

    public function test_referral_and_database_notifications_are_created_once(): void
    {
        $payload = $this->payload([
            'needs_referral' => true,
            'referral' => [
                'referral_category' => 'General Consultation',
                'urgency_level' => 'Urgent',
                'reason_for_referral' => 'Requires RHU assessment.',
            ],
        ]);
        $key = (string) Str::uuid();

        $first = $this->postRecord($payload, $key)->assertCreated();
        $referralId = $first->json('result.referral_id');

        $this->postRecord($payload, $key)
            ->assertOk()
            ->assertJsonPath('result.referral_id', $referralId);

        $this->assertDatabaseCount('referrals', 1);
        $this->assertDatabaseCount('referral_updates', 1);
        $this->assertSame(2, UserNotification::where('related_referral_id', $referralId)->count());
        $this->assertSame(1, AuditLog::where('module', 'referrals')->count());
        $this->assertSame(1, AuditLog::where('module', 'health_records')->count());
    }

    public function test_late_referral_failure_rolls_back_record_stock_and_follow_up(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $medicine = $this->medicine(12);
        $this->bhc->update(['rural_health_unit_id' => null]);
        $payload = $this->followUpPayload($parent, $task, null, [
            'needs_referral' => true,
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 3,
            ]],
            'referral' => [
                'reason_for_referral' => 'Requires RHU assessment.',
            ],
        ]);

        $this->postRecord($payload, (string) Str::uuid())->assertUnprocessable();

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertSame(12, $medicine->fresh()->quantity);
        $this->assertNull($task->fresh()->fulfilled_at);
    }

    public function test_follow_up_failure_after_medicine_deduction_rolls_back_everything(): void
    {
        [$parent] = $this->scheduledFollowUp();
        $medicine = $this->medicine(8);
        $payload = $this->followUpPayload($parent, null, null, [
            'monitoring_data' => ['followUpTaskId' => 999999],
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 2,
            ]],
        ]);

        $this->postRecord($payload, (string) Str::uuid())->assertUnprocessable();

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertSame(8, $medicine->fresh()->quantity);
    }

    public function test_different_keys_create_distinct_valid_visits(): void
    {
        $payload = $this->payload();

        $this->postRecord($payload, (string) Str::uuid())->assertCreated();
        $this->postRecord($payload, (string) Str::uuid())->assertCreated();

        $this->assertDatabaseCount('health_records', 2);
    }

    public function test_database_unique_index_is_the_final_same_key_defense(): void
    {
        $key = (string) Str::uuid();
        HealthRecord::create([
            'idempotency_key' => $key,
            'idempotency_hash' => str_repeat('a', 64),
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
        ]);

        $this->expectException(QueryException::class);
        HealthRecord::create([
            'idempotency_key' => $key,
            'idempotency_hash' => str_repeat('b', 64),
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    private function postRecord(array $payload, string $key)
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/health-records', $payload);
    }

    private function payload(array $overrides = []): array
    {
        return [
            'patient_id' => $this->patient->id,
            'date_recorded' => '2026-07-19 09:30:00',
            'category' => 'General Consultation',
            'chief_complaint' => 'Routine consultation',
            ...$overrides,
        ];
    }

    private function followUpPayload(
        HealthRecord $parent,
        ?FollowUpTask $task,
        ?string $nextDate = null,
        array $overrides = []
    ): array {
        return $this->payload([
            'category' => $parent->category,
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'monitoring_data' => array_filter([
                'followUpTaskId' => $task?->id,
                'followUpStatus' => $nextDate ? 'Follow-up Required' : 'Routine Monitoring',
                'followUpDate' => $nextDate,
            ], fn (mixed $value): bool => $value !== null),
            ...$overrides,
        ]);
    }

    private function scheduledFollowUp(string $category = 'General Consultation'): array
    {
        $parent = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => $category,
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ]);
        $task = FollowUpTask::create([
            'health_record_id' => $parent->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->addWeek()->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $this->bhw->id,
        ]);

        return [$parent, $task];
    }

    private function medicine(int $quantity): Medicine
    {
        return Medicine::create([
            'name' => 'Test Medicine '.Str::random(5),
            'category' => 'Medicine',
            'quantity' => $quantity,
            'unit' => 'tablet',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->bhw->id,
        ]);
    }

    private function createPatient(string $firstName, string $lastName): Patient
    {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->bhw->id,
        ]);
    }

    private function createUser(
        string $name,
        string $email,
        string $role = User::ROLE_BHW,
        ?int $rhuId = null
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $role === User::ROLE_BHW ? $this->bhc->id : null,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
