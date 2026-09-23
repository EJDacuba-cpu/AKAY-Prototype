<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;

class ReferralRoutingService
{
    public const MISSING_MAPPING_MESSAGE = 'This Barangay Health Center has no receiving Rural Health Unit configured. Please contact the administrator.';

    public const INACTIVE_DESTINATION_MESSAGE = 'The configured receiving Rural Health Unit is inactive. Please contact the administrator.';

    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function resolveAssignedBhc(User $user): BarangayHealthCenter
    {
        abort_unless($user->isBhw(), 403, 'Only BHW accounts can use BHC referral routing.');
        $this->facilityAccess->ensureValidFacilityAssignment($user);

        $bhc = BarangayHealthCenter::query()
            ->with('ruralHealthUnit')
            ->whereKey($user->barangay_health_center_id)
            ->where('status', 'active')
            ->when(\Illuminate\Support\Facades\DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())
            ->first();

        abort_unless($bhc, 422, 'The assigned Barangay Health Center is unavailable. Please contact the administrator.');

        return $bhc;
    }

    public function resolveReceivingRhuForBhw(User $user): RuralHealthUnit
    {
        return $this->resolveForBhw($user)['rhu'];
    }

    /**
     * @return array{bhc: BarangayHealthCenter, rhu: RuralHealthUnit}
     */
    public function resolveForBhw(User $user, ?int $destinationId = null): array
    {
        $bhc = $this->resolveAssignedBhc($user);

        abort_unless($bhc->rural_health_unit_id, 422, self::MISSING_MAPPING_MESSAGE);

        $destinationId ??= (int) $bhc->rural_health_unit_id;
        abort_unless($destinationId === (int) $bhc->rural_health_unit_id || $bhc->alternativeRhus()->whereKey($destinationId)->exists(), 422, 'The selected RHU is not an approved destination for this BHC.');
        $rhu = RuralHealthUnit::find($destinationId);
        abort_unless($rhu, 422, self::MISSING_MAPPING_MESSAGE);
        abort_unless($rhu->status === 'active', 422, self::INACTIVE_DESTINATION_MESSAGE);

        return ['bhc' => $bhc, 'rhu' => $rhu];
    }

    public function destinations(User $user): array
    {
        $bhc = $this->resolveAssignedBhc($user);
        $ids = $bhc->alternativeRhus()->pluck('rural_health_units.id')->push($bhc->rural_health_unit_id)->filter()->unique();
        return RuralHealthUnit::whereIn('id', $ids)->where('status', 'active')->orderBy('name')->get()->map(function ($rhu) use ($bhc) {
            $providers = \App\Models\RhuProvider::where('rural_health_unit_id', $rhu->id)->where('is_active', true)->get();
            return [...$rhu->only(['id', 'name', 'status']), 'is_default' => (int) $rhu->id === (int) $bhc->rural_health_unit_id,
                'availability' => app(ProviderAvailabilityService::class)->summarize($providers, (int) $rhu->id)];
        })->all();
    }
}
