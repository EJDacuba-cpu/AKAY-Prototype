<?php

namespace App\Services;

use App\Models\User;

class ActionPermissions
{
    public const ALL = ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'inventory.manage', 'items.dispense', 'rhu.manage', 'reports.view'];

    public const PRESETS = [
        'clinical' => ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'reports.view'],
        'encoder' => ['patients.register', 'consultations.encode', 'inventory.view'],
        'inventory' => ['inventory.view', 'inventory.manage'],
        'rhu' => ['patients.register', 'clinical.history', 'rhu.manage', 'inventory.view', 'reports.view'],
    ];

    public static function home(User $user): array
    {
        if ($user->permissions !== null) {
            return $user->permissions;
        }

        // A historical BHW role does not establish a clinical designation.
        return match ($user->getRawOriginal('role')) {
            User::ROLE_BHW => self::PRESETS['encoder'],
            User::ROLE_RHU_STAFF => self::PRESETS['rhu'],
            default => [],
        };
    }

    public static function allows(User $user, string $permission): bool
    {
        return $user->isActive() && in_array($permission, $user->workingFacility['permissions'] ?? self::home($user), true);
    }

    public static function ensure(User $user, string $permission): void
    {
        abort_unless(self::allows($user, $permission), 403, 'Your current facility assignment does not permit this action.');
    }
}
