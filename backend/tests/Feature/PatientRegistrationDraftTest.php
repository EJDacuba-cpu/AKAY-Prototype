<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PatientRegistrationDraftTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $role): User
    {
        $rhu = RuralHealthUnit::create(['name' => 'Recovery RHU '.Str::uuid(), 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Recovery BHC '.Str::uuid(), 'barangay' => 'Bagumbayan', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);

        return User::create(['name' => 'Registrar', 'email' => Str::uuid().'@test.test', 'password' => 'password',
            'role' => $role, 'status' => 'active', 'staff_role' => 'nurse',
            'barangay_health_center_id' => $role === 'bhc' ? $bhc->id : null, 'rural_health_unit_id' => $role === 'rhu' ? $rhu->id : null,
            'permissions' => ['patients.register', 'families.view', 'families.manage', 'clinical.history']]);
    }

    private function draft(): array
    {
        return $this->postJson('/api/form-drafts', ['form_type' => 'patient', 'mode' => 'create', 'context_key' => 'new',
            'transaction_uuid' => (string) Str::uuid(), 'schema_version' => 1,
            'payload' => ['registration' => ['form' => ['firstName' => 'Partial', 'birthDate' => '2026-'], 'householdVersion' => null]],
        ])->assertCreated()->json('data');
    }

    private function headers(array $draft): array
    {
        return ['X-Form-Draft-Id' => $draft['id'], 'X-Form-Draft-Version' => (string) $draft['version'], 'X-Form-Draft-Transaction' => $draft['transaction_uuid']];
    }

    private function body(): array
    {
        return ['first_name' => 'Registered', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '1995-01-01',
            'household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => ['streetAddress' => 'Main street', 'purokArea' => 'Zone 1', 'barangay' => 'Bagumbayan', 'municipality' => 'Bulakan']]];
    }

    public function test_both_roles_commit_registration_once_and_consume_the_parent_draft(): void
    {
        foreach (['bhc', 'rhu'] as $index => $role) {
            $this->actingAs($this->actor($role), 'sanctum');
            $draft = $this->draft();
            $headers = $this->headers($draft);
            $body = $this->body();
            $id = $this->postJson('/api/patients', $body, $headers)->assertCreated()->json('data.id');
            $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'consumed']);
            $this->postJson('/api/patients', $body, $headers)->assertCreated()->assertJsonPath('data.id', $id);
            $this->assertDatabaseCount('patients', $index + 1);
            $this->postJson('/api/patients', [...$body, 'first_name' => 'Different'], $headers)->assertConflict();
            $this->assertDatabaseCount('rhu_visit_queue_entries', 0);
        }
    }

    public function test_failed_domain_validation_and_revoked_permissions_preserve_registration_input(): void
    {
        $user = $this->actor('bhc');
        $this->actingAs($user, 'sanctum');
        $draft = $this->draft();
        $headers = $this->headers($draft);
        $this->postJson('/api/patients', ['first_name' => 'Incomplete'], $headers)->assertUnprocessable();
        $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'active']);
        $this->assertDatabaseCount('patients', 0);
        $user->update(['permissions' => []]);
        $this->actingAs($user->fresh(), 'sanctum')->postJson('/api/patients', $this->body(), $headers)->assertForbidden();
        $this->assertDatabaseCount('patients', 0);
    }

    public function test_duplicate_confirmation_is_rechecked_and_never_restored_as_preapproved(): void
    {
        $this->actingAs($this->actor('rhu'), 'sanctum')->postJson('/api/patients', $this->body())->assertCreated();
        $draft = $this->draft();
        $headers = $this->headers($draft);
        $this->postJson('/api/patients', $this->body(), $headers)->assertConflict()->assertJsonPath('code', 'POSSIBLE_DUPLICATE_PATIENT');
        $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'active']);
        $this->postJson('/api/patients', [...$this->body(), 'confirm_possible_duplicate' => true], $headers)->assertCreated();
        $this->assertSame(2, Patient::count());
        $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'consumed']);
    }

    public function test_rhu_registration_draft_accepts_auto_fsn_existing_household_and_walk_in_shapes(): void
    {
        $this->actingAs($this->actor('rhu'), 'sanctum');
        $form = [
            'firstName' => 'Ana', 'lastName' => 'Cruz', 'birthDate' => '1990-01-01', 'sex' => 'Female',
            'barangay' => 'Bagumbayan', 'municipality' => 'Bulakan', 'streetAddress' => 'Main', 'purokArea' => 'Zone 1',
        ];
        $auto = $this->postJson('/api/form-drafts', [
            'form_type' => 'patient', 'mode' => 'create', 'context_key' => 'new',
            'transaction_uuid' => (string) Str::uuid(), 'schema_version' => 1,
            'payload' => ['registration' => [
                'form' => $form,
                'connection' => [
                    'kind' => 'new', 'headPatientId' => 'self',
                    'household' => [
                        'serialMode' => 'auto', 'serialNumber' => '',
                        'address' => ['streetAddress' => 'Main', 'purokArea' => 'Zone 1', 'barangay' => 'Bagumbayan', 'municipality' => 'Bulakan'],
                    ],
                ],
                'householdVersion' => null,
                'walkIn' => ['key' => 'walk-in-key'],
            ]],
        ])->assertCreated()->json('data');

        $this->putJson('/api/form-drafts/'.$auto['id'], [
            'form_type' => 'patient',
            'mode' => 'create',
            'context_key' => 'new',
            'transaction_uuid' => $auto['transaction_uuid'],
            'schema_version' => 1,
            'version' => $auto['version'],
            'payload' => ['registration' => [
                'form' => $form,
                'connection' => ['kind' => 'existing', 'householdId' => '4', 'relationship' => 'Spouse'],
                'householdVersion' => 2,
            ]],
        ])->assertOk();
    }
}
