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
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuVisitReturnCheckInTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Return RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Return BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = User::create(['name' => 'Return Nurse', 'email' => 'return-nurse@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create(['first_name' => 'Return', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, ...$attributes]);
    }

    private function referral(Patient $patient, string $status = Referral::STATUS_PENDING, array $attributes = []): Referral
    {
        return Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Return test',
            'status' => $status,
            ...$attributes,
        ]);
    }

    private function receive(Referral $referral, ?string $remarks = null): TestResponse
    {
        Sanctum::actingAs($this->nurse, ['akay:access']);

        return $this->patchJson("/api/referrals/{$referral->id}/status", array_filter([
            'status' => Referral::STATUS_RECEIVED,
            'remarks' => $remarks,
        ]));
    }

    private function closeVisit(RhuVisitQueueEntry $visit, string $reason, ?string $note = null): TestResponse
    {
        Sanctum::actingAs($this->nurse, ['akay:access']);

        return $this->postJson("/api/rhu-visits/{$visit->id}/close", array_filter([
            'reason' => $reason,
            'note' => $note,
        ], fn ($value) => $value !== null));
    }

    private function checkIn(Patient $patient, string $key, array $extra = []): TestResponse
    {
        Sanctum::actingAs($this->nurse, ['akay:access']);

        return $this->postJson('/api/rhu-visits', [
            'patient_id' => $patient->id,
            'check_in_key' => $key,
            ...$extra,
        ]);
    }

    private function receivedThenClosed(Patient $patient, string $reason, ?string $note = null): array
    {
        $referral = $this->referral($patient);
        $this->receive($referral)->assertOk();
        $visit = RhuVisitQueueEntry::query()->where('referral_id', $referral->id)->sole();
        $this->closeVisit($visit, $reason, $note)->assertOk();

        return [$referral->fresh(), $visit->fresh()];
    }

    private function assertReturnReusesReceivedReferral(string $reason, string $key, ?string $note = null): void
    {
        $patient = $this->patient();
        [$referral, $closed] = $this->receivedThenClosed($patient, $reason, $note);
        $tracking = $referral->only(['id', 'tracking_id', 'status', 'patient_id', 'rural_health_unit_id']);
        $updates = $referral->updates()->count();

        $response = $this->checkIn($patient, $key)
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_REFERRAL)
            ->assertJsonPath('data.status', RhuVisitQueueEntry::STATUS_WAITING)
            ->assertJsonPath('data.referral.id', $referral->id);

        $created = RhuVisitQueueEntry::query()->where('check_in_key', $key)->sole();
        $this->assertSame($response->json('data.id'), $created->id);
        $this->assertNotSame($closed->id, $created->id);
        $this->assertSame($referral->id, $created->referral_id);
        $this->assertSame($patient->id, $created->patient_id);
        $this->assertSame($this->rhu->id, $created->rural_health_unit_id);
        $this->assertSame($key, $created->check_in_key);
        $this->assertNotSame('referral-'.$referral->id, $created->check_in_key);
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $closed->fresh()->status);
        $this->assertSame($reason, $closed->fresh()->close_reason);
        $this->assertNotNull($closed->fresh()->closed_at);
        $this->assertSame('referral-'.$referral->id, $closed->fresh()->check_in_key);
        $this->assertSame($tracking, $referral->fresh()->only(['id', 'tracking_id', 'status', 'patient_id', 'rural_health_unit_id']));
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
        $this->assertSame(1, Referral::count());
        $this->assertSame($updates, $referral->updates()->count());
        $this->assertSame(2, RhuVisitQueueEntry::count());

        $this->checkIn($patient, $key)
            ->assertOk()
            ->assertJsonPath('data.id', $created->id)
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_REFERRAL)
            ->assertJsonPath('data.referral.id', $referral->id);

        $this->assertSame(2, RhuVisitQueueEntry::count());
    }

    public function test_walk_in_check_in_after_left_before_consultation_reuses_the_received_referral(): void
    {
        $this->assertReturnReusesReceivedReferral(
            RhuVisitQueueEntry::CLOSE_REASON_LEFT,
            'walk-in-return-1'
        );
    }

    public function test_walk_in_check_in_after_checked_in_by_mistake_reuses_the_received_referral(): void
    {
        $this->assertReturnReusesReceivedReferral(
            RhuVisitQueueEntry::CLOSE_REASON_MISTAKE,
            'walk-in-return-mistake'
        );
    }

    public function test_walk_in_check_in_after_other_close_reuses_the_received_referral(): void
    {
        $this->assertReturnReusesReceivedReferral(
            RhuVisitQueueEntry::CLOSE_REASON_OTHER,
            'walk-in-return-other',
            'Family emergency'
        );
    }

    public function test_walk_in_check_in_does_not_attach_a_completed_referral(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_COMPLETED);
        $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, '2026-10-30 09:00:00');

        $this->assertStaysWalkIn($patient, 'walk-in-completed', $referral);
    }

    public function test_walk_in_check_in_does_not_attach_when_the_latest_visit_completed_consultation(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_RECEIVED);
        $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_LEFT, '2026-10-30 08:00:00', 'referral-'.$referral->id);
        $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, '2026-10-30 11:00:00');

        $this->assertStaysWalkIn($patient, 'walk-in-after-consult', $referral);
    }

    public function test_walk_in_check_in_does_not_attach_no_show(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_NO_SHOW);

        $this->assertStaysWalkIn($patient, 'walk-in-no-show', $referral);
    }

    public function test_walk_in_check_in_does_not_attach_a_pending_referral(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_PENDING);

        $this->assertStaysWalkIn($patient, 'walk-in-pending', $referral);
    }

    public function test_walk_in_check_in_does_not_attach_for_monitoring(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_FOR_MONITORING);
        $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_LEFT, '2026-10-30 09:00:00');

        $this->assertStaysWalkIn($patient, 'walk-in-monitoring', $referral);
    }

    public function test_walk_in_check_in_does_not_attach_another_rhus_received_referral(): void
    {
        $other = RuralHealthUnit::create(['name' => 'Other Return RHU', 'status' => 'active']);
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_RECEIVED, ['rural_health_unit_id' => $other->id]);
        $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_LEFT, '2026-10-30 09:00:00', 'other-rhu-left', $other->id);

        $this->assertStaysWalkIn($patient, 'walk-in-other-rhu', $referral);
    }

    public function test_walk_in_check_in_does_not_attach_when_two_received_referrals_are_eligible(): void
    {
        $patient = $this->patient();
        $first = $this->referral($patient);
        $second = $this->referral($patient);
        $this->receive($first)->assertOk();
        $this->closeVisit(RhuVisitQueueEntry::query()->where('referral_id', $first->id)->sole(), RhuVisitQueueEntry::CLOSE_REASON_LEFT)->assertOk();
        $this->receive($second)->assertOk();
        $this->closeVisit(RhuVisitQueueEntry::query()->where('referral_id', $second->id)->sole(), RhuVisitQueueEntry::CLOSE_REASON_MISTAKE)->assertOk();

        $this->checkIn($patient, 'walk-in-ambiguous')
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_WALK_IN)
            ->assertJsonPath('data.referral', null);

        $created = RhuVisitQueueEntry::query()->where('check_in_key', 'walk-in-ambiguous')->sole();
        $this->assertNull($created->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $created->source);
        $this->assertSame(Referral::STATUS_RECEIVED, $first->fresh()->status);
        $this->assertSame(Referral::STATUS_RECEIVED, $second->fresh()->status);
        $this->assertSame(2, Referral::count());
    }

    public function test_walk_in_check_in_attaches_only_the_received_referral_that_passes_eligibility(): void
    {
        $patient = $this->patient();
        [$eligible] = $this->receivedThenClosed($patient, RhuVisitQueueEntry::CLOSE_REASON_LEFT);
        $completed = $this->referral($patient, Referral::STATUS_RECEIVED);
        $this->closedVisit($patient, $completed, RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, '2026-10-30 12:00:00');

        $this->checkIn($patient, 'walk-in-one-eligible')
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_REFERRAL)
            ->assertJsonPath('data.referral.id', $eligible->id);

        $created = RhuVisitQueueEntry::query()->where('check_in_key', 'walk-in-one-eligible')->sole();
        $this->assertSame($eligible->id, $created->referral_id);
        $this->assertNotSame($completed->id, $created->referral_id);
        $this->assertSame(Referral::STATUS_RECEIVED, $eligible->fresh()->status);
        $this->assertSame(Referral::STATUS_RECEIVED, $completed->fresh()->status);
    }

    public function test_received_referral_with_no_visit_is_attached_on_walk_in(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_RECEIVED);

        $this->checkIn($patient, 'walk-in-no-prior-visit')
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_REFERRAL)
            ->assertJsonPath('data.referral.id', $referral->id);

        $created = RhuVisitQueueEntry::sole();
        $this->assertSame($referral->id, $created->referral_id);
        $this->assertSame('walk-in-no-prior-visit', $created->check_in_key);
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_a_later_returnable_close_is_used_when_an_earlier_visit_was_completed(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);
        $referral = $this->referral($patient, Referral::STATUS_RECEIVED);
        $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, '2026-10-29 09:00:00', 'referral-'.$referral->id);
        $later = $this->closedVisit($patient, $referral, RhuVisitQueueEntry::CLOSE_REASON_LEFT, '2026-10-30 09:00:00');

        $this->checkIn($patient, 'walk-in-later-left')
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_REFERRAL)
            ->assertJsonPath('data.referral.id', $referral->id);

        $created = RhuVisitQueueEntry::query()->where('check_in_key', 'walk-in-later-left')->sole();
        $this->assertSame($referral->id, $created->referral_id);
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $later->fresh()->status);
    }

    public function test_duplicate_active_visit_still_rejected(): void
    {
        $patient = $this->patient();
        $referral = $this->referral($patient);
        $this->receive($referral)->assertOk();
        $waiting = RhuVisitQueueEntry::sole();

        $this->checkIn($patient, 'walk-in-while-waiting')
            ->assertConflict()
            ->assertJsonPath('code', 'VISIT_ALREADY_ACTIVE')
            ->assertJsonPath('active_visit_id', $waiting->id);

        $this->assertSame(1, RhuVisitQueueEntry::count());
        $waiting->refresh();
        $this->assertSame(RhuVisitQueueEntry::SOURCE_REFERRAL, $waiting->source);
        $this->assertSame($referral->id, $waiting->referral_id);
        $this->assertSame(RhuVisitQueueEntry::STATUS_WAITING, $waiting->status);
        $this->assertNull($waiting->closed_at);
        $this->assertSame('referral-'.$referral->id, $waiting->check_in_key);
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_active_walk_in_is_not_relinked_when_a_return_referral_is_eligible(): void
    {
        $patient = $this->patient();
        [$referral] = $this->receivedThenClosed($patient, RhuVisitQueueEntry::CLOSE_REASON_LEFT);
        $walkIn = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => 'already-waiting',
        ]);

        $this->checkIn($patient, 'walk-in-during-active')
            ->assertConflict()
            ->assertJsonPath('code', 'VISIT_ALREADY_ACTIVE')
            ->assertJsonPath('active_visit_id', $walkIn->id);

        $walkIn->refresh();
        $this->assertNull($walkIn->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $walkIn->source);
        $this->assertSame(RhuVisitQueueEntry::STATUS_WAITING, $walkIn->status);
        $this->assertSame(2, RhuVisitQueueEntry::count());
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_replaying_a_walk_in_key_stays_walk_in_when_a_return_referral_is_eligible(): void
    {
        $patient = $this->patient();
        [$referral] = $this->receivedThenClosed($patient, RhuVisitQueueEntry::CLOSE_REASON_LEFT);
        $walkIn = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => 'replay-walk-in',
        ]);

        $this->checkIn($patient, 'replay-walk-in')
            ->assertOk()
            ->assertJsonPath('data.id', $walkIn->id)
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_WALK_IN)
            ->assertJsonPath('data.referral', null);

        $walkIn->refresh();
        $this->assertNull($walkIn->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $walkIn->source);
        $this->assertSame(2, RhuVisitQueueEntry::count());
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_true_walk_in_without_received_referral_stays_walk_in(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu->id]);

        $this->checkIn($patient, 'walk-in-plain')
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_WALK_IN)
            ->assertJsonPath('data.referral', null);

        $created = RhuVisitQueueEntry::sole();
        $this->assertNull($created->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $created->source);
        $this->assertSame('walk-in-plain', $created->check_in_key);
        $this->assertSame(0, Referral::count());
    }

    public function test_client_referral_id_does_not_select_the_attached_referral(): void
    {
        $patient = $this->patient();
        [$eligible] = $this->receivedThenClosed($patient, RhuVisitQueueEntry::CLOSE_REASON_LEFT);
        $other = $this->referral($patient, Referral::STATUS_COMPLETED);

        $this->checkIn($patient, 'walk-in-return-body', ['referral_id' => $other->id])
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_REFERRAL)
            ->assertJsonPath('data.referral.id', $eligible->id);

        $created = RhuVisitQueueEntry::query()->where('check_in_key', 'walk-in-return-body')->sole();
        $this->assertSame($eligible->id, $created->referral_id);
        $this->assertNotSame($other->id, $created->referral_id);
    }

    private function assertStaysWalkIn(Patient $patient, string $key, Referral $referral): void
    {
        $this->checkIn($patient, $key)
            ->assertCreated()
            ->assertJsonPath('data.source', RhuVisitQueueEntry::SOURCE_WALK_IN)
            ->assertJsonPath('data.referral', null);

        $created = RhuVisitQueueEntry::query()->where('check_in_key', $key)->sole();
        $this->assertNull($created->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $created->source);
        $this->assertSame($referral->status, $referral->fresh()->status);
    }

    private function closedVisit(
        Patient $patient,
        Referral $referral,
        string $reason,
        string $checkedInAt,
        ?string $key = null,
        ?int $rhuId = null,
    ): RhuVisitQueueEntry {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $rhuId ?? $this->rhu->id,
            'patient_id' => $patient->id,
            'referral_id' => $referral->id,
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'status' => RhuVisitQueueEntry::STATUS_CLOSED,
            'checked_in_at' => $checkedInAt,
            'closed_at' => $checkedInAt,
            'close_reason' => $reason,
            'check_in_key' => $key ?? uniqid('closed-', true),
        ]);
    }
}
