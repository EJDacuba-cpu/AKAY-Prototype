<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
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
