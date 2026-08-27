<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Doctor Availability - DOC-01, DOC-14 (aggregate only), DOC-15, DOC-15a-V,
 * DOC-19, DOC-20, DOC-21, DOC-22, SCR-06.
 *
 * Covers plan QA 7.2 cases 11-14, 24 and 25. The submission gate itself
 * (cases 15-23) is Phase 3 and is not asserted here.
 */
class RhuProviderAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private User $rhuStaffA;

    private User $rhuStaffB;

    private User $bhwA;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Provider RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Provider RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Provider BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);

        $this->rhuStaffA = $this->user('RHU A Staff', 'prov-rhu-a@example.test', User::ROLE_RHU_STAFF, null, $this->rhuA->id);
        $this->rhuStaffB = $this->user('RHU B Staff', 'prov-rhu-b@example.test', User::ROLE_RHU_STAFF, null, $this->rhuB->id);
        $this->bhwA = $this->user('BHW A', 'prov-bhw-a@example.test', User::ROLE_BHW, $this->bhcA->id);
        $this->admin = $this->user('Provider Admin', 'prov-admin@example.test', User::ROLE_ADMIN);
    }

    /** DOC-20 - RHU staff manage their own roster. */
    public function test_rhu_staff_can_create_and_update_own_provider(): void
    {
        $id = $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/rhu-providers', [
                'name' => 'Dr. Maria Santos',
                'specialization' => 'General Practitioner',
                'remarks' => 'Covering provider',
            ])
            ->assertCreated()
            ->assertJsonPath('data.availability_status', RhuProvider::STATUS_AVAILABLE)
            ->assertJsonPath('data.specialization', 'General Practitioner')
            ->assertJsonPath('data.remarks', 'Covering provider')
            ->json('data.id');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$id}", [
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            ])
            ->assertOk()
            ->assertJsonPath('data.availability_status', RhuProvider::STATUS_UNAVAILABLE);

        $this->assertSame($this->rhuA->id, RhuProvider::query()->sole()->rural_health_unit_id);
    }

    /** QA 11 - DOC-15: RHU staff cannot read or write another RHU's roster. */
    public function test_rhu_staff_cannot_reach_another_rhu_roster(): void
    {
        $foreign = $this->provider($this->rhuB, 'Dr. Foreign');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$foreign->id}", [
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            ])
            ->assertForbidden();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->deleteJson("/api/rhu-providers/{$foreign->id}")
            ->assertForbidden();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/rhu-providers')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->assertSame(
            RhuProvider::STATUS_AVAILABLE,
            $foreign->fresh()->availability_status
        );
    }

    /** QA 12 - DOC-01: a BHW may never write to a roster. */
    public function test_bhw_cannot_write_providers(): void
    {
        $provider = $this->provider($this->rhuA, 'Dr. Read Only');

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Injected'])
            ->assertForbidden();

        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            ])
            ->assertForbidden();

        $this->actingAs($this->bhwA, 'sanctum')
            ->deleteJson("/api/rhu-providers/{$provider->id}")
            ->assertForbidden();

        $this->assertDatabaseCount('rhu_providers', 1);
    }

    /** QA 13 - DOC-01/DOC-19: a BHW reads only their mapped parent RHU. */
    public function test_bhw_reads_only_mapped_parent_rhu_availability(): void
    {
        $this->provider($this->rhuA, 'Dr. Mapped');
        $this->provider($this->rhuA, 'Dr. Away', RhuProvider::STATUS_UNAVAILABLE);
        $this->provider($this->rhuB, 'Dr. Other RHU');

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.rural_health_unit_id', $this->rhuA->id)
            ->assertJsonPath('data.available_count', 1)
            ->assertJsonPath('data.total_count', 2)
            ->assertJsonPath('data.can_submit_referral', true)
            ->assertJsonCount(2, 'data.providers')
            ->assertJsonMissing(['name' => 'Dr. Other RHU']);
    }

    /** DOC-19 - zero available is reported as not submittable. */
    public function test_availability_reports_zero_available_as_blocked(): void
    {
        $this->provider($this->rhuA, 'Dr. Away', RhuProvider::STATUS_UNAVAILABLE);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.available_count', 0)
            ->assertJsonPath('data.total_count', 1)
            ->assertJsonPath('data.status', RhuProvider::STATUS_UNAVAILABLE)
            ->assertJsonPath('data.can_submit_referral', false);
    }

    /** An empty roster is also not submittable - DOC-14 has no implicit provider. */
    public function test_empty_roster_is_not_submittable(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.total_count', 0)
            ->assertJsonPath('data.can_submit_referral', false);
    }

    /** QA 14 - DOC-15: admin may read every roster but may not write any. */
    public function test_admin_can_read_but_never_write(): void
    {
        $provider = $this->provider($this->rhuA, 'Dr. Admin Readable');
        $this->provider($this->rhuB, 'Dr. Other');

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/rhu-providers')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Admin Added'])
            ->assertForbidden();

        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('rhu_providers', 2);
    }

    /** DOC-20 - deactivation is a soft delete; the row is retained for REL-01. */
    public function test_deactivation_is_soft_and_leaves_the_row(): void
    {
        $provider = $this->provider($this->rhuA, 'Dr. Leaving');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->deleteJson("/api/rhu-providers/{$provider->id}")
            ->assertOk();

        $this->assertDatabaseHas('rhu_providers', [
            'id' => $provider->id,
            'is_active' => false,
        ]);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/rhu-providers/availability')
            ->assertOk()
            ->assertJsonPath('data.total_count', 0);
    }

    /** QA 25 - SCR-06: an availability flip is its own audited event. */
    public function test_availability_change_writes_its_own_audit_event(): void
    {
        $provider = $this->provider($this->rhuA, 'Dr. Audited');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", [
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            ])
            ->assertOk();

        $this->assertTrue(
            AuditLog::where('action', 'provider_availability_changed')
                ->where('module', 'providers')
                ->exists()
        );

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/rhu-providers/{$provider->id}", ['remarks' => 'Back Monday'])
            ->assertOk();

        $this->assertTrue(
            AuditLog::where('action', 'provider_updated')->exists(),
            'A non-availability edit must audit as provider_updated.'
        );
    }

    /**
     * QA 24 / DOC-15a-V - the schema must contain no default, fallback or
     * covering-provider designation. DOC-15a forbids automatic replacement, and
     * such a column would reintroduce it through the schema.
     */
    public function test_schema_has_no_default_or_covering_provider_column(): void
    {
        $forbidden = [
            'is_default', 'is_fallback', 'is_covering', 'is_primary',
            'priority_order', 'rank', 'default_provider', 'fallback_provider_id',
        ];

        foreach ($forbidden as $column) {
            $this->assertFalse(
                Schema::hasColumn('rhu_providers', $column),
                "DOC-15a-V: rhu_providers must not carry a '{$column}' column."
            );
        }
    }

    /** DOC-20 - an RHU cannot hold two active providers with the same name. */
    public function test_duplicate_active_name_is_rejected_per_rhu(): void
    {
        $this->provider($this->rhuA, 'Dr. Twin');

        // The same name is legitimate at a different RHU.
        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->postJson('/api/rhu-providers', ['name' => 'Dr. Twin'])
            ->assertCreated();

        $this->assertSame(2, RhuProvider::query()->count());
    }

    /** Availability rejects an invalid status rather than storing it. */
    public function test_invalid_availability_status_is_rejected(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/rhu-providers', [
                'name' => 'Dr. Bad Status',
                'availability_status' => 'On Leave',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('availability_status');
    }

    private function provider(
        RuralHealthUnit $rhu,
        string $name,
        string $status = RhuProvider::STATUS_AVAILABLE
    ): RhuProvider {
        return RhuProvider::create([
            'rural_health_unit_id' => $rhu->id,
            'name' => $name,
            'specialization' => 'General Practitioner',
            'availability_status' => $status,
            'is_active' => true,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
