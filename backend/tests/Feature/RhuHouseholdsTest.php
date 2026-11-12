<?php

namespace Tests\Feature;

use App\Models\Household;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * RHU household/FSN management is removed. Legacy rows may still exist in the DB,
 * but RHU APIs and registration must not create or manage households.
 */
class RhuHouseholdsTest extends TestCase
{
    use RefreshDatabase;

    private function staff(array $permissions = ['patients.register', 'families.view', 'families.manage']): User
    {
        $facility = RuralHealthUnit::create(['name' => 'Test RHU '.uniqid(), 'status' => 'active']);
        $user = User::create([
            'name' => 'RHU Registrar',
            'email' => uniqid().'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $facility->id,
            'permissions' => $permissions,
        ]);
        Sanctum::actingAs($user, ['akay:access']);

        return $user;
    }

    public function test_rhu_household_endpoints_are_not_registered(): void
    {
        $this->staff();
        foreach ([
            '/api/rhu/households',
            '/api/rhu/households/lookup',
            '/api/rhu/households/candidates',
            '/api/rhu/households/1',
        ] as $uri) {
            $this->getJson($uri)->assertNotFound();
        }
        $this->postJson('/api/rhu/households', [])->assertNotFound();
        $this->patchJson('/api/rhu/households/1', [])->assertNotFound();
    }

    public function test_rhu_patient_registration_rejects_household_payload(): void
    {
        $this->staff(['patients.register']);
        $this->postJson('/api/patients', [
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'sex' => 'Female',
            'birthdate' => '1990-01-01',
            'household' => [
                'kind' => 'new',
                'serial_mode' => 'auto',
                'address' => [
                    'streetAddress' => 'Main street',
                    'purokArea' => 'Zone 1',
                    'barangay' => 'Local',
                    'municipality' => 'Bulakan',
                ],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('household');

        $this->assertSame(0, Patient::count());
        $this->assertSame(0, Household::count());
    }

    public function test_rhu_patient_registration_rejects_family_serial_number(): void
    {
        $this->staff(['patients.register']);
        $this->postJson('/api/patients', [
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'sex' => 'Female',
            'birthdate' => '1990-01-01',
            'family_serial_number' => 'FSN-2026-0001',
        ])->assertUnprocessable()->assertJsonValidationErrors('family_serial_number');

        $this->assertSame(0, Patient::count());
    }

    public function test_rhu_patient_registers_without_household_or_fsn(): void
    {
        $user = $this->staff(['patients.register']);
        $this->postJson('/api/patients', [
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'sex' => 'Female',
            'birthdate' => '1990-01-01',
        ])->assertCreated()
            ->assertJsonPath('data.rural_health_unit_id', $user->rural_health_unit_id)
            ->assertJsonPath('data.barangay_health_center_id', null)
            ->assertJsonPath('data.household_id', null)
            ->assertJsonPath('data.family_serial_number', null);

        $this->assertSame(1, Patient::count());
        $this->assertSame(0, Household::count());
    }

    public function test_legacy_rhu_household_rows_are_not_deleted_by_registration(): void
    {
        $user = $this->staff(['patients.register']);
        $legacy = Household::create([
            'rural_health_unit_id' => $user->rural_health_unit_id,
            'serial_number' => 'FSN-LEGACY-0001',
            'address' => [],
            'version' => 1,
        ]);
        $member = Patient::create([
            'first_name' => 'Legacy',
            'last_name' => 'Member',
            'sex' => 'Female',
            'birthdate' => '1988-02-02',
            'status' => 'active',
            'rural_health_unit_id' => $user->rural_health_unit_id,
            'household_id' => $legacy->id,
            'family_serial_number' => $legacy->serial_number,
            'relationship_to_household_head' => 'Household head',
        ]);
        $legacy->update(['head_patient_id' => $member->id]);

        $this->postJson('/api/patients', [
            'first_name' => 'New',
            'last_name' => 'WalkIn',
            'sex' => 'Male',
            'birthdate' => '1995-03-03',
        ])->assertCreated()->assertJsonPath('data.household_id', null);

        $this->assertDatabaseHas('households', ['id' => $legacy->id, 'serial_number' => 'FSN-LEGACY-0001']);
        $this->assertSame($legacy->id, $member->fresh()->household_id);
        $this->assertSame(2, Patient::count());
        $this->assertSame(1, Household::count());
    }
}
