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

class FollowUpEpisodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_details_return_the_explicit_episode_in_visit_and_schedule_order(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Episode RHU']);
        $bhc = BarangayHealthCenter::create([
            'name' => 'Episode BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $bhw = User::create([
            'name' => 'Episode BHW',
            'email' => 'episode-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        $patient = Patient::create([
            'first_name' => 'Episode',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'created_by' => $bhw->id,
        ]);

        $initial = $this->record($patient, $bhw, $bhc, null, '2026-07-01 08:00:00');
        $firstFollowUp = $this->record($patient, $bhw, $bhc, $initial, '2026-07-08 08:00:00');
        $secondFollowUp = $this->record($patient, $bhw, $bhc, $firstFollowUp, '2026-07-15 08:00:00');

        $firstTask = $this->fulfilledTask($initial, $firstFollowUp, $patient, $bhw, $bhc, '2026-07-08');
        $secondTask = $this->fulfilledTask($firstFollowUp, $secondFollowUp, $patient, $bhw, $bhc, '2026-07-15');
        $pendingTask = FollowUpTask::create([
            'health_record_id' => $secondFollowUp->id,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'due_date' => '2026-07-22',
            'due_time' => '09:30',
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $bhw->id,
        ]);

        $response = $this->actingAs($bhw, 'sanctum')
            ->getJson("/api/health-records/{$firstFollowUp->id}")
            ->assertOk()
            ->assertJsonPath('data.follow_up_episode.original_record.id', $initial->id)
            ->assertJsonPath('data.follow_up_episode.pending_next_follow_up.id', $pendingTask->id);

        $this->assertSame(
            [$initial->id, $firstFollowUp->id, $secondFollowUp->id],
            collect($response->json('data.follow_up_episode.records'))->pluck('id')->all()
        );
        $this->assertSame(
            [$firstTask->id, $secondTask->id, $pendingTask->id],
            collect($response->json('data.follow_up_episode.tasks'))->pluck('id')->all()
        );
        $response
            ->assertJsonPath(
                'data.follow_up_episode.tasks.0.fulfilled_by_health_record_id',
                $firstFollowUp->id
            )
            ->assertJsonPath(
                'data.follow_up_episode.tasks.1.fulfilled_by_health_record_id',
                $secondFollowUp->id
            );
    }

    private function record(
        Patient $patient,
        User $bhw,
        BarangayHealthCenter $bhc,
        ?HealthRecord $parent,
        string $date
    ): HealthRecord {
        return HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $bhw->id,
            'barangay_health_center_id' => $bhc->id,
            'category' => 'General Consultation',
            'visit_type' => $parent ? 'follow_up_visit' : 'initial_consultation',
            'parent_health_record_id' => $parent?->id,
            'date_recorded' => $date,
        ]);
    }

    private function fulfilledTask(
        HealthRecord $source,
        HealthRecord $result,
        Patient $patient,
        User $bhw,
        BarangayHealthCenter $bhc,
        string $dueDate
    ): FollowUpTask {
        return FollowUpTask::create([
            'health_record_id' => $source->id,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'due_date' => $dueDate,
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'fulfilled_by_health_record_id' => $result->id,
            'created_by' => $bhw->id,
        ]);
    }
}
