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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class FollowUpConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;
    private BarangayHealthCenter $bhc;
    private User $bhw;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Concurrency RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Concurrency BHC',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->user(
            'Concurrency BHW',
            'concurrency-bhw@example.test',
            User::ROLE_BHW,
            $this->bhc->id
        );
        $this->user(
            'Concurrency RHU Staff',
            'concurrency-rhu@example.test',
            User::ROLE_RHU_STAFF,
            $this->rhu->id
        );
        $this->patient = $this->patient('Concurrency', 'Patient', $this->bhc);
    }

    public function test_one_different_key_submission_wins_and_the_second_has_no_effects(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $medicine = $this->medicine(20);
        $payload = $this->followUpPayload($parent, $task, [
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-15',
            ],
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 3,
            ]],
            'needs_referral' => true,
            'referral' => [
                'reason_for_referral' => 'Concurrent processing test.',
            ],
        ]);

        $winner = $this->postRecord($this->bhw, $payload, (string) Str::uuid())
            ->assertCreated();
        $winnerRecordId = $winner->json('data.id');
        $nextTaskId = $winner->json('result.next_follow_up_task_id');
        $referralId = $winner->json('result.referral_id');

        $loser = $this->postRecord($this->bhw, $payload, (string) Str::uuid())
            ->assertConflict()
            ->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED')
            ->assertJsonPath('follow_up_task_id', $task->id)
            ->assertJsonPath('health_record_id', $winnerRecordId);

        $this->assertSame($winnerRecordId, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertNotNull($task->fresh()->fulfilled_at);
        $this->assertDatabaseCount('health_records', 2);
        $this->assertSame(17, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 1);
        $this->assertSame(1, FollowUpTask::where('health_record_id', $winnerRecordId)->count());
        $this->assertSame($nextTaskId, FollowUpTask::where('health_record_id', $winnerRecordId)->value('id'));
        $this->assertSame(1, Referral::whereKey($referralId)->count());
        $this->assertSame(2, AuditLog::count());
        $this->assertSame('FOLLOW_UP_ALREADY_PROCESSED', $loser->json('code'));
    }

    public function test_phase_2a_replay_and_payload_mismatch_take_precedence(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $payload = $this->followUpPayload($parent, $task);
        $key = (string) Str::uuid();

        $winner = $this->postRecord($this->bhw, $payload, $key)->assertCreated();
        $recordId = $winner->json('data.id');

        $this->postRecord($this->bhw, $payload, $key)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('result.health_record_id', $recordId)
            ->assertJsonMissing(['code' => 'FOLLOW_UP_ALREADY_PROCESSED']);

        $this->postRecord($this->bhw, [
            ...$payload,
            'chief_complaint' => 'Changed after successful submission',
        ], $key)
            ->assertConflict()
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');

        $this->assertDatabaseCount('health_records', 2);
    }

    public function test_pending_no_show_and_rescheduled_are_the_only_processable_states(): void
    {
        foreach ([
            FollowUpTask::STATE_PENDING,
            FollowUpTask::STATE_NO_SHOW,
            FollowUpTask::STATE_RESCHEDULED,
        ] as $index => $state) {
            $patient = $index === 0
                ? $this->patient
                : $this->patient("State {$index}", 'Patient', $this->bhc);
            [$parent, $task] = $this->scheduledFollowUp('General Consultation', $patient);
            $task->update([
                'state' => $state,
                'no_show_at' => $state === FollowUpTask::STATE_NO_SHOW ? now() : null,
                'rescheduled_at' => $state === FollowUpTask::STATE_RESCHEDULED ? now() : null,
            ]);

            $this->postRecord(
                $this->bhw,
                $this->followUpPayload($parent, $task, [], $patient),
                (string) Str::uuid()
            )->assertCreated();

            $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        }
    }

    public function test_fulfilled_task_returns_conflict_and_cannot_be_rescheduled_or_marked_no_show(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $completedRecord = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
        ]);
        $task->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $completedRecord->id,
        ]);

        $this->postRecord(
            $this->bhw,
            $this->followUpPayload($parent, $task),
            (string) Str::uuid()
        )
            ->assertConflict()
            ->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED')
            ->assertJsonPath('health_record_id', $completedRecord->id);

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
                'due_date' => '2026-09-01',
            ])
            ->assertConflict()
            ->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/no-show", [])
            ->assertConflict()
            ->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');

        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        $this->assertSame($completedRecord->id, $task->fresh()->fulfilled_by_health_record_id);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_patient_and_facility_mismatches_create_no_effects(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $otherPatient = $this->patient('Other', 'Patient', $this->bhc);

        $this->postRecord($this->bhw, [
            ...$this->followUpPayload($parent, $task),
            'patient_id' => $otherPatient->id,
        ], (string) Str::uuid())
            ->assertUnprocessable();

        $otherRhu = RuralHealthUnit::create(['name' => 'Other Concurrency RHU']);
        $otherBhc = BarangayHealthCenter::create([
            'name' => 'Other Concurrency BHC',
            'rural_health_unit_id' => $otherRhu->id,
        ]);
        $otherBhw = $this->user(
            'Other Concurrency BHW',
            'other-concurrency-bhw@example.test',
            User::ROLE_BHW,
            $otherBhc->id
        );

        $this->postRecord(
            $otherBhw,
            $this->followUpPayload($parent, $task),
            (string) Str::uuid()
        )->assertForbidden();

        $this->assertNull($task->fresh()->fulfilled_at);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_rhu_staff_cannot_process_a_bhc_follow_up_task(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $this->patient->update(['rural_health_unit_id' => $this->rhu->id]);
        $parent->update(['rural_health_unit_id' => $this->rhu->id]);
        $rhuStaff = User::where('role', User::ROLE_RHU_STAFF)->firstOrFail();

        $this->postRecord(
            $rhuStaff,
            $this->followUpPayload($parent, $task),
            (string) Str::uuid()
        )->assertForbidden();

        $this->assertNull($task->fresh()->fulfilled_at);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_medicine_failure_after_lock_leaves_task_active(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $medicine = $this->medicine(2);
        $payload = $this->followUpPayload($parent, $task, [
            'dispensed_medicines' => [[
                'medicine_id' => $medicine->id,
                'quantity' => 3,
            ]],
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-20',
            ],
        ]);

        $this->postRecord($this->bhw, $payload, (string) Str::uuid())
            ->assertUnprocessable();

        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertNull($task->fresh()->fulfilled_at);
        $this->assertSame(2, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('follow_up_tasks', 1);
    }

    public function test_referral_failure_after_lock_rolls_back_completion_and_next_task(): void
    {
        [$parent, $task] = $this->scheduledFollowUp();
        $this->bhc->update(['rural_health_unit_id' => null]);
        $payload = $this->followUpPayload($parent, $task, [
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-25',
            ],
            'needs_referral' => true,
            'referral' => [
                'reason_for_referral' => 'Referral rollback test.',
            ],
        ]);

        $this->postRecord($this->bhw, $payload, (string) Str::uuid())
            ->assertUnprocessable();

        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertNull($task->fresh()->fulfilled_at);
        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('follow_up_tasks', 1);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_final_epi_follow_up_creates_no_next_task(): void
    {
        [$parent, $task] = $this->scheduledFollowUp('Immunization');
        $payload = $this->followUpPayload($parent, $task, [
            'immunization_data' => [
                'vaccineEntries' => [[
                    'vaccineName' => 'MCV 2',
                    'dateGiven' => '2026-07-19',
                ]],
            ],
        ]);

        $response = $this->postRecord($this->bhw, $payload, (string) Str::uuid())
            ->assertCreated()
            ->assertJsonPath('result.next_follow_up_task_id', null);

        $this->assertSame($response->json('data.id'), $task->fresh()->fulfilled_by_health_record_id);
        $this->assertDatabaseCount('follow_up_tasks', 1);
    }

    public function test_direct_non_follow_up_records_and_different_keys_remain_allowed(): void
    {
        $payload = [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Independent consultation',
        ];

        $this->postRecord($this->bhw, $payload, (string) Str::uuid())->assertCreated();
        $this->postRecord($this->bhw, $payload, (string) Str::uuid())->assertCreated();

        $this->assertDatabaseCount('health_records', 2);
    }

    private function postRecord(User $user, array $payload, string $key)
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/health-records', $payload);
    }

    private function followUpPayload(
        HealthRecord $parent,
        FollowUpTask $task,
        array $overrides = [],
        ?Patient $patient = null
    ): array {
        return [
            'patient_id' => ($patient ?? $this->patient)->id,
            'date_recorded' => '2026-07-19 10:00:00',
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'category' => $parent->category,
            'chief_complaint' => 'Scheduled return visit',
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Routine Monitoring',
            ],
            ...$overrides,
        ];
    }

    private function scheduledFollowUp(
        string $category = 'General Consultation',
        ?Patient $patient = null
    ): array {
        $patient ??= $this->patient;
        $parent = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => $category,
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-01',
            ],
        ]);
        $task = FollowUpTask::create([
            'health_record_id' => $parent->id,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => '2026-08-01',
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $this->bhw->id,
        ]);

        return [$parent, $task];
    }

    private function medicine(int $quantity): Medicine
    {
        return Medicine::create([
            'name' => 'Concurrency Medicine '.Str::random(5),
            'category' => 'Medicine',
            'quantity' => $quantity,
            'unit' => 'tablet',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->bhw->id,
        ]);
    }

    private function patient(
        string $firstName,
        string $lastName,
        BarangayHealthCenter $bhc
    ): Patient {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'created_by' => $this->bhw?->id,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        int $facilityId
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $role === User::ROLE_BHW ? $facilityId : null,
            'rural_health_unit_id' => $role === User::ROLE_RHU_STAFF ? $facilityId : null,
        ]);
    }
}
