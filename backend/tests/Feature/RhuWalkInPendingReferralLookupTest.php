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

class RhuWalkInPendingReferralLookupTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Pending RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Pending BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = $this->rhuUser();
    }

    private function rhuUser(array $attributes = []): User
    {
        return User::create(['name' => 'Pending Nurse', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create(['first_name' => 'Pending', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function referral(Patient $patient, array $attributes = []): Referral
    {
        return Referral::create([
            'tracking_id' => 'AKY-PEND-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'SecretReason',
            'chief_complaint' => 'SecretComplaint',
            'initial_diagnosis' => 'SecretDiagnosis',
            'status' => Referral::STATUS_PENDING,
            ...$attributes,
        ]);
    }

    private function lookup(Patient $patient, ?User $user = null)
    {
        Sanctum::actingAs($user ?? $this->nurse, ['akay:access']);

        return $this->getJson('/api/rhu-visits/patients/'.$patient->id.'/pending-referrals');
    }

    public function test_returns_pending_referrals_for_walk_in_eligible_patient(): void
    {
        $patient = $this->patient(['medical_background' => ['allergies' => ['items' => [['allergen' => 'PrivateAllergen']]]]]);
        $referral = $this->referral($patient);

        $response = $this->lookup($patient)->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.referrals.0.referral_id', $referral->id)
            ->assertJsonPath('data.referrals.0.tracking_id', $referral->tracking_id)
            ->assertJsonPath('data.referrals.0.status', Referral::STATUS_PENDING)
            ->assertJsonPath('data.referrals.0.sending_bhc', $this->bhc->name);

        $this->assertNotNull($response->json('data.referrals.0.referred_at'));
        $this->assertSame(
            ['referral_id', 'tracking_id', 'status', 'sending_bhc', 'referred_at'],
            array_keys($response->json('data.referrals.0'))
        );
        $content = $response->getContent();
        foreach (['SecretReason', 'SecretComplaint', 'SecretDiagnosis', 'PrivateAllergen', 'medical_background'] as $hidden) {
            $this->assertStringNotContainsString($hidden, $content);
        }
    }

    public function test_received_referral_does_not_appear(): void
    {
        $patient = $this->patient();
        $this->referral($patient, ['status' => Referral::STATUS_RECEIVED]);

        $this->lookup($patient)->assertOk()->assertJsonPath('data.count', 0)->assertJsonPath('data.referrals', []);
    }

    public function test_multiple_pending_are_all_returned_oldest_first(): void
    {
        $patient = $this->patient();
        $older = $this->referral($patient, ['tracking_id' => 'AKY-PEND-OLDER']);
        $newer = $this->referral($patient, ['tracking_id' => 'AKY-PEND-NEWER']);

        $this->lookup($patient)->assertOk()
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.referrals.0.tracking_id', $older->tracking_id)
            ->assertJsonPath('data.referrals.0.referral_id', $older->id)
            ->assertJsonPath('data.referrals.1.tracking_id', $newer->tracking_id)
            ->assertJsonPath('data.referrals.1.referral_id', $newer->id);
    }

    public function test_other_rhu_pending_is_hidden(): void
    {
        $patient = $this->patient();
        $otherRhu = RuralHealthUnit::create(['name' => 'Other Pending RHU', 'status' => 'active']);
        $this->referral($patient, ['rural_health_unit_id' => $otherRhu->id]);

        $this->lookup($patient)->assertOk()->assertJsonPath('data.count', 0)->assertJsonPath('data.referrals', []);
    }

    public function test_active_visit_lookup_still_independent(): void
    {
        $patient = $this->patient();
        $this->referral($patient);

        $this->lookup($patient)->assertOk()->assertJsonPath('data.count', 1);

        $this->assertSame(0, RhuVisitQueueEntry::count());
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
        $this->referral($patient);

        $this->lookup($patient, $user)->assertOk()->assertJsonPath('data.count', 1);
    }

    public function test_inaccessible_patient_is_forbidden(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Foreign Pending RHU', 'status' => 'active']);
        $patient = $this->patient(['rural_health_unit_id' => $otherRhu->id, 'barangay_health_center_id' => null]);

        $this->lookup($patient)->assertForbidden();
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }
}
