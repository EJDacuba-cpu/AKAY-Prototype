<?php

namespace App\Exceptions;

use App\Models\RhuProvider;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * REF-SLIP-05c (Decision A) - the BHW's preferred provider is unavailable while
 * other providers remain available.
 *
 * This warns; it does not block. REF-SLIP-05b makes the preference non-binding
 * and DOC-15 reserves assignment to the RHU, so hard-blocking here would turn a
 * preference into a requirement. Resubmitting with
 * acknowledged_unavailable_preference = true proceeds and records
 * preference_acknowledged_at as the durable REL-01 trace that the BHW was told.
 */
class PreferredProviderUnavailableException extends RuntimeException
{
    public const CODE = 'PREFERRED_PROVIDER_UNAVAILABLE';

    /**
     * @param  Collection<int, RhuProvider>  $alternatives
     */
    public function __construct(
        private readonly RhuProvider $provider,
        private readonly Collection $alternatives
    ) {
        parent::__construct(
            "{$provider->name} is currently unavailable at the receiving Rural Health Unit."
        );
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => self::CODE,
            'provider' => [
                'id' => $this->provider->id,
                'name' => $this->provider->name,
                'specialization' => $this->provider->specialization,
                'remarks' => $this->provider->remarks,
            ],
            'available_alternatives' => $this->alternatives
                ->map(fn (RhuProvider $provider): array => [
                    'id' => $provider->id,
                    'name' => $provider->name,
                    'specialization' => $provider->specialization,
                ])->values()->all(),
        ], 409);
    }
}
