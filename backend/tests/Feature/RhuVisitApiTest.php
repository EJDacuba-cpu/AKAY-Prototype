<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuVisitApiTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-25 01:30:00 UTC');
        $this->rhu = RuralHealthUnit::create(['name' => 'Visit API RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Other Visit API RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Sending BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function rhuUser(RuralHealthUnit $rhu, array $attributes = []): User
    {
        return User::create(['name' => 'Visit Reader', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, ...$attributes]);
    }

    private function visit(RuralHealthUnit $rhu, array $attributes = []): RhuVisitQueueEntry
    {
        $patient = Patient::create(['first_name' => 'Queue', 'last_name' => uniqid(), 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);

        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('key-', true),
            ...$attributes,
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    public function test_rhu_staff_list_own_active_visits_oldest_first(): void
    {
        $later = $this->visit($this->rhu, ['checked_in_at' => now()->subMinutes(5)]);
        $earlier = $this->visit($this->rhu, ['checked_in_at' => now()->subMinutes(30)]);
        $this->visit($this->otherRhu);
        $this->visit($this->rhu, ['closed_at' => now()]);

        $this->as($this->rhuUser($this->rhu))->getJson('/api/rhu-visits')
            ->assertOk()
            ->assertJsonPath('data.*.id', [$earlier->id, $later->id]);
    }

    public function test_include_closed_adds_closed_visits(): void
    {
        $open = $this->visit($this->rhu, ['checked_in_at' => now()->subMinutes(10)]);
        $closed = $this->visit($this->rhu, ['checked_in_at' => now()->subMinutes(20), 'closed_at' => now()]);
        $user = $this->rhuUser($this->rhu);

        $this->as($user)->getJson('/api/rhu-visits?include_closed=1')
            ->assertJsonPath('data.*.id', [$closed->id, $open->id]);
        $this->as($user)->getJson('/api/rhu-visits?include_closed=nope')
            ->assertJsonPath('data.*.id', [$open->id]);
    }

    public function test_payload_shape_has_no_tracking_or_qr_values(): void
    {
        $patient = Patient::create(['first_name' => 'Referred', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-20261025-SECRET',
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Payload test',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'referral_id' => $referral->id,
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now()->subMinutes(15),
            'check_in_key' => 'referral-'.$referral->id,
        ]);

        $response = $this->as($this->rhuUser($this->rhu))->getJson('/api/rhu-visits')
            ->assertOk()
            ->assertJsonPath('data.0.source', 'referral')
            ->assertJsonPath('data.0.referral.id', $referral->id)
            ->assertJsonPath('data.0.referral.sending_bhc', 'Sending BHC')
            ->assertJsonPath('data.0.waiting_minutes', 15)
            ->assertJsonPath('data.0.patient.id', $patient->id)
            ->assertJsonMissingPath('data.0.referral.tracking_id')
            ->assertJsonMissingPath('data.0.referral.qr_code_value');

        $this->assertStringNotContainsString('AKY-20261025-SECRET', $response->getContent());
        $this->assertStringNotContainsString($referral->qr_code_value, $response->getContent());
    }

    public function test_show_returns_own_visit_and_hides_other_rhu_visit(): void
    {
        $own = $this->visit($this->rhu);
        $other = $this->visit($this->otherRhu);
        $user = $this->rhuUser($this->rhu);

        $this->as($user)->getJson("/api/rhu-visits/{$own->id}")->assertOk()->assertJsonPath('data.id', $own->id);
        $this->as($user)->getJson("/api/rhu-visits/{$other->id}")->assertNotFound();
    }

    public function test_bhc_and_admin_cannot_read_the_queue(): void
    {
        $visit = $this->visit($this->rhu);
        $bhcUser = User::create(['name' => 'BHC', 'email' => 'visit-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);
        $admin = User::create(['name' => 'Admin', 'email' => 'visit-admin@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'admin']);

        foreach ([$bhcUser, $admin] as $user) {
            $this->as($user)->getJson('/api/rhu-visits')->assertForbidden();
            $this->as($user)->getJson("/api/rhu-visits/{$visit->id}")->assertForbidden();
        }
    }

    public function test_doctor_can_read_the_queue(): void
    {
        $this->visit($this->rhu);

        $this->as($this->rhuUser($this->rhu, ['staff_role' => 'doctor']))->getJson('/api/rhu-visits')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_rhu_account_without_clinical_history_is_denied(): void
    {
        $visit = $this->visit($this->rhu);
        $user = $this->rhuUser($this->rhu, ['permissions' => ['patients.register']]);

        $this->as($user)->getJson('/api/rhu-visits')->assertForbidden();
        $this->as($user)->getJson("/api/rhu-visits/{$visit->id}")->assertForbidden();
    }
}
