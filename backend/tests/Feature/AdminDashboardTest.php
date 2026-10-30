<?php

namespace Tests\Feature;

use App\Models\AccountInvite;
use App\Models\BarangayHealthCenter;
use App\Models\FacilityAssignment;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\PasswordResetRequest;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123',
            'role' => 'admin', 'status' => 'active', 'permissions' => [],
        ]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function makeRhu(string $name, string $status = 'active'): RuralHealthUnit
    {
        return RuralHealthUnit::create(['name' => $name, 'status' => $status]);
    }

    private function makeBhc(string $name, RuralHealthUnit $rhu, string $status = 'active'): BarangayHealthCenter
    {
        return BarangayHealthCenter::create(['name' => $name, 'status' => $status, 'rural_health_unit_id' => $rhu->id]);
    }

    private function makeUser(string $role, array $attrs = []): User
    {
        $this->sequence++;

        return User::create([
            'name' => 'User '.$this->sequence, 'email' => "user{$this->sequence}@example.test",
            'password' => bin2hex(random_bytes(16)),
            'role' => $role, 'staff_role' => $role === 'admin' ? null : 'midwife', 'status' => 'active',
            'permissions' => [],
            ...$attrs,
        ]);
    }

    private function makePatient(BarangayHealthCenter $bhc, array $attrs = []): Patient
    {
        $this->sequence++;
        $createdAt = $attrs['created_at'] ?? null;
        unset($attrs['created_at']);

        $patient = Patient::create([
            'first_name' => 'Patient'.$this->sequence, 'last_name' => 'Test', 'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            ...$attrs,
        ]);

        if ($createdAt !== null) {
            $patient->forceFill(['created_at' => $createdAt])->save();
        }

        return $patient;
    }

    private function makeReferral(Patient $patient, string $status, array $attrs = []): Referral
    {
        $this->sequence++;
        $createdAt = $attrs['created_at'] ?? null;
        unset($attrs['created_at']);
        $bhc = BarangayHealthCenter::findOrFail($patient->barangay_health_center_id);

        $referral = Referral::create([
            'tracking_id' => 'AKAY-DASH-'.$this->sequence,
            'qr_code_value' => 'AKAY:REFERRAL:AKAY-DASH-'.$this->sequence,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $bhc->rural_health_unit_id,
            'status' => $status,
            'urgency_level' => Referral::ATTENTION_ROUTINE,
            'reason_for_referral' => 'Dashboard test.',
            'referral_datetime' => now(),
            ...$attrs,
        ]);

        if ($createdAt !== null) {
            $referral->forceFill(['created_at' => $createdAt])->save();
        }

        return $referral;
    }

    private function makeFollowUp(Patient $patient, array $attrs): FollowUpTask
    {
        $record = HealthRecord::create([
            'patient_id' => $patient->id, 'category' => 'General Consultation',
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'date_recorded' => now()->subWeeks(3),
        ]);

        return FollowUpTask::create([
            'health_record_id' => $record->id, 'patient_id' => $patient->id,
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'state' => 'pending', 'due_date' => now()->toDateString(),
            ...$attrs,
        ]);
    }

    private function makeMedicine(array $attrs): Medicine
    {
        $this->sequence++;

        return Medicine::create([
            'name' => 'Medicine '.$this->sequence, 'category' => 'Basic Medicines', 'quantity' => 10, 'unit' => 'pcs',
            'availability_status' => 'Available', 'is_active' => true,
            ...$attrs,
        ]);
    }

    private function dashboard(string $query = ''): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/admin/dashboard'.$query);
    }

    private function stamp(\Illuminate\Testing\TestResponse $response, string $path): string
    {
        return CarbonImmutable::parse($response->json($path))->format('Y-m-d H:i');
    }

    public function test_only_admin_can_open_the_dashboard(): void
    {
        $this->dashboard()->assertOk();

        $rhu = $this->makeRhu('RHU One');
        $bhc = $this->makeBhc('BHC One', $rhu);

        Sanctum::actingAs($this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]), ['*']);
        $this->dashboard()->assertForbidden();

        Sanctum::actingAs($this->makeUser('rhu', ['rural_health_unit_id' => $rhu->id]), ['*']);
        $this->dashboard()->assertForbidden();
    }

    public function test_period_windows(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-31 15:00'));

        $month = $this->dashboard('?period=month')->assertOk()->assertJsonPath('data.period.key', 'month');
        $this->assertSame('2026-10-01 00:00', $this->stamp($month, 'data.period.from'));
        $this->assertSame('2026-10-31 15:00', $this->stamp($month, 'data.period.to'));
        $this->assertSame('2026-09-01 00:00', $this->stamp($month, 'data.period.previous_from'));
        $this->assertSame('2026-09-30 15:00', $this->stamp($month, 'data.period.previous_to'));

        $week = $this->dashboard('?period=week')->assertOk()->assertJsonPath('data.period.key', 'week');
        $this->assertSame('2026-10-26 00:00', $this->stamp($week, 'data.period.from'));
        $this->assertSame('2026-10-19 00:00', $this->stamp($week, 'data.period.previous_from'));
        $this->assertSame('2026-10-24 15:00', $this->stamp($week, 'data.period.previous_to'));

        $today = $this->dashboard('?period=today')->assertOk()->assertJsonPath('data.period.key', 'today');
        $this->assertSame('2026-10-31 00:00', $this->stamp($today, 'data.period.from'));
        $this->assertSame('2026-10-30 00:00', $this->stamp($today, 'data.period.previous_from'));
        $this->assertSame('2026-10-30 15:00', $this->stamp($today, 'data.period.previous_to'));

        $year = $this->dashboard('?period=year')->assertOk()->assertJsonPath('data.period.key', 'year');
        $this->assertSame('2026-01-01 00:00', $this->stamp($year, 'data.period.from'));
        $this->assertSame('2025-01-01 00:00', $this->stamp($year, 'data.period.previous_from'));
        $this->assertSame('2025-10-31 15:00', $this->stamp($year, 'data.period.previous_to'));
    }

    public function test_unknown_period_falls_back_to_month(): void
    {
        foreach (['?period=MONTH', '?period=%3Cscript%3E', ''] as $query) {
            $this->dashboard($query)->assertOk()->assertJsonPath('data.period.key', 'month');
        }
    }

    public function test_account_counts(): void
    {
        $rhu = $this->makeRhu('RHU One');
        $bhc = $this->makeBhc('BHC One', $rhu);

        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id, 'status' => 'inactive']);
        $this->makeUser('rhu', ['rural_health_unit_id' => $rhu->id]);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.accounts', ['total' => 5, 'active' => 4, 'inactive' => 1, 'bhc' => 3, 'rhu' => 1])
            ->assertJsonStructure(['data' => ['generated_at']]);
    }

    public function test_referral_counts_use_period_and_normalized_status(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00'));
        $bhc = $this->makeBhc('BHC One', $this->makeRhu('RHU One'));
        $patient = $this->makePatient($bhc);

        $this->makeReferral($patient, 'Pending', ['urgency_level' => 'Priority', 'referral_datetime' => '2026-10-05 09:00']);
        $this->makeReferral($patient, 'pending ', ['urgency_level' => 'Routine', 'referral_datetime' => '2026-10-06 09:00']);
        $this->makeReferral($patient, 'Completed', ['referral_datetime' => '2026-10-07 09:00']);
        $this->makeReferral($patient, 'complete', ['referral_datetime' => '2026-10-08 09:00']);
        $this->makeReferral($patient, 'No-Show', ['referral_datetime' => '2026-10-09 09:00']);
        $this->makeReferral($patient, 'For Monitoring', ['referral_datetime' => '2026-10-10 09:00']);
        $this->makeReferral($patient, 'Received', ['referral_datetime' => null, 'created_at' => '2026-10-03 09:00:00']);
        $this->makeReferral($patient, 'Completed', ['referral_datetime' => '2026-09-05 09:00']);
        $this->makeReferral($patient, 'Completed', ['referral_datetime' => '2026-09-05 11:00']);
        $this->makeReferral($patient, 'Pending', ['urgency_level' => 'Routine', 'referral_datetime' => '2026-08-01 09:00']);

        $this->dashboard('?period=month')
            ->assertOk()
            ->assertJsonPath('data.referrals', [
                'total' => 7, 'previous_total' => 2, 'completed' => 2,
                'no_show' => 1, 'pending' => 3, 'priority_pending' => 1,
            ]);
    }

    public function test_follow_up_counts(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00'));
        $bhc = $this->makeBhc('BHC One', $this->makeRhu('RHU One'));
        $patient = $this->makePatient($bhc);

        $this->makeFollowUp($patient, ['state' => 'pending', 'due_date' => '2026-10-11']);
        $this->makeFollowUp($patient, ['state' => 'pending', 'due_date' => '2026-10-12']);
        $this->makeFollowUp($patient, ['state' => 'fulfilled', 'due_date' => '2026-10-05', 'fulfilled_at' => '2026-10-05 09:00']);
        $this->makeFollowUp($patient, ['state' => 'no_show', 'due_date' => '2026-10-08', 'no_show_at' => '2026-10-09 09:00']);
        $this->makeFollowUp($patient, ['state' => 'no_show', 'due_date' => '2026-09-08', 'no_show_at' => '2026-09-09 09:00']);

        $this->dashboard('?period=month')
            ->assertOk()
            ->assertJsonPath('data.follow_ups', ['overdue' => 1, 'no_show' => 1]);
    }

    public function test_patient_counts(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00'));
        $bhc = $this->makeBhc('BHC One', $this->makeRhu('RHU One'));

        foreach (['2026-08-01', '2026-09-15', '2026-09-30'] as $date) {
            $this->makePatient($bhc, ['created_at' => $date.' 09:00:00']);
        }
        foreach (['2026-10-02', '2026-10-11'] as $date) {
            $this->makePatient($bhc, ['created_at' => $date.' 09:00:00']);
        }

        $this->dashboard('?period=month')
            ->assertOk()
            ->assertJsonPath('data.patients', ['total' => 5, 'new' => 2]);
    }

    public function test_medicine_low_stock_split_by_rhu_and_bhc(): void
    {
        $rhu = $this->makeRhu('RHU One');
        $bhcA = $this->makeBhc('BHC A', $rhu);
        $bhcB = $this->makeBhc('BHC B', $rhu);
        $bhcC = $this->makeBhc('BHC C', $rhu);

        $this->makeMedicine(['rural_health_unit_id' => $rhu->id, 'availability_status' => 'Low Stock']);
        $this->makeMedicine(['rural_health_unit_id' => $rhu->id, 'availability_status' => 'Unavailable']);
        $this->makeMedicine(['rural_health_unit_id' => $rhu->id, 'availability_status' => 'Available']);
        $this->makeMedicine(['barangay_health_center_id' => $bhcA->id, 'availability_status' => 'Low Stock']);
        $this->makeMedicine(['barangay_health_center_id' => $bhcA->id, 'availability_status' => 'Low Stock']);
        $this->makeMedicine(['barangay_health_center_id' => $bhcB->id, 'availability_status' => 'Unavailable']);
        $this->makeMedicine(['barangay_health_center_id' => $bhcC->id, 'availability_status' => 'Available']);
        $this->makeMedicine(['barangay_health_center_id' => $bhcC->id, 'availability_status' => 'Low Stock', 'is_active' => false]);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.medicines', ['rhu_low_stock' => 2, 'bhc_low_stock' => 3, 'bhc_barangays_affected' => 2]);
    }

    public function test_low_stock_at_inactive_bhcs_is_excluded_so_totals_match_the_table(): void
    {
        $rhu = $this->makeRhu('RHU One');
        $active = $this->makeBhc('BHC Active', $rhu);
        $inactive = $this->makeBhc('BHC Inactive', $rhu, 'inactive');

        $this->makeMedicine(['barangay_health_center_id' => $active->id, 'availability_status' => 'Low Stock']);
        $this->makeMedicine(['barangay_health_center_id' => $inactive->id, 'availability_status' => 'Low Stock']);
        $this->makeMedicine(['barangay_health_center_id' => $inactive->id, 'availability_status' => 'Unavailable']);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.medicines.bhc_low_stock', 1)
            ->assertJsonPath('data.medicines.bhc_barangays_affected', 1)
            ->assertJsonCount(1, 'data.barangays')
            ->assertJsonPath('data.barangays.0.low_stock', 1);
    }

    public function test_reset_requests_and_invites_match_password_and_invites_counts(): void
    {
        $rhu = $this->makeRhu('RHU One');
        $bhc = $this->makeBhc('BHC One', $rhu);
        $account = fn (string $status = 'active'): User => $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id, 'status' => $status]);

        foreach ([['pending', null], ['pending', null], ['completed', now()]] as [$status, $completedAt]) {
            $user = $account();
            PasswordResetRequest::create([
                'user_id' => $user->id, 'email' => $user->email,
                'status' => $status, 'requested_at' => now(), 'completed_at' => $completedAt,
            ]);
        }

        // A failed delivery is Pending on the Invites tab; a closed account's invite is Cancelled.
        foreach ([['active', 'failed'], ['inactive', 'failed']] as [$userStatus, $delivery]) {
            $user = $account($userStatus);
            AccountInvite::create([
                'user_id' => $user->id, 'email' => $user->email,
                'status' => AccountInvite::STATUS_PENDING, 'delivery' => $delivery, 'expires_at' => now()->addHours(10),
            ]);
        }

        $summary = $this->getJson('/api/password-invites/summary')->assertOk();
        $this->assertSame(2, $summary->json('data.reset_requests'));
        $this->assertSame(1, $summary->json('data.invites'));

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.attention.reset_requests', $summary->json('data.reset_requests'))
            ->assertJsonPath('data.attention.invites', $summary->json('data.invites'));
    }

    public function test_stale_priority_referrals_use_a_two_day_threshold(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00'));
        $now = CarbonImmutable::now();
        $patient = $this->makePatient($this->makeBhc('BHC One', $this->makeRhu('RHU One')));
        $priority = ['urgency_level' => 'Priority'];

        $this->makeReferral($patient, 'Pending', [...$priority, 'referral_datetime' => $now->subDays(2)->addMinute()]);
        $this->makeReferral($patient, 'Pending', [...$priority, 'referral_datetime' => $now->subDays(2)]);
        $this->makeReferral($patient, 'Pending', [...$priority, 'referral_datetime' => $now->subDays(2)->subMinute()]);
        $this->makeReferral($patient, 'pending ', [...$priority, 'referral_datetime' => $now->subDays(5)]);
        $this->makeReferral($patient, 'Pending', [...$priority, 'referral_datetime' => null, 'created_at' => $now->subDays(6)]);
        $this->makeReferral($patient, 'Pending', ['urgency_level' => 'Routine', 'referral_datetime' => $now->subDays(5)]);
        $this->makeReferral($patient, 'Received', [...$priority, 'referral_datetime' => $now->subDays(5)]);

        $this->dashboard()->assertOk()->assertJsonPath('data.attention.stale_priority_referrals', 3);
    }

    public function test_facilities_without_staff(): void
    {
        $north = $this->makeRhu('North');
        $south = $this->makeRhu('South');
        $alpha = $this->makeBhc('Alpha', $north);
        $bravo = $this->makeBhc('Bravo', $north);
        $charlie = $this->makeBhc('Charlie', $north);
        $delta = $this->makeBhc('Delta', $north);
        $this->makeBhc('Echo', $north, 'inactive');

        $this->makeUser('bhc', ['barangay_health_center_id' => $alpha->id]);
        $this->makeUser('bhc', ['barangay_health_center_id' => $bravo->id, 'status' => 'inactive']);
        $nurse = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $north->id]);
        $inactiveNurse = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $north->id, 'status' => 'inactive']);

        $assign = fn (User $user, BarangayHealthCenter $bhc, array $dates) => FacilityAssignment::create([
            'user_id' => $user->id, 'barangay_health_center_id' => $bhc->id,
            'permissions' => [], 'assignment_type' => 'ongoing', ...$dates,
        ]);
        $assign($nurse, $charlie, ['starts_on' => today()->subDay(), 'ends_on' => null]);
        $assign($inactiveNurse, $bravo, ['starts_on' => today()->subDay(), 'ends_on' => null]);
        $assign($nurse, $delta, ['starts_on' => today()->subDays(3), 'revoked_at' => now()]);
        $assign($nurse, $delta, ['starts_on' => today()->addDay(), 'ends_on' => null]);
        $assign($nurse, $delta, ['starts_on' => today()->subDays(3), 'ends_on' => today()->subDay()]);

        $response = $this->dashboard()->assertOk();

        $this->assertSame([
            ['type' => 'bhc', 'id' => $bravo->id, 'name' => 'Bravo'],
            ['type' => 'bhc', 'id' => $delta->id, 'name' => 'Delta'],
            ['type' => 'rhu', 'id' => $south->id, 'name' => 'South'],
        ], $response->json('data.attention.facilities_without_staff'));

        $this->assertSame(['Alpha', 'Bravo', 'Charlie', 'Delta'], array_column($response->json('data.barangays'), 'name'));
        $this->assertSame([true, false, true, false], array_column($response->json('data.barangays'), 'has_staff'));
    }

    public function test_barangay_rows_combine_per_bhc_signals(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00'));
        $rhu = $this->makeRhu('RHU One');
        $first = $this->makeBhc('Aplaya', $rhu);
        $second = $this->makeBhc('Bantay', $rhu);
        $first->update(['barangay' => 'Aplaya']);
        $patient = $this->makePatient($first);

        $this->makeReferral($patient, 'Completed', ['referral_datetime' => '2026-10-03 09:00']);
        $this->makeReferral($patient, 'No-Show', ['referral_datetime' => '2026-10-04 09:00']);
        $this->makeReferral($patient, 'pending ', ['referral_datetime' => '2026-10-05 09:00']);
        $this->makeReferral($patient, 'Pending', ['referral_datetime' => '2026-08-05 09:00']);
        $this->makeFollowUp($patient, ['state' => 'pending', 'due_date' => '2026-10-10']);
        $this->makeFollowUp($patient, ['state' => 'pending', 'due_date' => '2026-10-12']);
        $this->makeMedicine(['barangay_health_center_id' => $first->id, 'availability_status' => 'Low Stock']);

        $rows = $this->dashboard('?period=month')->assertOk()->json('data.barangays');

        $this->assertSame(
            ['id' => $first->id, 'name' => 'Aplaya', 'barangay' => 'Aplaya', 'referrals' => 3, 'no_show' => 1, 'pending' => 2, 'overdue_follow_ups' => 1, 'low_stock' => 1, 'has_staff' => false],
            $rows[0],
        );
        $this->assertSame(
            ['id' => $second->id, 'name' => 'Bantay', 'barangay' => null, 'referrals' => 0, 'no_show' => 0, 'pending' => 0, 'overdue_follow_ups' => 0, 'low_stock' => 0, 'has_staff' => false],
            $rows[1],
        );
    }

    public function test_personnel_cards_exclude_admins_and_count_account_status_independently_of_assignments(): void
    {
        $rhu = $this->makeRhu('RHU');
        $bhc = $this->makeBhc('BHC', $rhu);
        $closed = $this->makeBhc('Closed BHC', $rhu, 'inactive');
        $closedRhu = $this->makeRhu('Closed RHU', 'inactive');
        $this->makeUser('admin', ['status' => 'inactive']);
        $this->makeUser('bhc', ['barangay_health_center_id' => $bhc->id]);
        $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'status' => 'inactive']);
        $this->makeUser('bhc'); // No home facility.
        $this->makeUser('bhc', ['barangay_health_center_id' => $closed->id]);
        $this->makeUser('rhu', ['staff_role' => 'doctor', 'rural_health_unit_id' => $closedRhu->id]);
        $this->makeUser('bhc', ['rural_health_unit_id' => $rhu->id]); // Wrong home tier.
        $this->makeUser('rhu', ['rural_health_unit_id' => $rhu->id, 'barangay_health_center_id' => $bhc->id]); // Ambiguous home.

        $response = $this->dashboard()->assertOk()
            ->assertJsonPath('data.personnel.active', 6)
            ->assertJsonPath('data.personnel.inactive', 1)
            ->assertJsonPath('data.personnel.unassigned', 5);

        // These are current-state counts, regardless of the selected clinical period.
        $this->assertSame($response->json('data.personnel'), $this->dashboard('?period=year')->json('data.personnel'));
    }

    public function test_personnel_tables_include_every_registered_facility_and_each_designation(): void
    {
        $rhu = $this->makeRhu('A RHU');
        $this->makeRhu('Z Closed RHU', 'inactive');
        $bhc = $this->makeBhc('A BHC', $rhu);
        $closed = $this->makeBhc('Z Closed BHC', $rhu, 'inactive');
        foreach (['midwife', 'encoder', 'bhw'] as $role) {
            foreach (['active', 'inactive'] as $status) {
                $this->makeUser('bhc', ['staff_role' => $role, 'status' => $status, 'barangay_health_center_id' => $bhc->id]);
            }
        }
        foreach (['intake_staff', 'doctor', 'nurse'] as $role) {
            foreach (['active', 'inactive'] as $status) {
                $this->makeUser('rhu', ['staff_role' => $role, 'status' => $status, 'rural_health_unit_id' => $rhu->id]);
            }
        }
        // Preserve legacy/null designations in totals, without inventing a designation.
        $this->makeUser('bhc', ['staff_role' => null, 'barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['barangay_health_center_id' => $closed->id, 'status' => 'inactive']);

        $this->dashboard()->assertOk()
            ->assertJsonCount(2, 'data.personnel.barangay_health_centers')
            ->assertJsonCount(2, 'data.personnel.rural_health_units')
            ->assertJsonPath('data.personnel.barangay_health_centers.0.midwife', 2)
            ->assertJsonPath('data.personnel.barangay_health_centers.0.encoder', 2)
            ->assertJsonPath('data.personnel.barangay_health_centers.0.bhw', 2)
            ->assertJsonPath('data.personnel.barangay_health_centers.0.total', 7)
            ->assertJsonCount(7, 'data.personnel.barangay_health_centers.0.personnel')
            ->assertJsonPath('data.personnel.barangay_health_centers.1.total', 1)
            ->assertJsonPath('data.personnel.rural_health_units.0.intake_staff', 2)
            ->assertJsonPath('data.personnel.rural_health_units.0.doctor', 2)
            ->assertJsonPath('data.personnel.rural_health_units.0.nurse', 2)
            ->assertJsonPath('data.personnel.rural_health_units.0.total', 6)
            ->assertJsonPath('data.personnel.rural_health_units.1.total', 0)
            ->assertJsonPath('data.personnel.rural_health_units.1.personnel', []);
    }

    public function test_personnel_totals_deduplicate_current_nurse_duties_and_ignore_invalid_assignments(): void
    {
        $rhu = $this->makeRhu('RHU');
        $closedRhu = $this->makeRhu('Closed RHU', 'inactive');
        $bhc = $this->makeBhc('BHC', $rhu);
        $nurse = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id]);
        $inactive = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'status' => 'inactive']);
        $doctor = $this->makeUser('rhu', ['staff_role' => 'doctor', 'rural_health_unit_id' => $rhu->id]);
        $invalidHome = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $closedRhu->id]);
        $assign = fn ($user, $dates) => FacilityAssignment::create([
            'user_id' => $user->id, 'barangay_health_center_id' => $bhc->id,
            'permissions' => [], 'assignment_type' => 'ongoing', 'starts_on' => today(), ...$dates,
        ]);
        $assign($nurse, []);
        $assign($nurse, ['starts_on' => today()->subDay(), 'ends_on' => today()]);
        $assign($inactive, []);
        $assign($doctor, []); // Additional BHC duty is nurse-only.
        $assign($invalidHome, []);
        $notCurrent = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id]);
        $assign($notCurrent, ['revoked_at' => now()]);
        $assign($notCurrent, ['starts_on' => today()->addDay()]);
        $assign($notCurrent, ['starts_on' => today()->subDays(2), 'ends_on' => today()->subDay()]);
        $assign($notCurrent, ['starts_on' => null]);

        $row = $this->dashboard()->assertOk()->json('data.personnel.barangay_health_centers.0');
        $this->assertSame(2, $row['total']);
        $this->assertSame(0, $row['midwife']); // Nurses remain nurses.
        $this->assertSame([$nurse->id, $inactive->id], array_column($row['personnel'], 'id'));
        $this->assertSame(['active', 'inactive'], array_column($row['personnel'], 'status'));
        $this->assertSame(['nurse', 'nurse'], array_column($row['personnel'], 'staff_role'));
        $this->assertSame(['id', 'name', 'staff_role', 'status'], array_keys($row['personnel'][0]));
    }

    public function test_pending_reset_card_source_includes_only_requests_needing_mho_action(): void
    {
        $rhu = $this->makeRhu('RHU');
        foreach ([
            ['pending', null, null, 'active'],
            ['expired', null, null, 'active'],
            ['approved', 'failed', now()->addDay(), 'active'],
            ['approved', 'sent', now()->subMinute(), 'active'], // Expired on read.
            ['approved', 'sent', now()->addDay(), 'active'], // Already in progress.
            ['completed', null, null, 'active'],
            ['rejected', null, null, 'active'],
            ['pending', null, null, 'inactive'],
        ] as [$status, $delivery, $expires, $accountStatus]) {
            $user = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'status' => $accountStatus]);
            PasswordResetRequest::create([
                'user_id' => $user->id, 'email' => $user->email, 'status' => $status,
                'requested_at' => now(), 'expires_at' => $expires, 'delivery' => $delivery,
            ]);
        }

        $this->dashboard()->assertOk()->assertJsonPath('data.attention.reset_requests', 4);
    }

    public function test_role_distribution_counts_accounts_once_including_unassigned_and_inactive_personnel(): void
    {
        $rhu = $this->makeRhu('RHU');
        $bhc = $this->makeBhc('BHC', $rhu);
        $nurse = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id]);
        FacilityAssignment::create([
            'user_id' => $nurse->id, 'barangay_health_center_id' => $bhc->id,
            'permissions' => [], 'starts_on' => today(), 'assignment_type' => 'ongoing',
        ]);
        $this->makeUser('bhc', ['staff_role' => 'encoder', 'status' => 'inactive']);
        $this->makeUser('rhu', ['staff_role' => 'intake_staff']);
        $this->makeUser('rhu', ['staff_role' => 'doctor', 'rural_health_unit_id' => $rhu->id]);
        $this->makeUser('bhc', ['staff_role' => 'bhw', 'barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['staff_role' => 'midwife', 'barangay_health_center_id' => $bhc->id]);
        // Unknown legacy designations and administrators must not become a named clinical role.
        $this->makeUser('bhc', ['staff_role' => null]);
        $this->makeUser('admin');

        $this->dashboard()->assertOk()->assertJsonPath('data.personnel.by_role', [
            'midwife' => 1, 'bhw' => 1, 'encoder' => 1, 'nurse' => 1, 'doctor' => 1, 'intake_staff' => 1,
        ]);
    }

    public function test_chart_distribution_uses_unique_assigned_accounts_in_each_home_category(): void
    {
        $rhu = $this->makeRhu('RHU');
        $closedRhu = $this->makeRhu('Closed RHU', 'inactive');
        $bhc = $this->makeBhc('BHC', $rhu);
        $otherBhc = $this->makeBhc('Other BHC', $rhu);
        $closedBhc = $this->makeBhc('Closed BHC', $rhu, 'inactive');
        $this->makeUser('bhc', ['staff_role' => 'midwife', 'barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['staff_role' => 'midwife', 'barangay_health_center_id' => $otherBhc->id, 'status' => 'inactive']);
        $this->makeUser('bhc', ['staff_role' => 'encoder', 'barangay_health_center_id' => $bhc->id, 'status' => 'inactive']);
        $this->makeUser('rhu', ['staff_role' => 'intake_staff', 'rural_health_unit_id' => $rhu->id]);
        $this->makeUser('rhu', ['staff_role' => 'doctor', 'rural_health_unit_id' => $rhu->id, 'status' => 'inactive']);
        $nurse = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id]);
        foreach ([$bhc, $otherBhc] as $location) {
            FacilityAssignment::create([
                'user_id' => $nurse->id, 'barangay_health_center_id' => $location->id,
                'permissions' => [], 'starts_on' => today(), 'assignment_type' => 'ongoing',
            ]);
        }
        $this->makeUser('bhc', ['staff_role' => 'bhw']); // Unassigned.
        $this->makeUser('bhc', ['staff_role' => null, 'barangay_health_center_id' => $bhc->id]);
        $this->makeUser('bhc', ['staff_role' => 'midwife', 'barangay_health_center_id' => $closedBhc->id]);
        $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $closedRhu->id]);
        $this->makeUser('bhc', ['staff_role' => 'bhw', 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $rhu->id]);

        $this->dashboard()->assertOk()->assertJsonPath('data.personnel.assigned_by_role', [
            'midwife' => 2, 'bhw' => 0, 'encoder' => 1, 'nurse' => 1, 'doctor' => 1, 'intake_staff' => 1,
        ]);
    }

    public function test_pending_invitations_count_only_usable_invitations_awaiting_recipient_completion(): void
    {
        $rhu = $this->makeRhu('RHU');
        foreach ([
            ['pending', 'sent', now()->addDay(), 'active', true, null],
            ['pending', 'copied', now()->addDay(), 'active', true, null],
            ['pending', null, now()->addDay(), 'active', true, null], // Legacy sent delivery.
            ['temporary', 'failed', null, 'active', false, now()->addDay()], // Valid replacement credential.
            ['completed', 'sent', now()->addDay(), 'active', true, null],
            ['expired', 'sent', now()->subDay(), 'active', false, null],
            ['pending', 'sent', now()->subMinute(), 'active', true, null],
            ['pending', 'failed', now()->addDay(), 'active', true, null],
            ['pending', 'sent', now()->addDay(), 'inactive', true, null],
            ['pending', 'sent', now()->addDay(), 'active', false, null], // Revoked/missing link.
            ['pending', 'sent', null, 'active', true, null],
            ['temporary', 'sent', null, 'active', false, now()->subMinute()],
            ['temporary', 'sent', null, 'active', false, null],
        ] as [$status, $delivery, $expires, $accountStatus, $hasToken, $temporaryExpiry]) {
            $user = $this->makeUser('rhu', ['staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'status' => $accountStatus]);
            $user->forceFill(['temp_password_expires_at' => $temporaryExpiry])->save();
            AccountInvite::create([
                'user_id' => $user->id, 'email' => $user->email, 'status' => $status,
                'delivery' => $delivery, 'expires_at' => $expires, 'sent_at' => now(),
                'token_hash' => $hasToken ? hash('sha256', 'invite-'.$user->id) : null,
            ]);
        }
        $this->makeUser('bhc', ['status' => 'inactive']); // Inactivity alone is not an invite.

        $this->dashboard()->assertOk()->assertJsonPath('data.pending_invitations', 4);
    }

    public function test_resent_invitation_counts_once_and_disappears_after_password_completion(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $user = $this->makeUser('bhc');
        $invite = AccountInvite::create([
            'user_id' => $user->id, 'email' => $user->email, 'status' => 'expired',
            'delivery' => 'sent', 'expires_at' => now()->subDay(),
        ]);
        $this->dashboard()->assertOk()->assertJsonPath('data.pending_invitations', 0);
        $service = app(\App\Services\AccountInviteService::class);
        $service->resend($invite);
        $service->resend($invite);
        $this->assertSame(1, AccountInvite::where('user_id', $user->id)->count());
        $this->dashboard()->assertOk()->assertJsonPath('data.pending_invitations', 1);

        app(\App\Services\PasswordSetRecorder::class)->record($user, \App\Services\PasswordSetRecorder::ROUTE_INVITE);
        $this->dashboard()->assertOk()->assertJsonPath('data.pending_invitations', 0);
    }

    public function test_personnel_snapshot_handles_an_empty_registry(): void
    {
        $this->dashboard()->assertOk()->assertJsonPath('data.personnel', [
            'active' => 0, 'inactive' => 0, 'unassigned' => 0,
            'by_role' => ['midwife' => 0, 'bhw' => 0, 'encoder' => 0, 'nurse' => 0, 'doctor' => 0, 'intake_staff' => 0],
            'assigned_by_role' => ['midwife' => 0, 'bhw' => 0, 'encoder' => 0, 'nurse' => 0, 'doctor' => 0, 'intake_staff' => 0],
            'barangay_health_centers' => [], 'rural_health_units' => [],
        ]);
    }

    public function test_response_contains_no_patient_identifiers(): void
    {
        $bhc = $this->makeBhc('BHC One', $this->makeRhu('RHU One'));
        $patient = $this->makePatient($bhc, ['first_name' => 'Zyxwq', 'last_name' => 'Unique']);
        $this->makeReferral($patient, 'Pending');

        $response = $this->dashboard()->assertOk();

        $this->assertStringNotContainsString('Zyxwq', $response->getContent());
        $this->assertStringNotContainsString('Unique', $response->getContent());
    }
}
