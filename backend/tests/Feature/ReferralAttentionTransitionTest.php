<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * URG-01..URG-06 (revised) - Routine/Priority attention scheme.
 *
 * Covers plan QA 7.1 cases 1-6d. The retired four-value scheme
 * (Low/Normal/Urgent/Emergency) must be rejected on every creation path, and
 * no path may silently default a value the caller did not supply.
 */
class ReferralAttentionTransitionTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private RuralHealthUnit $rhu;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Attention RHU', 'status' => 'active']);
        $this->seedAvailableProvider($this->rhu);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Attention BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Attention BHW',
            'email' => 'attention-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Attention',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    /** QA 7.1 #1 - Routine is accepted on the direct referral path. */
    public function test_direct_referral_accepts_routine(): void
    {
        $this->postReferral(['urgency_level' => Referral::ATTENTION_ROUTINE])
            ->assertCreated()
            ->assertJsonPath('data.urgency_level', Referral::ATTENTION_ROUTINE);
    }

    /** QA 7.1 #2 - Priority is accepted on the direct referral path. */
    public function test_direct_referral_accepts_priority(): void
    {
        $this->postReferral(['urgency_level' => Referral::ATTENTION_PRIORITY])
            ->assertCreated()
            ->assertJsonPath('data.urgency_level', Referral::ATTENTION_PRIORITY);
    }

    /**
     * QA 7.1 #3 - every retired value is rejected. The retired scheme is
     * replaced, not mapped: 'Urgent' must not silently become 'Priority'.
     */
    public function test_direct_referral_rejects_every_retired_value(): void
    {
        foreach (['Low', 'Normal', 'Urgent', 'Emergency', 'Non-Urgent', 'routine'] as $retired) {
            $this->postReferral(['urgency_level' => $retired])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('urgency_level');
        }

        $this->assertDatabaseCount('referrals', 0);
    }

    /** QA 7.1 #4 - omitting the value is rejected; there is no silent default. */
    public function test_direct_referral_requires_an_explicit_value(): void
    {
        $this->postReferral([])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('urgency_level');
    }

    /** QA 7.1 #6a - embedded referral path accepts Priority end to end. */
    public function test_embedded_referral_accepts_priority(): void
    {
        $this->postHealthRecord([
            'reason_for_referral' => 'Requires RHU assessment.',
            'urgency_level' => Referral::ATTENTION_PRIORITY,
        ])->assertCreated();

        $this->assertSame(
            Referral::ATTENTION_PRIORITY,
            Referral::query()->sole()->urgency_level
        );
    }

    /** QA 7.1 #6b - embedded referral path rejects a retired value. */
    public function test_embedded_referral_rejects_retired_value(): void
    {
        $this->postHealthRecord([
            'reason_for_referral' => 'Requires RHU assessment.',
            'urgency_level' => 'Emergency',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('referral.urgency_level');

        $this->assertDatabaseCount('referrals', 0);
    }

    /**
     * QA 7.1 #6c - embedded referral omitting the value is rejected, proving
     * the retired healthRecordService.js 'Normal' fallback has no server-side
     * counterpart left.
     */
    public function test_embedded_referral_requires_an_explicit_value(): void
    {
        $this->postHealthRecord(['reason_for_referral' => 'Requires RHU assessment.'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('referral.urgency_level');

        $this->assertDatabaseCount('referrals', 0);
    }

    /**
     * C8 - the rule is required_with:referral, not plain required. A health
     * record carrying no referral at all must still save; plain 'required'
     * would reject every non-referral health record.
     */
    public function test_health_record_without_a_referral_is_unaffected(): void
    {
        $this->postHealthRecord(null)->assertCreated();

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('referrals', 0);
    }

    /**
     * QA 7.1 #9 - creation paths that omit the column entirely fall back to the
     * migrated column DEFAULT, which must now be Routine rather than Normal.
     */
    public function test_column_default_is_routine(): void
    {
        $referral = Referral::create([
            'tracking_id' => 'AKAY-ATTENTION-DEFAULT',
            'qr_code_value' => 'AKAY:ATTENTION:DEFAULT',
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->bhw->id,
            'reason_for_referral' => 'Column default check.',
            'referral_datetime' => now()->addDay(),
            'status' => Referral::STATUS_PENDING,
        ]);

        $this->assertSame(
            Referral::ATTENTION_ROUTINE,
            DB::table('referrals')->where('id', $referral->id)->value('urgency_level')
        );
    }

    /** The attention set is exactly two values - no legacy field survives. */
    public function test_attention_set_is_exactly_two_values(): void
    {
        $this->assertSame(['Routine', 'Priority'], Referral::ATTENTION_LEVELS);
        $this->assertFalse(
            \Illuminate\Support\Facades\Schema::hasColumn('referrals', 'legacy_urgency_level'),
            'URG-06 (revised) forbids a legacy urgency column.'
        );
    }

    private function postReferral(array $overrides)
    {
        return $this->actingAs($this->bhw, 'sanctum')->postJson('/api/referrals', [
            'patient_id' => $this->patient->id,
            'reason_for_referral' => 'Requires RHU assessment.',
            ...$overrides,
        ]);
    }

    private function postHealthRecord(?array $referral)
    {
        $payload = [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Attention scheme check.',
        ];

        if ($referral !== null) {
            $payload['needs_referral'] = true;
            $payload['referral'] = $referral;
        }

        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', $payload);
    }
}
