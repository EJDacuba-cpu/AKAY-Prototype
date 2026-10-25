<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
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

    public function test_bhc_cannot_start_and_rhu_still_cannot_list_drafts(): void
    {
        $visit = $this->visit();
        $bhcUser = User::create(['name' => 'BHC', 'email' => 'start-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);

        $this->as($bhcUser)->postJson("/api/rhu-visits/{$visit->id}/start")->assertForbidden();
        $this->as($this->encoder())->getJson('/api/health-record-drafts')->assertForbidden();
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
}
