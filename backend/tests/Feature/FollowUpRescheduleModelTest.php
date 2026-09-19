<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Follow-up Module plan, Part B.1/B.2 - reschedule creates a new row instead
 * of mutating the original one, so a due date never moves and the Calendar
 * can keep showing the superseded entry on its original day.
 */
class FollowUpRescheduleModelTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Resched Model RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Resched Model BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Resched Model BHW',
            'email' => 'resched-model-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Resched',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    /** A Pending task, once rescheduled, becomes Rescheduled (superseded), not deleted. */
    public function test_rescheduling_a_pending_task_supersedes_it_with_a_new_row(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');

        $newTaskId = $this->reschedule($task, '2026-08-14')->json('data.id');

        $old = $task->fresh();
        $this->assertSame('2026-08-07', $old->due_date->toDateString());
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $old->state);
        $this->assertSame($newTaskId, $old->rescheduled_to_id);

        $new = FollowUpTask::find($newTaskId);
        $this->assertNotSame($task->id, $new->id);
        $this->assertSame('2026-08-14', $new->due_date->toDateString());
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $new->state);
        $this->assertNull($new->rescheduled_to_id);
        $this->assertSame($task->health_record_id, $new->health_record_id);
    }

    /** A No-Show task stays No-Show when rescheduled - it's terminal and already reads as "missed". */
    public function test_rescheduling_a_no_show_task_leaves_its_state_as_no_show(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_NO_SHOW, '2026-08-07');
        $task->update(['no_show_at' => now()]);

        $newTaskId = $this->reschedule($task, '2026-08-20')->json('data.id');

        $old = $task->fresh();
        $this->assertSame(FollowUpTask::STATE_NO_SHOW, $old->state);
        $this->assertSame($newTaskId, $old->rescheduled_to_id);

        $new = FollowUpTask::find($newTaskId);
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $new->state);
    }

    /** The List endpoint (GET /follow-up-tasks) shows only the current row after a reschedule. */
    public function test_index_shows_only_the_current_task_after_reschedule(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');
        $newTaskId = $this->reschedule($task, '2026-08-14')->json('data.id');

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/follow-up-tasks?per_page=100')
            ->assertOk();
        $allIds = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($newTaskId, $allIds);
        $this->assertNotContains($task->id, $allIds);
    }

    /** A superseded task can no longer be rescheduled, no-showed, or cancelled again through its own id. */
    public function test_a_superseded_task_is_no_longer_processable(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');
        $this->reschedule($task, '2026-08-14')->assertOk();

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", ['due_date' => '2026-09-01'])
            ->assertConflict();

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/no-show", [])
            ->assertConflict();

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/cancel", [])
            ->assertConflict();
    }

    /** The partial unique index still blocks two simultaneously-active rows for one health record. */
    public function test_database_prevents_two_simultaneously_active_tasks_for_one_record(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');

        $this->expectException(QueryException::class);

        FollowUpTask::create([
            'health_record_id' => $task->health_record_id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => '2026-08-09',
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $this->bhw->id,
            // rescheduled_to_id left null - this is what the constraint keys on.
        ]);
    }

    /** A superseded row (rescheduled_to_id set) does not collide with the active one. */
    public function test_a_superseded_and_its_active_replacement_can_coexist(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');
        $newTaskId = $this->reschedule($task, '2026-08-14')->json('data.id');

        $this->assertDatabaseCount('follow_up_tasks', 2);
        $this->assertNotNull(FollowUpTask::find($newTaskId));
        $this->assertNotNull($task->fresh());
    }

    private function schedule(string $state, string $dueDate): FollowUpTask
    {
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
        ]);

        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => $dueDate,
            'state' => $state,
            'created_by' => $this->bhw->id,
        ]);
    }

    private function reschedule(FollowUpTask $task, string $dueDate, array $overrides = [])
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
                'due_date' => $dueDate,
                ...$overrides,
            ]);
    }
}
