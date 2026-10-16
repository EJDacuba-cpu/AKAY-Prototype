<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\PatientRelationship;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientRelationshipSchemaTest extends TestCase
{
    use RefreshDatabase;

    private function bhc(): BarangayHealthCenter
    {
        return BarangayHealthCenter::create(['name' => 'Schema BHC '.uniqid()]);
    }

    private function patient(BarangayHealthCenter $bhc, string $name = 'Person'): Patient
    {
        return Patient::create(['first_name' => $name, 'last_name' => 'Test', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'barangay_health_center_id' => $bhc->id]);
    }

    private function link(BarangayHealthCenter $bhc, int $patient, int $relative, string $type = 'spouse'): PatientRelationship
    {
        return PatientRelationship::create(['barangay_health_center_id' => $bhc->id, 'patient_id' => $patient, 'relative_id' => $relative, 'type' => $type]);
    }

    private function rejects(callable $write): void
    {
        try {
            $write();
        } catch (QueryException) {
            $this->assertTrue(true);

            return;
        }
        $this->fail('The database accepted a write it must reject.');
    }

    public function test_pair_is_unique_and_canonical(): void
    {
        $bhc = $this->bhc();
        [$a, $b] = [$this->patient($bhc, 'A'), $this->patient($bhc, 'B')];
        $low = min($a->id, $b->id);
        $high = max($a->id, $b->id);
        $this->rejects(fn () => $this->link($bhc, $high, $low));
        $this->link($bhc, $low, $high);
        $this->rejects(fn () => $this->link($bhc, $low, $high, 'sibling'));
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_self_pair_is_rejected(): void
    {
        $bhc = $this->bhc();
        $a = $this->patient($bhc);
        $this->rejects(fn () => $this->link($bhc, $a->id, $a->id));
    }

    public function test_type_must_be_spouse_or_sibling(): void
    {
        $bhc = $this->bhc();
        [$a, $b] = [$this->patient($bhc, 'A'), $this->patient($bhc, 'B')];
        $this->rejects(fn () => $this->link($bhc, min($a->id, $b->id), max($a->id, $b->id), 'parent'));
        $this->rejects(fn () => $this->link($bhc, min($a->id, $b->id), max($a->id, $b->id), 'partner'));
    }

    public function test_cross_facility_pair_is_rejected(): void
    {
        [$one, $two] = [$this->bhc(), $this->bhc()];
        [$a, $b] = [$this->patient($one, 'A'), $this->patient($two, 'B')];
        $low = min($a->id, $b->id);
        $high = max($a->id, $b->id);
        $this->rejects(fn () => $this->link($one, $low, $high));
        $this->rejects(fn () => $this->link($two, $low, $high));
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_patient_delete_is_restricted(): void
    {
        $bhc = $this->bhc();
        [$a, $b] = [$this->patient($bhc, 'A'), $this->patient($bhc, 'B')];
        $this->link($bhc, min($a->id, $b->id), max($a->id, $b->id));
        $this->rejects(fn () => Patient::whereKey($a->id)->delete());
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_patient_relationship_links_finds_rows_from_either_side(): void
    {
        $bhc = $this->bhc();
        [$a, $b, $c] = [$this->patient($bhc, 'A'), $this->patient($bhc, 'B'), $this->patient($bhc, 'C')];
        $ids = collect([$a, $b, $c])->pluck('id')->sort()->values();
        $this->link($bhc, $ids[0], $ids[1]);
        $this->link($bhc, $ids[1], $ids[2], 'sibling');
        $middle = Patient::find($ids[1]);
        $this->assertCount(2, $middle->relationshipLinks()->get());
        $this->assertCount(1, Patient::find($ids[0])->relationshipLinks()->get());
    }
}
