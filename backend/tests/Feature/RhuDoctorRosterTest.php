<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\RhuDoctorRosterService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuDoctorRosterTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private User $admin;

    private User $rhuStaffA;

    private User $rhuStaffB;

    private User $bhwA;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Roster RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Roster RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Roster BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);

        $this->admin = $this->user('Roster Admin', 'roster-admin@example.test', User::ROLE_ADMIN);
        $this->rhuStaffA = $this->user('RHU A Staff', 'roster-rhu-a@example.test', User::ROLE_RHU, rhuId: $this->rhuA->id);
        $this->rhuStaffB = $this->user('RHU B Staff', 'roster-rhu-b@example.test', User::ROLE_RHU, rhuId: $this->rhuB->id);
        $this->bhwA = $this->user('BHW A', 'roster-bhw-a@example.test', User::ROLE_BHC, bhcId: $this->bhcA->id);

        Sanctum::actingAs($this->admin, ['*']);
    }

    public function test_schema_links_optional_account_identity(): void
    {
        $this->assertTrue(Schema::hasColumn('rhu_providers', 'user_id'));
        $this->assertFalse(
            Schema::hasColumn('rhu_providers', 'is_default'),
            'DOC-15a-V: linking an account must not add a default-provider column.'
        );
    }

    public function test_admin_creating_rhu_doctor_adds_unavailable_roster_entry(): void
    {
        $id = $this->postJson('/api/users', $this->doctorPayload())
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $id,
            'rural_health_unit_id' => $this->rhuA->id,
            'name' => 'Dr. Maria Santos',
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
        ]);
        $this->assertTrue(AuditLog::where('action', 'provider_created')->where('module', 'providers')->exists());
        $this->assertSame(1, RhuProvider::query()->count());
    }

    public function test_admin_creating_nurse_or_bhc_account_does_not_add_roster_entry(): void
    {
        $this->postJson('/api/users', $this->doctorPayload([
            'name' => 'Nurse Reyes',
            'email' => 'nurse.reyes@example.test',
            'staff_role' => 'nurse',
            'permissions' => StaffRoles::defaults('nurse'),
        ]))->assertCreated();

        $this->postJson('/api/users', [
            'name' => 'Midwife Cruz',
            'email' => 'midwife.cruz@example.test',
            'contact_number' => '09171234567',
            'role' => 'bhc',
            'staff_role' => 'midwife',
            'barangay_health_center_id' => $this->bhcA->id,
            'permissions' => StaffRoles::defaults('midwife'),
            'permissions_confirmed' => true,
        ])->assertCreated();

        $this->assertDatabaseCount('rhu_providers', 0);
    }

    public function test_new_official_doctor_does_not_open_the_referral_gate(): void
    {
        $this->postJson('/api/users', $this->doctorPayload())->assertCreated();

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.rural_health_unit_id', $this->rhuA->id)
            ->assertJsonPath('data.available_count', 0)
            ->assertJsonPath('data.total_count', 1)
            ->assertJsonPath('data.can_submit_referral', false)
            ->assertJsonPath('data.providers.0.availability_status', RhuProvider::STATUS_UNAVAILABLE)
            ->assertJsonPath('data.providers.0.user_id', User::where('email', 'maria.santos@example.test')->value('id'));
    }

    public function test_rhu_staff_can_mark_official_doctor_available_without_changing_identity(): void
    {
        $userId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');
        $provider = RhuProvider::query()->where('user_id', $userId)->sole();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
                'remarks' => 'On duty until 5pm',
            ])
            ->assertOk()
            ->assertJsonPath('data.availability_status', RhuProvider::STATUS_AVAILABLE)
            ->assertJsonPath('data.name', 'Dr. Maria Santos')
            ->assertJsonPath('data.user_id', $userId);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", ['name' => 'Someone Else'])
            ->assertUnprocessable()
            ->assertJsonPath('message', RhuDoctorRosterService::NAME_MANAGED);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->deleteJson("/api/rhu-providers/{$provider->id}")
            ->assertUnprocessable()
            ->assertJsonPath('message', RhuDoctorRosterService::OFFICIAL_LOCKED);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', true)
            ->assertJsonPath('data.available_count', 1);

        $this->assertTrue(AuditLog::where('action', 'provider_availability_changed')->exists());
        $this->assertSame('Dr. Maria Santos', $provider->fresh()->name);
        $this->assertTrue($provider->fresh()->is_active);
    }

    public function test_existing_same_name_covering_row_is_not_claimed_by_an_official_account(): void
    {
        $covering = RhuProvider::create([
            'rural_health_unit_id' => $this->rhuA->id,
            'name' => 'Dr. Maria Santos',
            'specialization' => 'General Practitioner',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'remarks' => 'Existing covering record',
            'is_active' => true,
        ]);

        $userId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');

        $this->assertDatabaseCount('rhu_providers', 2);
        $this->assertDatabaseHas('rhu_providers', [
            'id' => $covering->id,
            'user_id' => null,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'remarks' => 'Existing covering record',
            'specialization' => 'General Practitioner',
        ]);
        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $userId,
            'name' => 'Dr. Maria Santos',
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
        ]);
        $this->assertFalse(AuditLog::where('action', 'provider_linked')->exists());

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', true)
            ->assertJsonPath('data.total_count', 2)
            ->assertJsonPath('data.available_count', 1);
    }

    public function test_account_name_change_syncs_and_a_second_official_doctor_may_share_a_display_name(): void
    {
        $firstId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');

        $secondId = $this->postJson('/api/users', $this->doctorPayload([
            'name' => 'Dr. Maria Santos',
            'email' => 'duplicate.santos@example.test',
        ]))->assertCreated()->json('data.id');

        $this->assertDatabaseCount('rhu_providers', 2);
        $this->assertSame(2, RhuProvider::query()->where('name', 'Dr. Maria Santos')->count());

        $this->patchJson("/api/users/{$firstId}", $this->doctorPayload([
            'name' => 'Dr. Maria Santos-Reyes',
            'email' => 'maria.santos@example.test',
        ]))->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $firstId,
            'name' => 'Dr. Maria Santos-Reyes',
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
        ]);
        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $secondId,
            'name' => 'Dr. Maria Santos',
        ]);
    }

    public function test_deactivation_preserves_last_availability_and_reactivation_stays_unavailable_until_rhu_confirms(): void
    {
        $userId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');
        $provider = RhuProvider::query()->where('user_id', $userId)->sole();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
                'remarks' => 'On duty until 5pm',
            ])
            ->assertOk();

        Sanctum::actingAs($this->admin, ['*']);
        $this->deleteJson("/api/users/{$userId}")->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'user_id' => $userId,
            'is_active' => false,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'remarks' => 'On duty until 5pm',
        ]);
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.total_count', 0)
            ->assertJsonPath('data.available_count', 0)
            ->assertJsonPath('data.can_submit_referral', false);

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$userId}", ['status' => 'active'])->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'user_id' => $userId,
            'is_active' => true,
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'remarks' => 'On duty until 5pm',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->assertTrue(
            AuditLog::where('action', 'provider_updated')
                ->where('description', "Returned provider {$provider->name} to the RHU roster as Unavailable.")
                ->exists()
        );
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', false)
            ->assertJsonPath('data.available_count', 0)
            ->assertJsonPath('data.total_count', 1)
            ->assertJsonPath('data.providers.0.availability_status', RhuProvider::STATUS_UNAVAILABLE);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])
            ->assertOk();

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.can_submit_referral', true)
            ->assertJsonPath('data.available_count', 1);
    }

    public function test_reassigning_or_changing_role_keeps_one_row_and_isolates_facilities(): void
    {
        $userId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');
        $provider = RhuProvider::query()->where('user_id', $userId)->sole();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])
            ->assertOk();
        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->getJson('/api/rhu-providers')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$userId}", [
            'rural_health_unit_id' => $this->rhuB->id,
        ])->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'user_id' => $userId,
            'rural_health_unit_id' => $this->rhuB->id,
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
        ]);
        $this->assertDatabaseCount('rhu_providers', 1);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers')
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->getJson('/api/rhu-providers')
            ->assertOk()
            ->assertJsonPath('data.0.id', $provider->id);

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$userId}", [
            'staff_role' => 'nurse',
            'permissions' => StaffRoles::defaults('nurse'),
            'permissions_confirmed' => true,
        ])->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'is_active' => false,
            'user_id' => $userId,
        ]);
        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->getJson('/api/rhu-providers')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$userId}", [
            'staff_role' => 'doctor',
            'permissions' => StaffRoles::defaults('doctor'),
            'permissions_confirmed' => true,
        ])->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'user_id' => $userId,
            'is_active' => true,
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
    }

    public function test_unlinked_covering_doctors_remain_and_rhu_can_still_create_them(): void
    {
        $covering = RhuProvider::create([
            'rural_health_unit_id' => $this->rhuA->id,
            'name' => 'Dr. Covering',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'is_active' => true,
        ]);

        $this->postJson('/api/users', $this->doctorPayload())->assertCreated();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Locum'])
            ->assertCreated()
            ->assertJsonPath('data.user_id', null)
            ->assertJsonPath('data.availability_status', RhuProvider::STATUS_AVAILABLE);

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $covering->id,
            'user_id' => null,
            'is_active' => true,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
        ]);
        $this->assertSame(3, RhuProvider::query()->count());
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.total_count', 3)
            ->assertJsonPath('data.available_count', 2)
            ->assertJsonPath('data.can_submit_referral', true);
    }

    public function test_promoting_a_nurse_or_updating_a_legacy_doctor_provisions_the_roster(): void
    {
        $nurseId = $this->postJson('/api/users', $this->doctorPayload([
            'name' => 'Nurse To Doctor',
            'email' => 'nurse.to.doctor@example.test',
            'staff_role' => 'nurse',
            'permissions' => StaffRoles::defaults('nurse'),
        ]))->assertCreated()->json('data.id');

        $this->assertDatabaseCount('rhu_providers', 0);

        $this->patchJson("/api/users/{$nurseId}", [
            'staff_role' => 'doctor',
            'permissions' => StaffRoles::defaults('doctor'),
            'permissions_confirmed' => true,
        ])->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $nurseId,
            'name' => 'Nurse To Doctor',
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
        ]);

        $legacy = User::create([
            'name' => 'Dr. Legacy',
            'email' => 'legacy.doctor@example.test',
            'password' => 'password123',
            'role' => User::ROLE_RHU,
            'staff_role' => 'doctor',
            'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $this->rhuA->id,
            'permissions' => StaffRoles::defaults('doctor'),
        ]);

        $this->patchJson("/api/users/{$legacy->id}", ['contact_number' => '09170001122'])->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $legacy->id,
            'name' => 'Dr. Legacy',
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
        ]);
        $this->assertSame(2, RhuProvider::query()->count());
    }

    public function test_move_keeps_covering_identity_at_the_destination_and_resets_official_availability(): void
    {
        $userId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');
        $covering = RhuProvider::create([
            'rural_health_unit_id' => $this->rhuB->id,
            'name' => 'Dr. Maria Santos',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'is_active' => true,
        ]);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson('/api/rhu-providers/'.RhuProvider::query()->where('user_id', $userId)->value('id'), [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
            ])
            ->assertOk();

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$userId}", [
            'rural_health_unit_id' => $this->rhuB->id,
        ])->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $userId,
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->assertDatabaseHas('rhu_providers', [
            'id' => $covering->id,
            'user_id' => null,
            'rural_health_unit_id' => $this->rhuB->id,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
        ]);
        $this->assertDatabaseHas('rhu_providers', [
            'user_id' => $userId,
            'rural_health_unit_id' => $this->rhuB->id,
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
        ]);
        $this->assertSame(2, RhuProvider::query()->where('rural_health_unit_id', $this->rhuB->id)->count());
    }

    public function test_sync_is_idempotent_for_an_existing_official_row(): void

    {
        $userId = $this->postJson('/api/users', $this->doctorPayload())->assertCreated()->json('data.id');
        $provider = RhuProvider::query()->where('user_id', $userId)->sole();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_AVAILABLE,
                'remarks' => 'Clinic hours',
            ])
            ->assertOk();

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$userId}", [
            'contact_number' => '09179876543',
        ])->assertOk();

        app(RhuDoctorRosterService::class)->syncFromAccount(User::findOrFail($userId), $this->admin);

        $this->assertDatabaseCount('rhu_providers', 1);
        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'user_id' => $userId,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'remarks' => 'Clinic hours',
        ]);
    }

    private function doctorPayload(array $overrides = []): array
    {
        return [
            'name' => 'Dr. Maria Santos',
            'email' => 'maria.santos@example.test',
            'contact_number' => '09171234567',
            'role' => 'rhu',
            'staff_role' => 'doctor',
            'rural_health_unit_id' => $this->rhuA->id,
            'permissions' => StaffRoles::defaults('doctor'),
            'permissions_confirmed' => true,
            ...$overrides,
        ];
    }

    private function user(string $name, string $email, string $role, ?int $bhcId = null, ?int $rhuId = null): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => 'password123',
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
