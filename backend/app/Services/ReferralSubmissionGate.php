<?php

namespace App\Services;

use App\Exceptions\ReferralSubmissionBlockedException;
use App\Models\RhuProvider;
use App\Models\RuralHealthUnit;

/**
 * The single submission gate for both referral-creating paths (plan 3.5).
 *
 * DOC-14 - hard block when the receiving RHU has zero available providers.
 * Unconditional: it applies identically to Routine and Priority (URG-05) and
 * no flag can bypass it. The BHC never selects a provider; the receiving RHU
 * assigns one after reviewing the referral.
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
    public function assertCanSubmit(RuralHealthUnit $rhu): array
    {
        $providers = RhuProvider::query()
            ->where('rural_health_unit_id', $rhu->id)
            ->where('is_active', true)
            ->orderBy('name')
            ->when(\Illuminate\Support\Facades\DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())
            ->get();

        $available = $providers->where(
            'availability_status',
            RhuProvider::STATUS_AVAILABLE
        );

        if ($available->isEmpty()) {
            throw ReferralSubmissionBlockedException::noProviderAvailable();
        }

        return [
            'availability_snapshot' => $this->availability->summarize($providers, (int) $rhu->id),
        ];
    }
}
