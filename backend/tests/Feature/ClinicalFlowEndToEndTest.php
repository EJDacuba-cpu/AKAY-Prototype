<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The whole clinical path in one pass, at the API level:
 *
 *   patient -> consultation -> Next Action -> Routine / Follow-up / Referral
 *   -> the module that disposition lands in.
 *
 * Each Next Action branch is asserted end-to-end rather than in isolation,
 * because the parts that break are the handoffs: a scheduled follow-up that
 * never shows up in the Follow-ups list, a referral that leaves the record
 * reading "Routine", or a follow-up visit that fails to close the task it was
 * recorded against.
 */
class ClinicalFlowEndToEndTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Flow RHU', 'status' => 'active']);
        $this->seedAvailableProvider($this->rhu);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Flow BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Flow BHW',
            'email' => 'flow-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Flow',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    /** Next Action = No Follow-up: the record closes as Routine and schedules nothing. */
    public function test_routine_disposition_creates_no_follow_up_and_reads_routine(): void
    {
        $recordId = $this->postRecord([
            'monitoring_data' => ['followUpStatus' => 'Completed'],
        ])->assertCreated()->json('result.health_record_id');

        $this->assertSame('Routine', HealthRecord::findOrFail($recordId)->outcome);
        $this->assertDatabaseCount('follow_up_tasks', 0);
    }

    /**
     * Next Action = Schedule Follow-up: the task is created by the save, the
     * record reads Follow-up, and the task is visible in both Follow-ups
     * surfaces (the List endpoint and the Calendar endpoint).
     */
    public function test_scheduled_follow_up_appears_in_the_follow_ups_module(): void
    {
        $dueDate = '2026-10-05';
        $recordId = $this->postRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => $dueDate,
                'followUpTime' => '09:30',
            ],
        ])->assertCreated()->json('result.health_record_id');

        $task = FollowUpTask::where('health_record_id', $recordId)->sole();
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->state);
        $this->assertSame($dueDate, $task->due_date->toDateString());
        $this->assertSame('Follow-up', HealthRecord::findOrFail($recordId)->outcome);

        $listIds = collect(
            $this->actingAs($this->bhw, 'sanctum')
                ->getJson('/api/follow-up-tasks?per_page=100')
                ->assertOk()
                ->json('data.data')
        )->pluck('id')->all();
        $this->assertContains($task->id, $listIds);

        $calendarIds = collect(
            $this->actingAs($this->bhw, 'sanctum')
                ->getJson('/api/follow-up-tasks/calendar?start=2026-10-01&end=2026-10-31')
                ->assertOk()
                ->json("data.{$dueDate}")
        )->pluck('id')->all();
        $this->assertContains($task->id, $calendarIds);
    }

    /**
     * Recording the follow-up visit against that task closes it and links the
     * new record back to the original consultation.
     */
    public function test_follow_up_visit_fulfils_the_task_and_links_to_the_parent_record(): void
    {
        $parentId = $this->postRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-10-05',
                'followUpTime' => '09:30',
            ],
        ])->assertCreated()->json('result.health_record_id');
        $task = FollowUpTask::where('health_record_id', $parentId)->sole();

        $visitId = $this->postRecord([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parentId,
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'followUpStatus' => 'Completed',
            ],
        ])->assertCreated()->json('result.health_record_id');

        $task->refresh();
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->state);
        $this->assertSame($visitId, $task->fulfilled_by_health_record_id);

        $visit = HealthRecord::findOrFail($visitId);
        $this->assertSame($parentId, $visit->parent_health_record_id);
        $this->assertSame('follow_up_visit', $visit->visit_type);

        // The closed task drops out of the action queue but stays on the calendar.
        $listIds = collect(
            $this->actingAs($this->bhw, 'sanctum')
                ->getJson('/api/follow-up-tasks?per_page=100&active=1')
                ->json('data.data')
        )->pluck('id')->all();
        $this->assertNotContains($task->id, $listIds);

        $calendarIds = collect(
            $this->actingAs($this->bhw, 'sanctum')
                ->getJson('/api/follow-up-tasks/calendar?start=2026-10-01&end=2026-10-31')
                ->json('data.2026-10-05')
        )->pluck('id')->all();
        $this->assertContains($task->id, $calendarIds);
    }

    /**
     * Next Action = Referral: the referral is created with the record in one
     * submission, and the record reads Referred.
     */
    public function test_referral_disposition_creates_the_referral_and_reads_referred(): void
    {
        $response = $this->postRecord([
            'needs_referral' => true,
            'monitoring_data' => ['followUpStatus' => 'Completed'],
            'referral' => [
                'urgency_level' => Referral::ATTENTION_ROUTINE,
                'reason_for_referral' => 'Requires RHU assessment.',
            ],
        ])->assertCreated();

        $recordId = $response->json('result.health_record_id');
        $referralId = $response->json('result.referral_id');

        $this->assertNotNull($referralId);
        $referral = Referral::findOrFail($referralId);
        $this->assertSame($recordId, $referral->health_record_id);
        $this->assertSame($this->rhu->id, $referral->rural_health_unit_id);

        $record = HealthRecord::findOrFail($recordId);
        $this->assertSame('Referred', $record->outcome);
        // Referral wins over any follow-up, and no task is left dangling.
        $this->assertDatabaseCount('follow_up_tasks', 0);
    }

    /** The record list a BHW opens carries the resolved Outcome for every row. */
    public function test_health_records_list_exposes_the_resolved_outcome(): void
    {
        $this->postRecord([
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => '2026-10-05',
                'followUpTime' => '09:30',
            ],
        ])->assertCreated();

        $rows = $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/health-records?per_page=50')
            ->assertOk()
            ->json('data.data');

        $this->assertNotEmpty($rows);
        $this->assertSame('Follow-up', $rows[0]['outcome']);
        $this->assertArrayHasKey('outcome_sub_label', $rows[0]);
    }

    private function postRecord(array $overrides = [])
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'date_recorded' => '2026-09-19 09:00:00',
                'category' => 'General Consultation',
                'chief_complaint' => 'Cough and colds',
                ...$overrides,
            ]);
    }
}
