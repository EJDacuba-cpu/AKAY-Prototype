<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * DOC-14 submission gate and REF-SLIP-05c (Decision A).
 * Covers plan QA 7.2 cases 15-23.
 *
 * This class deliberately does NOT use the shared seedAvailableProvider()
 * helper in setUp: availability is the variable under test.
 */
class ReferralSubmissionGateTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Gate RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Gate Other RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Gate BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Gate BHW',
            'email' => 'gate-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Gate',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    /** QA 15 - DOC-14: zero available blocks a Routine referral. */
    public function test_zero_available_blocks_routine(): void
    {
        $this->provider('Dr. Away', RhuProvider::STATUS_UNAVAILABLE);

        $this->postReferral(['urgency_level' => Referral::ATTENTION_ROUTINE])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referrals', 0);
    }

    /** QA 16 - URG-05: Priority is blocked identically. Attention grants no exemption. */
    public function test_zero_available_blocks_priority_identically(): void
    {
        $this->provider('Dr. Away', RhuProvider::STATUS_UNAVAILABLE);

        $this->postReferral(['urgency_level' => Referral::ATTENTION_PRIORITY])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referrals', 0);
    }

    /** QA 17 - the gate is independent of preference: no selection still blocks. */
    public function test_zero_available_blocks_even_with_no_preference_selected(): void
    {
        $this->postReferral()
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referrals', 0);
    }

    /**
     * QA 18 - REL-01: availability is re-counted at WRITE time. A form loaded
     * while providers were free must still be blocked if the last one goes
     * unavailable before submit.
     */
    public function test_availability_dropping_after_form_load_still_blocks(): void
    {
        $provider = $this->provider('Dr. Leaving');

        // Simulates the RHU flipping availability between form load and submit.
        $provider->update(['availability_status' => RhuProvider::STATUS_UNAVAILABLE]);

        $this->postReferral()
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');
    }

    /** The BHC never names a doctor; a stray provider id is ignored, not stored. */
    public function test_a_named_provider_is_ignored(): void
    {
        $unavailable = $this->provider('Dr. Away', RhuProvider::STATUS_UNAVAILABLE);
        $this->provider('Dr. Here');

        $this->postReferral(['preferred_provider_id' => $unavailable->id])
            ->assertCreated();

        $this->assertFalse(Schema::hasColumn('referrals', 'preferred_provider_id'));
        $this->assertFalse(Schema::hasColumn('referrals', 'preferred_doctor'));
    }

    /** The availability snapshot uses the canonical service shape (B6). */
    public function test_availability_snapshot_uses_the_canonical_shape(): void
    {
        $this->provider('Dr. Free');
        $this->provider('Dr. Away', RhuProvider::STATUS_UNAVAILABLE);

        $this->postReferral()->assertCreated();

        $snapshot = Referral::query()->sole()->availability_snapshot;
        foreach ([
            'rural_health_unit_id', 'available_count', 'total_count',
            'status', 'can_submit_referral', 'providers',
        ] as $key) {
            $this->assertArrayHasKey($key, $snapshot);
        }
        $this->assertSame(1, $snapshot['available_count']);
        $this->assertSame(2, $snapshot['total_count']);
        $this->assertTrue($snapshot['can_submit_referral']);
    }

    /**
     * The gate must sit after the client_submission_id replay check: retrying a
     * submission that already created a referral must return the existing row
     * rather than 422 because availability changed in the meantime.
     */
    public function test_replay_of_an_existing_referral_is_not_blocked_by_the_gate(): void
    {
        $provider = $this->provider('Dr. Free');
        $submissionId = (string) Str::uuid();

        $first = $this->postReferral(['client_submission_id' => $submissionId])
            ->assertCreated()
            ->json('data.id');

        $provider->update(['availability_status' => RhuProvider::STATUS_UNAVAILABLE]);

        $this->postReferral(['client_submission_id' => $submissionId])
            ->assertOk()
            ->assertJsonPath('data.id', $first);

        $this->assertDatabaseCount('referrals', 1);
    }

    /** The embedded health-record path is gated identically (plan 3.3). */
    public function test_embedded_referral_path_is_gated_too(): void
    {
        $this->provider('Dr. Away', RhuProvider::STATUS_UNAVAILABLE);

        $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'category' => 'General Consultation',
                'needs_referral' => true,
                'referral' => [
                    'reason_for_referral' => 'Requires RHU assessment.',
                    'urgency_level' => Referral::ATTENTION_ROUTINE,
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('health_records', 0);
    }

    private function provider(
        string $name,
        string $status = RhuProvider::STATUS_AVAILABLE
    ): RhuProvider {
        return RhuProvider::create([
            'rural_health_unit_id' => $this->rhu->id,
            'name' => $name,
            'specialization' => 'General Practitioner',
            'availability_status' => $status,
            'is_active' => true,
        ]);
    }

    private function postReferral(array $overrides = [])
    {
        return $this->actingAs($this->bhw, 'sanctum')->postJson('/api/referrals', [
            'patient_id' => $this->patient->id,
            'reason_for_referral' => 'Requires RHU assessment.',
            'urgency_level' => Referral::ATTENTION_ROUTINE,
            ...$overrides,
        ]);
    }
}
