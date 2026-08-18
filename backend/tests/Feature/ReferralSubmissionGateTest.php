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

    /** QA 19 - REF-SLIP-05c: unavailable preference + others available = 409 warning. */
    public function test_unavailable_preference_warns_without_acknowledgment(): void
    {
        $preferred = $this->provider('Dr. Preferred', RhuProvider::STATUS_UNAVAILABLE);
        $preferred->update(['remarks' => 'Back Monday']);
        $this->provider('Dr. Free');

        $this->postReferral(['preferred_provider_id' => $preferred->id])
            ->assertConflict()
            ->assertJsonPath('code', 'PREFERRED_PROVIDER_UNAVAILABLE')
            ->assertJsonPath('provider.name', 'Dr. Preferred')
            ->assertJsonPath('provider.remarks', 'Back Monday')
            ->assertJsonPath('available_alternatives.0.name', 'Dr. Free');

        $this->assertDatabaseCount('referrals', 0);
    }

    /** QA 20 - acknowledging proceeds and records the REL-01 trace. */
    public function test_acknowledged_unavailable_preference_proceeds_and_is_traced(): void
    {
        $preferred = $this->provider('Dr. Preferred', RhuProvider::STATUS_UNAVAILABLE);
        $this->provider('Dr. Free');

        $this->postReferral([
            'preferred_provider_id' => $preferred->id,
            'acknowledged_unavailable_preference' => true,
        ])->assertCreated();

        $referral = Referral::query()->sole();
        $this->assertSame($preferred->id, $referral->preferred_provider_id);
        $this->assertNotNull(
            $referral->preference_acknowledged_at,
            'REF-SLIP-05c requires a durable server-side trace of the warning.'
        );
        $this->assertSame('Dr. Preferred', $referral->preferred_provider_snapshot['name']);
        // The legacy string column stays in sync for the detail screens.
        $this->assertSame('Dr. Preferred', $referral->preferred_doctor);
    }

    /**
     * QA 21 - the acknowledgment flag cannot bypass DOC-14. The two rules are
     * independent and DOC-14 is evaluated first.
     */
    public function test_acknowledgment_cannot_bypass_the_hard_block(): void
    {
        $preferred = $this->provider('Dr. Only', RhuProvider::STATUS_UNAVAILABLE);

        $this->postReferral([
            'preferred_provider_id' => $preferred->id,
            'acknowledged_unavailable_preference' => true,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referrals', 0);
    }

    /** QA 22 - DOC-15: a provider from another RHU is never a valid preference. */
    public function test_preferred_provider_from_another_rhu_is_rejected(): void
    {
        $this->provider('Dr. Free');
        $foreign = RhuProvider::create([
            'rural_health_unit_id' => $this->otherRhu->id,
            'name' => 'Dr. Foreign',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'is_active' => true,
        ]);

        $this->postReferral(['preferred_provider_id' => $foreign->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'PREFERRED_PROVIDER_INVALID');

        $this->assertDatabaseCount('referrals', 0);
    }

    /** A deactivated provider is not a valid preference either. */
    public function test_inactive_provider_is_not_a_valid_preference(): void
    {
        $this->provider('Dr. Free');
        $retired = $this->provider('Dr. Retired');
        $retired->update(['is_active' => false]);

        $this->postReferral(['preferred_provider_id' => $retired->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'PREFERRED_PROVIDER_INVALID');
    }

    /** An available preference needs no acknowledgment. */
    public function test_available_preference_is_accepted_directly(): void
    {
        $preferred = $this->provider('Dr. Preferred');

        $this->postReferral(['preferred_provider_id' => $preferred->id])
            ->assertCreated();

        $referral = Referral::query()->sole();
        $this->assertSame($preferred->id, $referral->preferred_provider_id);
        $this->assertNull(
            $referral->preference_acknowledged_at,
            'No warning was shown, so nothing should be acknowledged.'
        );
    }

    /**
     * QA 23 / REL-01 - the referral keeps what the BHW saw at submission time,
     * even after the RHU renames the provider or flips availability.
     */
    public function test_snapshot_survives_later_roster_changes(): void
    {
        $preferred = $this->provider('Dr. Original');

        $this->postReferral(['preferred_provider_id' => $preferred->id])->assertCreated();

        $preferred->update([
            'name' => 'Dr. Renamed',
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
        ]);

        $referral = Referral::query()->sole();
        $this->assertSame('Dr. Original', $referral->preferred_provider_snapshot['name']);
        $this->assertSame(
            RhuProvider::STATUS_AVAILABLE,
            $referral->preferred_provider_snapshot['availability_status']
        );
        $this->assertSame(1, $referral->availability_snapshot['available_count']);
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
