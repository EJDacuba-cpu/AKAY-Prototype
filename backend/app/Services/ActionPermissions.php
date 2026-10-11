<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

class ActionPermissions
{
    public const ALL = ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'inventory.manage', 'items.dispense', 'rhu.manage', 'conditions.confirm', 'reports.view'];

    public const PRESETS = [
        'clinical' => ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'items.dispense', 'inventory.view', 'reports.view'],
        'encoder' => ['patients.register', 'consultations.encode', 'inventory.view'],
        'inventory' => ['inventory.view', 'inventory.manage'],
        'rhu' => ['patients.register', 'clinical.history', 'rhu.manage', 'conditions.confirm', 'inventory.view', 'reports.view'],
    ];

    /** A write duty is unusable without the read duty for the same records (EnforceActionPermissions). */
    public const REQUIRES = [
        'consultations.finalize' => ['clinical.history'],
        'records.correct' => ['clinical.history'],
        'followups.manage' => ['clinical.history'],
        'referrals.submit' => ['clinical.history'],
        'inventory.manage' => ['inventory.view'],
    ];

    /** Licensed clinical acts. Any designation may be granted them, but outside midwife/nurse/doctor they are critical overrides. */
    public const LICENSED = ['consultations.finalize', 'records.correct', 'referrals.submit', 'conditions.confirm'];

    public const SENSITIVE = ['clinical.history', 'inventory.manage', 'items.dispense', 'followups.manage', 'reports.view', 'rhu.manage'];

    public const RHU_ONLY = ['rhu.manage', 'conditions.confirm'];

    public const CLINICAL_DESIGNATIONS = ['midwife', 'nurse', 'doctor'];

    public static function isClinical(?string $designation): bool
    {
        return in_array(strtolower(trim((string) $designation)), self::CLINICAL_DESIGNATIONS, true);
    }

    /** Duties a designation normally holds at its home facility. Anything granted beyond this is an override. */
    public static function scope(?string $designation, ?string $role): array
    {
        if ($role === User::ROLE_ADMIN) {
            return [];
        }

        if (self::isClinical($designation)) {
            return array_values(array_filter(self::ALL, fn ($p) => $role === User::ROLE_RHU_STAFF || ! in_array($p, self::RHU_ONLY, true)));
        }

        return strtolower(trim((string) $designation)) === 'logistics' ? self::PRESETS['inventory'] : self::PRESETS['encoder'];
    }

    /** Granted duties outside the designation's scope. Each one needs the admin's explicit acknowledgement. */
    public static function overrides(array $permissions, ?string $designation, ?string $role): array
    {
        return array_values(array_diff($permissions, self::scope($designation, $role)));
    }

    public static function overrideTier(string $permission, ?string $designation): string
    {
        if (in_array($permission, self::LICENSED, true) && ! self::isClinical($designation)) {
            return 'critical';
        }

        return in_array($permission, [...self::SENSITIVE, ...self::LICENSED], true) ? 'sensitive' : 'override';
    }

    /** @return array<string, string[]> each granted duty mapped to the prerequisites it is missing */
    public static function missingRequirements(array $permissions): array
    {
        $missing = [];
        foreach ($permissions as $permission) {
            $absent = array_values(array_diff(self::REQUIRES[$permission] ?? [], $permissions));
            if ($absent) {
                $missing[$permission] = $absent;
            }
        }

        return $missing;
    }

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

    /** Active home and dated duty assignments are both eligible for a BHC queue. */
    public static function bhcRecipients(int $bhcId, string $permission): Collection
    {
        return User::where('status', User::STATUS_ACTIVE)
            ->where(fn ($query) => $query->where('barangay_health_center_id', $bhcId)
                ->orWhereHas('facilityAssignments', fn ($assignment) => $assignment->where('barangay_health_center_id', $bhcId)))
            ->with('facilityAssignments')
            ->get()->filter(function (User $user) use ($bhcId, $permission): bool {
                if ((int) $user->getRawOriginal('barangay_health_center_id') === $bhcId && in_array($permission, self::home($user), true)) {
                    return true;
                }

                return $user->facilityAssignments->contains(fn ($assignment) => (int) $assignment->barangay_health_center_id === $bhcId
                    && $assignment->revoked_at === null
                    && ($assignment->starts_on === null || $assignment->starts_on->startOfDay()->lte(today()))
                    && ($assignment->ends_on === null || $assignment->ends_on->startOfDay()->gte(today()))
                    && in_array($permission, $assignment->permissions ?? [], true));
            });
    }
}
