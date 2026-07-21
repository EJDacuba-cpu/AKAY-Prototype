<?php

namespace App\Services;

use App\Models\Medicine;
use App\Models\Referral;
use App\Models\User;
use Closure;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AkayCacheService
{
    public const DOMAIN_MEDICINE_AVAILABILITY = 'medicine-availability';

    public const DOMAIN_MEDICINE_RHU_FEED = 'medicine-rhu-feed';

    public const DOMAIN_REPORT_AGGREGATE = 'report-aggregate';

    private const KEY_PREFIX = 'akay:v1';

    private const STATUS_HIT = 'HIT';

    private const STATUS_MISS = 'MISS';

    private const STATUS_BYPASS = 'BYPASS';

    private string $lastStatus = self::STATUS_BYPASS;

    public function rememberForUser(
        string $domain,
        User $user,
        array $filters,
        int $page,
        int $ttlSeconds,
        Closure $resolver,
        array $dependencies = [],
        bool $preventStampede = false
    ): array {
        $startedAt = hrtime(true);
        $scope = $this->scopeForUser($user);

        if (! config('akay_cache.enabled', true) || $scope === null || $ttlSeconds <= 0) {
            return $this->resolveBypass($domain, $resolver, $startedAt);
        }

        $generation = $this->readGeneration($domain, $scope);
        if ($generation === null) {
            return $this->resolveBypass($domain, $resolver, $startedAt);
        }

        $dependencyGenerations = [];
        foreach ($dependencies as $dependency) {
            $dependencyGeneration = $this->readGeneration(
                (string) ($dependency['domain'] ?? ''),
                $dependency
            );
            if ($dependencyGeneration === null) {
                return $this->resolveBypass($domain, $resolver, $startedAt);
            }
            $dependencyGenerations[] = $dependencyGeneration;
        }

        $key = $this->buildKey(
            $domain,
            $scope,
            $generation,
            [...$filters, '_dependency_generations' => $dependencyGenerations],
            $page
        );

        try {
            $cached = Cache::get($key);
        } catch (Throwable $exception) {
            $this->logFailure($domain, 'read', $exception);

            return $this->resolveBypass($domain, $resolver, $startedAt);
        }

        if (is_array($cached)) {
            $this->lastStatus = self::STATUS_HIT;
            $this->logMetric($domain, self::STATUS_HIT, $startedAt);

            return $cached;
        }

        if ($preventStampede) {
            return $this->resolveWithLock(
                $domain,
                $key,
                $ttlSeconds,
                $resolver,
                $startedAt
            );
        }

        return $this->resolveAndStore($domain, $key, $ttlSeconds, $resolver, $startedAt);
    }

    private function resolveWithLock(
        string $domain,
        string $key,
        int $ttlSeconds,
        Closure $resolver,
        int $startedAt
    ): array {
        try {
            $lock = Cache::lock($key.':recompute', 5);
            $lock->block(1);
        } catch (LockTimeoutException) {
            return $this->resolveBypass($domain, $resolver, $startedAt);
        } catch (Throwable $exception) {
            $this->logFailure($domain, 'lock', $exception);

            return $this->resolveBypass($domain, $resolver, $startedAt);
        }

        try {
            try {
                $cached = Cache::get($key);
            } catch (Throwable $exception) {
                $this->logFailure($domain, 'locked-read', $exception);

                return $this->resolveBypass($domain, $resolver, $startedAt);
            }

            if (is_array($cached)) {
                $this->lastStatus = self::STATUS_HIT;
                $this->logMetric($domain, self::STATUS_HIT, $startedAt);

                return $cached;
            }

            return $this->resolveAndStore($domain, $key, $ttlSeconds, $resolver, $startedAt);
        } finally {
            try {
                $lock->release();
            } catch (Throwable $exception) {
                $this->logFailure($domain, 'lock-release', $exception);
            }
        }
    }

    private function resolveAndStore(
        string $domain,
        string $key,
        int $ttlSeconds,
        Closure $resolver,
        int $startedAt
    ): array {
        $value = $resolver();
        if (! is_array($value)) {
            $this->lastStatus = self::STATUS_BYPASS;
            $this->logMetric($domain, self::STATUS_BYPASS, $startedAt);

            return [];
        }

        try {
            $stored = Cache::put($key, $value, $ttlSeconds);
            $this->lastStatus = $stored === false
                ? self::STATUS_BYPASS
                : self::STATUS_MISS;
        } catch (Throwable $exception) {
            $this->lastStatus = self::STATUS_BYPASS;
            $this->logFailure($domain, 'write', $exception);
        }

        $this->logMetric($domain, $this->lastStatus, $startedAt);

        return $value;
    }

    public function medicineRhuFeedDependency(): array
    {
        return $this->scope(
            self::DOMAIN_MEDICINE_RHU_FEED,
            User::ROLE_BHW,
            'bhc',
            0
        );
    }

    public function invalidateMedicine(Medicine $medicine): void
    {
        if ($medicine->barangay_health_center_id !== null) {
            $this->invalidateScope($this->scope(
                self::DOMAIN_MEDICINE_AVAILABILITY,
                User::ROLE_BHW,
                'bhc',
                (int) $medicine->barangay_health_center_id
            ));

            return;
        }

        if ($medicine->rural_health_unit_id === null) {
            return;
        }

        $rhuId = (int) $medicine->rural_health_unit_id;
        $this->invalidateScope($this->scope(
            self::DOMAIN_MEDICINE_AVAILABILITY,
            User::ROLE_RHU_STAFF,
            'rhu',
            $rhuId
        ));
        $this->invalidateScope($this->medicineRhuFeedDependency());
        $this->invalidateRhuReport($rhuId);
    }

    public function invalidateBhcMedicineDisplay(int $barangayHealthCenterId): void
    {
        $this->invalidateScope($this->scope(
            self::DOMAIN_MEDICINE_AVAILABILITY,
            User::ROLE_BHW,
            'bhc',
            $barangayHealthCenterId
        ));
    }

    public function invalidateReferralReports(Referral $referral): void
    {
        if ($referral->barangay_health_center_id !== null) {
            $this->invalidateScope($this->scope(
                self::DOMAIN_REPORT_AGGREGATE,
                User::ROLE_BHW,
                'bhc',
                (int) $referral->barangay_health_center_id
            ));
        }

        if ($referral->rural_health_unit_id !== null) {
            $this->invalidateRhuReport((int) $referral->rural_health_unit_id);
        }
    }

    public function invalidateRhuReport(int $ruralHealthUnitId): void
    {
        $this->invalidateScope($this->scope(
            self::DOMAIN_REPORT_AGGREGATE,
            User::ROLE_RHU_STAFF,
            'rhu',
            $ruralHealthUnitId
        ));
    }

    public function invalidateScope(array $scope): void
    {
        try {
            $key = $this->generationKey((string) $scope['domain'], $scope);
            Cache::add($key, 1, now()->addYears(5));
            Cache::increment($key);
        } catch (Throwable $exception) {
            $this->logFailure((string) ($scope['domain'] ?? 'unknown'), 'invalidate', $exception);
        }
    }

    public function addDiagnosticHeader(Response $response): Response
    {
        if (app()->isLocal() || app()->runningUnitTests()) {
            $response->headers->set('X-AKAY-Cache', $this->lastStatus);
        }

        return $response;
    }

    public function buildKeyForUser(
        string $domain,
        User $user,
        array $filters = [],
        int $page = 1,
        int $generation = 1
    ): ?string {
        $scope = $this->scopeForUser($user);

        return $scope === null
            ? null
            : $this->buildKey(
                $domain,
                $scope,
                $generation,
                [...$filters, '_dependency_generations' => []],
                $page
            );
    }

    private function resolveBypass(string $domain, Closure $resolver, int $startedAt): array
    {
        $this->lastStatus = self::STATUS_BYPASS;
        $value = $resolver();
        $this->logMetric($domain, self::STATUS_BYPASS, $startedAt);

        return is_array($value) ? $value : [];
    }

    private function readGeneration(string $domain, array $scope): ?int
    {
        try {
            return max((int) Cache::get($this->generationKey($domain, $scope), 1), 1);
        } catch (Throwable $exception) {
            $this->logFailure($domain, 'generation-read', $exception);

            return null;
        }
    }

    private function scopeForUser(User $user): ?array
    {
        if ($user->isBhw()
            && $user->barangay_health_center_id !== null
            && $user->rural_health_unit_id === null) {
            return $this->scope(
                '',
                User::ROLE_BHW,
                'bhc',
                (int) $user->barangay_health_center_id
            );
        }

        if ($user->isRhuStaff()
            && $user->rural_health_unit_id !== null
            && $user->barangay_health_center_id === null) {
            return $this->scope(
                '',
                User::ROLE_RHU_STAFF,
                'rhu',
                (int) $user->rural_health_unit_id
            );
        }

        return null;
    }

    private function scope(
        string $domain,
        string $role,
        string $facilityType,
        int $facilityId
    ): array {
        return [
            'domain' => $domain,
            'role' => $role,
            'facility_type' => $facilityType,
            'facility_id' => $facilityId,
        ];
    }

    private function buildKey(
        string $domain,
        array $scope,
        int $generation,
        array $filters,
        int $page
    ): string {
        $normalizedFilters = $this->normalize($filters);
        $filtersHash = hash('sha256', json_encode(
            $normalizedFilters,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES
        ));

        return implode(':', [
            self::KEY_PREFIX,
            $domain,
            $scope['role'],
            $scope['facility_type'],
            $scope['facility_id'],
            'g'.$generation,
            'f'.$filtersHash,
            'p'.max($page, 1),
        ]);
    }

    private function generationKey(string $domain, array $scope): string
    {
        return implode(':', [
            self::KEY_PREFIX,
            'generation',
            $domain,
            $scope['role'],
            $scope['facility_type'],
            $scope['facility_id'],
        ]);
    }

    private function normalize(array $value): array
    {
        if (array_is_list($value)) {
            $normalized = array_map(
                fn (mixed $item): mixed => is_array($item) ? $this->normalize($item) : $item,
                $value
            );
            usort($normalized, fn (mixed $left, mixed $right): int => strcmp(
                json_encode($left, JSON_THROW_ON_ERROR),
                json_encode($right, JSON_THROW_ON_ERROR)
            ));

            return $normalized;
        }

        ksort($value);
        foreach ($value as $key => $item) {
            $value[$key] = is_array($item) ? $this->normalize($item) : $item;
        }

        return $value;
    }

    private function logMetric(string $domain, string $result, int $startedAt): void
    {
        if (! app()->isLocal() && ! app()->runningUnitTests()) {
            return;
        }

        Log::debug('AKAY server cache lookup.', [
            'domain' => $domain,
            'result' => $result,
            'duration_ms' => round((hrtime(true) - $startedAt) / 1_000_000, 2),
        ]);
    }

    private function logFailure(string $domain, string $operation, Throwable $exception): void
    {
        Log::warning('AKAY server cache unavailable; using database authority.', [
            'domain' => $domain,
            'operation' => $operation,
            'exception_type' => $exception::class,
        ]);
    }
}
