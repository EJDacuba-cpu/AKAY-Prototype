<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class FollowUpTaskSchedulingTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;
    private User $bhw;
    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Scheduling RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Scheduling BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = $this->user(
            'Scheduling BHW',
            'scheduling-bhw@example.test',
            $this->bhc->id
        );
        $this->patient = $this->patient('Scheduling', 'Patient', $this->bhc, $this->bhw);
    }

    public function test_general_consultation_follow_up_required_needs_a_date_and_time(): void
    {
        $this->postHealthRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'monitoring_data.followUpDate',
            ]);

        $this->postHealthRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-07',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'monitoring_data.followUpTime',
            ]);

        $response = $this->postHealthRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-07',
                'followUpTime' => '11:30',
                'followUpReason' => 'Deprecated camel-case reason.',
                'follow_up_reason' => 'Deprecated snake-case reason.',
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('follow_up_tasks', [
            'patient_id' => $this->patient->id,
            'due_date' => '2026-08-07 00:00:00',
            'due_time' => '11:30',
            'state' => FollowUpTask::STATE_PENDING,
        ]);
        $monitoringData = HealthRecord::findOrFail(
            $response->json('data.id')
        )->monitoring_data;
        $this->assertArrayNotHasKey('followUpReason', $monitoringData);
        $this->assertArrayNotHasKey('follow_up_reason', $monitoringData);
        $this->assertFalse(Schema::hasColumn('follow_up_tasks', 'reason'));
    }

    public function test_initial_health_record_save_creates_one_schedule_with_required_time(): void
    {
        $response = $this->postHealthRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-07',
                'followUpTime' => '11:30',
            ],
        ])->assertCreated();

        $recordId = $response->json('data.id');
        $this->assertDatabaseHas('follow_up_tasks', [
            'health_record_id' => $recordId,
            'patient_id' => $this->patient->id,
            'due_date' => '2026-08-07 00:00:00',
            'due_time' => '11:30',
        ]);
        $this->assertSame(
            1,
            FollowUpTask::where('health_record_id', $recordId)->count()
        );
    }

    public function test_follow_up_visit_requires_time_when_scheduling_another_visit(): void
    {
        $task = $this->schedule($this->patient, $this->bhw, $this->bhc);

        $payload = [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $task->health_record_id,
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-14',
            ],
        ];

        $this->postHealthRecord($payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'monitoring_data.followUpTime',
            ]);

        $payload['monitoring_data']['followUpTime'] = '10:30';
        $response = $this->postHealthRecord($payload)->assertCreated();

        $this->assertDatabaseHas('follow_up_tasks', [
            'health_record_id' => $response->json('data.id'),
            'due_date' => '2026-08-14 00:00:00',
            'due_time' => '10:30',
            'state' => FollowUpTask::STATE_PENDING,
        ]);
    }

    public function test_referral_disposition_ignores_stale_follow_up_fields(): void
    {
        $response = $this->postHealthRecord([
            'needs_referral' => true,
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-07',
                'followUpTime' => '11:30',
            ],
            'referral' => [
                'reason_for_referral' => 'Requires higher-level assessment.',
            ],
        ])->assertCreated();

        $this->assertDatabaseMissing('follow_up_tasks', [
            'health_record_id' => $response->json('data.id'),
        ]);
    }

    public function test_active_patient_lookup_returns_all_unrelated_episodes_in_schedule_order(): void
    {
        $later = $this->schedule($this->patient, $this->bhw, $this->bhc, 'Maternal', '2026-08-10', '09:00');
        $earlier = $this->schedule($this->patient, $this->bhw, $this->bhc, 'General Consultation', '2026-08-07', '14:00');
        $cancelled = $this->schedule($this->patient, $this->bhw, $this->bhc, 'TB DOTS / TB Monitoring', '2026-08-06', null);
        $cancelled->update([
            'state' => FollowUpTask::STATE_CANCELLED,
            'cancelled_at' => now(),
        ]);

        $response = $this->actingAs($this->bhw, 'sanctum')->getJson(
            "/api/follow-up-tasks?patient_id={$this->patient->id}&active=1"
        );

        $response->assertOk()->assertJsonCount(2, 'data');
        $this->assertSame(
            [$earlier->id, $later->id],
            collect($response->json('data'))->pluck('id')->all()
        );
    }

    public function test_one_active_task_is_returned_without_auto_linking_a_new_consultation(): void
    {
        $task = $this->schedule($this->patient, $this->bhw, $this->bhc);

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson("/api/follow-up-tasks?patient_id={$this->patient->id}&active=1")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $task->id);

        $response = $this->postHealthRecord()->assertCreated();

        $response
            ->assertJsonPath('data.visit_type', 'initial_consultation')
            ->assertJsonPath('data.parent_health_record_id', null);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertNull($task->fresh()->fulfilled_by_health_record_id);
    }

    public function test_active_patient_lookup_is_facility_scoped(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Other RHU']);
        $otherBhc = BarangayHealthCenter::create([
            'name' => 'Other BHC',
            'rural_health_unit_id' => $otherRhu->id,
        ]);
        $otherBhw = $this->user('Other BHW', 'other-bhw@example.test', $otherBhc->id);
        $otherPatient = $this->patient('Other', 'Patient', $otherBhc, $otherBhw);
        $this->schedule($otherPatient, $otherBhw, $otherBhc);

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson("/api/follow-up-tasks?patient_id={$otherPatient->id}&active=1")
            ->assertForbidden();
    }

    public function test_reschedule_updates_date_time_notes_and_rejects_terminal_tasks(): void
    {
        $task = $this->schedule($this->patient, $this->bhw, $this->bhc);

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
                'due_date' => '2026-08-12',
                'due_time' => '13:45',
                'reason' => 'Deprecated reason must be ignored.',
                'notes' => 'Patient requested an afternoon appointment.',
            ])
            ->assertOk()
            ->assertJsonPath('data.state', FollowUpTask::STATE_RESCHEDULED)
            ->assertJsonPath('data.due_time', '13:45')
            ->assertJsonPath(
                'data.notes',
                'Patient requested an afternoon appointment.'
            );
        $this->assertArrayNotHasKey('reason', $response->json('data'));

        $task->refresh()->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
        ]);

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
                'due_date' => '2026-08-20',
            ])
            ->assertConflict();
    }

    public function test_cancel_preserves_history_and_removes_task_from_active_lookup(): void
    {
        $task = $this->schedule($this->patient, $this->bhw, $this->bhc);

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/cancel", [
                'notes' => 'Patient transferred care.',
            ])
            ->assertOk()
            ->assertJsonPath('data.state', FollowUpTask::STATE_CANCELLED);

        $this->assertNotNull($task->fresh()->cancelled_at);
        $this->actingAs($this->bhw, 'sanctum')
            ->getJson("/api/follow-up-tasks?patient_id={$this->patient->id}&active=1")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/cancel")
            ->assertConflict();
    }

    public function test_database_prevents_one_visit_from_fulfilling_two_schedules(): void
    {
        $first = $this->schedule($this->patient, $this->bhw, $this->bhc);
        $second = $this->schedule(
            $this->patient,
            $this->bhw,
            $this->bhc,
            'Maternal',
            '2026-08-10'
        );
        $completedVisit = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $first->health_record_id,
        ]);
        $first->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $completedVisit->id,
        ]);

        $this->expectException(QueryException::class);
        $second->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $completedVisit->id,
        ]);
    }

    private function postHealthRecord(array $overrides = [])
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Routine consultation',
                ...$overrides,
            ]);
    }

    private function schedule(
        Patient $patient,
        User $user,
        BarangayHealthCenter $bhc,
        string $category = 'General Consultation',
        string $dueDate = '2026-08-07',
        ?string $dueTime = null
    ): FollowUpTask {
        $record = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $user->id,
            'barangay_health_center_id' => $bhc->id,
            'category' => $category,
        ]);

        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'due_date' => $dueDate,
            'due_time' => $dueTime,
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $user->id,
        ]);
    }

    private function patient(
        string $firstName,
        string $lastName,
        BarangayHealthCenter $bhc,
        User $user
    ): Patient {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'created_by' => $user->id,
        ]);
    }

    private function user(string $name, string $email, int $bhcId): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
        ]);
    }
}
