<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\MedicineExpiryGroup;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BhcDashboardTest extends TestCase
{
    use RefreshDatabase;

    private int $sequence = 0;

    private function makeRhu(string $name = 'RHU One'): RuralHealthUnit
    {
        return RuralHealthUnit::create(['name' => $name, 'status' => 'active']);
    }

    private function makeBhc(string $name, RuralHealthUnit $rhu): BarangayHealthCenter
    {
        return BarangayHealthCenter::create([
            'name' => $name,
            'status' => 'active',
            'rural_health_unit_id' => $rhu->id,
        ]);
    }

    private function makeUser(string $role, array $attrs = []): User
    {
        $this->sequence++;
        $staffRole = $attrs['staff_role'] ?? ($role === 'bhc' ? 'midwife' : ($role === 'rhu' ? 'nurse' : null));
        $permissions = $attrs['permissions'] ?? ($staffRole ? StaffRoles::defaults($staffRole) : []);
        unset($attrs['permissions'], $attrs['staff_role']);

        return User::create([
            'name' => 'User '.$this->sequence,
            'email' => "user{$this->sequence}@example.test",
            'password' => bin2hex(random_bytes(16)),
            'role' => $role,
            'staff_role' => $staffRole,
            'status' => 'active',
            'permissions' => $permissions,
            ...$attrs,
        ]);
    }

    private function makePatient(BarangayHealthCenter $bhc, array $attrs = []): Patient
    {
        $this->sequence++;

        return Patient::create([
            'first_name' => 'Patient'.$this->sequence,
            'last_name' => 'Test',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            ...$attrs,
        ]);
    }

    private function makeRecord(Patient $patient, array $attrs = []): HealthRecord
    {
        return HealthRecord::create([
            'patient_id' => $patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'date_recorded' => now('Asia/Manila')->toDateTimeString(),
            ...$attrs,
        ]);
    }

    private function makeReferral(Patient $patient, string $status, array $attrs = []): Referral
    {
        $this->sequence++;
        $bhc = BarangayHealthCenter::findOrFail($patient->barangay_health_center_id);

        return Referral::create([
            'tracking_id' => 'AKAY-BHC-'.$this->sequence,
            'qr_code_value' => 'AKAY:REFERRAL:AKAY-BHC-'.$this->sequence,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $bhc->rural_health_unit_id,
            'status' => $status,
            'urgency_level' => Referral::ATTENTION_ROUTINE,
            'reason_for_referral' => 'Dashboard test.',
            'referral_datetime' => now(),
            ...$attrs,
        ]);
    }

    private function makeFollowUp(Patient $patient, array $attrs = []): FollowUpTask
    {
        $record = $this->makeRecord($patient, ['date_recorded' => now()->subWeeks(3)]);

        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'state' => FollowUpTask::STATE_PENDING,
            'due_date' => now('Asia/Manila')->toDateString(),
            ...$attrs,
        ]);
    }

    private function makeMedicine(BarangayHealthCenter $bhc, array $attrs = []): Medicine
    {
        $this->sequence++;

        return Medicine::create([
            'name' => 'Medicine '.$this->sequence,
            'category' => 'Basic Medicines',
            'quantity' => 10,
            'unit' => 'pcs',
            'availability_status' => 'Available',
            'is_active' => true,
            'barangay_health_center_id' => $bhc->id,
            ...$attrs,
        ]);
    }

    private function actAsBhc(BarangayHealthCenter $bhc, ?array $permissions = null): User
    {
        $user = $this->makeUser('bhc', [
            'barangay_health_center_id' => $bhc->id,
            'permissions' => $permissions ?? StaffRoles::defaults('midwife'),
        ]);
        Sanctum::actingAs($user, ['*']);

        return $user;
    }

    private function dashboard(): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/bhc/dashboard');
    }

    public function test_unauthenticated_users_cannot_open_the_dashboard(): void
    {
        $this->dashboard()->assertUnauthorized();
    }

    public function test_only_bhc_staff_can_open_the_dashboard(): void
    {
        $rhu = $this->makeRhu();
        $bhc = $this->makeBhc('San Jose BHC', $rhu);

        $this->actAsBhc($bhc);
        $this->dashboard()->assertOk();

        Sanctum::actingAs($this->makeUser('rhu', ['rural_health_unit_id' => $rhu->id]), ['*']);
        $this->dashboard()->assertForbidden();

        Sanctum::actingAs($this->makeUser('admin', ['staff_role' => null, 'permissions' => []]), ['*']);
        $this->dashboard()->assertForbidden();
    }

    public function test_empty_facility_returns_zeros_not_nulls_when_permitted(): void
    {
        $bhc = $this->makeBhc('Empty BHC', $this->makeRhu());
        $this->actAsBhc($bhc);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.facility.name', 'Empty BHC')
            ->assertJsonPath('data.access', [
                'patients' => true,
                'clinical' => true,
                'inventory' => true,
            ])
            ->assertJsonPath('data.kpis', [
                'registered_patients' => 0,
                'consultations_today' => 0,
                'open_referrals' => 0,
                'follow_ups_due_today' => 0,
            ])
            ->assertJsonPath('data.attention.overdue_follow_ups', 0)
            ->assertJsonPath('data.attention.pending_rhu_feedback', 0)
            ->assertJsonPath('data.attention.inventory_alerts', 0)
            ->assertJsonCount(30, 'data.consultation_activity.series');
    }

    public function test_encoder_without_clinical_history_gets_null_clinical_metrics(): void
    {
        $bhc = $this->makeBhc('Encoder BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);
        $this->makeRecord($patient);
        $this->makeReferral($patient, Referral::STATUS_PENDING);
        $this->makeFollowUp($patient);

        $this->actAsBhc($bhc, StaffRoles::defaults('encoder'));

        $response = $this->dashboard()->assertOk();
        $response
            ->assertJsonPath('data.access.patients', true)
            ->assertJsonPath('data.access.clinical', false)
            ->assertJsonPath('data.access.inventory', true)
            ->assertJsonPath('data.kpis.registered_patients', 1)
            ->assertJsonPath('data.kpis.consultations_today', null)
            ->assertJsonPath('data.kpis.open_referrals', null)
            ->assertJsonPath('data.kpis.follow_ups_due_today', null)
            ->assertJsonPath('data.consultation_activity', null)
            ->assertJsonPath('data.attention.overdue_follow_ups', null)
            ->assertJsonPath('data.attention.pending_rhu_feedback', null);
        $this->assertNotNull($response->json('data.attention.inventory_alerts'));
    }

    public function test_other_facility_records_are_not_counted(): void
    {
        $rhu = $this->makeRhu();
        $home = $this->makeBhc('Home BHC', $rhu);
        $other = $this->makeBhc('Other BHC', $rhu);

        $homePatient = $this->makePatient($home);
        $otherPatient = $this->makePatient($other);

        $this->makeRecord($homePatient);
        $this->makeRecord($otherPatient);
        $this->makeReferral($homePatient, Referral::STATUS_PENDING);
        $this->makeReferral($otherPatient, Referral::STATUS_PENDING);
        $this->makeFollowUp($homePatient);
        $this->makeFollowUp($otherPatient);
        $this->makeMedicine($home, ['availability_status' => 'Low Stock', 'quantity' => 2]);
        $this->makeMedicine($other, ['availability_status' => 'Low Stock', 'quantity' => 1]);

        $this->actAsBhc($home);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.kpis.registered_patients', 1)
            ->assertJsonPath('data.kpis.consultations_today', 1)
            ->assertJsonPath('data.kpis.open_referrals', 1)
            ->assertJsonPath('data.kpis.follow_ups_due_today', 1)
            ->assertJsonPath('data.attention.inventory_alerts', 1);
    }

    public function test_consultations_today_use_date_recorded_not_created_at(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-22 10:00:00', 'Asia/Manila'));
        $bhc = $this->makeBhc('Date BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);

        $today = $this->makeRecord($patient, [
            'date_recorded' => '2026-10-22 09:00:00',
        ]);
        $today->forceFill(['created_at' => '2026-10-21 09:00:00'])->save();

        $yesterdayVisit = $this->makeRecord($patient, [
            'date_recorded' => '2026-10-21 23:30:00',
        ]);
        $yesterdayVisit->forceFill(['created_at' => '2026-10-22 09:00:00'])->save();

        $this->actAsBhc($bhc);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.kpis.consultations_today', 1);
    }

    public function test_manila_midnight_does_not_count_previous_evening(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-22 00:30:00', 'Asia/Manila'));
        $bhc = $this->makeBhc('Midnight BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);

        $this->makeRecord($patient, ['date_recorded' => '2026-10-21 23:45:00']);
        $this->makeRecord($patient, ['date_recorded' => '2026-10-22 00:15:00']);

        $this->actAsBhc($bhc);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.kpis.consultations_today', 1);
    }

    public function test_drafts_are_not_counted_as_consultations(): void
    {
        $bhc = $this->makeBhc('Draft BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);
        $user = $this->actAsBhc($bhc);

        HealthRecordDraft::create([
            'public_id' => (string) Str::uuid(),
            'owner_user_id' => $user->id,
            'barangay_health_center_id' => $bhc->id,
            'patient_id' => $patient->id,
            'classification' => 'General Consultation',
            'encrypted_payload' => 'ciphertext',
            'version' => 1,
            'status' => HealthRecordDraft::STATUS_ACTIVE,
            'expires_at' => now()->addDay(),
            'last_saved_at' => now(),
        ]);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.kpis.consultations_today', 0);
    }

    public function test_open_referrals_count_pending_received_and_legacy_for_monitoring(): void
    {
        $bhc = $this->makeBhc('Referral BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);

        $this->makeReferral($patient, Referral::STATUS_PENDING);
        $this->makeReferral($patient, Referral::STATUS_RECEIVED);
        $this->makeReferral($patient, Referral::STATUS_FOR_MONITORING);
        $this->makeReferral($patient, Referral::STATUS_COMPLETED);
        $this->makeReferral($patient, Referral::STATUS_NO_SHOW);

        $this->actAsBhc($bhc);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.kpis.open_referrals', 3)
            ->assertJsonPath('data.attention.pending_rhu_feedback', 2);
    }

    public function test_follow_up_due_today_excludes_overdue_superseded_cancelled_and_fulfilled(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-22 10:00:00', 'Asia/Manila'));
        $bhc = $this->makeBhc('Follow BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);

        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-22',
            'state' => FollowUpTask::STATE_PENDING,
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-22',
            'state' => FollowUpTask::STATE_RESCHEDULED,
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-21',
            'state' => FollowUpTask::STATE_PENDING,
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-21',
            'state' => FollowUpTask::STATE_NO_SHOW,
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-22',
            'state' => FollowUpTask::STATE_CANCELLED,
            'cancelled_at' => now(),
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-22',
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-22',
            'state' => FollowUpTask::STATE_PENDING,
            'rescheduled_to_id' => 1,
        ]);
        $this->makeFollowUp($patient, [
            'due_date' => '2026-10-22',
            'state' => FollowUpTask::STATE_NO_SHOW,
        ]);

        $this->actAsBhc($bhc);

        $this->dashboard()
            ->assertOk()
            ->assertJsonPath('data.kpis.follow_ups_due_today', 2)
            ->assertJsonPath('data.attention.overdue_follow_ups', 2);
    }

    public function test_consultation_series_covers_thirty_days_and_fills_missing_days(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-22 12:00:00', 'Asia/Manila'));
        $bhc = $this->makeBhc('Series BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc);
        $this->makeRecord($patient, ['date_recorded' => '2026-10-22 08:00:00']);
        $this->makeRecord($patient, ['date_recorded' => '2026-10-22 09:00:00']);
        $this->makeRecord($patient, ['date_recorded' => '2026-10-20 11:00:00']);

        $this->actAsBhc($bhc);

        $series = $this->dashboard()->assertOk()->json('data.consultation_activity.series');
        $this->assertCount(30, $series);
        $this->assertSame('2026-09-23', $series[0]['date']);
        $this->assertSame(0, $series[0]['count']);
        $this->assertSame('2026-10-20', $series[27]['date']);
        $this->assertSame(1, $series[27]['count']);
        $this->assertSame('2026-10-22', $series[29]['date']);
        $this->assertSame(2, $series[29]['count']);
    }

    public function test_inventory_alerts_use_stock_and_expiry_not_notifications(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-22 12:00:00', 'Asia/Manila'));
        $bhc = $this->makeBhc('Meds BHC', $this->makeRhu());
        $this->makeMedicine($bhc, ['availability_status' => 'Available', 'quantity' => 20]);
        $low = $this->makeMedicine($bhc, ['availability_status' => 'Low Stock', 'quantity' => 2]);
        $expired = $this->makeMedicine($bhc, ['availability_status' => 'Available', 'quantity' => 8]);
        MedicineExpiryGroup::create([
            'medicine_id' => $expired->id,
            'expiration_date' => '2026-10-10',
            'available_quantity' => 8,
            'quarantined_quantity' => 0,
        ]);
        $this->makeMedicine($bhc, [
            'availability_status' => 'Unavailable',
            'quantity' => 0,
            'rural_health_unit_id' => $bhc->rural_health_unit_id,
            'barangay_health_center_id' => null,
        ]);

        $this->actAsBhc($bhc);

        $response = $this->dashboard()->assertOk();
        $response->assertJsonPath('data.attention.inventory_alerts', 2);
        $names = collect($response->json('data.attention.inventory_items'))->pluck('name')->all();
        $this->assertContains($low->name, $names);
        $this->assertContains($expired->name, $names);
    }

    public function test_summary_does_not_expose_patient_identifiable_data(): void
    {
        $bhc = $this->makeBhc('Privacy BHC', $this->makeRhu());
        $patient = $this->makePatient($bhc, ['first_name' => 'SecretGiven', 'last_name' => 'SecretFamily']);
        $this->makeRecord($patient, ['chief_complaint' => 'Hidden chest pain']);
        $this->makeReferral($patient, Referral::STATUS_PENDING, ['reason_for_referral' => 'Hidden reason']);
        $this->makeFollowUp($patient, ['notes' => 'Hidden follow-up note']);

        $this->actAsBhc($bhc);

        $encoded = json_encode($this->dashboard()->assertOk()->json('data'));
        $this->assertStringNotContainsString('SecretGiven', $encoded);
        $this->assertStringNotContainsString('SecretFamily', $encoded);
        $this->assertStringNotContainsString('Hidden chest pain', $encoded);
        $this->assertStringNotContainsString('Hidden reason', $encoded);
        $this->assertStringNotContainsString('Hidden follow-up note', $encoded);
    }
}
