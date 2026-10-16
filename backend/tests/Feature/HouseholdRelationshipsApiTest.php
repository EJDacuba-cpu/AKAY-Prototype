<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\PatientRelationship;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HouseholdRelationshipsApiTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'API BHC']);
    }

    private function actAs(array $permissions = ['patients.register', 'families.view', 'families.manage'], ?BarangayHealthCenter $facility = null): User
    {
        $facility ??= $this->bhc;
        $user = User::create(['name' => 'Staff', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $facility->id, 'permissions' => $permissions]);
        Sanctum::actingAs($user, ['akay:access']);

        return $user;
    }

    private function address(): array
    {
        return ['streetAddress' => 'Main street', 'purokArea' => 'Zone 1', 'barangay' => 'Local', 'municipality' => 'Bulakan'];
    }

    private function register(array $household, array $patient = [])
    {
        return $this->postJson('/api/patients', [...['first_name' => 'Adult', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '1990-01-01'], ...$patient, 'household' => $household]);
    }

    private function newHead(string $name = 'Head'): array
    {
        return $this->register(['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()], ['first_name' => $name, 'sex' => 'Male'])->assertCreated()->json('data');
    }

    private function join(array $head, string $label, string $name): array
    {
        return $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => $label], ['first_name' => $name])->assertCreated()->json('data');
    }

    private function household(int|string $id): array
    {
        return $this->getJson('/api/bhc/households/'.$id)->assertOk()->json('data');
    }

    private function add(array $household, int $patient, int $relative, string $type = 'spouse', ?int $version = null)
    {
        return $this->postJson('/api/bhc/households/'.$household['id'].'/relationships', ['version' => $version ?? $household['version'], 'patient_id' => $patient, 'relative_id' => $relative, 'type' => $type]);
    }

    public function test_create_change_and_remove_round_trip_and_bump_version(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $household = $this->household($head['household_id']);
        $this->assertSame([], $household['relationships']);

        $created = $this->add($household, $wife['id'], $head['id'])->assertCreated()->assertJsonCount(1, 'data.relationships')->json('data');
        $this->assertSame($household['version'] + 1, $created['version']);
        $row = $created['relationships'][0];
        $this->assertSame('spouse', $row['type']);
        $this->assertSame(min($head['id'], $wife['id']), $row['patient_id']);

        $url = '/api/bhc/households/'.$household['id'].'/relationships/'.$row['id'];
        $changed = $this->patchJson($url, ['version' => $created['version'], 'type' => 'sibling'])->assertOk()->json('data');
        $this->assertSame('sibling', $changed['relationships'][0]['type']);
        $this->assertSame($created['version'] + 1, $changed['version']);

        $removed = $this->deleteJson($url, ['version' => $changed['version']])->assertOk()->json('data');
        $this->assertSame([], $removed['relationships']);
        $this->assertSame($changed['version'] + 1, $removed['version']);
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_stale_version_returns_409_and_changes_nothing(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $household = $this->household($head['household_id']);
        $created = $this->add($household, $wife['id'], $head['id'])->assertCreated()->json('data');
        $url = '/api/bhc/households/'.$household['id'].'/relationships/'.$created['relationships'][0]['id'];
        $this->add($household, $wife['id'], $head['id'], 'sibling')->assertConflict();
        $this->patchJson($url, ['version' => $household['version'], 'type' => 'sibling'])->assertConflict();
        $this->deleteJson($url, ['version' => $household['version']])->assertConflict();
        $this->assertSame('spouse', PatientRelationship::sole()->type);
    }

    public function test_conflicts_and_bad_input_are_rejected(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $household = $this->household($head['household_id']);
        $this->add($household, $wife['id'], $head['id'], 'parent')->assertUnprocessable();
        $this->add($household, $wife['id'], $wife['id'])->assertUnprocessable()->assertJsonValidationErrors('relationship');
        $this->postJson('/api/bhc/households/'.$household['id'].'/relationships', ['version' => $household['version'], 'patient_id' => 'x', 'relative_id' => $head['id'], 'type' => 'spouse'])->assertUnprocessable();
        $created = $this->add($household, $wife['id'], $head['id'])->assertCreated()->json('data');
        $this->add($created, $head['id'], $wife['id'], 'sibling')->assertUnprocessable()->assertJsonValidationErrors('relationship');
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_requires_families_manage(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $household = $this->household($head['household_id']);
        $created = $this->add($household, $wife['id'], $head['id'])->assertCreated()->json('data');
        $url = '/api/bhc/households/'.$household['id'].'/relationships/'.$created['relationships'][0]['id'];

        $this->actAs(['patients.register', 'families.view']);
        $this->add($created, $wife['id'], $head['id'], 'sibling', $created['version'])->assertForbidden();
        $this->patchJson($url, ['version' => $created['version'], 'type' => 'sibling'])->assertForbidden();
        $this->deleteJson($url, ['version' => $created['version']])->assertForbidden();
        $this->getJson('/api/bhc/households/'.$household['id'])->assertOk()->assertJsonCount(1, 'data.relationships');
        $this->assertSame('spouse', PatientRelationship::sole()->type);
    }

    public function test_other_facility_and_rhu_users_cannot_reach_the_household(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $household = $this->household($head['household_id']);
        $row = $this->add($household, $wife['id'], $head['id'])->assertCreated()->json('data.relationships.0');
        $url = '/api/bhc/households/'.$household['id'].'/relationships/'.$row['id'];

        $this->actAs(['patients.register', 'families.view', 'families.manage'], BarangayHealthCenter::create(['name' => 'Foreign BHC']));
        $this->add($household, $wife['id'], $head['id'], 'sibling')->assertNotFound();
        $this->patchJson($url, ['version' => $household['version'] + 1, 'type' => 'sibling'])->assertNotFound();
        $this->deleteJson($url, ['version' => $household['version'] + 1])->assertNotFound();
        $this->getJson('/api/bhc/households/'.$household['id'])->assertNotFound();

        $rhu = RuralHealthUnit::create(['name' => 'Some RHU']);
        $user = User::create(['name' => 'RHU', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $rhu->id, 'permissions' => ['families.view', 'families.manage', 'patients.register']]);
        Sanctum::actingAs($user, ['akay:access']);
        $this->add($household, $wife['id'], $head['id'], 'sibling')->assertForbidden();
        $this->assertSame('spouse', PatientRelationship::sole()->type);
    }

    public function test_member_response_includes_parent_ids(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $child = $this->join($head, 'Son', 'Child');
        Patient::whereKey($child['id'])->update(['father_patient_id' => $head['id']]);
        $members = collect($this->household($head['household_id'])['members'])->keyBy('id');
        $this->assertSame($head['id'], $members[$child['id']]['father_patient_id']);
        $this->assertNull($members[$child['id']]['mother_patient_id']);
        $this->assertArrayNotHasKey('medical_background', $members[$child['id']]);
    }

    public function test_link_survives_household_move_and_is_listed_only_where_both_people_are_members(): void
    {
        $this->actAs();
        $one = $this->newHead('One');
        $wife = $this->join($one, 'Wife', 'Wife');
        $two = $this->newHead('Two');
        $household = $this->household($one['household_id']);
        $this->add($household, $wife['id'], $one['id'])->assertCreated();

        $target = $this->household($two['household_id']);
        $this->patchJson('/api/patients/'.$wife['id'], ['household' => ['kind' => 'existing', 'household_id' => $two['household_id'], 'relationship' => 'Sister', 'version' => $target['version']]])->assertOk();
        $this->assertSame([], $this->household($one['household_id'])['relationships']);
        $this->assertSame([], $this->household($two['household_id'])['relationships']);
        $this->assertDatabaseCount('patient_relationships', 1);

        $back = $this->household($one['household_id']);
        $this->patchJson('/api/patients/'.$wife['id'], ['household' => ['kind' => 'existing', 'household_id' => $one['household_id'], 'relationship' => 'Wife', 'version' => $back['version']]])->assertOk();
        $this->assertCount(1, $this->household($one['household_id'])['relationships']);
    }

    public function test_removing_a_member_leaves_other_links_intact(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $sister = $this->join($head, 'Sister', 'Sister');
        $other = $this->newHead('Other');
        $household = $this->household($head['household_id']);
        $household = $this->add($household, $wife['id'], $head['id'])->assertCreated()->json('data');
        $household = $this->add($household, $sister['id'], $head['id'], 'sibling')->assertCreated()->json('data');
        $target = $this->household($other['household_id']);
        $this->patchJson('/api/patients/'.$sister['id'], ['household' => ['kind' => 'existing', 'household_id' => $other['household_id'], 'relationship' => 'Cousin', 'version' => $target['version']]])->assertOk();
        $remaining = $this->household($head['household_id'])['relationships'];
        $this->assertCount(1, $remaining);
        $this->assertSame('spouse', $remaining[0]['type']);
    }

    public function test_audit_entries_for_each_mutation_and_empty_shape_for_unlinked_households(): void
    {
        $this->actAs();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'Wife');
        $household = $this->household($head['household_id']);
        $this->assertSame([], $household['relationships']);
        $created = $this->add($household, $wife['id'], $head['id'])->assertCreated()->json('data');
        $url = '/api/bhc/households/'.$household['id'].'/relationships/'.$created['relationships'][0]['id'];
        $changed = $this->patchJson($url, ['version' => $created['version'], 'type' => 'sibling'])->assertOk()->json('data');
        $this->deleteJson($url, ['version' => $changed['version']])->assertOk();
        foreach (['relationship_created', 'relationship_updated', 'relationship_removed'] as $action) {
            $this->assertSame(1, AuditLog::where('action', $action)->where('module', 'households')->count(), $action);
        }
    }
}
