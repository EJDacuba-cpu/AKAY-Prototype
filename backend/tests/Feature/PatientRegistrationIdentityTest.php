<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PatientRegistrationIdentityTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $role): User
    {
        $rhu = RuralHealthUnit::create(['name' => 'Identity RHU '.Str::uuid(), 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Identity BHC '.Str::uuid(), 'barangay' => 'Bagumbayan', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        return User::create(['name' => 'Registrar', 'email' => Str::uuid().'@test.test', 'password' => 'password',
            'role' => $role, 'status' => 'active', 'staff_role' => 'nurse',
            'barangay_health_center_id' => $role === 'bhc' ? $bhc->id : null, 'rural_health_unit_id' => $role === 'rhu' ? $rhu->id : null,
            'permissions' => ['patients.register', 'patients.view', 'clinical.history']]);
    }

    private function body(array $extra = []): array
    {
        return ['first_name' => 'Juan', 'middle_name' => 'Reyes', 'last_name' => 'Dela Cruz', 'sex' => 'Male', 'birthdate' => '1995-01-01', ...$extra];
    }

    public function test_both_facilities_save_edit_and_search_suffix_without_shortening_middle_name(): void
    {
        foreach (['bhc', 'rhu'] as $role) {
            $this->actingAs($this->actor($role), 'sanctum');
            $id = $this->postJson('/api/patients', $this->body(['suffix' => 'Jr.', 'contact_number' => '+639123456789', 'guardian_contact_number' => '639987654321']))->assertCreated()
                ->assertJsonPath('data.middle_name', 'Reyes')->assertJsonPath('data.suffix', 'Jr.')
                ->assertJsonPath('data.contact_number', '09123456789')->assertJsonPath('data.guardian_contact_number', '09987654321')->json('data.id');
            $this->getJson("/api/patients/$id")->assertOk()->assertJsonPath('data.full_name', 'Juan Reyes Dela Cruz Jr.');
            foreach (['Juan Reyes Dela Cruz Jr.', 'Juan R. Dela Cruz Jr.'] as $search) {
                $response = $this->getJson('/api/patients?'.http_build_query(['search' => $search]))->assertOk();
                $this->assertStringContainsString('Reyes', $response->getContent());
            }
            foreach (['Sr.', 'II', 'III', 'IV', 'V', 'VI', null] as $suffix) {
                $this->patchJson("/api/patients/$id", ['suffix' => $suffix])->assertOk()->assertJsonPath('data.suffix', $suffix);
                $this->assertSame('Reyes', Patient::findOrFail($id)->middle_name);
            }
            $this->patchJson("/api/patients/$id", ['contact_number' => '12345678901', 'guardian_contact_number' => null])->assertOk()->assertJsonPath('data.contact_number', '12345678901');
            $this->assertDatabaseHas('audit_logs', ['module' => 'patients', 'action' => 'updated']);
        }
    }

    public function test_invalid_final_contacts_are_rejected_without_creating_or_changing_patients(): void
    {
        foreach (['bhc', 'rhu'] as $role) {
            $this->actingAs($this->actor($role), 'sanctum');
            $id = $this->postJson('/api/patients', $this->body())->assertCreated()->json('data.id');
            $before = Patient::count();
            foreach (['contact_number', 'guardian_contact_number'] as $field) {
                foreach (['09123', '0912345678', '091234567890', '09a23456789', '0912 345678', '+12025550123'] as $invalid) {
                    $body = $this->body([$field => $invalid]);
                    $this->postJson('/api/patients', $body)->assertUnprocessable()->assertJsonValidationErrors($field);
                    $this->patchJson("/api/patients/$id", [$field => $invalid])->assertUnprocessable()->assertJsonValidationErrors($field);
                    $this->assertNull(Patient::findOrFail($id)->{$field});
                    $this->assertSame($before, Patient::count());
                }
            }
            Patient::whereKey($id)->update(['contact_number' => 'legacy extension 42']);
            $this->getJson("/api/patients/$id")->assertOk()->assertJsonPath('data.contact_number', 'legacy extension 42');
            $this->patchJson("/api/patients/$id", ['contact_number' => 'legacy extension 42'])->assertUnprocessable();
            $this->assertSame('legacy extension 42', Patient::findOrFail($id)->contact_number);
        }
    }

    public function test_partial_drafts_resume_with_custom_suffix_and_commit_exactly_once_in_both_facilities(): void
    {
        foreach (['bhc', 'rhu'] as $role) {
            $this->actingAs($this->actor($role), 'sanctum');
            $form = ['firstName' => 'Juan', 'middleName' => 'Reyes', 'lastName' => '', 'suffix' => '__other__', 'customSuffix' => '', 'contactNumber' => '09123', 'guardianContactNumber' => '09123456'];
            $draft = $this->postJson('/api/form-drafts', ['form_type' => 'patient', 'mode' => 'create', 'context_key' => 'new',
                'transaction_uuid' => (string) Str::uuid(), 'schema_version' => 1, 'payload' => ['registration' => ['form' => $form]]])->assertCreated()->json('data');
            $this->getJson('/api/form-drafts/'.$draft['id'])->assertOk()->assertJsonPath('data.payload.registration.form', array_map(fn ($value) => $value === '' ? null : $value, $form));
            $form['customSuffix'] = 'VI';
            $draft = $this->putJson('/api/form-drafts/'.$draft['id'], ['form_type' => 'patient', 'mode' => 'create', 'context_key' => 'new', 'transaction_uuid' => $draft['transaction_uuid'], 'schema_version' => 1, 'version' => $draft['version'], 'payload' => ['registration' => ['form' => $form]]])->assertOk()->json('data');
            $this->getJson('/api/form-drafts/'.$draft['id'])->assertOk()->assertJsonPath('data.payload.registration.form.customSuffix', 'VI')->assertJsonPath('data.payload.registration.form.contactNumber', '09123');
            $headers = ['X-Form-Draft-Id' => $draft['id'], 'X-Form-Draft-Version' => (string) $draft['version'], 'X-Form-Draft-Transaction' => $draft['transaction_uuid']];
            $this->postJson('/api/patients', $this->body(['contact_number' => '09123']), $headers)->assertUnprocessable();
            $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'active']);
            $body = $this->body(['suffix' => 'VI', 'contact_number' => '09123456789', 'guardian_contact_number' => '09987654321']);
            $before = Patient::count();
            $id = $this->postJson('/api/patients', $body, $headers)->assertCreated()->assertJsonPath('data.middle_name', 'Reyes')->assertJsonPath('data.suffix', 'VI')->json('data.id');
            $this->postJson('/api/patients', $body, $headers)->assertCreated()->assertJsonPath('data.id', $id);
            $this->assertSame($before + 1, Patient::count());
            $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'consumed']);
        }
    }
}
