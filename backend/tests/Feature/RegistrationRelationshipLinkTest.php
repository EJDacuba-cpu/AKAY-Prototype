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
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RegistrationRelationshipLinkTest extends TestCase
{
    use RefreshDatabase;

    private function staff(array $permissions = ['patients.register', 'families.view', 'families.manage']): User
    {
        $facility = BarangayHealthCenter::create(['name' => 'Link BHC '.uniqid()]);
        $user = User::create(['name' => 'Registrar', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $facility->id, 'permissions' => $permissions]);
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
        return $this->register(['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()], ['first_name' => 'Head', 'sex' => 'Male'])->assertCreated()->json('data');
    }

    private function join(array $head, string $relationship, ?string $link = null, array $patient = [])
    {
        return $this->register(['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => $relationship, ...($link ? ['relationship_link' => ['type' => $link]] : [])], $patient);
    }

    private function snapshot(array $head): array
    {
        return [Patient::count(), PatientRelationship::count(), Household::find($head['household_id'])->version];
    }

    public function test_wife_with_confirmed_spouse_link_persists_patient_membership_and_link(): void
    {
        $this->staff();
        $head = $this->newHead();
        $wife = $this->join($head, 'Wife', 'spouse')->assertCreated()->assertJsonPath('data.household_id', $head['household_id'])->json('data');
        $row = PatientRelationship::sole();
        $this->assertSame('spouse', $row->type);
        $this->assertSame([min($head['id'], $wife['id']), max($head['id'], $wife['id'])], [$row->patient_id, $row->relative_id]);
    }

    public function test_brother_with_confirmed_sibling_link_persists(): void
    {
        $this->staff();
        $head = $this->newHead();
        $this->join($head, 'Brother', 'sibling', ['sex' => 'Male'])->assertCreated();
        $this->assertSame('sibling', PatientRelationship::sole()->type);
    }

    public function test_no_link_is_created_without_the_confirmed_flag(): void
    {
        $this->staff();
        $head = $this->newHead();
        foreach (['Wife', 'Husband', 'Brother', 'Sister', 'Son', 'Daughter', 'Mother', 'Father', 'Grandson', 'Nephew', 'Niece'] as $label) {
            $this->join($head, $label)->assertCreated()
                ->assertJsonPath('data.household_id', $head['household_id'])
                ->assertJsonPath('data.relationship_to_household_head', $label)
                ->assertJsonPath('data.mother_patient_id', null)
                ->assertJsonPath('data.father_patient_id', null);
        }
        $this->assertNull(Patient::findOrFail($head['id'])->mother_patient_id);
        $this->assertNull(Patient::findOrFail($head['id'])->father_patient_id);
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_link_type_must_match_label_and_failure_leaves_nothing_behind(): void
    {
        $this->staff();
        $head = $this->newHead();
        $before = $this->snapshot($head);
        foreach ([['Wife', 'sibling'], ['Brother', 'spouse'], ['Partner', 'spouse'], ['Son', 'sibling'], ['Mother', 'spouse']] as [$label, $type]) {
            $this->join($head, $label, $type)->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        }
        $this->assertSame($before, $this->snapshot($head));
    }

    public function test_link_for_a_new_household_is_rejected(): void
    {
        $this->staff();
        $this->register(['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address(), 'relationship_link' => ['type' => 'spouse']])->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        $this->assertDatabaseCount('patients', 0);
        $this->assertDatabaseCount('households', 0);
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_conflicting_link_on_a_move_rolls_back_patient_and_membership(): void
    {
        $this->staff();
        $head = $this->newHead();
        $child = $this->register(['kind' => 'new', 'serial_mode' => 'auto', 'address' => $this->address()], ['first_name' => 'Solo'])->assertCreated()->json('data');
        Patient::whereKey($child['id'])->update(['father_patient_id' => $head['id']]);
        $before = $this->snapshot($head);
        $version = Household::find($head['household_id'])->version;
        $this->patchJson('/api/patients/'.$child['id'], ['household' => ['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Wife', 'version' => $version, 'relationship_link' => ['type' => 'spouse']]])
            ->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        $this->assertSame($before, $this->snapshot($head));
        $this->assertSame($child['household_id'], Patient::find($child['id'])->household_id);
    }

    public function test_late_failure_rolls_back_patient_membership_and_link(): void
    {
        $this->staff();
        $head = $this->newHead();
        $before = $this->snapshot($head);
        $this->mock(AuditLogger::class)->shouldReceive('log')->andThrow(new \RuntimeException('Audit unavailable'));
        $this->join($head, 'Wife', 'spouse')->assertInternalServerError();
        $this->assertSame($before, $this->snapshot($head));
        app()->forgetInstance(AuditLogger::class);
        $this->join($head, 'Wife', 'spouse')->assertCreated();
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_link_only_connects_the_saved_patient_and_the_head(): void
    {
        $this->staff(['patients.register']);
        $head = $this->newHead();
        $other = $this->join($head, 'Son')->assertCreated()->json('data');
        $this->postJson('/api/patients', [...['first_name' => 'Adult', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '1990-01-01'], 'household' => ['kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Wife', 'relationship_link' => ['type' => 'spouse', 'relative_id' => $other['id']]]])
            ->assertUnprocessable();
        $wife = $this->join($head, 'Wife', 'spouse')->assertCreated()->json('data');
        $row = PatientRelationship::sole();
        $this->assertEqualsCanonicalizing([$head['id'], $wife['id']], [$row->patient_id, $row->relative_id]);
    }

    public function test_move_with_link_confirms_against_the_new_head_and_keeps_the_old_link(): void
    {
        $this->staff();
        $one = $this->newHead();
        $two = $this->newHead();
        $member = $this->join($one, 'Wife', 'spouse')->assertCreated()->json('data');
        $version = Household::find($two['household_id'])->version;
        $this->patchJson('/api/patients/'.$member['id'], ['household' => ['kind' => 'existing', 'household_id' => $two['household_id'], 'relationship' => 'Sister', 'version' => $version, 'relationship_link' => ['type' => 'sibling']]])->assertOk();
        $this->assertDatabaseCount('patient_relationships', 2);
        $this->assertSame(['sibling', 'spouse'], PatientRelationship::orderBy('type', 'desc')->pluck('type')->sort()->values()->all());
    }

    public function test_household_only_patch_does_not_change_demographics(): void
    {
        $this->staff();
        $one = $this->newHead();
        $two = $this->newHead();
        $member = $this->join($one, 'Son', null, ['first_name' => 'Keep', 'birthdate' => '2012-03-04', 'contact_number' => '09171234567'])->assertCreated()->json('data');
        $version = Household::find($two['household_id'])->version;
        $this->patchJson('/api/patients/'.$member['id'], ['household' => ['kind' => 'existing', 'household_id' => $two['household_id'], 'relationship' => 'Nephew', 'version' => $version]])->assertOk();
        $fresh = Patient::find($member['id']);
        $this->assertSame('Keep', $fresh->first_name);
        $this->assertSame('2012-03-04', $fresh->birthdate->toDateString());
        $this->assertSame('09171234567', $fresh->contact_number);
        $this->assertSame((int) $two['household_id'], $fresh->household_id);
        $this->assertSame('Nephew', $fresh->relationship_to_household_head);
    }

    public function test_son_can_explicitly_confirm_the_head_as_father_with_registration_permission(): void
    {
        $this->staff(['patients.register']);
        $head = $this->newHead();
        $this->join($head, 'Son', 'father', ['sex' => 'Male', 'mother_name' => 'Reported mother'])
            ->assertCreated()->assertJsonPath('data.father_patient_id', $head['id'])
            ->assertJsonPath('data.mother_name', 'Reported mother');
        $this->assertDatabaseCount('patient_relationships', 0);
        $this->assertNull(Patient::find($head['id'])->father_patient_id);
    }

    public function test_daughter_can_explicitly_confirm_the_head_as_mother(): void
    {
        $this->staff(['patients.register']);
        $head = $this->newHead();
        Patient::find($head['id'])->update(['sex' => 'Female']);
        $this->join($head, 'Daughter', 'mother')->assertCreated()->assertJsonPath('data.mother_patient_id', $head['id']);
    }

    public function test_mother_and_father_labels_update_the_heads_parent_slot_in_the_correct_direction(): void
    {
        $this->staff();
        foreach (['mother' => 'Female', 'father' => 'Male'] as $role => $sex) {
            $head = $this->newHead();
            Patient::find($head['id'])->update(['mother_name' => 'Keep reported', 'guardian_name' => 'Keep guardian']);
            $saved = $this->join($head, ucfirst($role), $role, ['sex' => $sex])->assertCreated()->json('data');
            $child = Patient::find($head['id']);
            $this->assertSame($saved['id'], $child->{$role.'_patient_id'});
            $this->assertSame('Keep reported', $child->mother_name);
            $this->assertSame('Keep guardian', $child->guardian_name);
            $this->assertNull(Patient::find($saved['id'])->{$role.'_patient_id'});
        }
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_reverse_parent_confirmation_requires_management_but_label_only_registration_does_not(): void
    {
        $this->staff(['patients.register']);
        $head = $this->newHead();
        $before = $this->snapshot($head);
        $this->join($head, 'Mother', 'mother')->assertForbidden();
        $this->assertSame($before, $this->snapshot($head));
        $this->join($head, 'Mother')->assertCreated();
        $this->assertNull(Patient::find($head['id'])->mother_patient_id);
    }

    public function test_occupied_parent_slot_is_not_replaced_and_registration_is_rolled_back(): void
    {
        $this->staff();
        $head = $this->newHead();
        $existing = $this->join($head, 'Mother')->assertCreated()->json('data');
        Patient::find($head['id'])->update(['mother_patient_id' => $existing['id']]);
        $before = $this->snapshot($head);
        $this->join($head, 'Mother', 'mother')->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        $this->assertSame($before, $this->snapshot($head));
        $this->assertSame($existing['id'], Patient::find($head['id'])->mother_patient_id);
        $this->join($head, 'Mother')->assertCreated();
    }

    public function test_parent_confirmation_rejects_wrong_role_and_unsupported_labels_atomically(): void
    {
        $this->staff();
        $head = $this->newHead();
        $before = $this->snapshot($head);
        foreach ([['Son', 'mother'], ['Mother', 'father'], ['Nephew', 'father'], ['Grandmother', 'mother']] as [$label, $type]) {
            $this->join($head, $label, $type)->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        }
        $this->assertSame($before, $this->snapshot($head));
    }

    public function test_inactive_head_cannot_be_confirmed_as_parent(): void
    {
        $this->staff();
        $head = $this->newHead();
        Patient::find($head['id'])->update(['status' => 'inactive']);
        $before = $this->snapshot($head);
        $this->join($head, 'Son', 'father')->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        $this->assertSame($before, $this->snapshot($head));
    }

    public function test_reverse_parent_confirmation_cannot_create_a_cycle(): void
    {
        $this->staff();
        $head = $this->newHead();
        $before = $this->snapshot($head);
        $this->join($head, 'Mother', 'mother', ['father_patient_id' => $head['id']])
            ->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        $this->assertSame($before, $this->snapshot($head));
        $this->assertNull(Patient::find($head['id'])->mother_patient_id);
    }

    public function test_parent_link_and_existing_head_change_roll_back_on_late_failure(): void
    {
        $this->staff();
        $head = $this->newHead();
        $before = $this->snapshot($head);
        $this->mock(AuditLogger::class)->shouldReceive('log')->andThrow(new \RuntimeException('Audit unavailable'));
        $this->join($head, 'Mother', 'mother')->assertInternalServerError();
        $this->assertSame($before, $this->snapshot($head));
        $this->assertNull(Patient::find($head['id'])->mother_patient_id);
    }

    public function test_parent_confirmation_is_not_added_to_the_household_transfer_command(): void
    {
        $this->staff();
        $head = $this->newHead();
        $member = $this->join($head, 'Daughter')->assertCreated()->json('data');
        $this->patchJson('/api/patients/'.$member['id'], ['household' => [
            'kind' => 'existing', 'household_id' => $head['household_id'], 'relationship' => 'Daughter',
            'relationship_link' => ['type' => 'father'],
        ]])->assertUnprocessable()->assertJsonValidationErrors('household.relationship_link');
        $this->assertNull(Patient::find($member['id'])->father_patient_id);
    }

    public function test_rhu_registration_confirms_both_parent_directions_in_its_own_scope(): void
    {
        $user = $this->staff();
        $rhu = RuralHealthUnit::create(['name' => 'Registration RHU', 'status' => 'active']);
        $user->update(['role' => 'rhu', 'staff_role' => 'nurse', 'barangay_health_center_id' => null, 'rural_health_unit_id' => $rhu->id]);
        $head = $this->newHead();
        $this->join($head, 'Daughter', 'father')->assertCreated()->assertJsonPath('data.father_patient_id', $head['id']);
        $mother = $this->join($head, 'Mother', 'mother')->assertCreated()->json('data');
        $this->assertSame($mother['id'], Patient::find($head['id'])->mother_patient_id);
        $this->assertSame($rhu->id, Patient::find($mother['id'])->rural_health_unit_id);
    }
}
