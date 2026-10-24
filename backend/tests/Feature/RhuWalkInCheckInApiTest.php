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

class RhuWalkInCheckInApiTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Walk-in RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Walk-in BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = $this->rhuUser();
    }

    private function rhuUser(array $attributes = []): User
    {
        return User::create(['name' => 'Walk-in Nurse', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create(['first_name' => 'Walk', 'last_name' => 'In', 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function checkIn(array $body, ?User $user = null)
    {
        Sanctum::actingAs($user ?? $this->nurse, ['akay:access']);

        return $this->postJson('/api/rhu-visits', $body);
    }

    public function test_walk_in_check_in_creates_a_walk_in_visit(): void
    {
        $patient = $this->patient();

        $response = $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-1'])
            ->assertCreated()
            ->assertJsonPath('data.source', 'walk_in')
            ->assertJsonPath('data.patient.id', $patient->id)
            ->assertJsonPath('data.referral', null);

        $entry = RhuVisitQueueEntry::sole();
        $this->assertSame($entry->id, $response->json('data.id'));
        $this->assertNull($entry->referral_id);
        $this->assertSame($this->nurse->id, $entry->checked_in_by);
        $this->assertSame(RhuVisitQueueEntry::STATUS_WAITING, $entry->status);
    }

    public function test_retry_with_the_same_key_returns_the_visit_with_200(): void
    {
        $patient = $this->patient();
        $first = $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-1'])->assertCreated();

        $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-1'])
            ->assertOk()
            ->assertJsonPath('data.id', $first->json('data.id'));

        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_active_patient_with_a_new_key_is_409(): void
    {
        $patient = $this->patient();
        $first = $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-1'])->assertCreated();

        $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-2'])
            ->assertConflict()
            ->assertJsonPath('code', 'VISIT_ALREADY_ACTIVE')
            ->assertJsonPath('active_visit_id', $first->json('data.id'));
    }

    public function test_same_key_for_another_patient_is_409(): void
    {
        $this->checkIn(['patient_id' => $this->patient()->id, 'check_in_key' => 'key-1'])->assertCreated();

        $this->checkIn(['patient_id' => $this->patient()->id, 'check_in_key' => 'key-1'])
            ->assertConflict()
            ->assertJsonPath('code', 'VISIT_CHECK_IN_KEY_CONFLICT');
    }

    public function test_reserved_arrival_prefix_is_rejected(): void
    {
        $this->checkIn(['patient_id' => $this->patient()->id, 'check_in_key' => 'referral-5'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('check_in_key');

        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_referral_id_in_the_body_is_ignored(): void
    {
        $patient = $this->patient();
        $referral = Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Ignored',
            'status' => Referral::STATUS_PENDING,
        ]);

        $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-1', 'referral_id' => $referral->id])->assertCreated();

        $entry = RhuVisitQueueEntry::sole();
        $this->assertNull($entry->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $entry->source);
    }

    public function test_other_facility_patient_is_forbidden(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Other Walk-in RHU', 'status' => 'active']);
        $patient = $this->patient(['rural_health_unit_id' => $otherRhu->id]);

        $this->checkIn(['patient_id' => $patient->id, 'check_in_key' => 'key-1'])->assertForbidden();

        $bhcUser = User::create(['name' => 'BHC', 'email' => 'walk-in-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);
        $admin = User::create(['name' => 'Admin', 'email' => 'walk-in-admin@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'admin']);
        $own = $this->patient();
        foreach ([$bhcUser, $admin] as $user) {
            $this->checkIn(['patient_id' => $own->id, 'check_in_key' => 'key-2'], $user)->assertForbidden();
        }
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_user_without_patients_register_is_forbidden(): void
    {
        $user = $this->rhuUser(['permissions' => ['clinical.history']]);

        $this->checkIn(['patient_id' => $this->patient()->id, 'check_in_key' => 'key-1'], $user)->assertForbidden();
    }

    public function test_missing_fields_are_validation_errors(): void
    {
        $this->checkIn([])->assertUnprocessable()->assertJsonValidationErrors(['patient_id', 'check_in_key']);
    }

    public function test_referral_arrival_still_enqueues(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => null, 'barangay_health_center_id' => $this->bhc->id]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Arrival',
            'status' => Referral::STATUS_PENDING,
        ]);
        Sanctum::actingAs($this->nurse, ['akay:access']);

        $this->patchJson("/api/referrals/{$referral->id}/status", ['status' => Referral::STATUS_RECEIVED])->assertOk();

        $this->assertSame('referral-'.$referral->id, RhuVisitQueueEntry::sole()->check_in_key);
    }
}
