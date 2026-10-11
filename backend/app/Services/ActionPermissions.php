<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

class ActionPermissions
{
    public const ALL = ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize', 'records.correct', 'followups.manage', 'referrals.submit', 'inventory.view', 'inventory.manage', 'items.dispense', 'rhu.manage', 'conditions.confirm', 'reports.view'];

    /** A write duty is unusable without the read duty for the same records (EnforceActionPermissions). */
    public const REQUIRES = [
        'consultations.finalize' => ['clinical.history'],
        'records.correct' => ['clinical.history'],
        'followups.manage' => ['clinical.history'],
        'referrals.submit' => ['clinical.history'],
        'inventory.manage' => ['inventory.view'],
    ];

    /** Licensed clinical acts. Any role may be granted them; StaffRoles::licensedGrants flags them for non-licensed roles. */
    public const LICENSED = ['consultations.finalize', 'records.correct', 'referrals.submit', 'conditions.confirm'];

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

        if ($user->staff_role !== null) {
            return StaffRoles::defaults($user->staff_role);
        }

        // An account without a role falls back to the most limited defaults of its facility tier.
        return match ($user->getRawOriginal('role')) {
            User::ROLE_BHW => StaffRoles::defaults('encoder'),
            User::ROLE_RHU_STAFF => StaffRoles::defaults('nurse'),
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
