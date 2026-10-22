<?php

namespace Tests\Feature;

use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PDOException;
use Tests\TestCase;

/**
 * Validates the official-doctor roster migration against PostgreSQL when a
 * throwaway database is configured. Refuses managed Supabase endpoints.
 *
 *   AKAY_PGSQL_TEST_HOST=127.0.0.1
 *   AKAY_PGSQL_TEST_PORT=5432
 *   AKAY_PGSQL_TEST_DATABASE=akay_roster_pg_test
 *   AKAY_PGSQL_TEST_USERNAME=postgres
 *   AKAY_PGSQL_TEST_PASSWORD=...
 */
class RhuDoctorRosterPostgresMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const CONNECTION = 'pgsql_roster_migration_test';

    private function migration(): object
    {
        return require database_path('migrations/2026_10_22_000002_add_user_id_to_rhu_providers.php');
    }

    public function test_sqlite_backfill_does_not_claim_covering_rows_by_name(): void
    {
        $migration = $this->migration();
        $migration->down();

        $rhuA = RuralHealthUnit::create(['name' => 'PG RHU A', 'status' => 'active']);
        $rhuB = RuralHealthUnit::create(['name' => 'PG RHU B', 'status' => 'active']);

        $coveringId = DB::table('rhu_providers')->insertGetId([
            'rural_health_unit_id' => $rhuA->id,
            'name' => 'Dr. Maria Santos',
            'availability_status' => RhuProvider::STATUS_AVAILABLE,
            'remarks' => 'Covering history',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $activeDoctor = $this->doctor('active.doctor@example.test', $rhuA->id, 'Dr. Maria Santos');
        $inactiveDoctor = $this->doctor('inactive.doctor@example.test', $rhuA->id, 'Dr. Inactive', 'inactive');
        $otherRhuDoctor = $this->doctor('other.rhu.doctor@example.test', $rhuB->id, 'Dr. Other');
        $this->staff('nurse@example.test', $rhuA->id, 'nurse');

        $migration->up();

        $covering = DB::table('rhu_providers')->find($coveringId);
        $duplicateFailed = false;
        try {
            DB::table('rhu_providers')->insert([
                'rural_health_unit_id' => $rhuA->id,
                'name' => 'Dr. Twin',
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('rhu_providers')->insert([
                'rural_health_unit_id' => $rhuA->id,
                'name' => 'Dr. Twin',
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException) {
            $duplicateFailed = true;
        }

        $this->assertTrue($duplicateFailed);
        $this->assertNull($covering->user_id);
        $this->assertSame(RhuProvider::STATUS_AVAILABLE, $covering->availability_status);
        $this->assertTrue(DB::table('rhu_providers')->where('user_id', $activeDoctor)->where('availability_status', RhuProvider::STATUS_UNAVAILABLE)->exists());
        $this->assertFalse(DB::table('rhu_providers')->where('user_id', $inactiveDoctor)->exists());
        $this->assertSame($rhuB->id, (int) DB::table('rhu_providers')->where('user_id', $otherRhuDoctor)->value('rural_health_unit_id'));
    }

    public function test_isolated_postgres_migration_and_backfill(): void
    {
        $this->bootIsolatedPostgres();
        $this->installLegacyRosterSchema();

        $migration = $this->migration();
        $this->assertFalse(Schema::connection(self::CONNECTION)->hasColumn('rhu_providers', 'user_id'));

        $rhuA = (int) DB::connection(self::CONNECTION)->table('rural_health_units')->insertGetId([
            'name' => 'PG RHU A', 'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $rhuB = (int) DB::connection(self::CONNECTION)->table('rural_health_units')->insertGetId([
            'name' => 'PG RHU B', 'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $coveringId = (int) DB::connection(self::CONNECTION)->table('rhu_providers')->insertGetId([
            'rural_health_unit_id' => $rhuA,
            'name' => 'Dr. Maria Santos',
            'availability_status' => 'Available',
            'remarks' => 'Covering history',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $activeDoctor = $this->pgDoctor('active.doctor@example.test', $rhuA, 'Dr. Maria Santos');
        $inactiveDoctor = $this->pgDoctor('inactive.doctor@example.test', $rhuA, 'Dr. Inactive', 'inactive');
        $otherRhuDoctor = $this->pgDoctor('other.rhu.doctor@example.test', $rhuB, 'Dr. Other');
        $this->pgDoctor('nurse@example.test', $rhuA, 'Nurse', 'active', 'nurse');

        $original = config('database.default');
        config(['database.default' => self::CONNECTION]);
        try {
            $migration->up();
        } finally {
            config(['database.default' => $original]);
        }

        $covering = DB::connection(self::CONNECTION)->table('rhu_providers')->find($coveringId);
        $indexes = DB::connection(self::CONNECTION)->select(
            'SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ? ORDER BY indexname',
            ['rhu_providers']
        );
        $rls = DB::connection(self::CONNECTION)->selectOne(
            "SELECT relrowsecurity FROM pg_class WHERE relname = 'rhu_providers'"
        );

        $duplicateFailed = false;
        $duplicateSqlState = null;
        try {
            DB::connection(self::CONNECTION)->table('rhu_providers')->insert([
                'rural_health_unit_id' => $rhuA,
                'name' => 'Dr. Twin',
                'availability_status' => 'Unavailable',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::connection(self::CONNECTION)->table('rhu_providers')->insert([
                'rural_health_unit_id' => $rhuA,
                'name' => 'Dr. Twin',
                'availability_status' => 'Unavailable',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException $exception) {
            $duplicateFailed = true;
            $duplicateSqlState = $exception->errorInfo[0] ?? $exception->getCode();
        }

        $indexNames = collect($indexes)->pluck('indexname');
        $this->assertTrue(Schema::connection(self::CONNECTION)->hasColumn('rhu_providers', 'user_id'));
        $this->assertTrue((bool) ($rls->relrowsecurity ?? false));
        $this->assertTrue($duplicateFailed);
        $this->assertSame('23505', (string) $duplicateSqlState);
        $this->assertTrue($indexNames->contains('rhu_providers_user_id_unique'));
        $this->assertTrue($indexNames->contains('rhu_providers_rhu_active_unlinked_name_unique'));
        $this->assertFalse($indexNames->contains('rhu_providers_rhu_active_name_unique'));
        $this->assertNull($covering->user_id);
        $this->assertSame('Available', $covering->availability_status);
        $this->assertSame('Covering history', $covering->remarks);
        $this->assertTrue(
            DB::connection(self::CONNECTION)->table('rhu_providers')
                ->where('user_id', $activeDoctor)
                ->where('availability_status', 'Unavailable')
                ->exists()
        );
        $this->assertFalse(DB::connection(self::CONNECTION)->table('rhu_providers')->where('user_id', $inactiveDoctor)->exists());
        $this->assertSame($rhuB, (int) DB::connection(self::CONNECTION)->table('rhu_providers')->where('user_id', $otherRhuDoctor)->value('rural_health_unit_id'));

        $spareDoctor = $this->pgDoctor('spare.doctor@example.test', $rhuB, 'Dr. Spare');
        DB::connection(self::CONNECTION)->table('rhu_providers')->insert([
            'rural_health_unit_id' => $rhuA,
            'user_id' => $spareDoctor,
            'name' => 'Dr. Maria Santos',
            'availability_status' => 'Unavailable',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertSame(
            3,
            DB::connection(self::CONNECTION)->table('rhu_providers')
                ->where('rural_health_unit_id', $rhuA)
                ->where('name', 'Dr. Maria Santos')
                ->where('is_active', true)
                ->count()
        );
    }

    private function bootIsolatedPostgres(): void
    {
        $host = (string) env('AKAY_PGSQL_TEST_HOST', '');
        if ($host === '') {
            $this->markTestSkipped('Set AKAY_PGSQL_TEST_* to a throwaway local PostgreSQL database.');
        }
        if (preg_match('/supabase|pooler\./i', $host)) {
            $this->fail('AKAY_PGSQL_TEST_HOST looks like managed Supabase. Isolated validation only.');
        }

        config([
            'database.connections.'.self::CONNECTION => [
                'driver' => 'pgsql',
                'host' => $host,
                'port' => env('AKAY_PGSQL_TEST_PORT', '5432'),
                'database' => env('AKAY_PGSQL_TEST_DATABASE', 'akay_roster_pg_test'),
                'username' => env('AKAY_PGSQL_TEST_USERNAME', 'postgres'),
                'password' => env('AKAY_PGSQL_TEST_PASSWORD', ''),
                'charset' => 'utf8',
                'prefix' => '',
                'prefix_indexes' => true,
                'search_path' => 'public',
                'sslmode' => env('AKAY_PGSQL_TEST_SSLMODE', 'prefer'),
            ],
        ]);

        try {
            DB::connection(self::CONNECTION)->getPdo();
        } catch (PDOException $exception) {
            $this->markTestSkipped('Isolated PostgreSQL is not reachable: '.$exception->getMessage());
        }
    }

    private function installLegacyRosterSchema(): void
    {
        $db = DB::connection(self::CONNECTION);
        $db->unprepared('DROP SCHEMA IF EXISTS public CASCADE');
        $db->unprepared('CREATE SCHEMA public');
        $db->unprepared('GRANT ALL ON SCHEMA public TO postgres');
        $db->unprepared('GRANT ALL ON SCHEMA public TO public');
        $db->unprepared(<<<'SQL'
CREATE TABLE rural_health_units (
    id bigserial PRIMARY KEY,
    name varchar NOT NULL,
    status varchar,
    created_at timestamp,
    updated_at timestamp
);
CREATE TABLE users (
    id bigserial PRIMARY KEY,
    name varchar NOT NULL,
    email varchar NOT NULL UNIQUE,
    password varchar NOT NULL,
    role varchar NOT NULL,
    status varchar NOT NULL,
    staff_role varchar,
    rural_health_unit_id bigint REFERENCES rural_health_units (id),
    created_by bigint,
    created_at timestamp,
    updated_at timestamp
);
CREATE TABLE rhu_providers (
    id bigserial PRIMARY KEY,
    rural_health_unit_id bigint NOT NULL REFERENCES rural_health_units (id),
    name varchar NOT NULL,
    specialization varchar,
    availability_status varchar NOT NULL DEFAULT 'Available',
    remarks text,
    expected_available_at timestamp,
    is_active boolean NOT NULL DEFAULT true,
    created_by bigint,
    updated_by bigint,
    created_at timestamp,
    updated_at timestamp
);
CREATE UNIQUE INDEX rhu_providers_rhu_active_name_unique
    ON rhu_providers (rural_health_unit_id, name) WHERE is_active = true;
ALTER TABLE rhu_providers
    ADD CONSTRAINT rhu_providers_availability_status_check
    CHECK (availability_status IN ('Available', 'Unavailable'));
ALTER TABLE rhu_providers ENABLE ROW LEVEL SECURITY;
SQL);
    }

    private function doctor(string $email, int $rhuId, string $name, string $status = 'active'): int
    {
        return $this->staff($email, $rhuId, 'doctor', $status, $name);
    }

    private function staff(string $email, int $rhuId, string $staffRole, string $status = 'active', ?string $name = null): int
    {
        return DB::table('users')->insertGetId([
            'name' => $name ?? $email,
            'email' => $email,
            'password' => 'x',
            'role' => User::ROLE_RHU,
            'staff_role' => $staffRole,
            'status' => $status,
            'rural_health_unit_id' => $rhuId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function pgDoctor(string $email, int $rhuId, string $name, string $status = 'active', string $staffRole = 'doctor'): int
    {
        return DB::connection(self::CONNECTION)->table('users')->insertGetId([
            'name' => $name,
            'email' => $email,
            'password' => 'x',
            'role' => User::ROLE_RHU,
            'staff_role' => $staffRole,
            'status' => $status,
            'rural_health_unit_id' => $rhuId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
