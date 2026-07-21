<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
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
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'LOGIN_FAILED');
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

    public function test_bhw_can_manage_assigned_bhc_medicine_inventory(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Medicine BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'medicine-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);

        $response = $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/medicines', [
                'name' => 'Iron-Folic Acid Tablet',
                'category' => 'Basic Medicines',
                'quantity' => 100,
                'unit' => 'tablets',
                'low_stock_threshold' => 20,
                'expiration_date' => '2026-12-31',
                'description' => 'Prenatal supplement for pregnant patients',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Iron-Folic Acid Tablet')
            ->assertJsonPath('data.rural_health_unit_id', null)
            ->assertJsonPath('data.barangay_health_center_id', $bhc->id)
            ->assertJsonPath('data.availability_status', 'Available');

        $medicineId = $response->json('data.id');

        $this->actingAs($bhw, 'sanctum')
            ->postJson("/api/medicines/{$medicineId}/adjust", [
                'action' => 'adjustment_out',
                'quantity' => 85,
                'reason' => 'Issued through the controlled stock workflow.',
            ])
            ->assertOk()
            ->assertJsonPath('data.medicine.availability_status', 'Low Stock');

        $this->assertDatabaseHas('medicines', [
            'id' => $medicineId,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => null,
            'quantity' => 15,
            'low_stock_threshold' => 20,
        ]);
    }

    public function test_medicine_inventory_is_scoped_by_facility_role(): void
    {
        $ownBhc = BarangayHealthCenter::create(['name' => 'Own Medicine BHC']);
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other Medicine BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Medicine RHU']);

        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'medicine-scope-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $ownBhc->id,
        ]);
        $rhuStaff = User::create([
            'name' => 'RHU Staff',
            'email' => 'medicine-scope-rhu@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhu->id,
        ]);

        $ownMedicine = Medicine::create([
            'name' => 'Own BHC Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 10,
            'unit' => 'pcs',
            'barangay_health_center_id' => $ownBhc->id,
        ]);
        $otherMedicine = Medicine::create([
            'name' => 'Other BHC Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 10,
            'unit' => 'pcs',
            'barangay_health_center_id' => $otherBhc->id,
        ]);
        $rhuMedicine = Medicine::create([
            'name' => 'RHU Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 10,
            'unit' => 'pcs',
            'rural_health_unit_id' => $rhu->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Own BHC Medicine'])
            ->assertJsonFragment(['name' => 'RHU Medicine'])
            ->assertJsonMissing(['name' => 'Other BHC Medicine']);

        $this->actingAs($bhw, 'sanctum')
            ->patchJson("/api/medicines/{$rhuMedicine->id}", ['quantity' => 5])
            ->assertForbidden();

        $this->actingAs($rhuStaff, 'sanctum')
            ->patchJson("/api/medicines/{$ownMedicine->id}", ['quantity' => 5])
            ->assertForbidden();

        $this->actingAs($bhw, 'sanctum')
            ->deleteJson("/api/medicines/{$otherMedicine->id}")
            ->assertForbidden();
    }

    public function test_patient_creation_saves_adult_profile_fields(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Profile BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'profile-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/patients', [
                'first_name' => 'Married',
                'last_name' => 'Patient',
                'sex' => 'Female',
                'birthdate' => now()->subYears(30)->toDateString(),
                'civil_status' => 'Married',
                'occupation' => 'Teacher',
                'nhts_status' => 'NHTS',
                'purok_area' => 'Purok 3',
                'family_serial_number' => 'FSN-001',
                'philhealth_status' => 'With PhilHealth',
                'philhealth_number' => '12-345678901-2',
                'spouse_name' => 'Partner Patient',
                'spouse_occupation' => 'Engineer',
            ])
            ->assertCreated()
            ->assertJsonPath('data.occupation', 'Teacher')
            ->assertJsonPath('data.nhts_status', 'NHTS')
            ->assertJsonPath('data.purok_area', 'Purok 3')
            ->assertJsonPath('data.family_serial_number', 'FSN-001')
            ->assertJsonPath('data.philhealth_status', 'With PhilHealth')
            ->assertJsonPath('data.philhealth_number', '12-345678901-2')
            ->assertJsonPath('data.spouse_name', 'Partner Patient')
            ->assertJsonPath('data.spouse_occupation', 'Engineer');

        $this->assertDatabaseHas('patients', [
            'first_name' => 'Married',
            'occupation' => 'Teacher',
            'nhts_status' => 'NHTS',
            'purok_area' => 'Purok 3',
            'family_serial_number' => 'FSN-001',
            'philhealth_status' => 'With PhilHealth',
            'philhealth_number' => '12-345678901-2',
            'spouse_name' => 'Partner Patient',
            'spouse_occupation' => 'Engineer',
        ]);
    }

    public function test_patient_creation_without_philhealth_and_single_status_clears_conditional_fields(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Conditional BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'conditional-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/patients', [
                'first_name' => 'Single',
                'last_name' => 'Patient',
                'sex' => 'Male',
                'birthdate' => now()->subYears(25)->toDateString(),
                'civil_status' => 'Single',
                'occupation' => 'Driver',
                'philhealth_status' => 'Without PhilHealth',
                'philhealth_number' => '99-999999999-9',
                'spouse_name' => 'Should Clear',
                'spouse_occupation' => 'Should Clear',
            ])
            ->assertCreated()
            ->assertJsonPath('data.occupation', 'Driver')
            ->assertJsonPath('data.philhealth_status', 'Without PhilHealth')
            ->assertJsonPath('data.philhealth_number', null)
            ->assertJsonPath('data.spouse_name', null)
            ->assertJsonPath('data.spouse_occupation', null);

        $this->assertDatabaseHas('patients', [
            'first_name' => 'Single',
            'occupation' => 'Driver',
            'philhealth_status' => 'Without PhilHealth',
            'philhealth_number' => null,
            'spouse_name' => null,
            'spouse_occupation' => null,
        ]);
    }

    public function test_non_epi_child_patient_creation_keeps_profile_fields(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Child Profile BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'child-profile-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/patients', [
                'first_name' => 'Child',
                'last_name' => 'Patient',
                'sex' => 'Female',
                'birthdate' => now()->subYears(5)->toDateString(),
                'civil_status' => 'Single',
                'registration_type' => 'child',
                'occupation' => 'Student',
                'nhts_status' => 'Non-NHTS',
                'purok_area' => 'Purok 5',
                'family_serial_number' => 'FSN-CHILD',
                'philhealth_status' => 'Without PhilHealth',
                'philhealth_number' => '88-888888888-8',
            ])
            ->assertCreated()
            ->assertJsonPath('data.occupation', 'Student')
            ->assertJsonPath('data.nhts_status', 'Non-NHTS')
            ->assertJsonPath('data.purok_area', 'Purok 5')
            ->assertJsonPath('data.family_serial_number', 'FSN-CHILD')
            ->assertJsonPath('data.philhealth_status', 'Without PhilHealth')
            ->assertJsonPath('data.philhealth_number', null);

        $this->assertDatabaseHas('patients', [
            'first_name' => 'Child',
            'occupation' => 'Student',
            'nhts_status' => 'Non-NHTS',
            'purok_area' => 'Purok 5',
            'family_serial_number' => 'FSN-CHILD',
            'philhealth_status' => 'Without PhilHealth',
            'philhealth_number' => null,
        ]);
    }

    public function test_epi_infant_patient_creation_preserves_household_fields_and_clears_adult_profile_fields(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Infant Profile BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'infant-profile-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        $mother = Patient::create([
            'first_name' => 'Infant',
            'last_name' => 'Mother',
            'sex' => 'Female',
            'birthdate' => now()->subYears(25)->toDateString(),
            'barangay_health_center_id' => $bhc->id,
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/patients', [
                'first_name' => 'Infant',
                'last_name' => 'Patient',
                'sex' => 'Female',
                'birthdate' => now()->subMonths(6)->toDateString(),
                'civil_status' => 'Married',
                'registration_type' => 'child',
                'occupation' => 'Should Clear',
                'nhts_status' => 'NHTS',
                'purok_area' => 'Purok 1',
                'mother_patient_id' => $mother->id,
                'mother_name' => 'Infant Mother',
                'family_serial_number' => 'FSN-INFANT',
                'spouse_name' => 'Should Clear',
                'spouse_occupation' => 'Should Clear',
            ])
            ->assertCreated()
            ->assertJsonPath('data.civil_status', 'Single')
            ->assertJsonPath('data.occupation', null)
            ->assertJsonPath('data.nhts_status', null)
            ->assertJsonPath('data.purok_area', 'Purok 1')
            ->assertJsonPath('data.mother_patient_id', $mother->id)
            ->assertJsonPath('data.mother_name', 'Infant Mother')
            ->assertJsonPath('data.family_serial_number', 'FSN-INFANT')
            ->assertJsonPath('data.spouse_name', null)
            ->assertJsonPath('data.spouse_occupation', null);

        $this->assertDatabaseHas('patients', [
            'first_name' => 'Infant',
            'civil_status' => 'Single',
            'occupation' => null,
            'nhts_status' => null,
            'purok_area' => 'Purok 1',
            'mother_patient_id' => $mother->id,
            'mother_name' => 'Infant Mother',
            'family_serial_number' => 'FSN-INFANT',
            'spouse_name' => null,
            'spouse_occupation' => null,
        ]);
    }

    public function test_referral_creation_generates_tracking_notification_and_audit_log(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Bulakan RHU']);
        $bhc->update(['rural_health_unit_id' => $rhu->id]);
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
            ->assertJsonStructure(['data' => ['tracking_id']])
            ->assertJsonMissingPath('data.qr_code_value')
            ->assertJsonMissingPath('data.qr_token_hash');

        $this->assertDatabaseHas('notifications', ['type' => 'referral_submitted']);
        $this->assertDatabaseHas('audit_logs', ['module' => 'referrals', 'action' => 'submitted']);
    }

    public function test_notification_read_and_clear_actions_are_persisted_and_scoped_to_user(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Bulakan RHU']);
        $rhuStaff = User::create([
            'name' => 'RHU Staff',
            'email' => 'notifications-rhu@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhu->id,
        ]);
        $otherStaff = User::create([
            'name' => 'Other RHU Staff',
            'email' => 'notifications-other@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhu->id,
        ]);

        $first = UserNotification::create([
            'user_id' => $rhuStaff->id,
            'title' => 'Incoming referral',
            'message' => 'A referral is waiting.',
            'type' => 'incoming_referral',
        ]);
        $second = UserNotification::create([
            'user_id' => $rhuStaff->id,
            'title' => 'Medicine alert',
            'message' => 'Stock needs review.',
            'type' => 'medicine',
        ]);
        $otherNotification = UserNotification::create([
            'user_id' => $otherStaff->id,
            'title' => 'Other user alert',
            'message' => 'Should stay untouched.',
            'type' => 'incoming_referral',
        ]);

        $this->actingAs($rhuStaff, 'sanctum')
            ->patchJson("/api/notifications/{$first->id}/read")
            ->assertOk()
            ->assertJsonPath('data.is_read', true);

        $this->assertDatabaseHas('notifications', [
            'id' => $first->id,
            'user_id' => $rhuStaff->id,
            'is_read' => true,
        ]);

        $this->actingAs($rhuStaff, 'sanctum')
            ->deleteJson("/api/notifications/{$first->id}")
            ->assertOk();

        $this->assertDatabaseHas('notifications', [
            'id' => $first->id,
            'user_id' => $rhuStaff->id,
        ]);
        $this->assertNotNull($first->fresh()->cleared_at);

        $this->actingAs($rhuStaff, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $second->id);

        $this->actingAs($rhuStaff, 'sanctum')
            ->patchJson('/api/notifications/read-all')
            ->assertOk();

        $this->assertTrue($second->fresh()->is_read);
        $this->assertFalse($otherNotification->fresh()->is_read);

        $this->actingAs($rhuStaff, 'sanctum')
            ->deleteJson('/api/notifications')
            ->assertOk();

        $this->assertNotNull($second->fresh()->cleared_at);
        $this->assertNull($otherNotification->fresh()->cleared_at);

        $this->actingAs($rhuStaff, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_referral_creation_is_idempotent_by_client_submission_id(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Bulakan RHU']);
        $bhc->update(['rural_health_unit_id' => $rhu->id]);
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
        $firstResponse->assertJsonMissingPath('data.qr_code_value');

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/referrals', $payload)
            ->assertOk()
            ->assertJsonPath('data.tracking_id', $trackingId)
            ->assertJsonMissingPath('data.qr_code_value');

        $this->assertSame(1, Referral::where('client_submission_id', 'offline-draft-123')->count());
        $this->assertSame(1, Referral::count());
        $this->assertDatabaseCount('referral_updates', 1);
        $this->assertDatabaseHas('notifications', ['type' => 'incoming_referral']);
        $this->assertDatabaseHas('notifications', ['type' => 'referral_submitted']);
        $this->assertDatabaseCount('notifications', 2);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_rhu_received_referral_links_existing_patient_to_rhu_without_duplicates(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Bulakan RHU']);
        $rhuStaff = User::create([
            'name' => 'RHU Staff',
            'email' => 'received-rhu@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $rhu->id,
        ]);
        User::create([
            'name' => 'BHW',
            'email' => 'received-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        $patient = Patient::create([
            'first_name' => 'Checked',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
        ]);
        $referral = Referral::create([
            'tracking_id' => 'AKAY-TEST-RECEIVED',
            'qr_code_value' => 'AKAY:REFERRAL:AKAY-TEST-RECEIVED',
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $rhu->id,
            'status' => Referral::STATUS_PENDING,
            'reason_for_referral' => 'RHU check-in.',
        ]);

        $this->actingAs($rhuStaff, 'sanctum')
            ->patchJson("/api/referrals/{$referral->id}/status", [
                'status' => Referral::STATUS_RECEIVED,
                'remarks' => 'Patient received.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Referral::STATUS_RECEIVED);

        $this->assertSame($rhu->id, $patient->fresh()->rural_health_unit_id);
        $this->assertSame(1, Patient::where('first_name', 'Checked')->where('last_name', 'Patient')->count());

        $this->actingAs($rhuStaff, 'sanctum')
            ->patchJson("/api/referrals/{$referral->id}/status", [
                'status' => Referral::STATUS_RECEIVED,
                'remarks' => 'Repeated receive.',
            ])
            ->assertOk();

        $this->assertSame(1, Patient::where('first_name', 'Checked')->where('last_name', 'Patient')->count());

        $this->actingAs($rhuStaff, 'sanctum')
            ->getJson('/api/patients')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $patient->id);
    }

    public function test_family_planning_health_record_saves_json_payload_and_can_be_filtered(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'Family Planning BHC']);
        $bhw = User::create([
            'name' => 'BHW',
            'email' => 'family-planning-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        $patient = Patient::create([
            'first_name' => 'Family',
            'last_name' => 'Planning',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
        ]);

        $response = $this->actingAs($bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $patient->id,
                'category' => 'Family Planning',
                'chief_complaint' => 'Family planning counseling',
                'family_planning_data' => [
                    'clientType' => 'New Acceptor',
                    'methodUsed' => 'DMPA / Injectable',
                    'previousMethod' => 'None',
                    'fpVisitType' => 'Counseling',
                    'source' => 'Public',
                    'dateOfVisit' => now()->toDateString(),
                    'nextAppointmentDate' => now()->addMonth()->toDateString(),
                    'remarks' => 'Counseling completed.',
                    'actionTaken' => 'Method counseling done.',
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.category', 'Family Planning')
            ->assertJsonPath('data.family_planning_data.clientType', 'New Acceptor')
            ->assertJsonPath('data.family_planning_data.method_used', 'DMPA / Injectable')
            ->assertJsonPath('data.family_planning_data.previous_method', 'None')
            ->assertJsonPath('data.family_planning_data.fp_visit_type', 'Counseling')
            ->assertJsonPath('data.family_planning_data.source', 'Public');

        $recordId = $response->json('data.id');
        $this->assertSame(1, HealthRecord::where('category', 'Family Planning')->count());
        $this->assertDatabaseHas('health_records', [
            'id' => $recordId,
            'category' => 'Family Planning',
        ]);

        $this->actingAs($bhw, 'sanctum')
            ->getJson('/api/health-records?category=Family%20Planning')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $recordId)
            ->assertJsonPath('data.data.0.category', 'Family Planning');
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
