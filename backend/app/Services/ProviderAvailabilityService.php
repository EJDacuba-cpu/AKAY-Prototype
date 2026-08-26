<?php

namespace App\Services;

use App\Models\RhuProvider;
use Illuminate\Support\Collection;

/**
 * DOC-19 - the RHU-level aggregate, computed from the roster on every read.
 *
 * Deliberately not cached and not stored. This aggregate is the input to the
 * DOC-14 submission gate, so a stale value would either block a valid referral
 * (REL-01) or admit one that should have been blocked. The roster is
 * single-digit rows; counting is free.
 */
class ProviderAvailabilityService
{
    /**
     * @param  Collection<int, RhuProvider>  $providers
     */
    public function summarize(Collection $providers, ?int $ruralHealthUnitId): array
    {
        $active = $providers->where('is_active', true);
        $availableCount = $active
            ->where('availability_status', RhuProvider::STATUS_AVAILABLE)
            ->count();
        $totalCount = $active->count();

        return [
            'rural_health_unit_id' => $ruralHealthUnitId,
            'available_count' => $availableCount,
            'total_count' => $totalCount,
            'status' => $availableCount > 0
                ? RhuProvider::STATUS_AVAILABLE
                : RhuProvider::STATUS_UNAVAILABLE,
            // DOC-14 is computed server-side and never re-derived by the client.
            // Phase 3 enforces the same rule again at write time, because
            // availability is live and a form may be minutes stale.
            'can_submit_referral' => $availableCount > 0,
            'updated_at' => $active->max('updated_at'),
            'providers' => $active->values()->map(fn (RhuProvider $provider): array => [
                'id' => $provider->id,
                'name' => $provider->name,
                'specialization' => $provider->specialization,
                'availability_status' => $provider->availability_status,
                'remarks' => $provider->remarks,
                'expected_available_at' => $provider->expected_available_at,
                'updated_at' => $provider->updated_at,
            ])->all(),
        ];
    }

    /**
     * Authoritative count for the DOC-14 gate, read straight from the table.
     */
    public function availableCountForRhu(int $ruralHealthUnitId): int
    {
        return RhuProvider::query()
            ->where('rural_health_unit_id', $ruralHealthUnitId)
            ->where('is_active', true)
            ->where('availability_status', RhuProvider::STATUS_AVAILABLE)
            ->count();
    }
}
