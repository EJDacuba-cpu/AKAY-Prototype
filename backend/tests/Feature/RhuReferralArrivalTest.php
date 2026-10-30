<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\FacilityAccessService;
use App\Services\ReferralService;
use App\Services\RhuVisitQueueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuReferralArrivalTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    private User $midwife;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Arrival RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Arrival BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = User::create(['name' => 'Arrival Nurse', 'email' => 'arrival-nurse@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id]);
        $this->midwife = User::create(['name' => 'Arrival Midwife', 'email' => 'arrival-midwife@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create(['first_name' => 'Arrival', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, ...$attributes]);
    }

    private function referral(Patient $patient, string $status = Referral::STATUS_PENDING): Referral
    {
        return Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Arrival test',
            'status' => $status,
        ]);
    }

    private function receive(Referral $referral, ?string $remarks = null)
    {
        Sanctum::actingAs($this->nurse, ['akay:access']);

        return $this->patchJson("/api/referrals/{$referral->id}/status", array_filter([
            'status' => Referral::STATUS_RECEIVED,
            'remarks' => $remarks,
        ]));
    }

    private function walkInVisit(Patient $patient, array $attributes = []): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('walk-in-', true),
            ...$attributes,
        ]);
    }

    public function test_received_enqueues_one_waiting_referral_visit(): void
    {
        $referral = $this->referral($this->patient());

        $this->receive($referral)->assertOk()->assertJsonPath('status', Referral::STATUS_RECEIVED);

        $entry = RhuVisitQueueEntry::sole();
        $this->assertSame(RhuVisitQueueEntry::SOURCE_REFERRAL, $entry->source);
        $this->assertSame($referral->id, $entry->referral_id);
        $this->assertSame($referral->patient_id, $entry->patient_id);
        $this->assertSame(RhuVisitQueueEntry::STATUS_WAITING, $entry->status);
        $this->assertSame($this->nurse->id, $entry->checked_in_by);
        $this->assertSame('referral-'.$referral->id, $entry->check_in_key);
        $this->assertSame(1, $referral->updates()->where('status', Referral::STATUS_RECEIVED)->count());
        $this->assertSame(1, UserNotification::where('user_id', $this->midwife->id)->where('type', 'referral_received')->count());
    }

    public function test_repeated_received_creates_no_second_visit(): void
    {
        $referral = $this->referral($this->patient());
        $this->receive($referral)->assertOk();

        $this->receive($referral)->assertOk()->assertJsonPath('status_unchanged', true);

        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_late_arrival_from_no_show_enqueues_the_visit(): void
    {
        $referral = $this->referral($this->patient(), Referral::STATUS_NO_SHOW);

        $this->receive($referral, 'Arrived the next morning.')->assertOk();

        $this->assertSame($referral->id, RhuVisitQueueEntry::sole()->referral_id);
    }

    public function test_late_arrival_without_note_is_refused_and_creates_no_visit(): void
    {
        $referral = $this->referral($this->patient(), Referral::STATUS_NO_SHOW);

        $this->receive($referral)->assertUnprocessable()->assertJsonValidationErrors('remarks');

        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_arrival_links_an_active_walk_in_visit(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => null]);
        $referral = $this->referral($patient);
        $walkIn = $this->walkInVisit($patient);

        $this->receive($referral)->assertOk();

        $entry = RhuVisitQueueEntry::sole();
        $this->assertSame($walkIn->id, $entry->id);
        $this->assertSame($referral->id, $entry->referral_id);
        $this->assertSame(RhuVisitQueueEntry::SOURCE_WALK_IN, $entry->source);
    }

    public function test_arrival_leaves_a_visit_linked_to_another_referral_unchanged(): void
    {
        $patient = $this->patient();
        $earlier = $this->referral($patient, Referral::STATUS_RECEIVED);
        $visit = $this->walkInVisit($patient, ['source' => RhuVisitQueueEntry::SOURCE_REFERRAL, 'referral_id' => $earlier->id]);
        $later = $this->referral($patient);

        $this->receive($later)->assertOk();

        $this->assertSame(1, RhuVisitQueueEntry::count());
        $this->assertSame($earlier->id, $visit->fresh()->referral_id);
    }

    public function test_household_member_can_be_received_without_ownership_change(): void
    {
        $household = Household::create(['barangay_health_center_id' => $this->bhc->id, 'serial_number' => 'FSN-2026-0001']);
        $patient = $this->patient(['household_id' => $household->id]);
        $referral = $this->referral($patient);

        $this->receive($referral)->assertOk();

        $this->assertNull($patient->fresh()->rural_health_unit_id);
        $this->assertSame($this->bhc->id, $patient->fresh()->barangay_health_center_id);
        $this->assertSame($patient->id, RhuVisitQueueEntry::sole()->patient_id);
    }

    public function test_non_household_patient_keeps_the_receiving_rhu_link(): void
    {
        $patient = $this->patient();

        $this->receive($this->referral($patient))->assertOk();

        $this->assertSame($this->rhu->id, $patient->fresh()->rural_health_unit_id);
    }

    public function test_arrival_that_loses_a_race_links_the_winning_walk_in_visit(): void
    {
        $patient = $this->patient();
        $referral = $this->referral($patient);
        // A concurrent walk-in check-in commits between our lookup and our insert.
        $service = new class(app(FacilityAccessService::class), $this->rhu->id, $patient->id) extends RhuVisitQueueService
        {
            public function __construct(FacilityAccessService $facilityAccess, private readonly int $rhuId, private readonly int $patientId)
            {
                parent::__construct($facilityAccess);
            }

            protected function insert(array $attributes): RhuVisitQueueEntry
            {
                DB::table('rhu_visit_queue_entries')->insert(['rural_health_unit_id' => $this->rhuId, 'patient_id' => $this->patientId, 'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => 'winner', 'created_at' => now(), 'updated_at' => now()]);

                return parent::insert($attributes);
            }
        };

        $entry = DB::transaction(fn () => $service->recordReferralArrival($this->nurse, $referral));

        $this->assertSame('winner', $entry->check_in_key);
        $this->assertSame($referral->id, $entry->fresh()->referral_id);
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_inactive_patient_arrival_is_refused_and_rolled_back(): void
    {
        $referral = $this->referral($this->patient(['status' => 'inactive']));

        $this->receive($referral)->assertUnprocessable()->assertJsonValidationErrors('patient_id');

        $this->assertSame(Referral::STATUS_PENDING, $referral->fresh()->status);
        $this->assertSame(0, RhuVisitQueueEntry::count());
        $this->assertSame(0, $referral->updates()->count());
    }
}
