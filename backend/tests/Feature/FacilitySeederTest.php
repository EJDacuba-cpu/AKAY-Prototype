<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\FacilitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class FacilitySeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_creates_all_fourteen_bhcs_linked_to_one_rhu(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('rural_health_units', 1);
        $this->assertDatabaseCount('barangay_health_centers', 14);
        $rhu = RuralHealthUnit::sole();
        $this->assertSame('Rural Health Unit Bulakan', $rhu->name);
        $this->assertSame('active', $rhu->status);
        $this->assertSame([
            'Bagumbayan', 'Balubad', 'Bambang', 'Matungao', 'Maysantol',
            'Perez', 'Pitpitan', 'San Francisco', 'San Jose (Poblacion)',
            'San Nicolas', 'Santa Ana', 'Santa Ines', 'Taliptip', 'Tibig',
        ], BarangayHealthCenter::orderBy('barangay')->pluck('barangay')->all());

        foreach (BarangayHealthCenter::all() as $bhc) {
            $this->assertSame($bhc->barangay.' Health Center', $bhc->name);
            $this->assertSame($bhc->barangay.', Bulakan, Bulacan', $bhc->address);
            $this->assertSame($rhu->id, $bhc->rural_health_unit_id);
            $this->assertSame('active', $bhc->status);
        }
    }

    public function test_reruns_preserve_ids_edited_details_assignments_and_timestamps(): void
    {
        $this->seed(DatabaseSeeder::class);
        $alternative = RuralHealthUnit::create(['name' => 'Alternative RHU']);
        RuralHealthUnit::where('name', 'Rural Health Unit Bulakan')->firstOrFail()->update([
            'address' => 'Admin-maintained RHU address',
            'contact_information' => '09170000000',
            'status' => 'inactive',
        ]);
        BarangayHealthCenter::where('barangay', 'Pitpitan')->firstOrFail()->update([
            'name' => 'Renamed Pitpitan Clinic',
            'address' => null,
            'contact_information' => '09170000001',
            'status' => 'inactive',
            'rural_health_unit_id' => $alternative->id,
        ]);
        BarangayHealthCenter::where('barangay', 'Bambang')->update(['rural_health_unit_id' => null]);
        $before = $this->facilityRows();

        $this->travel(1)->days();
        $this->seed(DatabaseSeeder::class);
        $this->assertSame($before, $this->facilityRows());
        $this->seed(FacilitySeeder::class);

        $this->assertSame($before, $this->facilityRows());
    }

    public function test_partial_setup_adds_only_missing_facilities(): void
    {
        $rhu = RuralHealthUnit::create([
            'name' => 'Rural Health Unit Bulakan',
            'status' => 'inactive',
            'address' => 'Existing address',
        ]);
        $existing = BarangayHealthCenter::create([
            'name' => 'Pitpitan Community Clinic',
            'barangay' => 'Pitpitan',
            'status' => 'inactive',
            'rural_health_unit_id' => null,
        ]);
        $unrelated = BarangayHealthCenter::create(['name' => 'Unrelated Clinic', 'barangay' => 'Elsewhere']);
        $existingRow = $existing->refresh()->getRawOriginal();
        $rhuRow = $rhu->refresh()->getRawOriginal();

        $this->seed(FacilitySeeder::class);

        $this->assertDatabaseCount('barangay_health_centers', 15);
        $this->assertDatabaseCount('rural_health_units', 1);
        $this->assertSame($existingRow, $existing->fresh()->getRawOriginal());
        $this->assertSame($rhuRow, $rhu->fresh()->getRawOriginal());
        $this->assertModelExists($unrelated);
        $this->assertDatabaseHas('barangay_health_centers', [
            'barangay' => 'Bambang', 'rural_health_unit_id' => $rhu->id, 'status' => 'active',
        ]);
    }

    public function test_legacy_canonical_bhc_without_barangay_is_not_duplicated_or_updated(): void
    {
        $existing = BarangayHealthCenter::create(['name' => 'Pitpitan Health Center']);
        $before = $existing->refresh()->getRawOriginal();

        $this->seed(FacilitySeeder::class);

        $this->assertDatabaseCount('barangay_health_centers', 14);
        $this->assertSame($before, $existing->fresh()->getRawOriginal());
    }

    public function test_missing_canonical_rhu_with_existing_rhu_aborts_without_duplicates(): void
    {
        RuralHealthUnit::create(['name' => 'Renamed Municipal RHU']);
        $before = $this->facilityRows();

        $this->assertSeedingAborts('default RHU');

        $this->assertSame($before, $this->facilityRows());
    }

    public function test_ambiguous_bhc_rolls_back_rhu_and_earlier_bhc_inserts(): void
    {
        BarangayHealthCenter::create(['name' => 'Pitpitan Health Center', 'barangay' => 'Pitpitan']);
        BarangayHealthCenter::create(['name' => 'Second Pitpitan Clinic', 'barangay' => 'Pitpitan']);
        $before = $this->facilityRows();

        $this->assertSeedingAborts('Pitpitan');

        $this->assertSame($before, $this->facilityRows());
    }

    public function test_canonical_name_with_conflicting_barangay_aborts_without_updates(): void
    {
        BarangayHealthCenter::create(['name' => 'Pitpitan Health Center', 'barangay' => 'Bambang']);
        $before = $this->facilityRows();

        $this->assertSeedingAborts('Pitpitan');

        $this->assertSame($before, $this->facilityRows());
    }

    private function assertSeedingAborts(string $message): void
    {
        try {
            $this->seed(FacilitySeeder::class);
            $this->fail('Conflicting facility identities must stop seeding.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString($message, $exception->getMessage());
        }
    }

    private function facilityRows(): array
    {
        return [
            'rhus' => DB::table('rural_health_units')->orderBy('id')->get()->map(fn ($row) => (array) $row)->all(),
            'bhcs' => DB::table('barangay_health_centers')->orderBy('id')->get()->map(fn ($row) => (array) $row)->all(),
        ];
    }
}
