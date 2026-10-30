<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuVisitCloseTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Close RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Other Close RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Close BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = $this->rhuUser($this->rhu);
    }

    private function rhuUser(RuralHealthUnit $rhu, array $attributes = []): User
    {
        return User::create(['name' => 'Close Nurse', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, ...$attributes]);
    }

    private function visit(RuralHealthUnit $rhu, array $attributes = []): RhuVisitQueueEntry
    {
        $patient = Patient::create(['first_name' => 'Close', 'last_name' => uniqid(), 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);

        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('close-', true),
            ...$attributes,
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    public function test_waiting_visit_closes_with_an_audited_reason(): void
    {
        $visit = $this->visit($this->rhu);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_LEFT,
        ])->assertOk()
            ->assertJsonPath('data.id', $visit->id)
            ->assertJsonPath('data.status', RhuVisitQueueEntry::STATUS_CLOSED)
            ->assertJsonPath('data.close_reason', RhuVisitQueueEntry::CLOSE_REASON_LEFT)
            ->assertJsonPath('data.close_note', null);

        $visit->refresh();
        $this->assertNotNull($visit->closed_at);
        $this->assertSame($this->nurse->id, $visit->closed_by);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $this->nurse->id,
            'action' => 'visit_closed',
            'module' => 'rhu_visit_queue',
        ]);
        $this->assertStringContainsString("visit_id={$visit->id}", AuditLog::where('action', 'visit_closed')->value('description'));
        $this->as($this->nurse)->getJson('/api/rhu-visits')->assertJsonMissingPath('data.0.id');
    }

    public function test_other_requires_a_note(): void
    {
        $visit = $this->visit($this->rhu);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_OTHER,
        ])->assertUnprocessable()->assertJsonValidationErrors('note');

        $this->assertNull($visit->fresh()->closed_at);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_OTHER,
            'note' => 'Family asked to leave',
        ])->assertOk()->assertJsonPath('data.close_note', 'Family asked to leave');
    }

    public function test_in_consultation_visit_cannot_be_closed(): void
    {
        $visit = $this->visit($this->rhu, [
            'status' => RhuVisitQueueEntry::STATUS_IN_CONSULTATION,
            'consultation_uuid' => '11111111-1111-1111-1111-111111111111',
        ]);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_MISTAKE,
        ])->assertStatus(409)->assertJsonPath('code', 'VISIT_NOT_WAITING');

        $this->assertNull($visit->fresh()->closed_at);
    }

    public function test_other_rhu_visit_is_not_found(): void
    {
        $visit = $this->visit($this->otherRhu);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_LEFT,
        ])->assertNotFound();
    }

    public function test_bhc_and_admin_cannot_close(): void
    {
        $visit = $this->visit($this->rhu);
        $bhcUser = User::create(['name' => 'BHC', 'email' => 'close-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);
        $admin = User::create(['name' => 'Admin', 'email' => 'close-admin@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'admin']);

        foreach ([$bhcUser, $admin] as $user) {
            $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/close", [
                'reason' => RhuVisitQueueEntry::CLOSE_REASON_LEFT,
            ])->assertForbidden();
        }
    }

    public function test_closing_a_referred_visit_does_not_change_referral_status(): void
    {
        $patient = Patient::create(['first_name' => 'Referred', 'last_name' => 'Close', 'sex' => 'Female', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-CLOSE-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Close test',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'referral_id' => $referral->id,
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => 'referral-'.$referral->id,
        ]);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_LEFT,
        ])->assertOk();

        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_closed_visit_can_be_checked_in_again_the_same_day(): void
    {
        $visit = $this->visit($this->rhu);

        $this->as($this->nurse)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_MISTAKE,
        ])->assertOk();

        $this->as($this->nurse)->postJson('/api/rhu-visits', [
            'patient_id' => $visit->patient_id,
            'check_in_key' => 'key-after-close',
        ])->assertCreated()->assertJsonPath('data.status', RhuVisitQueueEntry::STATUS_WAITING);

        $this->assertSame(2, RhuVisitQueueEntry::where('patient_id', $visit->patient_id)->count());
    }

    public function test_user_without_patients_register_cannot_close(): void
    {
        $visit = $this->visit($this->rhu);
        $user = $this->rhuUser($this->rhu, ['permissions' => ['clinical.history']]);

        $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/close", [
            'reason' => RhuVisitQueueEntry::CLOSE_REASON_LEFT,
        ])->assertForbidden();
    }
}
