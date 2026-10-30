<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuVisitStartTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Start RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Other Start RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Start BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
    }

    private function rhuUser(array $attributes = []): User
    {
        return User::create(['name' => 'Start Nurse', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function encoder(): User
    {
        return $this->rhuUser([
            'permissions' => [...StaffRoles::defaults('nurse'), 'consultations.encode'],
        ]);
    }

    private function visit(array $attributes = []): RhuVisitQueueEntry
    {
        $patient = Patient::create(['first_name' => 'Start', 'last_name' => uniqid(), 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);

        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('start-', true),
            ...$attributes,
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    public function test_start_mints_one_consultation_uuid_and_is_idempotent(): void
    {
        $visit = $this->visit();
        $user = $this->encoder();

        $first = $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertOk()
            ->assertJsonPath('data.status', RhuVisitQueueEntry::STATUS_IN_CONSULTATION);
        $uuid = $first->json('data.consultation_uuid');
        $this->assertNotEmpty($uuid);
        $this->assertArrayNotHasKey('assigned_doctor_id', $first->json('data'));
        $this->assertDatabaseCount('health_record_drafts', 0);

        $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertOk()
            ->assertJsonPath('data.id', $visit->id)
            ->assertJsonPath('data.consultation_uuid', $uuid);

        $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/resume")
            ->assertOk()
            ->assertJsonPath('data.consultation_uuid', $uuid);

        $this->assertSame(1, RhuVisitQueueEntry::where('consultation_uuid', $uuid)->count());
        $this->assertSame([], $first->json('data.continued_follow_up_task_ids'));
    }

    public function test_start_stores_only_the_selected_pending_follow_up_ids(): void
    {
        $visit = $this->visit();
        $user = $this->encoder();
        $selected = $this->pendingTask($visit, 'Hypertension review');
        $other = $this->pendingTask($visit, 'Wound review');

        $started = $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start", [
            'follow_up_task_ids' => [$selected->id],
        ])->assertOk();

        $this->assertSame([$selected->id], $started->json('data.continued_follow_up_task_ids'));
        $this->assertSame(FollowUpTask::STATE_PENDING, $selected->fresh()->state);
        $this->assertSame(FollowUpTask::STATE_PENDING, $other->fresh()->state);

        $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start", [
            'follow_up_task_ids' => [$other->id],
        ])->assertOk()->assertJsonPath('data.continued_follow_up_task_ids', [$selected->id]);

        $finalizer = $this->rhuUser([
            'email' => uniqid('finalizer-', true).'@example.test',
            'permissions' => [...StaffRoles::defaults('doctor'), 'consultations.finalize'],
        ]);
        $this->as($finalizer)->postJson("/api/rhu-visits/{$visit->id}/resume")
            ->assertOk()
            ->assertJsonPath('data.continued_follow_up_task_ids', [$selected->id]);
    }

    public function test_start_can_store_multiple_explicitly_selected_follow_up_ids(): void
    {
        $visit = $this->visit();
        $first = $this->pendingTask($visit, 'Hypertension review');
        $second = $this->pendingTask($visit, 'Diabetes review');

        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/start", [
            'follow_up_task_ids' => [$second->id, $first->id],
        ])->assertOk()->assertJsonPath('data.continued_follow_up_task_ids', [$second->id, $first->id]);
    }

    public function test_start_rejects_ineligible_or_foreign_follow_up_ids_and_stays_waiting(): void
    {
        $visit = $this->visit();
        $foreignVisit = $this->visit();
        $fulfilled = $this->pendingTask($visit, 'Already seen');
        $fulfilled->update(['state' => FollowUpTask::STATE_FULFILLED, 'fulfilled_at' => now()]);
        $foreign = $this->pendingTask($foreignVisit, 'Other patient');

        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/start", [
            'follow_up_task_ids' => [$foreign->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('follow_up_task_ids.0');

        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/start", [
            'follow_up_task_ids' => [$fulfilled->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('follow_up_task_ids.0');

        $this->assertSame(RhuVisitQueueEntry::STATUS_WAITING, $visit->fresh()->status);
        $this->assertNull($visit->fresh()->consultation_uuid);
    }

    public function test_resume_of_a_waiting_visit_is_conflict(): void
    {
        $visit = $this->visit();

        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/resume")
            ->assertStatus(409)
            ->assertJsonPath('code', 'VISIT_NOT_IN_CONSULTATION');
    }

    public function test_closed_visit_cannot_be_started(): void
    {
        $visit = $this->visit([
            'status' => RhuVisitQueueEntry::STATUS_CLOSED,
            'closed_at' => now(),
            'close_reason' => RhuVisitQueueEntry::CLOSE_REASON_LEFT,
        ]);

        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertStatus(409)
            ->assertJsonPath('code', 'VISIT_CLOSED');
    }

    public function test_start_without_encode_is_forbidden(): void
    {
        $visit = $this->visit();

        $this->as($this->rhuUser())->postJson("/api/rhu-visits/{$visit->id}/start")->assertForbidden();
        $this->as($this->rhuUser(['permissions' => ['patients.register', 'clinical.history']]))
            ->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertForbidden();
    }

    public function test_bhc_cannot_start_and_rhu_encoder_can_list_drafts(): void
    {
        $visit = $this->visit();
        $bhcUser = User::create(['name' => 'BHC', 'email' => 'start-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);

        $this->as($bhcUser)->postJson("/api/rhu-visits/{$visit->id}/start")->assertForbidden();
        $this->as($this->encoder())->getJson('/api/health-record-drafts')->assertOk();
    }

    public function test_finalize_only_can_resume_but_cannot_start(): void
    {
        $visit = $this->visit();
        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/start")->assertOk();

        $finalizer = $this->rhuUser([
            'email' => uniqid('finalizer-', true).'@example.test',
            'permissions' => [...StaffRoles::defaults('doctor'), 'consultations.finalize'],
        ]);

        $this->as($finalizer)->postJson("/api/rhu-visits/{$visit->id}/resume")
            ->assertOk()
            ->assertJsonPath('data.status', RhuVisitQueueEntry::STATUS_IN_CONSULTATION);

        $waiting = $this->visit();
        $this->as($finalizer)->postJson("/api/rhu-visits/{$waiting->id}/start")->assertForbidden();
    }

    public function test_other_rhu_visit_cannot_be_started(): void
    {
        $patient = Patient::create(['first_name' => 'Other', 'last_name' => 'Start', 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $this->otherRhu->id]);
        $visit = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->otherRhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('other-start-', true),
        ]);

        $this->as($this->encoder())->postJson("/api/rhu-visits/{$visit->id}/start")->assertNotFound();
    }

    private function pendingTask(RhuVisitQueueEntry $visit, string $purpose): FollowUpTask
    {
        $record = HealthRecord::create([
            'patient_id' => $visit->patient_id,
            'created_by' => $this->encoder()->id,
            'rural_health_unit_id' => $this->rhu->id,
            'category' => 'General Consultation',
            'chief_complaint' => $purpose,
        ]);

        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $visit->patient_id,
            'rural_health_unit_id' => $this->rhu->id,
            'due_date' => now()->toDateString(),
            'purpose' => $purpose,
            'state' => FollowUpTask::STATE_PENDING,
        ]);
    }
}
