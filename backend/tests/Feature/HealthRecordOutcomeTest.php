<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralHold;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Covers HealthRecords-Redesign-Plan.md Decisions 1-3: the backend-computed
 * Outcome (Referred > Follow-up > Routine) and the Awaiting-Provider
 * sub-label for a referral blocked at submission (DOC-14).
 */
class HealthRecordOutcomeTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Outcome RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Outcome BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Outcome BHW',
            'email' => 'outcome-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Outcome',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }

    public function test_record_with_no_referral_or_follow_up_is_routine(): void
    {
        $record = $this->record();

        $this->assertSame('Routine', $record->outcome);
        $this->assertNull($record->outcome_sub_label);
    }

    public function test_record_with_active_follow_up_is_follow_up(): void
    {
        $record = $this->record();
        $this->followUpTask($record, FollowUpTask::STATE_PENDING);

        $this->assertSame('Follow-up', $record->outcome);
    }

    public function test_record_with_a_referral_row_is_referred_with_no_sub_label(): void
    {
        $record = $this->record();
        $this->referral($record);

        $this->assertSame('Referred', $record->outcome);
        $this->assertNull($record->outcome_sub_label);
    }

    /** Decision 3: blocked at submission - only a waiting hold exists, no referrals row. */
    public function test_record_with_only_a_waiting_hold_is_referred_awaiting_provider(): void
    {
        $record = $this->record();
        $this->hold($record, ReferralHold::STATUS_WAITING);

        $this->assertSame('Referred', $record->outcome);
        $this->assertSame('Awaiting Provider', $record->outcome_sub_label);
    }

    /** A resolved/discarded hold with no referrals row must not read as Referred. */
    public function test_record_with_only_a_resolved_hold_is_not_referred(): void
    {
        $record = $this->record();
        $this->hold($record, ReferralHold::STATUS_DISCARDED);

        $this->assertSame('Routine', $record->outcome);
        $this->assertNull($record->outcome_sub_label);
    }

    /** Decision 2: Referred outranks an active follow-up even for historical records that have both. */
    public function test_referred_takes_precedence_over_an_active_follow_up(): void
    {
        $record = $this->record();
        $this->followUpTask($record, FollowUpTask::STATE_PENDING);
        $this->hold($record, ReferralHold::STATUS_WAITING);

        $this->assertSame('Referred', $record->outcome);
        $this->assertSame('Awaiting Provider', $record->outcome_sub_label);
    }

    /** The eager-loaded list path (OUTCOME_RELATIONS) must resolve to the same values as a fresh fetch. */
    public function test_outcome_relations_eager_load_matches_lazy_resolution(): void
    {
        $record = $this->record();
        $this->hold($record, ReferralHold::STATUS_WAITING);

        $eagerLoaded = HealthRecord::query()
            ->with(HealthRecord::OUTCOME_RELATIONS)
            ->findOrFail($record->id);

        $this->assertSame('Referred', $eagerLoaded->outcome);
        $this->assertSame('Awaiting Provider', $eagerLoaded->outcome_sub_label);
    }

    private function record(): HealthRecord
    {
        return HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'date_recorded' => now(),
        ]);
    }

    private function followUpTask(HealthRecord $record, string $state): FollowUpTask
    {
        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->addDays(3),
            'state' => $state,
            'created_by' => $this->bhw->id,
        ]);
    }

    private function referral(HealthRecord $record): Referral
    {
        return Referral::create([
            'tracking_id' => 'TRK-'.uniqid(),
            'qr_code_value' => 'QR-'.uniqid(),
            'patient_id' => $this->patient->id,
            'health_record_id' => $record->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->bhw->id,
            'reason_for_referral' => 'Needs RHU assessment.',
            'urgency_level' => Referral::ATTENTION_ROUTINE,
            'status' => Referral::STATUS_PENDING,
        ]);
    }

    private function hold(HealthRecord $record, string $status): ReferralHold
    {
        return ReferralHold::create([
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->bhw->id,
            'health_record_id' => $record->id,
            'status' => $status,
        ]);
    }
}
