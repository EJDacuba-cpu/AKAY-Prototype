<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\PatientRelationship;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ParentLinkRelationshipConsistencyTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private Household $household;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Parent BHC']);
        $user = User::create(['name' => 'Registrar', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => ['patients.register', 'families.view', 'families.manage']]);
        Sanctum::actingAs($user, ['akay:access']);
        $this->household = Household::create(['barangay_health_center_id' => $this->bhc->id, 'serial_number' => 'FSN-2026-0001', 'address' => [], 'version' => 1]);
    }

    private function person(string $name, string $sex, array $extra = []): Patient
    {
        return Patient::create(['first_name' => $name, 'last_name' => 'Test', 'sex' => $sex, 'birthdate' => '1990-01-01', 'barangay_health_center_id' => $this->bhc->id, 'household_id' => $this->household->id, 'family_serial_number' => $this->household->serial_number, 'relationship_to_household_head' => 'Other relative', ...$extra]);
    }

    private function link(Patient $a, Patient $b, string $type): void
    {
        PatientRelationship::create(['barangay_health_center_id' => $this->bhc->id, 'patient_id' => min($a->id, $b->id), 'relative_id' => max($a->id, $b->id), 'type' => $type]);
    }

    public function test_cannot_set_mother_to_a_stored_spouse_or_sibling(): void
    {
        $patient = $this->person('Patient', 'Female');
        $spouse = $this->person('Spouse', 'Female');
        $sister = $this->person('Sister', 'Female');
        $this->link($patient, $spouse, 'spouse');
        $this->link($patient, $sister, 'sibling');
        foreach ([$spouse, $sister] as $other) {
            $this->patchJson('/api/patients/'.$patient->id, ['mother_patient_id' => $other->id])->assertUnprocessable()->assertJsonValidationErrors('mother_patient_id');
        }
        $this->assertNull($patient->fresh()->mother_patient_id);
    }

    public function test_cannot_set_father_to_a_stored_sibling(): void
    {
        $patient = $this->person('Patient', 'Female');
        $brother = $this->person('Brother', 'Male');
        $this->link($patient, $brother, 'sibling');
        $this->patchJson('/api/patients/'.$patient->id, ['father_patient_id' => $brother->id])->assertUnprocessable()->assertJsonValidationErrors('father_patient_id');
        $this->assertNull($patient->fresh()->father_patient_id);
    }

    public function test_a_stored_partner_who_would_become_an_ancestor_is_rejected(): void
    {
        $patient = $this->person('Patient', 'Female');
        $partner = $this->person('Partner', 'Male');
        $son = $this->person('Son', 'Male', ['father_patient_id' => $partner->id]);
        $this->link($patient, $partner, 'spouse');
        $this->patchJson('/api/patients/'.$patient->id, ['father_patient_id' => $son->id])->assertUnprocessable()->assertJsonValidationErrors('father_patient_id');
    }

    public function test_unrelated_parent_link_still_saves_and_clearing_is_allowed(): void
    {
        $patient = $this->person('Patient', 'Female');
        $spouse = $this->person('Spouse', 'Male');
        $mother = $this->person('Mother', 'Female');
        $this->link($patient, $spouse, 'spouse');
        $this->patchJson('/api/patients/'.$patient->id, ['mother_patient_id' => $mother->id])->assertOk()->assertJsonPath('data.mother_patient_id', $mother->id);
        $this->patchJson('/api/patients/'.$patient->id, ['mother_patient_id' => null])->assertOk();
        $this->assertNull($patient->fresh()->mother_patient_id);
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_resending_an_unchanged_existing_parent_never_blocks_a_save(): void
    {
        $mother = $this->person('Mother', 'Female');
        $patient = $this->person('Patient', 'Female', ['mother_patient_id' => $mother->id]);
        $this->link($patient, $mother, 'sibling');
        $this->patchJson('/api/patients/'.$patient->id, ['mother_patient_id' => $mother->id, 'occupation' => 'Teacher'])->assertOk();
        $this->assertSame('Teacher', $patient->fresh()->occupation);
    }
}
