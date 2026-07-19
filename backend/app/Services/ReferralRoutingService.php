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
    public function resolveForBhw(User $user): array
    {
        $bhc = $this->resolveAssignedBhc($user);

        abort_unless($bhc->rural_health_unit_id, 422, self::MISSING_MAPPING_MESSAGE);

        $rhu = $bhc->ruralHealthUnit;
        abort_unless($rhu, 422, self::MISSING_MAPPING_MESSAGE);
        abort_unless($rhu->status === 'active', 422, self::INACTIVE_DESTINATION_MESSAGE);

        return ['bhc' => $bhc, 'rhu' => $rhu];
    }
}
