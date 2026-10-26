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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ParentGuardianWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Parent link BHC']);
        $this->staff = User::create([
            'name' => 'Registrar', 'email' => 'parents@example.test', 'password' => 'password123',
            'role' => 'bhc', 'staff_role' => 'encoder', 'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => ['patients.register', 'families.view', 'families.manage'],
        ]);
        Sanctum::actingAs($this->staff, ['akay:access']);
    }

    private function person(string $sex = 'Female', array $extra = []): Patient
    {
        return Patient::create([
            'first_name' => 'Person', 'last_name' => 'Cruz', 'sex' => $sex,
            'birthdate' => '1990-01-01', 'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id, ...$extra,
        ]);
    }

    public function test_cross_fsn_link_and_unlink_preserve_both_households_and_reported_information(): void
    {
        $household = fn ($serial) => Household::create(['barangay_health_center_id' => $this->bhc->id, 'serial_number' => $serial, 'address' => [], 'version' => 1]);
        $childHousehold = $household('CHILD-FSN');
        $parentHousehold = $household('PARENT-FSN');
        $parent = $this->person('Female', ['first_name' => 'Registered', 'household_id' => $parentHousehold->id, 'family_serial_number' => 'PARENT-FSN']);
        $child = $this->person('Male', [
            'household_id' => $childHousehold->id, 'family_serial_number' => 'CHILD-FSN',
            'mother_name' => 'Reported name', 'mother_birth_date' => '1980-01-01',
            'guardian_name' => 'Grandmother', 'guardian_relationship' => 'Grandmother', 'occupation' => 'Student',
        ]);
        $original = $child->getAttributes();
        $parentOriginal = $parent->fresh()->getAttributes();

        $this->patchJson('/api/patients/'.$child->id, [
            'mother_patient_id' => $parent->id, 'parent_link_base' => ['mother_patient_id' => null],
        ])->assertOk()->assertJsonPath('data.mother.first_name', 'Registered');
        foreach ($original as $field => $value) {
            if (! in_array($field, ['mother_patient_id', 'updated_at'])) {
                $this->assertEquals($value, $child->fresh()->getAttributes()[$field], $field);
            }
        }
        $this->assertEquals($parentOriginal, $parent->fresh()->getAttributes());
        $this->getJson('/api/patients/'.$child->id)->assertOk()
            ->assertJsonPath('data.mother.first_name', 'Registered')
            ->assertJsonPath('data.mother_name', 'Reported name')
            ->assertJsonMissingPath('data.mother.medical_background');
        $this->patchJson('/api/patients/'.$child->id, [
            'mother_patient_id' => null, 'parent_link_base' => ['mother_patient_id' => $parent->id],
        ])->assertOk();
        $this->assertSame('Reported name', $child->fresh()->mother_name);
        $this->assertSame('Grandmother', $child->fresh()->guardian_name);
        $this->assertSame(1, $childHousehold->fresh()->version);
        $this->assertSame(1, $parentHousehold->fresh()->version);
        $this->assertDatabaseCount('patient_relationships', 0);
        $logs = AuditLog::where('action', 'parent_links_updated')->get();
        $this->assertCount(2, $logs);
        $this->assertStringContainsString('mother_patient_id', $logs[0]->description);
        $this->assertStringContainsString((string) $parent->id, $logs[0]->description);
    }

    public function test_registration_only_staff_cannot_change_or_clear_existing_parent_links(): void
    {
        $parent = $this->person();
        $child = $this->person('Male', ['mother_patient_id' => $parent->id]);
        $this->staff->update(['permissions' => ['patients.register']]);
        foreach ([null, $this->person()->id] as $id) {
            $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $id])->assertForbidden();
        }
        $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $parent->id, 'occupation' => 'Teacher'])->assertOk();
        $this->assertSame($parent->id, $child->fresh()->mother_patient_id);
    }

    public function test_family_management_alone_does_not_grant_patient_update_authority(): void
    {
        $parent = $this->person();
        $child = $this->person();
        $this->staff->update(['permissions' => ['families.view', 'families.manage']]);
        $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $parent->id])->assertForbidden();
    }

    public function test_inactive_parent_or_child_cannot_receive_a_new_link(): void
    {
        $parent = $this->person('Female', ['status' => 'inactive']);
        $child = $this->person('Male');
        $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $parent->id])
            ->assertUnprocessable()->assertJsonValidationErrors('mother_patient_id');
        $parent->update(['status' => 'active']);
        $child->update(['status' => 'inactive']);
        $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $parent->id])
            ->assertUnprocessable()->assertJsonValidationErrors('mother_patient_id');
    }

    public function test_direct_and_indirect_parent_cycles_are_rejected(): void
    {
        $ancestor = $this->person();
        $child = $this->person('Male', ['mother_patient_id' => $ancestor->id]);
        $grandchild = $this->person('Female', ['father_patient_id' => $child->id]);
        $this->patchJson('/api/patients/'.$ancestor->id, ['father_patient_id' => $child->id])
            ->assertUnprocessable()->assertJsonValidationErrors('father_patient_id');
        $this->patchJson('/api/patients/'.$ancestor->id, ['mother_patient_id' => $grandchild->id])
            ->assertUnprocessable()->assertJsonValidationErrors('mother_patient_id');
        $this->assertNull($ancestor->fresh()->mother_patient_id);
        $this->assertNull($ancestor->fresh()->father_patient_id);
    }

    public function test_stale_parent_change_is_rejected_without_overwriting_the_saved_link(): void
    {
        $saved = $this->person();
        $other = $this->person();
        $child = $this->person('Male', ['mother_patient_id' => $saved->id]);
        $this->patchJson('/api/patients/'.$child->id, [
            'mother_patient_id' => $other->id, 'parent_link_base' => ['mother_patient_id' => null],
        ])->assertConflict();
        $this->assertSame($saved->id, $child->fresh()->mother_patient_id);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_out_of_scope_parent_is_rejected_and_never_exposed_in_identity_reads(): void
    {
        $parent = $this->person('Female', ['barangay_health_center_id' => BarangayHealthCenter::create(['name' => 'Other BHC'])->id]);
        $child = $this->person();
        $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $parent->id])->assertForbidden();
        $child->update(['mother_patient_id' => $parent->id]);
        $this->getJson('/api/patients/'.$child->id)->assertOk()->assertJsonPath('data.mother', null);
    }

    public function test_rhu_can_link_its_own_patients_across_fsn_without_moving_them(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Parent RHU', 'status' => 'active']);
        $this->staff->update(['role' => 'rhu', 'staff_role' => 'nurse', 'barangay_health_center_id' => null, 'rural_health_unit_id' => $rhu->id]);
        $parent = $this->person('Male', ['barangay_health_center_id' => null, 'rural_health_unit_id' => $rhu->id, 'family_serial_number' => 'FATHER']);
        $child = $this->person('Female', ['barangay_health_center_id' => null, 'rural_health_unit_id' => $rhu->id, 'family_serial_number' => 'CHILD']);
        $this->patchJson('/api/patients/'.$child->id, ['father_patient_id' => $parent->id])->assertOk();
        $this->getJson('/api/patients/'.$child->id)->assertOk()->assertJsonPath('data.father.id', $parent->id);
        $this->assertSame('CHILD', $child->fresh()->family_serial_number);
        $this->assertSame('FATHER', $parent->fresh()->family_serial_number);
    }

    public function test_registration_without_reported_or_registered_parents_is_allowed(): void
    {
        $this->postJson('/api/patients', [
            'first_name' => 'Child', 'last_name' => 'Cruz', 'sex' => 'Male',
            'birthdate' => now()->subMonths(3)->toDateString(), 'registration_type' => 'child',
        ])->assertCreated()->assertJsonPath('data.mother_patient_id', null)->assertJsonPath('data.father_patient_id', null);
    }

    public function test_clinical_staff_also_read_linked_identity_without_parent_clinical_data(): void
    {
        $this->staff->update(['permissions' => [...$this->staff->permissions, 'clinical.history']]);
        $parent = $this->person('Female', ['first_name' => 'Linked', 'medical_background' => ['private' => 'Parent clinical data']]);
        $child = $this->person('Male');
        $this->patchJson('/api/patients/'.$child->id, ['mother_patient_id' => $parent->id])
            ->assertOk()->assertJsonPath('data.mother.first_name', 'Linked')->assertJsonMissingPath('data.mother.medical_background');
        $this->getJson('/api/patients/'.$child->id)->assertOk()
            ->assertJsonPath('data.mother.full_name', 'Linked Cruz')->assertJsonMissingPath('data.mother.medical_background');
    }

    public function test_existing_patient_search_stays_facility_scoped_across_fsn(): void
    {
        $local = $this->person('Female', ['first_name' => 'Searchable', 'family_serial_number' => 'OTHER-FSN']);
        $this->person('Female', ['first_name' => 'Searchable', 'barangay_health_center_id' => BarangayHealthCenter::create(['name' => 'Unrelated BHC'])->id]);
        $this->getJson('/api/patients?search=Searchable&status=active')->assertOk()
            ->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $local->id);
    }

    public function test_ancestry_beyond_the_validation_bound_is_rejected_safely(): void
    {
        $last = $this->person();
        for ($generation = 0; $generation < 21; $generation++) {
            $last = $this->person('Female', ['mother_patient_id' => $last->id]);
        }
        $unrelated = $this->person('Male');
        $this->patchJson('/api/patients/'.$unrelated->id, ['mother_patient_id' => $last->id])
            ->assertUnprocessable()->assertJsonValidationErrors('relationship');
        $this->assertNull($unrelated->fresh()->mother_patient_id);
    }

    public function test_parent_changes_cannot_turn_a_descendants_spouse_or_sibling_into_an_ancestor(): void
    {
        foreach (['spouse', 'sibling'] as $type) {
            $ancestor = $this->person();
            $descendant = $this->person('Male', ['mother_patient_id' => $ancestor->id]);
            $relative = $this->person();
            PatientRelationship::create([
                'barangay_health_center_id' => $this->bhc->id,
                'patient_id' => min($descendant->id, $relative->id),
                'relative_id' => max($descendant->id, $relative->id), 'type' => $type,
            ]);
            $this->patchJson('/api/patients/'.$ancestor->id, ['mother_patient_id' => $relative->id])
                ->assertUnprocessable()->assertJsonValidationErrors('mother_patient_id');
            $this->assertNull($ancestor->fresh()->mother_patient_id);
        }
    }

    public static function registrationFacilities(): array
    {
        return [['bhc'], ['rhu']];
    }

    #[DataProvider('registrationFacilities')]
    public function test_reported_names_can_be_edited_and_cleared_without_changing_legacy_links_or_clinical_history(string $role): void
    {
        $facility = ['barangay_health_center_id' => $this->bhc->id];
        if ($role === 'rhu') {
            $rhu = RuralHealthUnit::create(['name' => 'Registry RHU', 'status' => 'active']);
            $facility = ['barangay_health_center_id' => null, 'rural_health_unit_id' => $rhu->id];
            $this->staff->update(['role' => 'rhu', 'staff_role' => 'nurse', ...$facility]);
        }
        $household = Household::create([...$facility, 'serial_number' => 'KEEP-FSN', 'address' => [], 'version' => 1]);
        $mother = $this->person('Female', $facility);
        $father = $this->person('Male', $facility);
        $child = $this->person('Male', [...$facility, 'mother_patient_id' => $mother->id, 'father_patient_id' => $father->id,
            'mother_name' => 'Reported mother', 'father_name' => 'Reported father', 'guardian_name' => 'Guardian',
            'household_id' => $household->id, 'family_serial_number' => 'KEEP-FSN', 'medical_background' => ['family' => ['reported' => 'Reported history']]]);
        $household->update(['head_patient_id' => $child->id]);
        PatientRelationship::create([...$facility, 'patient_id' => min($mother->id, $father->id), 'relative_id' => max($mother->id, $father->id), 'type' => 'spouse']);
        $relationships = PatientRelationship::get()->toArray();
        $this->staff->update(['permissions' => ['patients.register']]);
        foreach ([['mother_name' => 'Corrected mother', 'father_name' => 'Corrected father'], ['mother_name' => null, 'father_name' => null]] as $names) {
            $this->patchJson('/api/patients/'.$child->id, $names)->assertOk();
            $saved = $child->fresh();
            $this->assertSame($mother->id, $saved->mother_patient_id);
            $this->assertSame($father->id, $saved->father_patient_id);
            $this->assertSame($names['mother_name'], $saved->mother_name);
            $this->assertSame($names['father_name'], $saved->father_name);
            $this->assertSame('KEEP-FSN', $saved->family_serial_number);
            $this->assertSame($household->id, $saved->household_id);
            $this->assertSame(1, $household->fresh()->version);
            $this->assertSame('Guardian', $saved->guardian_name);
            $this->assertSame($child->medical_background, $saved->medical_background);
        }
        $this->assertSame(0, AuditLog::where('action', 'parent_links_updated')->count());
        $this->assertSame($relationships, PatientRelationship::get()->toArray());
    }
}
