<?php

namespace App\Services;

use App\Models\User;

/**
 * Single source of staff-role rules. The frontend reads these through GET /staff-roles.
 * RHU entries are provisional until the RHU module is finished.
 */
class StaffRoles
{
    private const MIDWIFE_DEFAULTS = ['patients.register', 'consultations.encode', 'consultations.finalize', 'clinical.history', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'items.dispense', 'reports.view'];

    private const RHU_DEFAULTS = ['patients.register', 'clinical.history', 'rhu.manage', 'rhu.providers.manage', 'conditions.confirm', 'inventory.view', 'reports.view'];

    public const ROLES = [
        'midwife' => ['label' => 'Midwife', 'tier' => User::ROLE_BHC, 'licensed' => true, 'defaults' => self::MIDWIFE_DEFAULTS],
        'bhw' => ['label' => 'BHW', 'tier' => User::ROLE_BHC, 'licensed' => false, 'defaults' => ['patients.register']],
        'encoder' => ['label' => 'Encoder', 'tier' => User::ROLE_BHC, 'licensed' => false, 'defaults' => ['patients.register', 'consultations.encode', 'inventory.view']],
        'nurse' => ['label' => 'Nurse', 'tier' => User::ROLE_RHU, 'licensed' => true, 'defaults' => self::RHU_DEFAULTS],
        'doctor' => ['label' => 'Doctor', 'tier' => User::ROLE_RHU, 'licensed' => true, 'defaults' => self::RHU_DEFAULTS],
    ];

    /** Duties that work at each facility tier; the rest have no screen there. */
    public const AVAILABLE = [
        User::ROLE_BHC => ['patients.register', 'consultations.encode', 'consultations.finalize', 'clinical.history', 'clinical.background.update', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'inventory.manage', 'items.dispense', 'reports.view', 'families.view', 'families.manage'],
        User::ROLE_RHU => ['patients.register', 'clinical.history', 'inventory.view', 'reports.view', 'rhu.manage', 'rhu.providers.manage', 'conditions.confirm', 'families.view', 'families.manage'],
    ];

    public static function keys(): array
    {
        return array_keys(self::ROLES);
    }

    public static function label(?string $role): ?string
    {
        return self::ROLES[(string) $role]['label'] ?? null;
    }

    public static function allowedAt(string $role, ?string $tier): bool
    {
        return $tier !== null && (self::ROLES[(string) $role]['tier'] ?? null) === $tier;
    }

    public static function defaults(?string $role): array
    {
        return self::ROLES[(string) $role]['defaults'] ?? [];
    }

    public static function available(?string $tier): array
    {
        return self::AVAILABLE[(string) $tier] ?? [];
    }

    public static function isLicensed(?string $role): bool
    {
        return self::ROLES[(string) $role]['licensed'] ?? false;
    }

    /** Licensed duties held by a role that is not licensed to perform them. */
    public static function licensedGrants(?string $role, array $permissions): array
    {
        return self::isLicensed($role) ? [] : array_values(array_intersect($permissions, ActionPermissions::LICENSED));
    }

    /** Maps a legacy professional designation onto a staff role, or null when there is no match. */
    public static function fromDesignation(?string $designation): ?string
    {
        $key = strtolower(trim((string) $designation));

        return array_key_exists($key, self::ROLES) ? $key : null;
    }

    public static function forApi(): array
    {
        $roles = [];
        foreach (self::ROLES as $key => $role) {
            $roles[] = ['key' => $key, ...$role];
        }

        return ['roles' => $roles, 'available' => self::AVAILABLE];
    }
}
