<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralQrService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * RHU intake is a real scanning duty: it resolves a QR or tracking ID and marks the referral
 * Received, seeing only who arrived. Clinical content stays behind clinical.history.
 */
class RhuIntakeScanTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;
    private BarangayHealthCenter $bhc;
    private Referral $referral;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhu = RuralHealthUnit::create(['name' => 'Intake RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Intake BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $patient = Patient::create([
            'first_name' => 'Rosa',
            'last_name' => 'Intake',
            'sex' => 'Female',
            'birthdate' => '1990-05-01',
            'contact_number' => '09171234567',
            'street_address' => '12 Rizal St',
            'barangay' => 'Pitpitan',
            'municipality' => 'Bulakan',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->referral = Referral::create([
            'tracking_id' => 'AKY-20261025-'.Str::upper(Str::random(6)),
            'qr_code_value' => 'AKAY:REFERRAL:LEGACY-'.Str::uuid(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'status' => Referral::STATUS_PENDING,
            'reason_for_referral' => 'Confidential clinical reason.',
        ]);
    }

    private function staff(array $permissions, string $staffRole = 'intake_staff'): User
    {
        return User::create(['name' => 'Intake Staff', 'email' => uniqid('', true).'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => $staffRole, 'rural_health_unit_id' => $this->rhu->id, 'permissions' => $permissions]);
    }

    public function test_rhu_staff_preset_is_a_non_licensed_intake_role(): void
    {
        $this->assertSame('RHU Staff', StaffRoles::label('intake_staff'));
        $this->assertTrue(StaffRoles::allowedAt('intake_staff', 'rhu'));
        $this->assertFalse(StaffRoles::isLicensed('intake_staff'));
        $this->assertSame(['patients.register', 'rhu.intake', 'inventory.view'], StaffRoles::defaults('intake_staff'));
    }

    public function test_intake_resolves_a_qr_with_an_arrival_summary_and_no_clinical_content(): void
    {
        $token = app(ReferralQrService::class)->issue($this->referral);

        $response = $this->actingAs($this->staff(StaffRoles::defaults('intake_staff')), 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('data.referral_id', $this->referral->id)
            ->assertJsonPath('data.arrival.patient.full_name', 'Rosa Intake')
            ->assertJsonPath('data.arrival.sending_bhc', 'Intake BHC')
            ->assertJsonPath('data.arrival.receiving_rhu', 'Intake RHU');

        $this->assertStringNotContainsString('Confidential clinical reason', $response->getContent());
        $response
            ->assertJsonPath('data.arrival.patient.birthdate', '1990-05-01')
            ->assertJsonPath('data.arrival.patient.sex', 'Female')
            ->assertJsonPath('data.arrival.patient.contact_number', '09171234567')
            ->assertJsonPath('data.arrival.patient.address', '12 Rizal St, Pitpitan, Bulakan');
        $this->assertArrayNotHasKey('reason_for_referral', $response->json('data.arrival'));
        $this->assertArrayNotHasKey('philhealth_number', $response->json('data.arrival.patient') ?? []);
    }

    public function test_arrival_summary_keeps_missing_demographics_blank(): void
    {
        $patient = Patient::create([
            'first_name' => 'No',
            'last_name' => 'Contact',
            'sex' => 'Male',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-20261025-'.Str::upper(Str::random(6)),
            'qr_code_value' => 'AKAY:REFERRAL:LEGACY-'.Str::uuid(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'status' => Referral::STATUS_PENDING,
            'reason_for_referral' => 'Confidential clinical reason.',
        ]);

        $this->actingAs($this->staff(['rhu.intake']), 'sanctum')
            ->postJson('/api/referrals/tracking/resolve', ['tracking_id' => $referral->tracking_id])
            ->assertOk()
            ->assertJsonPath('data.arrival.patient.full_name', 'No Contact')
            ->assertJsonPath('data.arrival.patient.birthdate', null)
            ->assertJsonPath('data.arrival.patient.contact_number', null)
            ->assertJsonPath('data.arrival.patient.address', null);
    }

    public function test_intake_resolves_a_tracking_id(): void
    {
        $this->actingAs($this->staff(['rhu.intake']), 'sanctum')
            ->postJson('/api/referrals/tracking/resolve', ['tracking_id' => $this->referral->tracking_id])
            ->assertOk()
            ->assertJsonPath('data.arrival.patient.full_name', 'Rosa Intake');
    }

    public function test_intake_marks_received_enqueues_the_visit_and_gets_only_the_summary_back(): void
    {
        $response = $this->actingAs($this->staff(['rhu.intake']), 'sanctum')
            ->patchJson("/api/referrals/{$this->referral->id}/status", ['status' => 'Received'])
            ->assertOk()
            ->assertJsonPath('data.status', Referral::STATUS_RECEIVED)
            ->assertJsonPath('data.arrival.patient.full_name', 'Rosa Intake');

        $this->assertStringNotContainsString('Confidential clinical reason', $response->getContent());
        $this->assertSame(Referral::STATUS_RECEIVED, $this->referral->fresh()->status);
        $this->assertTrue(RhuVisitQueueEntry::where('referral_id', $this->referral->id)->whereNull('closed_at')->exists());
    }

    public function test_intake_cannot_set_any_other_status(): void
    {
        $this->actingAs($this->staff(['rhu.intake']), 'sanctum')
            ->patchJson("/api/referrals/{$this->referral->id}/status", ['status' => 'No-Show'])
            ->assertForbidden();

        $this->assertSame(Referral::STATUS_PENDING, $this->referral->fresh()->status);
    }

    public function test_intake_cannot_read_the_full_referral(): void
    {
        $this->actingAs($this->staff(['rhu.intake']), 'sanctum')
            ->getJson("/api/referrals/{$this->referral->id}")
            ->assertForbidden();
    }

    public function test_without_intake_or_manage_scanning_is_forbidden(): void
    {
        $token = app(ReferralQrService::class)->issue($this->referral);
        $staff = $this->staff(['patients.register', 'inventory.view']);

        $this->actingAs($staff, 'sanctum')->postJson('/api/referrals/qr/resolve', ['token' => $token])->assertForbidden();
        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/referrals/{$this->referral->id}/status", ['status' => 'Received'])
            ->assertForbidden();
    }

    public function test_a_manager_with_history_still_gets_the_full_referral_back(): void
    {
        $this->actingAs($this->staff(['rhu.manage', 'clinical.history'], 'nurse'), 'sanctum')
            ->patchJson("/api/referrals/{$this->referral->id}/status", ['status' => 'Received'])
            ->assertOk()
            ->assertJsonPath('data.id', $this->referral->id)
            ->assertJsonMissingPath('data.arrival');
    }
}
