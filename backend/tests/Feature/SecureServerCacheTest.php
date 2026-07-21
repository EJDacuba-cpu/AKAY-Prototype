<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AkayCacheService;
use App\Services\ReferralWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class SecureServerCacheTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private BarangayHealthCenter $bhcB;

    private User $bhwA;

    private User $bhwB;

    private User $rhuStaffA;

    private User $rhuStaffB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Cache RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Cache RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Cache BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'Cache BHC B',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->bhwA = $this->user('Cache BHW A', 'cache-bhw-a@example.test', User::ROLE_BHW, $this->bhcA->id);
        $this->bhwB = $this->user('Cache BHW B', 'cache-bhw-b@example.test', User::ROLE_BHW, $this->bhcB->id);
        $this->rhuStaffA = $this->user('Cache RHU A', 'cache-rhu-a@example.test', User::ROLE_RHU_STAFF, null, $this->rhuA->id);
        $this->rhuStaffB = $this->user('Cache RHU B', 'cache-rhu-b@example.test', User::ROLE_RHU_STAFF, null, $this->rhuB->id);
    }

    public function test_medicine_cache_records_miss_then_hit_with_identical_allowlisted_response(): void
    {
        $medicine = $this->medicine('Scoped Paracetamol', 12, $this->bhcA->id, null);

        DB::enableQueryLog();
        DB::flushQueryLog();
        $coldStartedAt = hrtime(true);
        $first = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines?per_page=25')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('Pragma', 'no-cache');
        $coldDurationMs = round((hrtime(true) - $coldStartedAt) / 1_000_000, 2);
        $coldQueries = count(DB::getQueryLog());

        DB::flushQueryLog();
        $warmStartedAt = hrtime(true);
        $second = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines?per_page=25')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT');
        $warmDurationMs = round((hrtime(true) - $warmStartedAt) / 1_000_000, 2);
        $warmQueries = count(DB::getQueryLog());

        if (getenv('AKAY_CACHE_BENCHMARK') === '1') {
            $invalidationStartedAt = hrtime(true);
            app(AkayCacheService::class)->invalidateBhcMedicineDisplay($this->bhcA->id);
            $invalidationDurationMs = round(
                (hrtime(true) - $invalidationStartedAt) / 1_000_000,
                2
            );
            fwrite(STDOUT, json_encode([
                'environment' => 'PHPUnit SQLite in-memory / array cache',
                'endpoint' => '/api/medicines?per_page=25',
                'cold_ms' => $coldDurationMs,
                'warm_ms' => $warmDurationMs,
                'cold_queries' => $coldQueries,
                'warm_queries' => $warmQueries,
                'ttl_seconds' => 20,
                'generation_invalidation_ms' => $invalidationDurationMs,
            ], JSON_THROW_ON_ERROR).PHP_EOL);
        }

        $this->assertSame($first->json('data'), $second->json('data'));
        $this->assertLessThan($coldQueries, $warmQueries);
        $this->assertSame($medicine->id, $second->json('data.data.0.id'));
        $this->assertSame([
            'id',
            'name',
            'category',
            'description',
            'quantity',
            'low_stock_threshold',
            'unit',
            'availability_status',
            'expiration_date',
            'rural_health_unit_id',
            'barangay_health_center_id',
            'created_at',
            'updated_at',
            'rural_health_unit',
            'barangay_health_center',
        ], array_keys($second->json('data.data.0')));
        $this->assertStringNotContainsString('max-age', (string) $second->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('public', (string) $second->headers->get('Cache-Control'));
    }

    public function test_role_facility_filter_and_pagination_cache_keys_do_not_collide(): void
    {
        $medicineA = $this->medicine('Alpha Cache Medicine', 8, $this->bhcA->id, null);
        $medicineB = $this->medicine('Beta Cache Medicine', 9, $this->bhcB->id, null);
        $rhuMedicine = $this->medicine('RHU Cache Medicine', 10, null, $this->rhuA->id);

        $aPageOne = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines?per_page=1&page=1')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');
        $aPageTwo = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines?per_page=1&page=2')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines?per_page=1&page=1')
            ->assertHeader('X-AKAY-Cache', 'HIT');

        $bhwB = $this->actingAs($this->bhwB, 'sanctum')
            ->getJson('/api/medicines?search=Beta')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');
        $rhuA = $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');
        $rhuB = $this->actingAs($this->rhuStaffB, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');

        $this->assertNotSame($aPageOne->json('data.data.0.id'), $aPageTwo->json('data.data.0.id'));
        $this->assertSame($medicineB->id, $bhwB->json('data.data.0.id'));
        $this->assertSame($rhuMedicine->id, $rhuA->json('data.data.0.id'));
        $this->assertSame([], $rhuB->json('data.data'));
        $this->assertNotContains($medicineB->id, collect($aPageOne->json('data.data'))->pluck('id')->all());
        $this->assertNotContains($medicineA->id, collect($rhuA->json('data.data'))->pluck('id')->all());
    }

    public function test_cache_keys_hash_sensitive_filters_and_cached_values_are_explicit_arrays(): void
    {
        $cache = app(AkayCacheService::class);
        $filters = [
            'search' => 'Patient Name patient@example.test diagnosis token-123',
            'category' => 'Basic Medicines',
        ];
        $safeValue = ['total_referrals' => 4, 'referrals_by_status' => ['Pending' => 4]];

        $result = $cache->rememberForUser(
            AkayCacheService::DOMAIN_REPORT_AGGREGATE,
            $this->bhwA,
            $filters,
            2,
            120,
            fn (): array => $safeValue
        );
        $key = $cache->buildKeyForUser(
            AkayCacheService::DOMAIN_REPORT_AGGREGATE,
            $this->bhwA,
            $filters,
            2
        );

        $this->assertSame($safeValue, $result);
        $this->assertSame($safeValue, Cache::get($key));
        $this->assertStringContainsString(':bhw:bhc:'.$this->bhcA->id.':', $key);
        foreach (['Patient Name', 'patient@example.test', 'diagnosis', 'token-123'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $key);
            $this->assertStringNotContainsString($forbidden, json_encode(Cache::get($key), JSON_THROW_ON_ERROR));
        }
    }

    public function test_successful_and_failed_stock_mutations_handle_invalidation_and_database_authority(): void
    {
        $medicineA = $this->medicine('Mutation Cache A', 10, $this->bhcA->id, null);
        $this->medicine('Mutation Cache B', 7, $this->bhcB->id, null);

        $this->primeMedicineCache($this->bhwA);
        $this->primeMedicineCache($this->bhwB);

        $medicineA->update(['quantity' => 1, 'availability_status' => 'Low Stock']);
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson("/api/medicines/{$medicineA->id}/adjust", [
                'action' => 'adjustment_out',
                'quantity' => 2,
                'reason' => 'Must use the locked database row',
            ])
            ->assertConflict();

        $this->assertSame(1, $medicineA->fresh()->quantity);
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT');

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson("/api/medicines/{$medicineA->id}/restock", [
                'quantity' => 2,
                'reason' => 'Committed cache invalidation test',
            ])
            ->assertOk()
            ->assertJsonPath('data.medicine.quantity', 3);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.data.0.quantity', 3);
        $this->actingAs($this->bhwB, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT');
    }

    public function test_official_dispensing_invalidates_bhc_display_after_commit(): void
    {
        $medicine = $this->medicine('Dispense Cache Medicine', 5, $this->bhcA->id, null);
        $patient = Patient::create([
            'first_name' => 'Cache',
            'last_name' => 'Dispense Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhcA->id,
        ]);
        $this->primeMedicineCache($this->bhwA);

        $this->actingAs($this->bhwA, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'dispensed_medicines' => [[
                    'medicine_id' => $medicine->id,
                    'quantity' => 2,
                ]],
            ])
            ->assertCreated();

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.data.0.quantity', 3);
    }

    public function test_report_cache_is_invalidated_by_committed_referral_for_affected_facilities_only(): void
    {
        $patient = Patient::create([
            'first_name' => 'Aggregate',
            'last_name' => 'Referral',
            'sex' => 'Male',
            'barangay_health_center_id' => $this->bhcA->id,
        ]);

        $this->primeReportCache($this->bhwA, '/api/reports/bhw');
        $this->primeReportCache($this->bhwB, '/api/reports/bhw');
        $this->primeReportCache($this->rhuStaffA, '/api/reports/rhu');

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $patient->id,
                'reason_for_referral' => 'Cache aggregate invalidation test.',
            ])
            ->assertCreated();

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/reports/bhw')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.total_referrals', 1);
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.total_referrals', 1);
        $this->actingAs($this->bhwB, 'sanctum')
            ->getJson('/api/reports/bhw')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT')
            ->assertJsonPath('data.total_referrals', 0);
    }

    public function test_rhu_medicine_and_patient_volume_mutations_invalidate_only_affected_report(): void
    {
        $medicine = $this->medicine('RHU Report Medicine', 0, null, $this->rhuA->id);
        $this->primeReportCache($this->rhuStaffA, '/api/reports/rhu');
        $this->primeReportCache($this->rhuStaffB, '/api/reports/rhu');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson("/api/medicines/{$medicine->id}/restock", [
                'quantity' => 4,
                'reason' => 'RHU report cache invalidation',
            ])
            ->assertOk();

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.medicine_availability.Low Stock', 1);
        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertHeader('X-AKAY-Cache', 'HIT');
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/rhu-patient-volumes', ['status' => 'High'])
            ->assertOk();
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.patient_volume.status', 'High');
    }

    public function test_referral_receive_feedback_and_no_show_each_invalidate_aggregate_cache(): void
    {
        $patient = Patient::create([
            'first_name' => 'Lifecycle',
            'last_name' => 'Cache Referral',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhcA->id,
        ]);
        $referralId = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $patient->id,
                'reason_for_referral' => 'Referral lifecycle cache test.',
            ])
            ->assertCreated()
            ->json('data.id');
        $this->primeReportCache($this->bhwA, '/api/reports/bhw');
        $this->primeReportCache($this->rhuStaffA, '/api/reports/rhu');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/referrals/{$referralId}/status", [
                'status' => Referral::STATUS_RECEIVED,
                'remarks' => 'Patient received for cache test.',
            ])
            ->assertOk();
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/reports/bhw')
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.referrals_by_status.Received', 1);
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertHeader('X-AKAY-Cache', 'MISS');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', [
                'referral_id' => $referralId,
                'rhu_diagnosis' => 'Cache-safe aggregate diagnosis.',
                'action_taken' => 'Assessment completed.',
            ])
            ->assertCreated();
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/reports/bhw')
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.completed_referrals', 1);
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertHeader('X-AKAY-Cache', 'MISS');

        $noShowId = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $patient->id,
                'reason_for_referral' => 'Overdue cache invalidation test.',
                'referral_datetime' => now()->subDay()->toISOString(),
            ])
            ->assertCreated()
            ->json('data.id');
        $this->primeReportCache($this->bhwA, '/api/reports/bhw');
        $this->assertTrue(app(ReferralWorkflowService::class)->markNoShow((int) $noShowId));
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/reports/bhw')
            ->assertHeader('X-AKAY-Cache', 'MISS')
            ->assertJsonPath('data.no_show_referrals', 1);
    }

    public function test_active_and_facility_middleware_reject_before_cache_lookup(): void
    {
        $this->medicine('Authorization Cache Medicine', 3, $this->bhcA->id, null);
        $this->primeMedicineCache($this->bhwA);
        $inactive = $this->user(
            'Inactive Cache User',
            'inactive-cache@example.test',
            User::ROLE_BHW,
            $this->bhcA->id,
            null,
            User::STATUS_INACTIVE
        );
        $unassigned = $this->user(
            'Unassigned Cache User',
            'unassigned-cache@example.test',
            User::ROLE_BHW
        );

        Cache::shouldReceive('get')->never();

        $this->actingAs($inactive, 'sanctum')->getJson('/api/medicines')->assertForbidden();
        $this->actingAs($unassigned, 'sanctum')->getJson('/api/medicines')->assertForbidden();
    }

    public function test_cache_get_failure_returns_authorized_database_result_without_details(): void
    {
        $medicine = $this->medicine('Read Failure Medicine', 6, $this->bhcA->id, null);
        Log::spy();
        Cache::shouldReceive('get')
            ->once()
            ->andThrow(new RuntimeException('secret-cache-host patient@example.test'));

        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'BYPASS')
            ->assertJsonPath('data.data.0.id', $medicine->id);

        $this->assertStringNotContainsString('secret-cache-host', $response->getContent());
        $this->assertStringNotContainsString('patient@example.test', $response->getContent());
        Log::shouldHaveReceived('warning')->withArgs(
            fn (string $message, array $context): bool => $message === 'AKAY server cache unavailable; using database authority.'
                && $context === [
                    'domain' => AkayCacheService::DOMAIN_MEDICINE_AVAILABILITY,
                    'operation' => 'generation-read',
                    'exception_type' => RuntimeException::class,
                ]
        )->once();
    }

    public function test_cache_put_failure_returns_database_result_without_details(): void
    {
        $medicine = $this->medicine('Write Failure Medicine', 6, $this->bhcA->id, null);
        Log::spy();
        Cache::shouldReceive('get')->times(3)->andReturn(1, 1, null);
        Cache::shouldReceive('put')
            ->once()
            ->andThrow(new RuntimeException('secret-cache-write patient@example.test'));

        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'BYPASS')
            ->assertJsonPath('data.data.0.id', $medicine->id);

        $this->assertStringNotContainsString('secret-cache-write', $response->getContent());
        $this->assertStringNotContainsString('patient@example.test', $response->getContent());
        Log::shouldHaveReceived('warning')->withArgs(
            fn (string $message, array $context): bool => $message === 'AKAY server cache unavailable; using database authority.'
                && $context === [
                    'domain' => AkayCacheService::DOMAIN_MEDICINE_AVAILABILITY,
                    'operation' => 'write',
                    'exception_type' => RuntimeException::class,
                ]
        )->once();
    }

    private function primeMedicineCache(User $user): void
    {
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/medicines')
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT');
    }

    private function primeReportCache(User $user, string $url): void
    {
        $this->actingAs($user, 'sanctum')
            ->getJson($url)
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'MISS');
        $this->actingAs($user, 'sanctum')
            ->getJson($url)
            ->assertOk()
            ->assertHeader('X-AKAY-Cache', 'HIT');
    }

    private function medicine(
        string $name,
        int $quantity,
        ?int $bhcId,
        ?int $rhuId
    ): Medicine {
        return Medicine::create([
            'name' => $name,
            'category' => 'Basic Medicines',
            'quantity' => $quantity,
            'low_stock_threshold' => 5,
            'unit' => 'tablets',
            'availability_status' => $quantity <= 5 ? 'Low Stock' : 'Available',
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
            'created_by' => $bhcId === null ? $this->rhuStaffA->id : $this->bhwA->id,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null,
        string $status = User::STATUS_ACTIVE
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => $status,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
