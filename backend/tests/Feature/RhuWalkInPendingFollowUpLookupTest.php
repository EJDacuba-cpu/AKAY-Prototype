<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuWalkInPendingFollowUpLookupTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Follow-up RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Follow-up BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = $this->rhuUser();
    }

    private function rhuUser(array $attributes = []): User
    {
        return User::create(['name' => 'Follow-up Nurse', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create(['first_name' => 'Follow', 'last_name' => 'Up', 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function task(Patient $patient, array $attributes = []): FollowUpTask
    {
        $record = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $this->nurse->id,
            'rural_health_unit_id' => $this->rhu->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'SecretComplaint',
        ]);

        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $patient->id,
            'rural_health_unit_id' => $this->rhu->id,
            'due_date' => now()->toDateString(),
            'purpose' => 'SecretPurpose',
            'notes' => 'SecretNotes',
            'state' => FollowUpTask::STATE_PENDING,
            ...$attributes,
        ]);
    }

    private function lookup(Patient $patient, ?User $user = null)
    {
        Sanctum::actingAs($user ?? $this->nurse, ['akay:access']);

        return $this->getJson('/api/rhu-visits/patients/'.$patient->id.'/pending-follow-ups');
    }

    public function test_returns_active_follow_ups_without_clinical_fields(): void
    {
        $patient = $this->patient(['medical_background' => ['allergies' => ['items' => [['allergen' => 'PrivateAllergen']]]]]);
        $overdue = $this->task($patient, [
            'due_date' => now()->subDay()->toDateString(),
            'purpose' => 'SecretPurposeOverdue',
        ]);
        $pending = $this->task($patient, [
            'due_date' => now()->addDay()->toDateString(),
            'purpose' => 'SecretPurposePending',
        ]);

        $response = $this->lookup($patient)->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.follow_ups.0.id', $overdue->id)
            ->assertJsonPath('data.follow_ups.0.due_date', $overdue->due_date->toDateString())
            ->assertJsonPath('data.follow_ups.0.state', FollowUpTask::STATE_PENDING)
            ->assertJsonPath('data.follow_ups.0.is_overdue', true)
            ->assertJsonPath('data.follow_ups.1.id', $pending->id)
            ->assertJsonPath('data.follow_ups.1.is_overdue', false);

        $this->assertSame(
            ['id', 'due_date', 'state', 'is_overdue'],
            array_keys($response->json('data.follow_ups.0'))
        );
        $content = $response->getContent();
        foreach (['SecretPurpose', 'SecretNotes', 'SecretComplaint', 'PrivateAllergen', 'medical_background', 'purpose'] as $hidden) {
            $this->assertStringNotContainsString($hidden, $content);
        }
    }

    public function test_excludes_fulfilled_cancelled_and_superseded_tasks(): void
    {
        $patient = $this->patient();
        $active = $this->task($patient);
        $this->task($patient, [
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
            'purpose' => 'FulfilledPurpose',
        ]);
        $this->task($patient, [
            'state' => FollowUpTask::STATE_CANCELLED,
            'cancelled_at' => now(),
            'purpose' => 'CancelledPurpose',
        ]);
        $replacement = $this->task($patient, ['purpose' => 'ReplacementPurpose']);
        $this->task($patient, [
            'state' => FollowUpTask::STATE_RESCHEDULED,
            'rescheduled_to_id' => $replacement->id,
            'rescheduled_at' => now(),
            'purpose' => 'SupersededPurpose',
        ]);

        $this->lookup($patient)->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.follow_ups.0.id', $active->id)
            ->assertJsonPath('data.follow_ups.1.id', $replacement->id);
    }

    public function test_other_rhu_follow_up_is_hidden(): void
    {
        $patient = $this->patient();
        $otherRhu = RuralHealthUnit::create(['name' => 'Other Follow-up RHU', 'status' => 'active']);
        $this->task($patient, ['rural_health_unit_id' => $otherRhu->id]);

        $this->lookup($patient)->assertOk()->assertJsonPath('data.count', 0)->assertJsonPath('data.follow_ups', []);
    }

    public function test_lookup_does_not_create_or_mutate_queue_or_tasks(): void
    {
        $patient = $this->patient();
        $task = $this->task($patient);

        $this->lookup($patient)->assertOk()->assertJsonPath('data.count', 1);

        $this->assertSame(0, RhuVisitQueueEntry::count());
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertNull($task->fresh()->fulfilled_at);
    }

    public function test_without_register_intake_or_manage_is_forbidden(): void
    {
        $user = $this->rhuUser(['permissions' => ['clinical.history']]);

        $this->lookup($this->patient(), $user)->assertForbidden();
    }

    public function test_register_only_may_read(): void
    {
        $user = $this->rhuUser(['permissions' => ['patients.register']]);
        $patient = $this->patient();
        $this->task($patient);

        $this->lookup($patient, $user)->assertOk()->assertJsonPath('data.count', 1);
    }

    public function test_inaccessible_patient_is_forbidden(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Foreign Follow-up RHU', 'status' => 'active']);
        $patient = $this->patient(['rural_health_unit_id' => $otherRhu->id, 'barangay_health_center_id' => null]);

        $this->lookup($patient)->assertForbidden();
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }
}
