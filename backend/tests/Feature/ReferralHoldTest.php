<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralHold;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\ReferralHoldPruner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Blocked Referral / Doctor Availability Notification - covers the
 * implementation plan section 5: record-on-block, resolve-on-resubmission,
 * discard, index scoping/ownership, the availability-flip notification
 * (with cooldown), and pruning.
 */
class ReferralHoldTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private User $otherBhw;

    private User $rhuStaff;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Hold RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Hold BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->user('Hold BHW', 'hold-bhw@example.test', User::ROLE_BHW, $this->bhc->id);
        $this->otherBhw = $this->user('Other Hold BHW', 'hold-bhw-2@example.test', User::ROLE_BHW, $this->bhc->id);
        $this->rhuStaff = $this->user('Hold RHU Staff', 'hold-rhu@example.test', User::ROLE_RHU_STAFF, null, $this->rhu->id);
        $this->patient = Patient::create([
            'first_name' => 'Hold',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    /** A blocked submission persists exactly one waiting hold, and the 422 response is unchanged. */
    public function test_blocked_submission_records_a_waiting_hold(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);

        $this->postReferral()
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertDatabaseCount('referrals', 0);

        $hold = ReferralHold::query()->sole();
        $this->assertSame($this->patient->id, $hold->patient_id);
        $this->assertSame($this->bhc->id, $hold->barangay_health_center_id);
        $this->assertSame($this->rhu->id, $hold->rural_health_unit_id);
        $this->assertSame($this->bhw->id, $hold->created_by);
        $this->assertSame(ReferralHold::STATUS_WAITING, $hold->status);
    }

    /** REF-SLIP-05c / PREFERRED_PROVIDER_UNAVAILABLE must not create a hold - only the DOC-14 block does. */
    public function test_preferred_provider_unavailable_warning_does_not_create_a_hold(): void
    {
        $preferred = $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->provider(RhuProvider::STATUS_AVAILABLE);

        $this->postReferral(['preferred_provider_id' => $preferred->id])
            ->assertConflict();

        $this->assertDatabaseCount('referral_holds', 0);
    }

    /** DOC-14 is unaffected by an existing waiting hold - it stays a live, uncached check. */
    public function test_existing_waiting_hold_does_not_change_the_gate_decision(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);

        $this->postReferral()->assertUnprocessable();
        $this->assertDatabaseCount('referral_holds', 1);

        // A second blocked attempt behaves identically - the hold does not
        // satisfy or influence the gate.
        $this->postReferral()
            ->assertUnprocessable()
            ->assertJsonPath('code', 'NO_PROVIDER_AVAILABLE');

        $this->assertDatabaseCount('referral_holds', 2);
    }

    /** Resubmitting with resume_hold_id resolves that hold once the referral is created. */
    public function test_successful_resubmission_resolves_the_hold(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();
        $hold = ReferralHold::query()->sole();

        $provider = $this->provider(RhuProvider::STATUS_AVAILABLE);

        $referralId = $this->postReferral(['resume_hold_id' => $hold->id])
            ->assertCreated()
            ->json('data.id');

        $hold->refresh();
        $this->assertSame(ReferralHold::STATUS_RESUBMITTED, $hold->status);
        $this->assertSame($referralId, $hold->resolved_referral_id);
        $this->assertNotNull($hold->resolved_at);
    }

    /** A BHW cannot resolve another BHW's hold by guessing its id. */
    public function test_resume_hold_id_is_scoped_to_its_creator(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();
        $hold = ReferralHold::query()->sole();

        $this->provider(RhuProvider::STATUS_AVAILABLE);

        $this->postReferral(['resume_hold_id' => $hold->id], $this->otherBhw)
            ->assertCreated();

        $hold->refresh();
        $this->assertSame(
            ReferralHold::STATUS_WAITING,
            $hold->status,
            'A referral created by a different BHW must not resolve someone else\'s hold.'
        );
    }

    /** GET /referral-holds returns only the caller's own waiting holds. */
    public function test_index_returns_only_the_callers_waiting_holds(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();
        $this->postReferral([], $this->otherBhw)->assertUnprocessable();

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson('/api/referral-holds')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /** A BHW cannot discard another BHW's hold. */
    public function test_discard_is_forbidden_for_another_bhws_hold(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();
        $hold = ReferralHold::query()->sole();

        $this->actingAs($this->otherBhw, 'sanctum')
            ->postJson("/api/referral-holds/{$hold->id}/discard")
            ->assertForbidden();

        $this->assertSame(ReferralHold::STATUS_WAITING, $hold->fresh()->status);
    }

    /** Discarding an already-resolved hold 422s rather than re-resolving it. */
    public function test_discard_rejects_an_already_resolved_hold(): void
    {
        $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();
        $hold = ReferralHold::query()->sole();

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/referral-holds/{$hold->id}/discard")
            ->assertOk();

        $this->actingAs($this->bhw, 'sanctum')
            ->postJson("/api/referral-holds/{$hold->id}/discard")
            ->assertUnprocessable();
    }

    /** Flipping a provider to Available notifies every waiting hold at that RHU exactly once. */
    public function test_flip_to_available_notifies_waiting_holds(): void
    {
        $provider = $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();
        $this->postReferral([], $this->otherBhw)->assertUnprocessable();

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])
            ->assertOk();

        $this->assertSame(
            2,
            UserNotification::where('type', 'referral_hold_available')->count()
        );
        $this->assertNotNull(ReferralHold::query()->first()->last_notified_at);
    }

    /** Flipping to Unavailable, or an unrelated field edit, notifies nobody. */
    public function test_flip_to_unavailable_and_unrelated_edits_notify_nobody(): void
    {
        $provider = $this->provider(RhuProvider::STATUS_AVAILABLE);
        $blocker = $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertCreated();

        // Now block the RHU and create a waiting hold to notify against.
        $provider->update(['availability_status' => RhuProvider::STATUS_UNAVAILABLE]);
        $this->postReferral()->assertUnprocessable();

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->patchJson("/api/rhu-providers/{$blocker->id}", ['remarks' => 'Still away'])
            ->assertOk();

        $this->assertSame(0, UserNotification::where('type', 'referral_hold_available')->count());
    }

    /** The cooldown prevents a burst of availability flips from paging the same BHW repeatedly. */
    public function test_notification_cooldown_suppresses_rapid_repeat_notifications(): void
    {
        config(['operations.referral_holds.notify_cooldown_minutes' => 15]);

        $providerA = $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $providerB = $this->provider(RhuProvider::STATUS_UNAVAILABLE);
        $this->postReferral()->assertUnprocessable();

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->patchJson("/api/rhu-providers/{$providerA->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])->assertOk();

        $providerA->update(['availability_status' => RhuProvider::STATUS_UNAVAILABLE]);

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->patchJson("/api/rhu-providers/{$providerB->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])->assertOk();

        $this->assertSame(
            1,
            UserNotification::where('type', 'referral_hold_available')->count(),
            'A second flip inside the cooldown window must not notify again.'
        );
    }

    /** The pruner expires only waiting holds older than the configured window. */
    public function test_pruner_expires_only_stale_waiting_holds(): void
    {
        config(['operations.referral_holds.expire_after_days' => 14]);

        $stale = $this->hold(ReferralHold::STATUS_WAITING);
        $stale->forceFill(['created_at' => now()->subDays(20)])->save();

        $recent = $this->hold(ReferralHold::STATUS_WAITING);

        $resolved = $this->hold(ReferralHold::STATUS_DISCARDED);
        $resolved->forceFill(['created_at' => now()->subDays(20)])->save();

        $pruner = app(ReferralHoldPruner::class);

        $this->assertSame(1, $pruner->prune(dryRun: true));
        $this->assertSame(ReferralHold::STATUS_WAITING, $stale->fresh()->status, 'Dry run must not mutate.');

        $this->assertSame(1, $pruner->prune());
        $this->assertSame(ReferralHold::STATUS_EXPIRED, $stale->fresh()->status);
        $this->assertSame(ReferralHold::STATUS_WAITING, $recent->fresh()->status);
        $this->assertSame(ReferralHold::STATUS_DISCARDED, $resolved->fresh()->status);
    }

    private function hold(string $status): ReferralHold
    {
        return ReferralHold::create([
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->bhw->id,
            'status' => $status,
        ]);
    }

    private function provider(string $status = RhuProvider::STATUS_AVAILABLE): RhuProvider
    {
        return RhuProvider::create([
            'rural_health_unit_id' => $this->rhu->id,
            'name' => 'Dr. '.uniqid(),
            'specialization' => 'General Practitioner',
            'availability_status' => $status,
            'is_active' => true,
        ]);
    }

    private function postReferral(array $overrides = [], ?User $actor = null)
    {
        return $this->actingAs($actor ?? $this->bhw, 'sanctum')->postJson('/api/referrals', [
            'patient_id' => $this->patient->id,
            'reason_for_referral' => 'Requires RHU assessment.',
            'urgency_level' => Referral::ATTENTION_ROUTINE,
            ...$overrides,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
