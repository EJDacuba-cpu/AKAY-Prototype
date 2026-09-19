<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Follow-up Module plan, Part A.4/B.3 - GET /follow-up-tasks/calendar shows
 * the full history for a date range (superseded rows included), grouped by
 * due_date, unlike the List endpoint which only shows what's actionable now.
 */
class FollowUpCalendarEndpointTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Calendar RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Calendar BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Calendar BHW',
            'email' => 'calendar-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Calendar',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    public function test_calendar_groups_tasks_by_due_date(): void
    {
        $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');
        $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');
        $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-09');

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/follow-up-tasks/calendar?start=2026-08-01&end=2026-08-31')
            ->assertOk();

        $this->assertCount(2, $response->json('data.2026-08-07'));
        $this->assertCount(1, $response->json('data.2026-08-09'));
    }

    /** Unlike the List endpoint, Calendar keeps showing a superseded row on its original day. */
    public function test_calendar_includes_superseded_rows_on_their_original_day(): void
    {
        $task = $this->schedule(FollowUpTask::STATE_PENDING, '2026-08-07');
        $newTaskId = $this->actingAs($this->bhw, 'sanctum')
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", ['due_date' => '2026-08-20'])
            ->json('data.id');

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/follow-up-tasks/calendar?start=2026-08-01&end=2026-08-31')
            ->assertOk();

        $onOriginalDay = collect($response->json('data.2026-08-07'))->pluck('id')->all();
        $onNewDay = collect($response->json('data.2026-08-20'))->pluck('id')->all();

        $this->assertContains($task->id, $onOriginalDay);
        $this->assertContains($newTaskId, $onNewDay);

        // But the List endpoint must show only the current one.
        $listIds = collect(
            $this->actingAs($this->bhw, 'sanctum')
                ->getJson('/api/follow-up-tasks?per_page=100')
                ->json('data.data')
        )->pluck('id')->all();
        $this->assertContains($newTaskId, $listIds);
        $this->assertNotContains($task->id, $listIds);
    }

    public function test_calendar_requires_a_date_range(): void
    {
        $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/follow-up-tasks/calendar')
            ->assertUnprocessable();
    }

    public function test_calendar_is_facility_scoped(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Other Calendar RHU']);
        $otherBhc = BarangayHealthCenter::create([
            'name' => 'Other Calendar BHC',
            'rural_health_unit_id' => $otherRhu->id,
        ]);
        $otherBhw = User::create([
            'name' => 'Other Calendar BHW',
            'email' => 'other-calendar-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $otherBhc->id,
        ]);
        $otherPatient = Patient::create([
            'first_name' => 'Other',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $otherBhc->id,
        ]);
        $otherRecord = HealthRecord::create([
            'patient_id' => $otherPatient->id,
            'created_by' => $otherBhw->id,
            'barangay_health_center_id' => $otherBhc->id,
            'category' => 'General Consultation',
        ]);
        FollowUpTask::create([
            'health_record_id' => $otherRecord->id,
            'patient_id' => $otherPatient->id,
            'barangay_health_center_id' => $otherBhc->id,
            'due_date' => '2026-08-07',
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $otherBhw->id,
        ]);

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/follow-up-tasks/calendar?start=2026-08-01&end=2026-08-31')
            ->assertOk();

        $this->assertSame([], $response->json('data'));
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
}
