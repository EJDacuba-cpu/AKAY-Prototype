<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class FormDraftScopeTest extends TestCase
{
    use RefreshDatabase;

    private function actor(string $role = 'bhc'): User
    {
        $rhu = RuralHealthUnit::create(['name' => 'Scoped RHU '.Str::uuid(), 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Scoped BHC '.Str::uuid(), 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);

        return User::create([
            'name' => 'Scoped user', 'email' => Str::uuid().'@example.test', 'password' => 'test-password',
            'role' => $role, 'status' => 'active', 'rural_health_unit_id' => $role === 'rhu' ? $rhu->id : null,
            'barangay_health_center_id' => $role === 'bhc' ? $bhc->id : null,
            'permissions' => ['patients.register', 'clinical.history', 'consultations.encode'],
        ]);
    }

    private function input(string $form = 'patient'): array
    {
        return ['form_type' => $form, 'mode' => 'create', 'context_key' => 'new',
            'transaction_uuid' => (string) Str::uuid(), 'schema_version' => 1,
            'payload' => $form === 'patient' ? ['first_name' => 'Partial'] : ['name' => 'Legacy clinic']];
    }

    public function test_active_registry_only_enrolls_new_patient_registration(): void
    {
        $this->assertSame(['patient'], array_keys(config('form_drafts.forms')));
        $this->assertSame(['create' => ['new', 'household']], config('form_drafts.forms.patient.contexts'));
        $this->assertSame(['bhc', 'rhu'], config('form_drafts.forms.patient.roles'));
    }

    public function test_new_registration_recovery_is_available_for_both_clinical_roles_but_not_patient_edits(): void
    {
        foreach (['bhc', 'rhu'] as $role) {
            $user = $this->actor($role);
            $this->actingAs($user, 'sanctum')->postJson('/api/form-drafts', $this->input())->assertCreated();
            $patient = Patient::create(['first_name' => 'Existing', 'last_name' => 'Patient', 'sex' => 'Female',
                'barangay_health_center_id' => $user->barangay_health_center_id, 'rural_health_unit_id' => $user->rural_health_unit_id]);
            $this->postJson('/api/form-drafts', [...$this->input(), 'mode' => 'edit', 'context_key' => 'patient:'.$patient->id])->assertUnprocessable();
        }
    }

    public function test_excluded_forms_cannot_create_new_drafts_or_new_device_keys(): void
    {
        $this->actingAs($this->actor('admin'), 'sanctum');
        foreach (['facility-rhu', 'facility-bhc', 'account', 'medicine', 'provider', 'household', 'visit-start'] as $form) {
            $input = $this->input($form);
            $this->postJson('/api/form-drafts', $input)->assertUnprocessable();
            $this->postJson('/api/form-drafts/device-key', $input)->assertUnprocessable();
        }
        $this->assertDatabaseCount('form_drafts', 0);
        $this->assertDatabaseCount('form_draft_recovery_keys', 0);
    }

    public function test_existing_excluded_drafts_and_keys_remain_authorized_readable_and_discardable(): void
    {
        $user = $this->actor('admin');
        $this->actingAs($user, 'sanctum');
        // Simulate a row created before enrollment narrowed, using the real old schema.
        $active = config('form_drafts.forms');
        $legacy = config('form_drafts.legacy_forms.facility-rhu', $active['facility-rhu'] ?? null);
        config(['form_drafts.forms.facility-rhu' => $legacy]);
        $input = $this->input('facility-rhu');
        $draft = $this->postJson('/api/form-drafts', $input)->assertCreated()->json('data');
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        config(['form_drafts.forms' => $active]);

        $this->getJson('/api/form-drafts/'.$draft['id'])->assertOk()->assertJsonPath('data.payload.name', 'Legacy clinic');
        $this->getJson('/api/form-drafts/lookup?'.http_build_query($input))->assertOk()->assertJsonPath('data.id', $draft['id']);
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 1])->assertUnprocessable();
        $this->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertOk()->assertJsonPath('data.key_id', $key['key_id']);
        $this->postJson('/api/form-drafts/device-key', $this->input('facility-rhu'))->assertUnprocessable();
        $this->deleteJson('/api/form-drafts/'.$draft['id'], ['version' => 2])->assertConflict();
        $this->deleteJson('/api/form-drafts/'.$draft['id'], ['version' => 1])->assertNoContent();
        $this->assertSame('discarded', DB::table('form_drafts')->where('public_id', $draft['id'])->value('status'));
    }
}
