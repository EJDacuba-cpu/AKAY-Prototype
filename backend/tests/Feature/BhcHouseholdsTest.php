<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\Households;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BhcHouseholdsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function staff(?BarangayHealthCenter $facility = null, array $permissions = ['patients.register', 'families.view', 'families.manage']): User
    {
        $facility ??= BarangayHealthCenter::create(['name' => 'Test BHC '.uniqid()]);
        $user = User::create(['name' => 'Registrar', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $facility->id, 'permissions' => $permissions]);
        Sanctum::actingAs($user, ['akay:access']);

        return $user;
    }

    private function register(array $household = [], array $patient = [])
    {
        $household = $household ?: ['kind' => 'new', 'serial_mode' => 'auto'];
        if (($household['kind'] ?? '') === 'new' && ! array_key_exists('address', $household)) {
            $household['address'] = $this->address();
        }

        return $this->postJson('/api/patients', [...['first_name' => 'Adult', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '1990-01-01'], ...$patient, 'household' => $household]);
    }

    private function address(): array
    {
        return ['streetAddress' => 'Main street', 'purokArea' => 'Zone 1', 'barangay' => 'Local', 'municipality' => 'Bulakan'];
    }

    public function test_automatic_allocation_is_persisted_scoped_and_annual(): void
    {
        Carbon::setTestNow('2026-12-31 16:01:00 UTC');
        $this->staff();
        $first = $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2027-0001');
        $id = $first->json('data.household_id');
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2027-0002');
        $this->getJson('/api/bhc/households/'.$id)->assertOk()->assertJsonPath('data.members.0.household_id', $id);
        $this->staff();
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2027-0001');
        $this->getJson('/api/bhc/households/'.$id)->assertNotFound();
        Carbon::setTestNow();
    }

    public function test_manual_override_normalizes_advances_counter_and_rejects_legacy_collision(): void
    {
        Carbon::setTestNow('2026-10-16');
        $user = $this->staff();
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => ' fsn-2026-0050 '])->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2026-0050');
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2026-0051');
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => 'FSN-2026-0050'])->assertUnprocessable()->assertJsonValidationErrors('household.serial_number');
        Patient::create(['first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $user->barangay_health_center_id, 'family_serial_number' => ' old-001 ']);
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => 'OLD-001'])->assertUnprocessable();
        Carbon::setTestNow();
    }

    public function test_join_correction_and_stale_versions_preserve_membership_and_privacy(): void
    {
        $this->staff();
        $first = $this->register()->assertCreated();
        $id = $first->json('data.household_id');
        $second = $this->register(['kind' => 'existing', 'household_id' => $id, 'relationship' => 'Child'], ['birthdate' => '2010-01-01'])->assertCreated();
        $household = $this->getJson('/api/bhc/households/'.$id)->assertOk()->json('data');
        $this->patchJson('/api/bhc/households/'.$id, ['version' => $household['version'], 'serial_number' => ' corrected '])->assertOk()->assertJsonPath('data.serial_number', 'CORRECTED')->assertJsonCount(2, 'data.members')->assertJsonMissingPath('data.members.0.medical_background');
        $this->assertSame('CORRECTED', Patient::find($second->json('data.id'))->family_serial_number);
        $this->patchJson('/api/bhc/households/'.$id, ['version' => $household['version'], 'serial_number' => 'STALE'])->assertConflict();
        $this->getJson('/api/patients/'.$second->json('data.id'))->assertOk()->assertJsonPath('data.household.serial_number', 'CORRECTED')->assertJsonMissingPath('data.medical_background');
    }

    public function test_foreign_join_and_minor_head_roll_back_patient_and_counter(): void
    {
        $this->staff();
        $id = $this->register()->assertCreated()->json('data.household_id');
        $this->staff();
        $this->register(['kind' => 'existing', 'household_id' => $id, 'relationship' => 'Child'])->assertNotFound();
        $this->register([], ['birthdate' => '2020-01-01'])->assertUnprocessable();
        $this->assertDatabaseCount('patients', 1);
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-'.now('Asia/Manila')->year.'-0001');
    }

    public function test_registration_lookup_is_allowed_but_directory_is_not_granted(): void
    {
        $this->staff(null, ['patients.register']);
        $this->register()->assertCreated();
        $this->getJson('/api/bhc/households/lookup')->assertOk();
        $this->getJson('/api/bhc/households')->assertForbidden();
        $this->postJson('/api/bhc/households', [])->assertForbidden();
    }

    public function test_family_editor_candidates_are_local_identity_only_and_support_creation(): void
    {
        $local = BarangayHealthCenter::create(['name' => 'Candidates local']);
        $foreign = BarangayHealthCenter::create(['name' => 'Candidates foreign']);
        $head = Patient::create(['first_name' => 'Candidate', 'last_name' => 'Head', 'sex' => 'Female', 'birthdate' => '1980-01-01', 'barangay_health_center_id' => $local->id, 'medical_background' => ['private' => true]]);
        Patient::create(['first_name' => 'Foreign', 'last_name' => 'Person', 'sex' => 'Male', 'barangay_health_center_id' => $foreign->id]);
        $this->staff($local, ['families.view', 'families.manage']);
        $head->update(['philhealth_number' => 'PRIVATE-INSURANCE', 'guardian_contact_number' => 'PRIVATE-CONTACT']);
        $this->getJson('/api/bhc/households/candidates')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $head->id)->assertJsonMissingPath('data.0.medical_background')->assertJsonMissingPath('data.0.philhealth_number')->assertJsonMissingPath('data.0.guardian_contact_number');
        $this->postJson('/api/bhc/households', ['head_patient_id' => $head->id, 'serial_mode' => 'auto', 'address' => $this->address()])->assertCreated()->assertJsonPath('data.head_patient_id', $head->id);
    }

    public function test_head_departure_requires_review_and_empty_household_is_archived(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $member = $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Spouse'])->assertCreated()->json('data');
        $this->patchJson('/api/patients/'.$head['id'], ['household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()]])->assertUnprocessable()->assertJsonValidationErrors('head_replacement');
        $source = $this->getJson('/api/bhc/households/'.$head['household_id'])->json('data');
        $this->patchJson('/api/patients/'.$head['id'], ['household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()], 'head_replacement' => ['household_id' => $source['id'], 'head_patient_id' => $member['id'], 'relationships' => [], 'version' => $source['version']]])->assertOk();
        $this->getJson('/api/bhc/households/'.$source['id'])->assertJsonPath('data.head_patient_id', $member['id'])->assertJsonPath('data.members.0.relationship_to_household_head', 'Household head');
        $this->patchJson('/api/patients/'.$member['id'], ['household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()]])->assertOk();
        $this->assertNotNull(Household::find($source['id'])->archived_at);
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => $source['serial_number']])->assertUnprocessable();
    }

    public function test_auto_skips_legacy_values_and_handles_more_than_four_digits(): void
    {
        Carbon::setTestNow('2026-10-16');
        $user = $this->staff();
        Patient::create(['first_name' => 'Old', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $user->barangay_health_center_id, 'family_serial_number' => ' fsn-2026-0001 ']);
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2026-0002');
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => 'FSN-2026-9999'])->assertCreated();
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2026-10000');
    }

    public function test_rhu_cannot_submit_bhc_household_payload_and_client_facility_does_not_choose_namespace(): void
    {
        $user = $this->staff();
        $foreign = BarangayHealthCenter::create(['name' => 'Spoofed BHC']);
        $this->register([], ['barangay_health_center_id' => $foreign->id])->assertCreated()->assertJsonPath('data.barangay_health_center_id', $user->barangay_health_center_id);
        $rhu = RuralHealthUnit::create(['name' => 'RHU']);
        $rhuUser = User::create(['name' => 'RHU registrar', 'email' => 'rhu@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'permissions' => ['patients.register']]);
        Sanctum::actingAs($rhuUser, ['akay:access']);
        $this->register()->assertForbidden();
        $this->getJson('/api/bhc/households/lookup')->assertForbidden();
        $this->assertDatabaseCount('patients', 1);
    }

    public function test_fsn_only_edit_preserves_relationships_and_address_changes_sync_all_members(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $member = $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Spouse'])->assertCreated()->json('data');
        $household = $this->getJson('/api/bhc/households/'.$head['household_id'])->json('data');
        $this->patchJson('/api/bhc/households/'.$household['id'], ['version' => $household['version'], 'serial_number' => 'EDITED', 'head_patient_id' => $head['id'], 'relationships' => [], 'address' => [...$this->address(), 'streetAddress' => 'River Road']])->assertOk()->assertJsonPath('data.members.1.relationship_to_household_head', 'Spouse');
        $this->assertSame('River Road', Patient::find($member['id'])->street_address);
        $this->getJson('/api/bhc/households?search=river')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/bhc/households/candidates')->assertOk()->assertJsonPath('data.0.household.members_count', 2);
    }

    public function test_household_requires_complete_nonblank_address(): void
    {
        $this->staff();
        $this->register(['kind' => 'new', 'serial_mode' => 'auto', 'address' => []])->assertUnprocessable()->assertJsonValidationErrors('household.address.streetAddress');
        $this->assertDatabaseCount('patients', 0);
    }

    public function test_identity_dates_are_calendar_dates_in_manila(): void
    {
        config(['app.timezone' => 'Asia/Manila']);
        date_default_timezone_set('Asia/Manila');
        $this->staff();
        $patient = $this->register([], ['birthdate' => '1990-01-02'])->assertCreated()->json('data');
        $this->getJson('/api/bhc/households/'.$patient['household_id'])->assertOk()->assertJsonPath('data.members.0.birthdate', '1990-01-02');
        $this->getJson('/api/bhc/households/candidates')->assertOk()->assertJsonPath('data.0.birthdate', '1990-01-02');
    }

    public function test_late_audit_failure_rolls_back_patient_household_and_counter(): void
    {
        $this->staff();
        $this->mock(AuditLogger::class)->shouldReceive('log')->once()->andThrow(new \RuntimeException('Audit unavailable'));
        $this->register()->assertInternalServerError();
        $this->assertDatabaseCount('patients', 0);
        $this->assertDatabaseCount('households', 0);
        $this->assertDatabaseCount('household_fsn_counters', 0);
        app()->forgetInstance(AuditLogger::class);
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-'.now('Asia/Manila')->year.'-0001');
    }

    public function test_stale_patient_instance_is_refreshed_under_household_lock(): void
    {
        $user = $this->staff();
        $patient = Patient::create(['first_name' => 'Existing', 'last_name' => 'Adult', 'sex' => 'Female', 'birthdate' => '1980-01-01', 'barangay_health_center_id' => $user->barangay_health_center_id]);
        $stale = Patient::find($patient->id);
        $first = $this->postJson('/api/bhc/households', ['head_patient_id' => $patient->id, 'serial_mode' => 'auto', 'address' => $this->address()])->assertCreated()->json('data');
        $request = Request::create('/api/bhc/households', 'POST');
        $request->setUserResolver(fn () => $user);
        DB::transaction(fn () => app(Households::class)->attach($request, $stale, ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()]));
        $this->assertNotNull(Household::find($first['id'])->archived_at);
        $this->assertNull(Household::find($first['id'])->head_patient_id);
    }

    public function test_legacy_api_cannot_create_or_rename_a_patient_into_an_existing_canonical_fsn(): void
    {
        $user = $this->staff();
        $household = $this->register()->assertCreated()->json('data');
        $input = ['first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Male', 'family_serial_number' => strtolower($household['family_serial_number'])];
        $this->postJson('/api/patients', $input)->assertUnprocessable()->assertJsonValidationErrors('family_serial_number');
        $legacy = Patient::create(['first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $user->barangay_health_center_id, 'family_serial_number' => 'OLD']);
        $this->patchJson('/api/patients/'.$legacy->id, ['family_serial_number' => $input['family_serial_number']])->assertUnprocessable();
        $this->assertSame('OLD', $legacy->fresh()->family_serial_number);
        $this->staff();
        $this->postJson('/api/patients', $input)->assertCreated();
    }

    public function test_head_birthdate_correction_cannot_leave_a_minor_as_household_head(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $this->patchJson('/api/patients/'.$head['id'], ['birthdate' => '2020-01-01'])->assertUnprocessable()->assertJsonValidationErrors('birthdate');
        $this->assertSame('1990-01-01', Patient::find($head['id'])->birthdate->toDateString());
    }
}
