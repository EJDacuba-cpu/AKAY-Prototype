<?php

namespace App\Services;

use App\Models\User;

class NurseAssignmentPolicy
{
    public const DUTIES = ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'items.dispense', 'reports.view'];

    public static function eligible(User $user): bool
    {
        return $user->isActive() && $user->getRawOriginal('role') === User::ROLE_RHU_STAFF
            && strtolower(trim((string) $user->professional_designation)) === 'nurse'
            && $user->getRawOriginal('rural_health_unit_id') !== null
            && $user->getRawOriginal('barangay_health_center_id') === null;
    }
}
