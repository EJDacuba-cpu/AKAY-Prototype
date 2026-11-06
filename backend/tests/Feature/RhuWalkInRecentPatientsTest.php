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
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuWalkInRecentPatientsTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Recent RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Recent BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = User::create([
            'name' => 'Recent Nurse',
            'email' => 'recent-nurse@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function patient(string $first, string $last, array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => $first,
            'last_name' => $last,
            'sex' => 'Female',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function recent(?User $user = null, array $query = [])
    {
        Sanctum::actingAs($user ?? $this->nurse, ['akay:access']);

        return $this->getJson('/api/rhu-visits/recent-patients'.($query === [] ? '' : '?'.http_build_query($query)));
    }

    public function test_returns_newest_patients_first_capped_at_eight_by_default(): void
    {
        $ids = [];
        foreach (range(1, 10) as $number) {
            $ids[] = $this->patient('Recent', 'Patient'.$number)->id;
        }

        $this->recent()->assertOk()
            ->assertJsonCount(8, 'data')
            ->assertJsonPath('data.0.id', $ids[9])
            ->assertJsonPath('data.7.id', $ids[2]);
    }

    public function test_limit_is_clamped_between_one_and_ten(): void
    {
        foreach (range(1, 12) as $number) {
            $this->patient('Cap', 'Patient'.$number);
        }

        $this->recent(null, ['limit' => 3])->assertOk()->assertJsonCount(3, 'data');
        $this->recent(null, ['limit' => 10])->assertOk()->assertJsonCount(10, 'data');
        $this->recent(null, ['limit' => 0])->assertUnprocessable()->assertJsonValidationErrors('limit');
        $this->recent(null, ['limit' => 11])->assertUnprocessable()->assertJsonValidationErrors('limit');
    }

    public function test_excludes_inactive_and_other_facility_patients(): void
    {
        $own = $this->patient('Own', 'Here');
        $this->patient('Gone', 'Inactive', ['status' => 'inactive']);
        $other = RuralHealthUnit::create(['name' => 'Other Recent RHU', 'status' => 'active']);
        $this->patient('Other', 'Facility', ['rural_health_unit_id' => $other->id]);

        $this->recent()->assertOk()->assertJsonPath('data.*.id', [$own->id]);
    }

    public function test_excludes_patients_with_an_active_queue_visit(): void
    {
        $eligible = $this->patient('Free', 'Desk');
        $queued = $this->patient('Queued', 'Now');
        RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $queued->id,
            'source' => 'walk_in',
            'status' => 'waiting',
            'checked_in_at' => now(),
            'check_in_key' => 'recent-key',
        ]);

        $this->recent()->assertOk()->assertJsonPath('data.*.id', [$eligible->id]);
    }

    public function test_excludes_patients_with_a_pending_referral_to_this_rhu(): void
    {
        $eligible = $this->patient('Walk', 'In');
        $referred = $this->patient('Pending', 'Referral');
        Referral::create([
            'tracking_id' => 'AKY-RECENT-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $referred->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Recent preview',
            'status' => Referral::STATUS_PENDING,
        ]);

        $this->recent()->assertOk()->assertJsonPath('data.*.id', [$eligible->id]);
    }

    public function test_received_referral_patients_remain_in_the_preview(): void
    {
        $received = $this->patient('Received', 'Before', ['medical_background' => ['allergies' => ['items' => [['allergen' => 'Private']]]]]);
        Referral::create([
            'tracking_id' => 'AKY-RECV-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $received->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Already received',
            'status' => Referral::STATUS_RECEIVED,
        ]);

        $response = $this->recent()->assertOk()
            ->assertJsonPath('data.0.id', $received->id)
            ->assertJsonPath('data.0.active_visit_id', null)
            ->assertJsonMissingPath('data.0.medical_background');
        $this->assertStringNotContainsString('Private', $response->getContent());
    }

    public function test_requires_patients_register(): void
    {
        $this->patient('Need', 'Duty');
        $historyOnly = User::create([
            'name' => 'History Only',
            'email' => 'recent-history@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => ['clinical.history'],
        ]);

        $this->recent($historyOnly)->assertForbidden();
    }
}
