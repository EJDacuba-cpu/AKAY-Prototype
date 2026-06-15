<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AkayApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_user_can_login_and_inactive_user_cannot(): void
    {
        User::create([
            'name' => 'Active Admin',
            'email' => 'active@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);

        User::create([
            'name' => 'Inactive Admin',
            'email' => 'inactive@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_INACTIVE,
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'active@example.test',
            'password' => 'password123',
        ])->assertOk()->assertJsonStructure(['token', 'user']);

        $this->postJson('/api/auth/login', [
            'email' => 'inactive@example.test',
            'password' => 'password123',
        ])->assertForbidden();
    }

    public function test_role_middleware_blocks_wrong_role_access(): void
    {
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->getJson('/api/users')
            ->assertForbidden();
    }

    public function test_bhw_cannot_access_patient_outside_assigned_bhc(): void
    {
        $ownBhc = BarangayHealthCenter::create(['name' => 'Own BHC']);
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other BHC']);

        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'bhw-scope@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $ownBhc->id,
        ]);

        $patient = Patient::create([
            'first_name' => 'Scoped',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $otherBhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->getJson("/api/patients/{$patient->id}")
            ->assertForbidden();
    }

    public function test_referral_creation_generates_tracking_notification_and_audit_log(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Bulakan RHU']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'referral-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        User::create([
            'name' => 'RHU Staff',
            'email' => 'rhu@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhu->id,
        ]);
        $patient = Patient::create([
            'first_name' => 'Referral',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $patient->id,
                'rural_health_unit_id' => $rhu->id,
                'reason_for_referral' => 'Needs RHU assessment.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', Referral::STATUS_PENDING)
            ->assertJsonStructure(['data' => ['tracking_id', 'qr_code_value']]);

        $this->assertDatabaseHas('notifications', ['type' => 'referral_submitted']);
        $this->assertDatabaseHas('audit_logs', ['module' => 'referrals', 'action' => 'submitted']);
    }

    public function test_referral_creation_is_idempotent_by_client_submission_id(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Bulakan RHU']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'idempotent-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        User::create([
            'name' => 'RHU Staff',
            'email' => 'idempotent-rhu@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhu->id,
        ]);
        $patient = Patient::create([
            'first_name' => 'Retry',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
        ]);

        $payload = [
            'client_submission_id' => 'offline-draft-123',
            'patient_id' => $patient->id,
            'rural_health_unit_id' => $rhu->id,
            'reason_for_referral' => 'Retry this same draft safely.',
        ];

        $firstResponse = $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/referrals', $payload)
            ->assertCreated();

        $trackingId = $firstResponse->json('data.tracking_id');
        $qrCodeValue = $firstResponse->json('data.qr_code_value');

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/referrals', $payload)
            ->assertOk()
            ->assertJsonPath('data.tracking_id', $trackingId)
            ->assertJsonPath('data.qr_code_value', $qrCodeValue);

        $this->assertSame(1, Referral::where('client_submission_id', 'offline-draft-123')->count());
        $this->assertSame(1, Referral::count());
        $this->assertDatabaseCount('referral_updates', 1);
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_empty_reports_return_zero_counts(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Empty BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'empty-report@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->getJson('/api/reports/bhw')
            ->assertOk()
            ->assertJsonPath('data.total_referrals', 0)
            ->assertJsonPath('data.completed_referrals', 0);
    }
}
