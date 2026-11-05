<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuWalkInRecentPatientsTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Recent RHU', 'status' => 'active']);
        BarangayHealthCenter::create(['name' => 'Recent BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = User::create([
            'name' => 'Recent Nurse',
            'email' => 'recent-nurse@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function patient(string $first, string $last, array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => $first,
            'last_name' => $last,
            'sex' => 'Female',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function recent(?User $user = null, array $query = [])
    {
        Sanctum::actingAs($user ?? $this->nurse, ['akay:access']);

        return $this->getJson('/api/rhu-visits/recent-patients'.($query === [] ? '' : '?'.http_build_query($query)));
    }

    public function test_returns_newest_patients_first_capped_at_eight_by_default(): void
    {
        $ids = [];
        foreach (range(1, 10) as $number) {
            $ids[] = $this->patient('Recent', 'Patient'.$number)->id;
        }

        $this->recent()->assertOk()
            ->assertJsonCount(8, 'data')
            ->assertJsonPath('data.0.id', $ids[9])
            ->assertJsonPath('data.7.id', $ids[2]);
    }

    public function test_limit_is_clamped_between_one_and_ten(): void
    {
        foreach (range(1, 12) as $number) {
            $this->patient('Cap', 'Patient'.$number);
        }

        $this->recent(null, ['limit' => 3])->assertOk()->assertJsonCount(3, 'data');
        $this->recent(null, ['limit' => 10])->assertOk()->assertJsonCount(10, 'data');
        $this->recent(null, ['limit' => 0])->assertUnprocessable()->assertJsonValidationErrors('limit');
        $this->recent(null, ['limit' => 11])->assertUnprocessable()->assertJsonValidationErrors('limit');
    }

    public function test_excludes_inactive_and_other_facility_patients(): void
    {
        $own = $this->patient('Own', 'Here');
        $this->patient('Gone', 'Inactive', ['status' => 'inactive']);
        $other = RuralHealthUnit::create(['name' => 'Other Recent RHU', 'status' => 'active']);
        $this->patient('Other', 'Facility', ['rural_health_unit_id' => $other->id]);

        $this->recent()->assertOk()->assertJsonPath('data.*.id', [$own->id]);
    }

    public function test_includes_active_visit_id_and_identity_only(): void
    {
        $queued = $this->patient('Queued', 'Now', ['medical_background' => ['allergies' => ['items' => [['allergen' => 'Private']]]]]);
        $visit = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $queued->id,
            'source' => 'walk_in',
            'status' => 'waiting',
            'checked_in_at' => now(),
            'check_in_key' => 'recent-key',
        ]);

        $response = $this->recent()->assertOk()
            ->assertJsonPath('data.0.id', $queued->id)
            ->assertJsonPath('data.0.active_visit_id', $visit->id)
            ->assertJsonMissingPath('data.0.medical_background');
        $this->assertStringNotContainsString('Private', $response->getContent());
    }

    public function test_requires_patients_register(): void
    {
        $this->patient('Need', 'Duty');
        $historyOnly = User::create([
            'name' => 'History Only',
            'email' => 'recent-history@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => ['clinical.history'],
        ]);

        $this->recent($historyOnly)->assertForbidden();
    }
}
