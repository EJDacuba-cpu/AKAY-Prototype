<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PatientCreationPermissionsTest extends TestCase
{
    use RefreshDatabase;

    public static function accounts(): array
    {
        return [
            'admin' => ['admin', null, null, true],
            'clinical BHC staff' => ['bhc', 'midwife', ['patients.register', 'clinical.history'], true],
            'registration only' => ['bhc', 'encoder', ['patients.register'], false],
            'encoder granted history' => ['bhc', 'encoder', ['patients.register', 'clinical.history'], true],
            'midwife without history' => ['bhc', 'midwife', ['patients.register'], false],
            'RHU staff' => ['rhu', 'nurse', ['patients.register', 'clinical.history'], true],
            'RHU registration only' => ['rhu', 'nurse', ['patients.register'], false],
        ];
    }

    #[DataProvider('accounts')]
    public function test_creation_respects_assigned_permissions_and_protects_linked_mother(
        string $role, ?string $staffRole, ?array $permissions, bool $canAccessHistory
    ): void {
        $bhc = BarangayHealthCenter::create(['name' => 'Registration BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Registration RHU']);
        $facility = $role === 'rhu'
            ? ['rural_health_unit_id' => $rhu->id]
            : ['barangay_health_center_id' => $bhc->id];
        $user = User::create([
            'name' => 'Registration Staff', 'email' => 'registration@example.test',
            'password' => 'password123', 'status' => 'active', 'role' => $role,
            'staff_role' => $staffRole, 'permissions' => $permissions,
            ...$facility,
        ]);
        $mother = Patient::create([
            'first_name' => 'Mother', 'last_name' => 'Patient', 'sex' => 'Female',
            'medical_background' => ['allergies' => 'Private mother history'], ...$facility,
        ]);
        Sanctum::actingAs($user, ['akay:access']);

        // Both accepted input spellings must obey the same permission check.
        foreach (['medical_background', 'medicalBackground'] as $field) {
            $response = $this->postJson('/api/patients', [
                'first_name' => 'Child', 'last_name' => 'Patient', 'sex' => 'Female',
                'registration_type' => 'child', 'mother_patient_id' => $mother->id,
                'family_serial_number' => 'FAMILY-001',
                $field => ['allergies' => 'Child history'], ...$facility,
            ])->assertCreated()
                ->assertJsonPath('data.mother_patient_id', $mother->id)
                ->assertJsonPath('data.family_serial_number', 'FAMILY-001')
                ->assertJsonPath('data.mother.first_name', 'Mother');

            $patient = Patient::findOrFail($response->json('data.id'));
            $this->assertSame($user->id, $patient->created_by);
            // Registration never writes a background, whoever registers: it
            // is only changed by a finalized consultation.
            $this->assertEmpty($patient->medical_background);
            if ($canAccessHistory) {
                $response->assertJsonPath('data.mother.medical_background.allergies', 'Private mother history');
            } else {
                $response->assertJsonMissingPath('data.medical_background')
                    ->assertJsonMissingPath('data.mother.medical_background')
                    ->assertJsonMissingPath('data.mother.health_records');
            }
        }
    }

    public function test_history_permission_alone_does_not_allow_patient_registration(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'BHC']);
        $user = User::create([
            'name' => 'History only', 'email' => 'history@example.test', 'password' => 'password123',
            'status' => 'active', 'role' => 'bhc', 'barangay_health_center_id' => $bhc->id,
            'permissions' => ['clinical.history'],
        ]);
        Sanctum::actingAs($user, ['akay:access']);
        $this->postJson('/api/patients', [
            'first_name' => 'Blocked', 'last_name' => 'Patient', 'sex' => 'Female',
        ])->assertForbidden();
        $this->assertDatabaseCount('patients', 0);
    }

    public function test_bhc_history_only_can_read_own_patient_profile_but_cannot_write_or_read_another_facility(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'History BHC']);
        $other = BarangayHealthCenter::create(['name' => 'Other BHC']);
        $user = User::create([
            'name' => 'History Reader', 'email' => 'reader@example.test', 'password' => 'password123',
            'status' => 'active', 'role' => 'bhc', 'barangay_health_center_id' => $bhc->id,
            'permissions' => ['clinical.history'],
        ]);
        $patient = Patient::create(['first_name' => 'Local', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $foreign = Patient::create(['first_name' => 'Foreign', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $other->id]);
        Sanctum::actingAs($user, ['akay:access']);

        $this->getJson('/api/patients')->assertOk();
        $this->getJson('/api/patients/'.$patient->id)->assertOk()->assertJsonPath('data.id', $patient->id);
        $this->getJson('/api/patients/'.$foreign->id)->assertForbidden();
        $this->patchJson('/api/patients/'.$patient->id, ['first_name' => 'Changed'])->assertForbidden();
        $this->deleteJson('/api/patients/'.$patient->id)->assertForbidden();
        $this->assertSame('Local', $patient->fresh()->first_name);
    }
}
