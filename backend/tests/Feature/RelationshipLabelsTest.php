<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\User;
use App\Services\RelationshipLabels;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RelationshipLabelsTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        $facility = BarangayHealthCenter::create(['name' => 'Labels BHC '.uniqid()]);
        $user = User::create(['name' => 'Registrar', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $facility->id, 'permissions' => ['patients.register', 'families.view', 'families.manage']]);
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

    private function newHead(): array
    {
        return $this->register(['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()])->assertCreated()->json('data');
    }

    private function join(array $head, string $relationship, array $patient = [])
    {
        return $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => $relationship], $patient);
    }

    public function test_new_labels_are_accepted_on_registration(): void
    {
        $this->staff();
        $head = $this->newHead();
        foreach (['Wife', 'Son', 'Grandmother', 'Partner', 'Daughter-in-law', 'Non-relative'] as $label) {
            $this->join($head, $label)->assertCreated()->assertJsonPath('data.relationship_to_household_head', $label);
        }
    }

    public function test_combined_label_rejected_for_a_new_member(): void
    {
        $this->staff();
        $head = $this->newHead();
        foreach (['Son / Daughter', 'Spouse / Partner', 'Parent', 'Child', 'Household head', ''] as $label) {
            $this->join($head, $label)->assertUnprocessable()->assertJsonValidationErrors('household.relationship');
        }
        $this->assertDatabaseCount('patients', 1);
    }

    public function test_legacy_label_accepted_only_when_unchanged_on_resave(): void
    {
        $this->staff();
        $head = $this->newHead();
        $member = $this->join($head, 'Son')->assertCreated()->json('data');
        Patient::whereKey($member['id'])->update(['relationship_to_household_head' => 'Son / Daughter']);
        $command = fn (string $label) => ['household' => ['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => $label, 'version' => $this->getJson('/api/bhc/households/'.$head['household_id'])->json('data.version')]];

        $this->patchJson('/api/patients/'.$member['id'], $command('Son / Daughter'))->assertOk()->assertJsonPath('data.relationship_to_household_head', 'Son / Daughter');
        $this->patchJson('/api/patients/'.$member['id'], $command('Parent'))->assertUnprocessable()->assertJsonValidationErrors('household.relationship');
        $this->assertSame('Son / Daughter', Patient::find($member['id'])->relationship_to_household_head);
        $this->patchJson('/api/patients/'.$member['id'], $command('Daughter'))->assertOk()->assertJsonPath('data.relationship_to_household_head', 'Daughter');
    }

    public function test_legacy_label_is_not_accepted_when_moving_to_another_household(): void
    {
        $this->staff();
        $one = $this->newHead();
        $two = $this->newHead();
        $member = $this->join($one, 'Son')->assertCreated()->json('data');
        Patient::whereKey($member['id'])->update(['relationship_to_household_head' => 'Son / Daughter']);
        $version = $this->getJson('/api/bhc/households/'.$two['household_id'])->json('data.version');
        $this->patchJson('/api/patients/'.$member['id'], ['household' => ['kind' => 'existing', 'household_id' => $two['household_id'], 'relationship' => 'Son / Daughter', 'version' => $version]])->assertUnprocessable();
    }

    public function test_head_replacement_relationships_use_new_labels(): void
    {
        $this->staff();
        $head = $this->newHead();
        $member = $this->join($head, 'Wife')->assertCreated()->json('data');
        $source = $this->getJson('/api/bhc/households/'.$head['household_id'])->json('data');
        $this->patchJson('/api/bhc/households/'.$source['id'], ['version' => $source['version'], 'head_patient_id' => $member['id'], 'relationships' => [$head['id'] => 'Spouse / Partner']])->assertUnprocessable()->assertJsonValidationErrors('relationships.'.$head['id']);
        $this->patchJson('/api/bhc/households/'.$source['id'], ['version' => $source['version'], 'head_patient_id' => $member['id'], 'relationships' => [$head['id'] => 'Husband']])->assertOk()->assertJsonPath('data.head_patient_id', $member['id']);
    }

    public function test_link_type_mapping_table(): void
    {
        foreach (['Husband' => 'spouse', 'Wife' => 'spouse', 'Brother' => 'sibling', 'Sister' => 'sibling'] as $label => $type) {
            $this->assertSame($type, RelationshipLabels::linkTypeFor($label), $label);
        }
        foreach (['Partner', 'Father', 'Mother', 'Son', 'Daughter', 'Grandmother', 'Cousin', 'Spouse / Partner', 'Sibling', ''] as $label) {
            $this->assertNull(RelationshipLabels::linkTypeFor($label), $label);
        }
    }
}
