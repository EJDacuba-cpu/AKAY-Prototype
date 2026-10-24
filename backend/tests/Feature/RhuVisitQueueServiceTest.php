<?php

namespace Tests\Feature;

use App\Exceptions\RhuVisitCheckInKeyConflictException;
use App\Exceptions\RhuVisitDuplicateActiveException;
use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\FacilityAccessService;
use App\Services\ReferralService;
use App\Services\RhuVisitQueueService;
use Closure;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class RhuVisitQueueServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-24 01:30:00 UTC');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function rhu(string $status = 'active'): RuralHealthUnit
    {
        return RuralHealthUnit::create(['name' => 'RHU '.uniqid('', true), 'status' => $status]);
    }

    private function bhc(): BarangayHealthCenter
    {
        return BarangayHealthCenter::create(['name' => 'BHC '.uniqid('', true), 'status' => 'active']);
    }

    private function rhuUser(RuralHealthUnit $rhu): User
    {
        return User::create(['name' => 'RHU Nurse', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id]);
    }

    private function bhcUser(): User
    {
        return User::create(['name' => 'BHC Midwife', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc()->id]);
    }

    private function adminUser(): User
    {
        return User::create(['name' => 'Admin', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'admin']);
    }

    private function patient(array $attributes): Patient
    {
        return Patient::create(['first_name' => 'Queue', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', ...$attributes]);
    }

    private function referral(Patient $patient, RuralHealthUnit $rhu, array $attributes = []): Referral
    {
        return Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc()->id,
            'rural_health_unit_id' => $rhu->id,
            'reason_for_referral' => 'Test',
            'status' => Referral::STATUS_PENDING,
            ...$attributes,
        ]);
    }

    private function service(): RhuVisitQueueService
    {
        return app(RhuVisitQueueService::class);
    }

    private function assertForbidden(Closure $call): void
    {
        try {
            $call();
            $this->fail('Expected a 403 response.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
    }

    private function assertValidationErrorOn(string $field, Closure $call): void
    {
        try {
            $call();
            $this->fail("Expected a validation error on {$field}.");
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey($field, $exception->errors());
        }
    }

    /** A service whose insert() first lets a competing writer win the race. */
    private function racingService(array $competingRow): RhuVisitQueueService
    {
        return new class(app(FacilityAccessService::class), $competingRow) extends RhuVisitQueueService
        {
            public function __construct(FacilityAccessService $facilityAccess, private readonly array $competingRow)
            {
                parent::__construct($facilityAccess);
            }

            protected function insert(array $attributes): RhuVisitQueueEntry
            {
                DB::table('rhu_visit_queue_entries')->insert([...$this->competingRow, 'created_at' => now(), 'updated_at' => now()]);

                return parent::insert($attributes);
            }
        };
    }

    public function test_bhc_and_admin_users_cannot_check_in(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu()->id]);

        foreach ([$this->bhcUser(), $this->adminUser()] as $user) {
            $this->assertForbidden(fn () => $this->service()->checkIn($user, $patient->id, null, 'key-1'));
        }
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_rhu_user_with_inactive_facility_cannot_check_in(): void
    {
        $rhu = $this->rhu('inactive');
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);

        $this->assertForbidden(fn () => $this->service()->checkIn($this->rhuUser($rhu), $patient->id, null, 'key-1'));
    }

    public function test_patient_outside_the_rhu_is_denied(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => $this->rhu()->id]);

        $this->assertForbidden(fn () => $this->service()->checkIn($this->rhuUser($this->rhu()), $patient->id, null, 'key-1'));
    }

    public function test_referral_to_another_rhu_is_denied(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $referral = $this->referral($patient, $this->rhu());

        $this->assertForbidden(fn () => $this->service()->checkIn($this->rhuUser($rhu), $patient->id, $referral->id, 'key-1'));
    }

    public function test_referred_check_in_records_referral_source_and_patient(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['barangay_health_center_id' => $this->bhc()->id]);
        $referral = $this->referral($patient, $rhu);

        $result = $this->service()->checkIn($user, $patient->id, $referral->id, 'key-1');
        $entry = $result['entry'];

        $this->assertTrue($result['created']);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_REFERRAL, $entry->source);
        $this->assertSame($referral->id, $entry->referral_id);
        $this->assertSame($patient->id, $entry->patient_id);
        $this->assertSame($rhu->id, $entry->rural_health_unit_id);
        $this->assertSame(RhuVisitQueueEntry::STATUS_WAITING, $entry->status);
        $this->assertSame($user->id, $entry->checked_in_by);
        $this->assertTrue($entry->checked_in_at->equalTo(now()));
        $this->assertNull($entry->closed_at);
    }

    public function test_referral_for_a_different_patient_is_rejected(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $referral = $this->referral($this->patient(['rural_health_unit_id' => $rhu->id]), $rhu);

        $this->assertValidationErrorOn('referral_id', fn () => $this->service()->checkIn($this->rhuUser($rhu), $patient->id, $referral->id, 'key-1'));
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_walk_in_check_in_has_no_referral(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);

        $entry = $this->service()->checkIn($this->rhuUser($rhu), $patient->id, null, 'key-1')['entry'];

        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $entry->source);
        $this->assertNull($entry->referral_id);
    }

    public function test_check_in_changes_no_patient_referral_or_record_data(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['barangay_health_center_id' => $this->bhc()->id]);
        $referral = $this->referral($patient, $rhu);
        $patientBefore = (array) DB::table('patients')->find($patient->id);
        $referralBefore = (array) DB::table('referrals')->find($referral->id);
        $recordsBefore = DB::table('health_records')->count();

        $this->service()->checkIn($this->rhuUser($rhu), $patient->id, $referral->id, 'key-1');

        $this->assertSame($patientBefore, (array) DB::table('patients')->find($patient->id));
        $this->assertSame($referralBefore, (array) DB::table('referrals')->find($referral->id));
        $this->assertSame($recordsBefore, DB::table('health_records')->count());
    }

    public function test_previously_referred_bhc_patient_may_check_in_as_walk_in(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['barangay_health_center_id' => $this->bhc()->id]);
        $this->referral($patient, $rhu, ['status' => Referral::STATUS_COMPLETED]);

        $result = $this->service()->checkIn($this->rhuUser($rhu), $patient->id, null, 'key-1');

        $this->assertTrue($result['created']);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $result['entry']->source);
        $this->assertNull($patient->fresh()->rural_health_unit_id);
    }

    public function test_inactive_patient_cannot_check_in(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id, 'status' => 'inactive']);

        $this->assertValidationErrorOn('patient_id', fn () => $this->service()->checkIn($this->rhuUser($rhu), $patient->id, null, 'key-1'));
    }

    public function test_unknown_referral_is_not_found(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);

        $this->expectException(ModelNotFoundException::class);
        $this->service()->checkIn($this->rhuUser($rhu), $patient->id, 999999, 'key-1');
    }

    public function test_blank_or_overlong_key_is_rejected(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);

        foreach (['', '   ', str_repeat('k', 101)] as $key) {
            $this->assertValidationErrorOn('check_in_key', fn () => $this->service()->checkIn($user, $patient->id, null, $key));
        }
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_retry_with_same_key_and_payload_returns_existing_entry(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);

        $first = $this->service()->checkIn($user, $patient->id, null, 'key-1');
        $retry = $this->service()->checkIn($user, $patient->id, null, 'key-1');

        $this->assertFalse($retry['created']);
        $this->assertSame($first['entry']->id, $retry['entry']->id);
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_walk_in_retry_still_replays_after_a_referral_is_linked(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $first = $this->service()->checkIn($user, $patient->id, null, 'key-1')['entry'];
        // D4: a referral arriving later is linked to the existing walk-in visit.
        $first->update(['referral_id' => $this->referral($patient, $rhu)->id]);

        $retry = $this->service()->checkIn($user, $patient->id, null, 'key-1');

        $this->assertFalse($retry['created']);
        $this->assertSame($first->id, $retry['entry']->id);
    }

    public function test_same_key_with_different_payload_conflicts(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $this->service()->checkIn($user, $this->patient(['rural_health_unit_id' => $rhu->id])->id, null, 'key-1');

        $this->expectException(RhuVisitCheckInKeyConflictException::class);
        try {
            $this->service()->checkIn($user, $this->patient(['rural_health_unit_id' => $rhu->id])->id, null, 'key-1');
        } finally {
            $this->assertSame(1, RhuVisitQueueEntry::count());
        }
    }

    public function test_active_patient_with_new_key_is_a_duplicate(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $first = $this->service()->checkIn($user, $patient->id, null, 'key-1')['entry'];

        try {
            $this->service()->checkIn($user, $patient->id, null, 'key-2');
            $this->fail('Expected a duplicate active visit.');
        } catch (RhuVisitDuplicateActiveException $exception) {
            $this->assertSame($first->id, $exception->entry->id);
        }
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_race_loser_resolves_to_the_winning_entry(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $service = $this->racingService(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => 'winner-key']);

        try {
            $service->checkIn($user, $patient->id, null, 'loser-key');
            $this->fail('Expected a duplicate active visit.');
        } catch (RhuVisitDuplicateActiveException $exception) {
            $this->assertSame('winner-key', $exception->entry->check_in_key);
        }
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_race_on_same_key_resolves_to_idempotent_replay(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $service = $this->racingService(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => 'key-1']);

        $result = $service->checkIn($user, $patient->id, null, 'key-1');

        $this->assertFalse($result['created']);
        $this->assertSame((int) DB::table('rhu_visit_queue_entries')->value('id'), $result['entry']->id);
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_new_visit_allowed_after_previous_one_is_closed_same_day(): void
    {
        $rhu = $this->rhu();
        $user = $this->rhuUser($rhu);
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $first = $this->service()->checkIn($user, $patient->id, null, 'key-1')['entry'];
        $first->update(['closed_at' => now()]);

        $second = $this->service()->checkIn($user, $patient->id, null, 'key-2');

        $this->assertTrue($second['created']);
        $this->assertNotSame($first->id, $second['entry']->id);
        $this->assertSame(2, RhuVisitQueueEntry::where('patient_id', $patient->id)->count());
    }

    private function entry(RuralHealthUnit $rhu, Patient $patient, array $attributes = []): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('key-', true),
            ...$attributes,
        ]);
    }

    public function test_find_returns_own_rhu_entry(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $entry = $this->entry($rhu, $patient);

        $found = $this->service()->find($this->rhuUser($rhu), $entry->id);

        $this->assertSame($entry->id, $found->id);
        $this->assertSame($patient->id, $found->patient->id);
    }

    public function test_find_hides_other_rhu_entry(): void
    {
        $otherRhu = $this->rhu();
        $entry = $this->entry($otherRhu, $this->patient(['rural_health_unit_id' => $otherRhu->id]));

        $this->expectException(ModelNotFoundException::class);
        $this->service()->find($this->rhuUser($this->rhu()), $entry->id);
    }

    public function test_find_and_list_deny_bhc_admin_and_inactive_facility(): void
    {
        $rhu = $this->rhu();
        $entry = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]));

        foreach ([$this->bhcUser(), $this->adminUser(), $this->rhuUser($this->rhu('inactive'))] as $user) {
            $this->assertForbidden(fn () => $this->service()->find($user, $entry->id));
            $this->assertForbidden(fn () => $this->service()->list($user));
        }
    }

    public function test_list_returns_only_own_active_entries_oldest_first(): void
    {
        $rhu = $this->rhu();
        $otherRhu = $this->rhu();
        $nine = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]), ['checked_in_at' => now()->setTime(1, 0)]);
        $eight = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]), ['checked_in_at' => now()->setTime(0, 0)]);
        $this->entry($otherRhu, $this->patient(['rural_health_unit_id' => $otherRhu->id]), ['checked_in_at' => now()->setTime(0, 30)]);
        $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]), ['checked_in_at' => now()->setTime(0, 15), 'closed_at' => now()]);

        $list = $this->service()->list($this->rhuUser($rhu));

        $this->assertSame([$eight->id, $nine->id], $list->pluck('id')->all());
        $this->assertTrue($list->first()->relationLoaded('patient'));
    }

    public function test_list_with_active_only_false_includes_closed_entries(): void
    {
        $rhu = $this->rhu();
        $otherRhu = $this->rhu();
        $open = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]));
        $closed = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]), ['closed_at' => now()]);
        $this->entry($otherRhu, $this->patient(['rural_health_unit_id' => $otherRhu->id]), ['closed_at' => now()]);

        $ids = $this->service()->list($this->rhuUser($rhu), false)->pluck('id')->all();

        $this->assertEqualsCanonicalizing([$open->id, $closed->id], $ids);
    }

    public function test_list_breaks_checked_in_at_ties_by_id(): void
    {
        $rhu = $this->rhu();
        $first = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]));
        $second = $this->entry($rhu, $this->patient(['rural_health_unit_id' => $rhu->id]));

        $this->assertSame([$first->id, $second->id], $this->service()->list($this->rhuUser($rhu))->pluck('id')->all());
    }

    public function test_repeat_visits_both_listed_when_including_closed(): void
    {
        $rhu = $this->rhu();
        $patient = $this->patient(['rural_health_unit_id' => $rhu->id]);
        $earlier = $this->entry($rhu, $patient, ['checked_in_at' => now()->subHour(), 'closed_at' => now()->subMinutes(30)]);
        $later = $this->entry($rhu, $patient);
        $user = $this->rhuUser($rhu);

        $this->assertSame([$earlier->id, $later->id], $this->service()->list($user, false)->pluck('id')->all());
        $this->assertSame([$later->id], $this->service()->list($user)->pluck('id')->all());
    }
}
