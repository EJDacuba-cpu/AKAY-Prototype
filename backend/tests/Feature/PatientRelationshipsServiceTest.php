<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\PatientRelationship;
use App\Models\User;
use App\Services\PatientRelationships;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PatientRelationshipsServiceTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $user;

    private Household $household;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bhc = BarangayHealthCenter::create(['name' => 'Service BHC']);
        $this->user = User::create(['name' => 'Manager', 'email' => uniqid().'@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'encoder', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => ['patients.register', 'families.view', 'families.manage']]);
        $this->household = Household::create(['barangay_health_center_id' => $this->bhc->id, 'serial_number' => 'FSN-2026-0001', 'address' => [], 'version' => 1]);
    }

    private function service(): PatientRelationships
    {
        return app(PatientRelationships::class);
    }

    private function request(): Request
    {
        $request = Request::create('/test');
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    private function member(string $name, array $extra = [], ?Household $household = null, ?BarangayHealthCenter $bhc = null): Patient
    {
        $household ??= $this->household;
        $bhc ??= $this->bhc;

        return Patient::create(['first_name' => $name, 'last_name' => 'Test', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'barangay_health_center_id' => $bhc->id, 'household_id' => $household->id, 'family_serial_number' => $household->serial_number, 'relationship_to_household_head' => 'Other relative', ...$extra]);
    }

    private function invalid(callable $write, string $key = 'relationship'): void
    {
        try {
            $write();
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey($key, $exception->errors());

            return;
        }
        $this->fail('Expected a validation error.');
    }

    private function denied(callable $write, int $status): void
    {
        try {
            $write();
        } catch (HttpException $exception) {
            $this->assertSame($status, $exception->getStatusCode());

            return;
        }
        $this->fail("Expected HTTP {$status}.");
    }

    public function test_creates_canonical_pair_regardless_of_argument_order(): void
    {
        [$a, $b] = [$this->member('A'), $this->member('B')];
        $link = $this->service()->create($this->request(), $this->household, $b, $a, 'spouse');
        $this->assertSame(min($a->id, $b->id), $link->patient_id);
        $this->assertSame(max($a->id, $b->id), $link->relative_id);
        $this->assertSame($this->bhc->id, $link->barangay_health_center_id);
        $this->assertSame($this->user->id, $link->created_by);
    }

    public function test_rejects_unknown_type_and_self_link(): void
    {
        [$a, $b] = [$this->member('A'), $this->member('B')];
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $a, $a, 'spouse'));
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $a, $b, 'parent'));
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $a, $b, 'partner'));
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_rejects_duplicate_and_reversed_duplicate(): void
    {
        [$a, $b] = [$this->member('A'), $this->member('B')];
        $this->service()->create($this->request(), $this->household, $a, $b, 'sibling');
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $a, $b, 'sibling'));
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $b, $a, 'sibling'));
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $b, $a, 'spouse'));
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_rejects_pair_already_parent_and_child(): void
    {
        $mother = $this->member('Mother');
        $father = $this->member('Father', ['sex' => 'Male']);
        $child = $this->member('Child', ['mother_patient_id' => $mother->id, 'father_patient_id' => $father->id]);
        foreach ([[$mother, $child], [$child, $mother], [$father, $child], [$child, $father]] as [$x, $y]) {
            $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $x, $y, 'sibling'));
            $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $x, $y, 'spouse'));
        }
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_rejects_spouse_or_sibling_when_one_is_an_ancestor_of_the_other(): void
    {
        $grandmother = $this->member('Grandmother');
        $mother = $this->member('Mother', ['mother_patient_id' => $grandmother->id]);
        $child = $this->member('Child', ['mother_patient_id' => $mother->id]);
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $grandmother, $child, 'spouse'));
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $child, $grandmother, 'sibling'));
        $unrelated = $this->member('Unrelated');
        $this->service()->create($this->request(), $this->household, $unrelated, $child, 'sibling');
        $this->assertDatabaseCount('patient_relationships', 1);
    }

    public function test_rejects_cross_facility_and_inactive_patients(): void
    {
        $other = BarangayHealthCenter::create(['name' => 'Other BHC']);
        $otherHousehold = Household::create(['barangay_health_center_id' => $other->id, 'serial_number' => 'FSN-2026-0001', 'address' => [], 'version' => 1]);
        $foreign = $this->member('Foreign', [], $otherHousehold, $other);
        $local = $this->member('Local');
        $this->denied(fn () => $this->service()->create($this->request(), $this->household, $local, $foreign, 'spouse'), 404);
        $this->denied(fn () => $this->service()->create($this->request(), $this->household, $foreign, $local, 'spouse'), 403);
        $inactive = $this->member('Inactive', ['status' => 'inactive']);
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $local, $inactive, 'sibling'));
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_requires_both_people_in_the_household(): void
    {
        $second = Household::create(['barangay_health_center_id' => $this->bhc->id, 'serial_number' => 'FSN-2026-0002', 'address' => [], 'version' => 1]);
        $here = $this->member('Here');
        $there = $this->member('There', [], $second);
        $this->invalid(fn () => $this->service()->create($this->request(), $this->household, $here, $there, 'spouse'));
        $this->invalid(fn () => $this->service()->create($this->request(), $second, $here, $there, 'spouse'));
        $this->assertDatabaseCount('patient_relationships', 0);
    }

    public function test_change_type_revalidates(): void
    {
        [$a, $b] = [$this->member('A'), $this->member('B')];
        $link = $this->service()->create($this->request(), $this->household, $a, $b, 'spouse');
        $changed = $this->service()->change($this->request(), $this->household, $link, 'sibling');
        $this->assertSame('sibling', $changed->fresh()->type);
        $this->invalid(fn () => $this->service()->change($this->request(), $this->household, $link, 'parent'));
        Patient::whereKey(max($a->id, $b->id))->update(['mother_patient_id' => min($a->id, $b->id)]);
        $this->invalid(fn () => $this->service()->change($this->request(), $this->household, $link->fresh(), 'spouse'));
        $this->assertSame('sibling', $link->fresh()->type);
    }

    public function test_remove_deletes_only_that_row_and_rows_outside_the_household_are_not_found(): void
    {
        [$a, $b, $c] = [$this->member('A'), $this->member('B'), $this->member('C')];
        $first = $this->service()->create($this->request(), $this->household, $a, $b, 'spouse');
        $second = $this->service()->create($this->request(), $this->household, $b, $c, 'sibling');
        $this->service()->remove($this->request(), $this->household, $first);
        $this->assertDatabaseMissing('patient_relationships', ['id' => $first->id]);
        $this->assertDatabaseHas('patient_relationships', ['id' => $second->id]);
        $second->relative()->first()->update(['household_id' => null, 'family_serial_number' => null]);
        $this->denied(fn () => $this->service()->remove($this->request(), $this->household, PatientRelationship::find($second->id)), 404);
        $this->assertDatabaseHas('patient_relationships', ['id' => $second->id]);
    }

    public function test_for_household_lists_only_links_between_current_members(): void
    {
        $second = Household::create(['barangay_health_center_id' => $this->bhc->id, 'serial_number' => 'FSN-2026-0002', 'address' => [], 'version' => 1]);
        [$a, $b] = [$this->member('A'), $this->member('B')];
        $link = $this->service()->create($this->request(), $this->household, $a, $b, 'spouse');
        $this->assertSame([$link->id], $this->service()->forHousehold($this->household)->pluck('id')->all());
        Patient::whereKey($b->id)->update(['household_id' => $second->id, 'family_serial_number' => $second->serial_number]);
        $this->assertCount(0, $this->service()->forHousehold($this->household));
        $this->assertCount(0, $this->service()->forHousehold($second));
        $this->assertDatabaseHas('patient_relationships', ['id' => $link->id]);
    }

    public function test_each_mutation_writes_an_audit_log_entry(): void
    {
        [$a, $b] = [$this->member('A'), $this->member('B')];
        $link = $this->service()->create($this->request(), $this->household, $a, $b, 'spouse');
        $this->service()->change($this->request(), $this->household, $link, 'sibling');
        $this->service()->remove($this->request(), $this->household, $link->fresh());
        foreach (['relationship_created', 'relationship_updated', 'relationship_removed'] as $action) {
            $entry = AuditLog::where('action', $action)->where('module', 'households')->first();
            $this->assertNotNull($entry, $action);
            $this->assertStringContainsString((string) min($a->id, $b->id), $entry->description);
            $this->assertStringContainsString((string) max($a->id, $b->id), $entry->description);
        }
    }
}
