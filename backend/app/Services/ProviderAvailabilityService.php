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
        if ($providers->isNotEmpty() && ! $providers->first()->relationLoaded('unavailability')) {
            $providers->load('unavailability');
        }

        $active = $providers
            ->where('is_active', true)
            ->filter(fn (RhuProvider $provider): bool => $provider->user_id !== null);
        $availableCount = $active
            ->filter(fn (RhuProvider $provider): bool => $provider->isEffectivelyAvailable())
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
            'providers' => $active->values()
                ->map(fn (RhuProvider $provider): array => $provider->toPublicAvailabilityArray())
                ->all(),
        ];
    }

    /**
     * Authoritative count for the DOC-14 gate, read straight from the table.
     */
    public function availableCountForRhu(int $ruralHealthUnitId): int
    {
        return RhuProvider::query()
            ->where('rural_health_unit_id', $ruralHealthUnitId)
            ->eligibleRoster()
            ->with('unavailability')
            ->get()
            ->filter(fn (RhuProvider $provider): bool => $provider->isEffectivelyAvailable())
            ->count();
    }
}
