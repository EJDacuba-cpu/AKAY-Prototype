<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\FollowUpTaskSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Regression coverage for the follow-up task re-sync bugs: GET /follow-up-tasks used to
 * call syncEligibleRecordsForUser on every request, which re-derived every task from its
 * health record's monitoring_data snapshot and clobbered state the task itself owns
 * (a reschedule date, or the pending/no_show state and id of a chained follow-up task).
 */
class FollowUpTaskSyncServiceTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;
    private User $bhw;
    private Patient $patient;
    private FollowUpTaskSyncService $sync;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Sync RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Sync BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Sync BHW',
            'email' => 'sync-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Sync',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->bhw->id,
        ]);
        $this->sync = app(FollowUpTaskSyncService::class);
    }

    public function test_resyncing_a_record_does_not_undo_a_reschedule(): void
    {
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-01',
            ],
        ]);
        $this->sync->syncRecord($record, $this->bhw);
        $task = FollowUpTask::where('health_record_id', $record->id)->firstOrFail();

        $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
                'due_date' => '2026-08-10',
                'notes' => 'Patient asked to move the visit.',
            ])
            ->assertOk();

        $rescheduled = $task->fresh();
        $this->assertSame('2026-08-10', $rescheduled->due_date->toDateString());
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $rescheduled->state);

        // Simulate the record-driven re-sync that used to run on every list load.
        $this->sync->syncRecord($record->fresh(), $this->bhw);

        $afterSync = $task->fresh();
        $this->assertSame(
            '2026-08-10',
            $afterSync->due_date->toDateString(),
            'Re-syncing the originating record must not revert a user-set reschedule date.'
        );
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $afterSync->state);
        $this->assertSame('Patient asked to move the visit.', $afterSync->notes);
    }

    public function test_resyncing_a_chained_follow_up_visit_preserves_the_next_tasks_identity(): void
    {
        $original = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-01',
            ],
        ]);
        $this->sync->syncRecord($original, $this->bhw);

        // Record the follow-up visit; it schedules a second follow-up of its own.
        $followUpVisit = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $original->id,
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-08-15',
            ],
        ]);
        $this->sync->syncRecord($followUpVisit, $this->bhw);

        $chainedTask = FollowUpTask::where('health_record_id', $followUpVisit->id)->firstOrFail();
        $chainedTaskId = $chainedTask->id;

        // Mark it no-show, the way the overdue sweep would.
        $chainedTask->update([
            'state' => FollowUpTask::STATE_NO_SHOW,
            'no_show_at' => now(),
        ]);

        // Re-sync the same record again (what the old per-request full re-sync did).
        $this->sync->syncRecord($followUpVisit->fresh(), $this->bhw);

        $afterSync = FollowUpTask::where('health_record_id', $followUpVisit->id)->first();
        $this->assertNotNull($afterSync);
        $this->assertSame(
            $chainedTaskId,
            $afterSync->id,
            'Re-syncing must not delete and recreate the chained task under a new id, or notification deep links break.'
        );
        $this->assertSame(
            FollowUpTask::STATE_NO_SHOW,
            $afterSync->state,
            'Re-syncing must not reset a no-show/rescheduled chained task back to pending.'
        );
    }
}
