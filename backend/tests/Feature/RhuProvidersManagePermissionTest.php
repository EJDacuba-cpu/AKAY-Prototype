<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FacilityAssignment;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuProvidersManagePermissionTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_10_22_000003_grant_rhu_providers_manage_to_existing_rhu_staff.php';

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Perm RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Perm RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Perm BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->admin = $this->user('Perm Admin', 'perm-admin@example.test', User::ROLE_ADMIN);
        Sanctum::actingAs($this->admin, ['*']);
    }

    public function test_new_rhu_roles_include_the_duty_and_bhc_roles_do_not(): void
    {
        $this->assertContains('rhu.providers.manage', ActionPermissions::ALL);
        $this->assertContains('rhu.providers.manage', StaffRoles::defaults('nurse'));
        $this->assertContains('rhu.providers.manage', StaffRoles::defaults('doctor'));
        $this->assertContains('rhu.providers.manage', StaffRoles::available(User::ROLE_RHU));
        $this->assertNotContains('rhu.providers.manage', StaffRoles::defaults('midwife'));
        $this->assertNotContains('rhu.providers.manage', StaffRoles::defaults('encoder'));
        $this->assertNotContains('rhu.providers.manage', StaffRoles::available(User::ROLE_BHC));
    }

    public function test_creating_rhu_accounts_stores_the_duty_and_bhc_cannot_be_granted_it(): void
    {
        $nurseId = $this->postJson('/api/users', $this->accountPayload('nurse', 'perm-nurse@example.test'))
            ->assertCreated()
            ->json('data.id');
        $doctorId = $this->postJson('/api/users', $this->accountPayload('doctor', 'perm-doctor@example.test', [
            'name' => 'Perm Doctor',
        ]))->assertCreated()->json('data.id');

        $this->assertContains('rhu.providers.manage', User::findOrFail($nurseId)->permissions);
        $this->assertContains('rhu.providers.manage', User::findOrFail($doctorId)->permissions);

        $this->postJson('/api/users', [
            'name' => 'Perm Encoder',
            'email' => 'perm-encoder@example.test',
            'contact_number' => '09171234567',
            'role' => 'bhc',
            'staff_role' => 'encoder',
            'barangay_health_center_id' => $this->bhcA->id,
            'permissions' => [...StaffRoles::defaults('encoder'), 'rhu.providers.manage'],
            'permissions_confirmed' => true,
        ])->assertUnprocessable()->assertJsonFragment(['rhu.providers.manage is not available to BHC accounts.']);
    }

    public function test_referral_duty_without_providers_manage_cannot_write_the_roster(): void
    {
        $nurse = $this->staff('perm-referrals-only@example.test', ['inventory.view', 'rhu.manage']);
        $provider = $this->provider($this->rhuA);

        $this->actingAs($nurse, 'sanctum')->getJson('/api/incoming-referrals')->assertOk();
        $this->actingAs($nurse, 'sanctum')->postJson('/api/rhu-providers', ['name' => 'Dr. Blocked'])->assertForbidden();
        $this->actingAs($nurse, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", ['availability_status' => RhuProvider::STATUS_UNAVAILABLE])
            ->assertForbidden();
        $this->actingAs($nurse, 'sanctum')->deleteJson("/api/rhu-providers/{$provider->id}")->assertForbidden();
        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'is_active' => true,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
        ]);
    }

    public function test_providers_manage_without_referral_duty_can_write_home_roster_only(): void
    {
        $nurse = $this->staff('perm-availability-only@example.test', ['inventory.view', 'rhu.providers.manage']);
        $foreign = $this->provider($this->rhuB, 'Dr. Foreign');

        $this->actingAs($nurse, 'sanctum')->getJson('/api/incoming-referrals')->assertForbidden();
        $this->actingAs($nurse, 'sanctum')->getJson('/api/feedback')->assertForbidden();

        $id = $this->actingAs($nurse, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Covering'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($nurse, 'sanctum')
            ->patchJson("/api/rhu-providers/{$id}", ['availability_status' => RhuProvider::STATUS_UNAVAILABLE])
            ->assertOk()
            ->assertJsonPath('data.availability_status', RhuProvider::STATUS_UNAVAILABLE);

        $this->actingAs($nurse, 'sanctum')
            ->patchJson("/api/rhu-providers/{$foreign->id}", ['availability_status' => RhuProvider::STATUS_UNAVAILABLE])
            ->assertForbidden();
        $this->actingAs($nurse, 'sanctum')->deleteJson("/api/rhu-providers/{$foreign->id}")->assertForbidden();
        $this->assertSame(RhuProvider::STATUS_AVAILABLE, $foreign->fresh()->availability_status);
    }

    public function test_doctor_with_duty_can_write_and_nurse_without_it_cannot(): void
    {
        $doctor = $this->staff('perm-doctor-write@example.test', ['inventory.view', 'rhu.providers.manage'], 'doctor');
        $nurse = $this->staff('perm-nurse-denied@example.test', ['inventory.view', 'rhu.manage']);

        $this->actingAs($doctor, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Duty'])
            ->assertCreated();
        $this->actingAs($nurse, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. No Duty'])
            ->assertForbidden();
    }

    public function test_admin_is_read_only_and_bhw_cannot_write(): void
    {
        $provider = $this->provider($this->rhuA);
        $bhw = $this->user('Perm BHW', 'perm-bhw@example.test', User::ROLE_BHC, $this->bhcA->id);

        $this->actingAs($this->admin, 'sanctum')->getJson('/api/rhu-providers')->assertOk();
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Admin Added'])
            ->assertForbidden();

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Injected'])
            ->assertForbidden();
        $this->actingAs($bhw, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", ['availability_status' => RhuProvider::STATUS_UNAVAILABLE])
            ->assertForbidden();
        $this->assertSame(RhuProvider::STATUS_AVAILABLE, $provider->fresh()->availability_status);
    }

    public function test_unchecking_and_checking_the_duty_toggles_write_access(): void
    {
        $id = $this->postJson('/api/users', $this->accountPayload('nurse', 'perm-toggle@example.test'))
            ->assertCreated()
            ->json('data.id');
        $nurse = User::findOrFail($id);

        $this->actingAs($nurse, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. First'])
            ->assertCreated();

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$id}", [
            'staff_role' => 'nurse',
            'permissions' => array_values(array_diff(StaffRoles::defaults('nurse'), ['rhu.providers.manage'])),
            'permissions_confirmed' => true,
        ])->assertOk();

        $this->actingAs($nurse->fresh(), 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. After Uncheck'])
            ->assertForbidden();

        Sanctum::actingAs($this->admin, ['*']);
        $this->patchJson("/api/users/{$id}", [
            'staff_role' => 'nurse',
            'permissions' => StaffRoles::defaults('nurse'),
            'permissions_confirmed' => true,
        ])->assertOk();

        $this->actingAs($nurse->fresh(), 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. After Check'])
            ->assertCreated();
    }

    public function test_migration_grants_the_duty_only_where_rhu_manage_already_exists(): void
    {
        $rhuUser = $this->staff('perm-backfill@example.test', ['patients.register', 'rhu.manage']);
        $alreadyGranted = $this->staff('perm-already@example.test', ['rhu.manage', 'rhu.providers.manage']);
        $bhw = $this->user('Perm BHW Backfill', 'perm-bhw-backfill@example.test', User::ROLE_BHC, $this->bhcA->id, permissions: ['patients.register', 'consultations.encode']);
        $legacy = $this->user('Perm Legacy', 'perm-legacy@example.test', User::ROLE_RHU, rhuId: $this->rhuA->id, permissions: null);
        $granted = FacilityAssignment::create([
            'user_id' => $bhw->id,
            'barangay_health_center_id' => $this->bhcA->id,
            'permissions' => ['rhu.manage', 'inventory.view'],
        ]);
        $other = FacilityAssignment::create([
            'user_id' => $bhw->id,
            'rural_health_unit_id' => $this->rhuA->id,
            'permissions' => ['inventory.view'],
        ]);

        $migration = require database_path(self::MIGRATION);
        $migration->up();
        $migration->up();

        $this->assertSame(['patients.register', 'rhu.manage', 'rhu.providers.manage'], $rhuUser->fresh()->permissions);
        $this->assertSame(['rhu.manage', 'rhu.providers.manage'], $alreadyGranted->fresh()->permissions);
        $this->assertNotContains('rhu.providers.manage', $bhw->fresh()->permissions);
        $this->assertNull($legacy->fresh()->permissions);
        $this->assertSame(['rhu.manage', 'inventory.view', 'rhu.providers.manage'], $granted->fresh()->permissions);
        $this->assertNotContains('rhu.providers.manage', $other->fresh()->permissions);

        $migration->down();

        $this->assertSame(['patients.register', 'rhu.manage'], $rhuUser->fresh()->permissions);
        $this->assertSame(['rhu.manage'], $alreadyGranted->fresh()->permissions);
        $this->assertSame(['rhu.manage', 'inventory.view'], $granted->fresh()->permissions);
    }

    private function accountPayload(string $staffRole, string $email, array $overrides = []): array
    {
        return [
            'name' => $overrides['name'] ?? 'Perm '.ucfirst($staffRole),
            'email' => $email,
            'contact_number' => '09171234567',
            'role' => 'rhu',
            'staff_role' => $staffRole,
            'rural_health_unit_id' => $this->rhuA->id,
            'permissions' => StaffRoles::defaults($staffRole),
            'permissions_confirmed' => true,
            ...$overrides,
        ];
    }

    private function staff(string $email, array $permissions, string $staffRole = 'nurse'): User
    {
        return $this->user($email, $email, User::ROLE_RHU, rhuId: $this->rhuA->id, staffRole: $staffRole, permissions: $permissions);
    }

    private function provider(RuralHealthUnit $rhu, string $name = 'Dr. Listed'): RhuProvider
    {
        return RhuProvider::create([
            'rural_health_unit_id' => $rhu->id,
            'name' => $name,
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'is_active' => true,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null,
        ?string $staffRole = null,
        ?array $permissions = []
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'staff_role' => $staffRole,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
            'permissions' => $permissions,
        ]);
    }
}
