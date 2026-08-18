<?php

namespace App\Services;

use App\Exceptions\PreferredProviderUnavailableException;
use App\Exceptions\ReferralSubmissionBlockedException;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;
use Illuminate\Support\Collection;

/**
 * The single submission gate for both referral-creating paths (plan 3.5).
 *
 * Two DISTINCT rules, checked in this order:
 *
 *   1. DOC-14 - hard block when the receiving RHU has zero available
 *      providers. Unconditional: it fires whether or not a preference was
 *      selected, applies identically to Routine and Priority (URG-05), and no
 *      acknowledgment flag can bypass it.
 *
 *   2. REF-SLIP-05c (Decision A) - warn, then allow, when the *selected*
 *      provider is unavailable while others remain available.
 *
 * Keeping them independent matters: a zero-provider RHU must block even when
 * the BHW picked nobody, and an acknowledged preference must never satisfy
 * rule 1.
 *
 * This runs inside the caller's write transaction so the count is authoritative
 * at write time. Availability is live - a BHW may load the form with two
 * providers free and submit minutes later - so checking only at page load would
 * make DOC-14 advisory in practice.
 */
class ReferralSubmissionGate
{
    public function __construct(
        private readonly ProviderAvailabilityService $availability
    ) {
    }

    /**
     * @return array<string, mixed> columns to merge into the new referral
     */
    public function assertCanSubmit(RuralHealthUnit $rhu, array $data): array
    {
        $providers = RhuProvider::query()
            ->where('rural_health_unit_id', $rhu->id)
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        $available = $providers->where(
            'availability_status',
            RhuProvider::STATUS_AVAILABLE
        );

        // --- Rule 1: DOC-14, unconditional ---------------------------------
        if ($available->isEmpty()) {
            throw ReferralSubmissionBlockedException::noProviderAvailable();
        }

        $snapshot = [
            'availability_snapshot' => $this->availability->summarize($providers, (int) $rhu->id),
            'preferred_provider_id' => null,
            'preferred_provider_snapshot' => null,
            'preference_acknowledged_at' => null,
        ];

        $preferredId = $data['preferred_provider_id'] ?? null;

        if (blank($preferredId)) {
            return $snapshot;
        }

        // --- Rule 2: REF-SLIP-05c, warn and continue -----------------------
        $preferred = $providers->firstWhere('id', (int) $preferredId);

        if ($preferred === null) {
            throw ReferralSubmissionBlockedException::preferredProviderInvalid();
        }

        $acknowledged = ($data['acknowledged_unavailable_preference'] ?? false) === true;

        if (! $preferred->isAvailable() && ! $acknowledged) {
            throw new PreferredProviderUnavailableException(
                $preferred,
                $this->alternatives($available, $preferred)
            );
        }

        $snapshot['preferred_provider_id'] = $preferred->id;
        $snapshot['preferred_provider_snapshot'] = [
            'id' => $preferred->id,
            'name' => $preferred->name,
            'specialization' => $preferred->specialization,
            'availability_status' => $preferred->availability_status,
            'remarks' => $preferred->remarks,
        ];

        // REL-01 - the durable server-side trace that the BHW was warned and
        // chose to continue. A UI-only warning would leave no such record.
        if (! $preferred->isAvailable() && $acknowledged) {
            $snapshot['preference_acknowledged_at'] = now();
        }

        // Kept in sync so the referral detail screens and print slip, which
        // read the legacy string column, keep working unchanged.
        $snapshot['preferred_doctor'] = $preferred->name;

        return $snapshot;
    }

    /**
     * @param  Collection<int, RhuProvider>  $available
     * @return Collection<int, RhuProvider>
     */
    private function alternatives(Collection $available, RhuProvider $preferred): Collection
    {
        return $available->reject(
            fn (RhuProvider $provider): bool => $provider->id === $preferred->id
        );
    }
}
