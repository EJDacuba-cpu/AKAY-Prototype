<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralNoShowService;
use App\Services\ReferralQrService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * D-1 FINAL - No-Show rescheduling. Covers plan QA 7.2 cases 26-28c.
 *
 * The governing constraint throughout: rescheduling records a new intended
 * visit date as an ATTRIBUTE. It must not move the referral through the
 * TRK-02 workflow, and it must not disturb the QR (QRS-10 FINAL).
 */
class ReferralRescheduleTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private User $rhuStaff;

    private User $otherRhuStaff;

    private User $admin;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Reschedule RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Reschedule Other RHU', 'status' => 'active']);
        $this->seedAvailableProvider($this->rhu);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Reschedule BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = $this->user('Reschedule BHW', 'resched-bhw@example.test', User::ROLE_BHW, $this->bhc->id);
        $this->rhuStaff = $this->user('Reschedule RHU Staff', 'resched-rhu@example.test', User::ROLE_RHU_STAFF, null, $this->rhu->id);
        $this->otherRhuStaff = $this->user('Other RHU Staff', 'resched-other@example.test', User::ROLE_RHU_STAFF, null, $this->otherRhu->id);
        $this->admin = $this->user('Reschedule Admin', 'resched-admin@example.test', User::ROLE_ADMIN);
        $this->patient = Patient::create([
            'first_name' => 'Reschedule',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    /** QA 26 - DOC-14b: an omitted date is rejected. No server default exists. */
    public function test_missing_date_is_rejected_with_no_server_default(): void
    {
        $referral = $this->noShowReferral();

        $this->asRhuStaff("/api/referrals/{$referral->id}/reschedule", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rescheduled_to');

        $this->assertNull($referral->fresh()->rescheduled_to);
    }

    /** QA 27 - DOC-14b: a past date is rejected. */
    public function test_past_date_is_rejected(): void
    {
        $referral = $this->noShowReferral();

        $this->asRhuStaff("/api/referrals/{$referral->id}/reschedule", [
            'rescheduled_to' => now()->subDay()->toISOString(),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rescheduled_to');

        $this->assertNull($referral->fresh()->rescheduled_to);
    }

    /** QA 28 - D-1: a valid reschedule succeeds and the status stays No-Show. */
    public function test_valid_reschedule_keeps_the_referral_no_show(): void
    {
        $referral = $this->noShowReferral();
        $newDate = now()->addWeek()->startOfMinute();

        $this->asRhuStaff("/api/referrals/{$referral->id}/reschedule", [
            'rescheduled_to' => $newDate->toISOString(),
            'reschedule_reason' => 'Patient asked for a later slot.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', Referral::STATUS_NO_SHOW);

        $fresh = $referral->fresh();
        $this->assertSame(Referral::STATUS_NO_SHOW, $fresh->status);
        // Compare instants, not formatted local strings: the request sends
        // UTC while the app renders in its configured timezone.
        $this->assertTrue($fresh->rescheduled_to->equalTo($newDate));
        $this->assertSame('Patient asked for a later slot.', $fresh->reschedule_reason);
        $this->assertSame($this->rhuStaff->id, (int) $fresh->rescheduled_by);
        $this->assertNotNull($fresh->rescheduled_at);
    }

    /** D-1 - no history row: rescheduled_by/_at are the traceability record. */
    public function test_reschedule_writes_no_status_history_row(): void
    {
        $referral = $this->noShowReferral();
        $before = ReferralUpdate::where('referral_id', $referral->id)->count();

        $this->reschedule($referral)->assertOk();

        $this->assertSame(
            $before,
            ReferralUpdate::where('referral_id', $referral->id)->count(),
            'Rescheduling is an attribute write, not a TRK-02 transition.'
        );
    }

    /** SCR-06 - the reschedule is audited. */
    public function test_reschedule_is_audited(): void
    {
        $referral = $this->noShowReferral();

        $this->reschedule($referral)->assertOk();

        $this->assertSame(
            1,
            AuditLog::where('action', 'referral_rescheduled')
                ->where('module', 'referrals')
                ->count()
        );
    }

    /** QA 28a - every non-No-Show status is refused. */
    public function test_non_no_show_referrals_cannot_be_rescheduled(): void
    {
        foreach ([
            Referral::STATUS_PENDING,
            Referral::STATUS_RECEIVED,
            Referral::STATUS_COMPLETED,
        ] as $status) {
            $referral = $this->referral($status);

            $this->reschedule($referral)
                ->assertConflict()
                ->assertJsonPath('code', 'REFERRAL_NOT_NO_SHOW');

            $this->assertNull($referral->fresh()->rescheduled_to);
        }
    }

    /**
     * QA 28b - QRS-10 FINAL: the QR is untouched by a reschedule. Neither the
     * hash nor the issue timestamp changes, and the same token still resolves.
     */
    public function test_reschedule_leaves_the_qr_untouched_and_resolvable(): void
    {
        $referral = $this->noShowReferral();
        $token = app(ReferralQrService::class)->issue($referral);
        $referral->refresh();
        $hashBefore = $referral->qr_token_hash;
        $issuedBefore = $referral->qr_token_issued_at;

        $this->reschedule($referral)->assertOk();

        $after = $referral->fresh();
        $this->assertSame($hashBefore, $after->qr_token_hash);
        $this->assertEquals($issuedBefore, $after->qr_token_issued_at);

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('data.referral_id', $referral->id);
    }

    /**
     * QA 28c - DOC-14a-DEFERRED: there is no pre-submission reschedule
     * pathway. The endpoint exists only for an already-created referral, so a
     * zero-provider block leaves nothing to reschedule.
     */
    public function test_no_pre_submission_reschedule_pathway_exists(): void
    {
        // A blocked submission creates no referral at all...
        $this->assertDatabaseCount('referrals', 0);

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->postJson('/api/referrals/0/reschedule', [
                'rescheduled_to' => now()->addWeek()->toISOString(),
            ])
            ->assertNotFound();

        // ...and no draft-level or intent-level reschedule surface exists.
        foreach ([
            'health_record_drafts.rescheduled_to',
            'health_record_drafts.reschedule_reason',
        ] as $candidate) {
            [$table, $column] = explode('.', $candidate);
            $this->assertFalse(
                \Illuminate\Support\Facades\Schema::hasColumn($table, $column),
                "DOC-14a-DEFERRED: {$candidate} must not exist."
            );
        }
        $this->assertFalse(
            \Illuminate\Support\Facades\Schema::hasTable('blocked_referral_intents'),
            'DOC-14a-DEFERRED: candidate C must not be implemented.'
        );
    }

    /** Re-rescheduling is allowed; the latest valid reschedule overwrites. */
    public function test_re_rescheduling_overwrites_the_previous_reschedule(): void
    {
        $referral = $this->noShowReferral();
        $first = now()->addWeek()->startOfMinute();
        $second = now()->addWeeks(3)->startOfMinute();

        $this->asRhuStaff("/api/referrals/{$referral->id}/reschedule", [
            'rescheduled_to' => $first->toISOString(),
            'reschedule_reason' => 'First attempt.',
        ])->assertOk();

        $this->asRhuStaff("/api/referrals/{$referral->id}/reschedule", [
            'rescheduled_to' => $second->toISOString(),
        ])->assertOk();

        $fresh = $referral->fresh();
        $this->assertTrue($fresh->rescheduled_to->equalTo($second));
        $this->assertNull(
            $fresh->reschedule_reason,
            'The latest reschedule overwrites the previous reschedule fields.'
        );
        $this->assertSame(Referral::STATUS_NO_SHOW, $fresh->status);
    }

    /** DOC-15 - another RHU cannot reschedule this referral. */
    public function test_other_rhu_staff_cannot_reschedule(): void
    {
        $referral = $this->noShowReferral();

        $this->actingAs($this->otherRhuStaff, 'sanctum')
            ->postJson("/api/referrals/{$referral->id}/reschedule", [
                'rescheduled_to' => now()->addWeek()->toISOString(),
            ])
            ->assertForbidden();

        $this->assertNull($referral->fresh()->rescheduled_to);
    }

    /** Rescheduling is an RHU action; BHW and admin are both refused. */
    public function test_bhw_and_admin_cannot_reschedule(): void
    {
        $referral = $this->noShowReferral();

        foreach ([$this->bhw, $this->admin] as $user) {
            $this->actingAs($user, 'sanctum')
                ->postJson("/api/referrals/{$referral->id}/reschedule", [
                    'rescheduled_to' => now()->addWeek()->toISOString(),
                ])
                ->assertForbidden();
        }

        $this->assertNull($referral->fresh()->rescheduled_to);
    }

    /**
     * The auto-No-Show sweeper must not re-touch a rescheduled referral: it
     * only acts on Pending rows, and a rescheduled referral stays No-Show.
     */
    public function test_auto_no_show_sweeper_ignores_a_rescheduled_referral(): void
    {
        $referral = $this->noShowReferral();
        $this->reschedule($referral)->assertOk();

        $this->assertSame(0, app(ReferralNoShowService::class)->markOverduePending());
        $this->assertSame(Referral::STATUS_NO_SHOW, $referral->fresh()->status);
    }

    /** A rescheduled patient who arrives is still received by the normal path. */
    public function test_rescheduled_referral_can_still_be_received_late(): void
    {
        $referral = $this->noShowReferral();
        $this->reschedule($referral)->assertOk();

        $this->actingAs($this->rhuStaff, 'sanctum')
            ->patchJson("/api/referrals/{$referral->id}/status", [
                'status' => Referral::STATUS_RECEIVED,
                'remarks' => 'Patient arrived on the rescheduled date.',
            ])
            ->assertOk();

        $fresh = $referral->fresh();
        $this->assertSame(Referral::STATUS_RECEIVED, $fresh->status);
        // The reschedule record survives the later transition.
        $this->assertNotNull($fresh->rescheduled_to);
    }

    private function reschedule(Referral $referral)
    {
        return $this->asRhuStaff("/api/referrals/{$referral->id}/reschedule", [
            'rescheduled_to' => now()->addWeek()->toISOString(),
        ]);
    }

    private function asRhuStaff(string $uri, array $payload)
    {
        return $this->actingAs($this->rhuStaff, 'sanctum')->postJson($uri, $payload);
    }

    private function noShowReferral(): Referral
    {
        return $this->referral(Referral::STATUS_NO_SHOW);
    }

    private function referral(string $status): Referral
    {
        static $sequence = 0;
        $sequence++;

        return Referral::create([
            'tracking_id' => "AKAY-RESCHED-{$sequence}",
            'qr_code_value' => "AKAY:RESCHED:{$sequence}",
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->bhw->id,
            'reason_for_referral' => 'Reschedule test referral.',
            'referral_datetime' => now()->subDays(2),
            'status' => $status,
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
