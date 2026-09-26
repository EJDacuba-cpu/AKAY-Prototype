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
            'clinical BHC staff' => ['bhw', 'Midwife', ['patients.register', 'clinical.history'], true],
            'registration only' => ['bhw', 'Encoder', ['patients.register'], false],
            'encoder granted history' => ['bhw', 'Encoder', ['patients.register', 'clinical.history'], true],
            'midwife without history' => ['bhw', 'Midwife', ['patients.register'], false],
            'RHU staff' => ['rhu_staff', 'Nurse', ['patients.register', 'clinical.history'], true],
            'RHU registration only' => ['rhu_staff', 'Nurse', ['patients.register'], false],
        ];
    }

    #[DataProvider('accounts')]
    public function test_creation_respects_assigned_permissions_and_protects_linked_mother(
        string $role, ?string $designation, ?array $permissions, bool $canAccessHistory
    ): void {
        $bhc = BarangayHealthCenter::create(['name' => 'Registration BHC']);
        $rhu = RuralHealthUnit::create(['name' => 'Registration RHU']);
        $facility = $role === 'rhu_staff'
            ? ['rural_health_unit_id' => $rhu->id]
            : ['barangay_health_center_id' => $bhc->id];
        $user = User::create([
            'name' => 'Registration Staff', 'email' => 'registration@example.test',
            'password' => 'password123', 'status' => 'active', 'role' => $role,
            'professional_designation' => $designation, 'permissions' => $permissions,
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
            if ($canAccessHistory) {
                $response->assertJsonPath('data.medical_background.allergies', 'Child history')
                    ->assertJsonPath('data.mother.medical_background.allergies', 'Private mother history');
                $this->assertSame('Child history', $patient->medical_background['allergies']);
            } else {
                $response->assertJsonMissingPath('data.medical_background')
                    ->assertJsonMissingPath('data.mother.medical_background')
                    ->assertJsonMissingPath('data.mother.health_records');
                $this->assertEmpty($patient->medical_background);
            }
        }
    }

    public function test_history_permission_alone_does_not_allow_patient_registration(): void
    {
        $bhc = BarangayHealthCenter::create(['name' => 'BHC']);
        $user = User::create([
            'name' => 'History only', 'email' => 'history@example.test', 'password' => 'password123',
            'status' => 'active', 'role' => 'bhw', 'barangay_health_center_id' => $bhc->id,
            'permissions' => ['clinical.history'],
        ]);
        Sanctum::actingAs($user, ['akay:access']);
        $this->postJson('/api/patients', [
            'first_name' => 'Blocked', 'last_name' => 'Patient', 'sex' => 'Female',
        ])->assertForbidden();
        $this->assertDatabaseCount('patients', 0);
    }
}
