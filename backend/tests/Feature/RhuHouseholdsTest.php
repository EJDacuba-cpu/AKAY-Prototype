<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\PatientRelationship;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuHouseholdsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function staff(?RuralHealthUnit $facility = null, array $permissions = ['patients.register', 'families.view', 'families.manage']): User
    {
        $facility ??= RuralHealthUnit::create(['name' => 'Test RHU '.uniqid(), 'status' => 'active']);
        $user = User::create(['name' => 'RHU Registrar', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $facility->id, 'permissions' => $permissions]);
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

    public function test_empty_directory_returns_no_records(): void
    {
        $this->staff();
        $this->getJson('/api/rhu/households')->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.total', 0);
    }

    public function test_automatic_allocation_is_persisted_scoped_and_independent_of_bhc(): void
    {
        Carbon::setTestNow('2026-12-31 16:01:00 UTC');
        $this->staff();
        $first = $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2027-0001');
        $id = $first->json('data.household_id');
        $this->assertNotNull(Household::find($id)->rural_health_unit_id);
        $this->assertNull(Household::find($id)->barangay_health_center_id);
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2027-0002');
        $this->getJson('/api/rhu/households/'.$id)->assertOk()->assertJsonPath('data.members.0.household_id', $id);
        $this->staff();
        $this->register()->assertCreated()->assertJsonPath('data.family_serial_number', 'FSN-2027-0001');
        $this->getJson('/api/rhu/households/'.$id)->assertNotFound();
        Carbon::setTestNow();
    }

    public function test_same_fsn_may_exist_in_bhc_and_rhu_namespaces(): void
    {
        $rhuUser = $this->staff();
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => 'FSN-2026-0001'])->assertCreated();
        $bhc = BarangayHealthCenter::create(['name' => 'Peer BHC', 'status' => 'active']);
        $bhcUser = User::create(['name' => 'BHC Registrar', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $bhc->id, 'permissions' => ['patients.register', 'families.view', 'families.manage']]);
        Sanctum::actingAs($bhcUser, ['akay:access']);
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => 'FSN-2026-0001'])->assertCreated()
            ->assertJsonPath('data.barangay_health_center_id', $bhc->id)
            ->assertJsonPath('data.rural_health_unit_id', null);
        Sanctum::actingAs($rhuUser, ['akay:access']);
        $this->getJson('/api/rhu/households')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.serial_number', 'FSN-2026-0001');
        $this->getJson('/api/bhc/households')->assertForbidden();
    }

    public function test_join_existing_household_and_reject_duplicate_manual_fsn(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Wife'])->assertCreated()
            ->assertJsonPath('data.household_id', $head['household_id'])
            ->assertJsonPath('data.relationship_to_household_head', 'Wife')
            ->assertJsonPath('data.street_address', 'Main street');
        $this->register(['kind' => 'new', 'serial_mode' => 'manual', 'serial_number' => $head['family_serial_number']])->assertUnprocessable()->assertJsonValidationErrors('household.serial_number');
    }

    public function test_registration_lookup_is_allowed_but_directory_is_not_granted(): void
    {
        $this->staff(null, ['patients.register']);
        $this->register()->assertCreated();
        $this->getJson('/api/rhu/households/lookup')->assertOk();
        $this->getJson('/api/rhu/households')->assertForbidden();
        $this->postJson('/api/rhu/households', [])->assertForbidden();
    }

    public function test_bhc_cannot_use_rhu_household_namespace(): void
    {
        $this->staff();
        $id = $this->register()->assertCreated()->json('data.household_id');
        $bhc = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active']);
        $bhcUser = User::create(['name' => 'BHC', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $bhc->id, 'permissions' => ['patients.register', 'families.view', 'families.manage']]);
        Sanctum::actingAs($bhcUser, ['akay:access']);
        $this->getJson('/api/rhu/households/lookup')->assertForbidden();
        $this->getJson('/api/rhu/households/'.$id)->assertForbidden();
        $this->register(['kind' => 'existing', 'household_id' => $id, 'relationship' => 'Son'])->assertNotFound();
    }

    public function test_other_rhu_cannot_read_or_join_household(): void
    {
        $this->staff();
        $id = $this->register()->assertCreated()->json('data.household_id');
        $this->staff();
        $this->getJson('/api/rhu/households/'.$id)->assertNotFound();
        $this->register(['kind' => 'existing', 'household_id' => $id, 'relationship' => 'Son'])->assertNotFound();
    }

    public function test_bhc_owned_patient_cannot_join_rhu_household(): void
    {
        $rhuUser = $this->staff();
        $id = $this->register()->assertCreated()->json('data.household_id');
        $bhc = BarangayHealthCenter::create(['name' => 'Owned BHC', 'status' => 'active']);
        $foreign = Patient::create(['first_name' => 'BHC', 'last_name' => 'Walkin', 'sex' => 'Female', 'birthdate' => '1988-01-01', 'barangay_health_center_id' => $bhc->id]);
        $this->patchJson('/api/patients/'.$foreign->id, ['household' => ['kind' => 'existing', 'household_id' => $id, 'relationship' => 'Sister']])->assertForbidden();
        $this->assertNull($foreign->fresh()->household_id);
        Sanctum::actingAs($rhuUser, ['akay:access']);
        $this->getJson('/api/rhu/households/'.$id)->assertOk()->assertJsonCount(1, 'data.members');
    }

    public function test_family_editor_candidates_are_local_and_support_creation(): void
    {
        $local = RuralHealthUnit::create(['name' => 'Candidates local', 'status' => 'active']);
        $foreign = RuralHealthUnit::create(['name' => 'Candidates foreign', 'status' => 'active']);
        $head = Patient::create(['first_name' => 'Candidate', 'last_name' => 'Head', 'sex' => 'Female', 'birthdate' => '1980-01-01', 'rural_health_unit_id' => $local->id, 'medical_background' => ['private' => true]]);
        Patient::create(['first_name' => 'Foreign', 'last_name' => 'Person', 'sex' => 'Male', 'rural_health_unit_id' => $foreign->id]);
        $this->staff($local, ['families.view', 'families.manage']);
        $this->getJson('/api/rhu/households/candidates')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $head->id)->assertJsonMissingPath('data.0.medical_background');
        $this->postJson('/api/rhu/households', ['head_patient_id' => $head->id, 'serial_mode' => 'auto', 'address' => $this->address()])->assertCreated()->assertJsonPath('data.head_patient_id', $head->id);
    }

    public function test_head_departure_requires_review_and_empty_household_is_archived(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $member = $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Wife'])->assertCreated()->json('data');
        $this->patchJson('/api/patients/'.$head['id'], ['household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()]])->assertUnprocessable()->assertJsonValidationErrors('head_replacement');
        $source = $this->getJson('/api/rhu/households/'.$head['household_id'])->json('data');
        $this->patchJson('/api/patients/'.$head['id'], ['household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()], 'head_replacement' => ['household_id' => $source['id'], 'head_patient_id' => $member['id'], 'relationships' => [], 'version' => $source['version']]])->assertOk();
        $this->getJson('/api/rhu/households/'.$source['id'])->assertJsonPath('data.head_patient_id', $member['id']);
        $this->patchJson('/api/patients/'.$member['id'], ['household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()]])->assertOk();
        $this->assertNotNull(Household::find($source['id'])->archived_at);
    }

    public function test_relationship_persistence_is_facility_scoped(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $wife = $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Wife', 'relationship_link' => ['type' => 'spouse']])->assertCreated()->json('data');
        $household = $this->getJson('/api/rhu/households/'.$head['household_id'])->assertOk()->json('data');
        $this->assertCount(1, $household['relationships']);
        $this->assertSame('spouse', $household['relationships'][0]['type']);
        $this->assertSame('spouse', PatientRelationship::sole()->type);
        $this->assertNotNull(PatientRelationship::sole()->rural_health_unit_id);
        $this->assertNull(PatientRelationship::sole()->barangay_health_center_id);
        $url = '/api/rhu/households/'.$household['id'].'/relationships/'.$household['relationships'][0]['id'];
        $this->patchJson($url, ['version' => $household['version'], 'type' => 'sibling'])->assertOk()->assertJsonPath('data.relationships.0.type', 'sibling');
        $this->staff();
        $this->patchJson($url, ['version' => $household['version'] + 1, 'type' => 'spouse'])->assertNotFound();
        $this->assertSame('sibling', PatientRelationship::sole()->type);
        $this->assertContains($wife['id'], [$household['relationships'][0]['patient_id'], $household['relationships'][0]['relative_id']]);
    }

    public function test_unauthorized_user_cannot_mutate_relationships(): void
    {
        $this->staff();
        $head = $this->register()->assertCreated()->json('data');
        $wife = $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Wife'])->assertCreated()->json('data');
        $household = $this->getJson('/api/rhu/households/'.$head['household_id'])->json('data');
        $this->staff(null, ['patients.register', 'families.view']);
        $this->postJson('/api/rhu/households/'.$household['id'].'/relationships', ['version' => $household['version'], 'patient_id' => $wife['id'], 'relative_id' => $head['id'], 'type' => 'spouse'])->assertForbidden();
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_audit_failure_rolls_back_rhu_patient_household_and_counter(): void
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

    public function test_minor_cannot_head_a_new_rhu_household(): void
    {
        $this->staff();
        $this->register([], ['birthdate' => '2020-01-01'])->assertUnprocessable();
        $this->assertDatabaseCount('patients', 0);
        $this->assertDatabaseCount('households', 0);
    }

    public function test_legacy_fsn_cannot_collide_with_rhu_household(): void
    {
        $this->staff();
        $household = $this->register()->assertCreated()->json('data');
        $this->postJson('/api/patients', ['first_name' => 'Legacy', 'last_name' => 'Patient', 'sex' => 'Male', 'family_serial_number' => strtolower($household['family_serial_number'])])
            ->assertUnprocessable()->assertJsonValidationErrors('family_serial_number');
    }
}
