<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralRoutingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReferralRoutingSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $bhwA;
    private User $rhuStaffA;
    private RuralHealthUnit $rhuA;
    private RuralHealthUnit $rhuB;
    private RuralHealthUnit $inactiveRhu;
    private BarangayHealthCenter $bhcA;
    private BarangayHealthCenter $bhcB;
    private BarangayHealthCenter $unmappedBhc;
    private Patient $patientA;
    private Patient $patientB;
    private HealthRecord $recordA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Routing RHU A']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Routing RHU B']);
        $this->inactiveRhu = RuralHealthUnit::create([
            'name' => 'Inactive Routing RHU',
            'status' => 'inactive',
        ]);

        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Routing BHC A',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'Routing BHC B',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->unmappedBhc = BarangayHealthCenter::create([
            'name' => 'Unmapped Routing BHC',
        ]);

        $this->admin = $this->createUser(
            'Routing Admin',
            'routing-admin@example.test',
            User::ROLE_ADMIN
        );
        $this->bhwA = $this->createUser(
            'Routing BHW A',
            'routing-bhw-a@example.test',
            User::ROLE_BHW,
            $this->bhcA->id
        );
        $this->rhuStaffA = $this->createUser(
            'Routing RHU Staff A',
            'routing-rhu-a@example.test',
            User::ROLE_RHU_STAFF,
            null,
            $this->rhuA->id
        );

        $this->patientA = $this->createPatient('Routing', 'Patient A', $this->bhcA);
        $this->patientB = $this->createPatient('Routing', 'Patient B', $this->bhcB);
        $this->recordA = HealthRecord::create([
            'patient_id' => $this->patientA->id,
            'created_by' => $this->bhwA->id,
            'barangay_health_center_id' => $this->bhcA->id,
            'category' => 'General Consultation',
        ]);
    }

    public function test_admin_can_map_a_bhc_to_an_active_rhu(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/barangay-health-centers/{$this->unmappedBhc->id}", [
                'rural_health_unit_id' => $this->rhuA->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.rural_health_unit_id', $this->rhuA->id)
            ->assertJsonPath('data.rural_health_unit.id', $this->rhuA->id);

        $this->assertTrue($this->unmappedBhc->fresh()->ruralHealthUnit->is($this->rhuA));
    }

    public function test_multiple_bhcs_can_map_to_the_same_rhu(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/barangay-health-centers/{$this->bhcB->id}", [
                'rural_health_unit_id' => $this->rhuA->id,
            ])
            ->assertOk();

        $this->assertSame(2, BarangayHealthCenter::where('rural_health_unit_id', $this->rhuA->id)->count());
    }

    public function test_nonexistent_rhu_mapping_is_rejected(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/barangay-health-centers/{$this->bhcA->id}", [
                'rural_health_unit_id' => 999999,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rural_health_unit_id');
    }

    public function test_inactive_rhu_mapping_is_rejected_by_admin_validation(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/barangay-health-centers/{$this->bhcA->id}", [
                'rural_health_unit_id' => $this->inactiveRhu->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rural_health_unit_id');
    }

    public function test_bhw_can_read_only_the_destination_mapped_to_their_bhc(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/referral-routing')
            ->assertOk()
            ->assertJsonPath('data.referring_barangay_health_center.id', $this->bhcA->id)
            ->assertJsonPath('data.receiving_rural_health_unit.id', $this->rhuA->id);
    }

    public function test_valid_referral_is_routed_from_authenticated_bhc_to_mapped_rhu(): void
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload())
            ->assertCreated();

        $referralId = $response->json('data.id');
        $this->assertDatabaseHas('referrals', [
            'id' => $referralId,
            'patient_id' => $this->patientA->id,
            'health_record_id' => $this->recordA->id,
            'barangay_health_center_id' => $this->bhcA->id,
            'rural_health_unit_id' => $this->rhuA->id,
            'created_by' => $this->bhwA->id,
        ]);
        $this->assertNull($this->bhwA->fresh()->rural_health_unit_id);
        $this->assertNull($this->rhuStaffA->fresh()->barangay_health_center_id);
        $this->assertSame($this->rhuA->id, $this->rhuStaffA->fresh()->rural_health_unit_id);
    }

    public function test_client_destination_overrides_are_ignored(): void
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                ...$this->referralPayload(),
                'barangay_health_center_id' => $this->bhcB->id,
                'rural_health_unit_id' => $this->rhuB->id,
                'receiving_rhu_id' => $this->rhuB->id,
                'destination_facility_id' => $this->rhuB->id,
                'created_by' => $this->admin->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.barangay_health_center_id', $this->bhcA->id)
            ->assertJsonPath('data.rural_health_unit_id', $this->rhuA->id)
            ->assertJsonPath('data.created_by', $this->bhwA->id);

        $this->assertDatabaseMissing('referrals', [
            'id' => $response->json('data.id'),
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
    }

    public function test_unmapped_bhc_cannot_create_a_referral(): void
    {
        $bhw = $this->createUser(
            'Unmapped BHW',
            'unmapped-bhw@example.test',
            User::ROLE_BHW,
            $this->unmappedBhc->id
        );
        $patient = $this->createPatient('Unmapped', 'Patient', $this->unmappedBhc);

        $this->actingAs($bhw, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $patient->id,
                'reason_for_referral' => 'Needs further assessment.',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', ReferralRoutingService::MISSING_MAPPING_MESSAGE);

        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_inactive_mapped_rhu_blocks_referral_creation(): void
    {
        $this->bhcA->update(['rural_health_unit_id' => $this->inactiveRhu->id]);

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload())
            ->assertUnprocessable()
            ->assertJsonPath('message', ReferralRoutingService::INACTIVE_DESTINATION_MESSAGE);

        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_bhw_cannot_use_another_bhc_patient_or_mapping(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $this->patientB->id,
                'barangay_health_center_id' => $this->bhcB->id,
                'rural_health_unit_id' => $this->rhuB->id,
                'reason_for_referral' => 'Attempted cross-facility referral.',
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_changing_mapping_does_not_rewrite_existing_referral_destination(): void
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload())
            ->assertCreated();

        $referral = Referral::findOrFail($response->json('data.id'));
        $this->bhcA->update(['rural_health_unit_id' => $this->rhuB->id]);

        $this->assertSame($this->rhuA->id, $referral->fresh()->rural_health_unit_id);
    }

    private function createUser(
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

    private function createPatient(
        string $firstName,
        string $lastName,
        BarangayHealthCenter $bhc
    ): Patient {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
        ]);
    }

    private function referralPayload(): array
    {
        return [
            'patient_id' => $this->patientA->id,
            'health_record_id' => $this->recordA->id,
            'reason_for_referral' => 'Further RHU assessment is needed.',
        ];
    }
}
