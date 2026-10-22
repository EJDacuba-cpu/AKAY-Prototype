<?php

namespace App\Services;

use App\Models\RhuProvider;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Keeps official RHU Doctor accounts on the assigned RHU roster.
 *
 * Identity (name, facility membership) comes from Admin-managed accounts.
 * Availability stays independently writable by authorized RHU staff on the
 * existing rhu_providers row. New, moved, and reactivated official rows start
 * Unavailable so the referral gate stays closed until RHU staff confirm duty.
 * Covering/unlinked roster rows are left in place and are never claimed by
 * matching names. Deactivation keeps the last availability on the hidden row.
 */
class RhuDoctorRosterService
{
    public const NAME_TAKEN = 'An active doctor with this name already exists in this RHU roster.';

    public const NAME_MANAGED = "This doctor's name is managed from the official account.";

    public const OFFICIAL_LOCKED = 'Official doctor records stay on the roster until the account is deactivated or reassigned.';

    public function syncFromAccount(
        User $user,
        User $actor,
        ?Request $request = null,
        ?AuditLogger $auditLogger = null
    ): void {
        $provider = RhuProvider::query()
            ->where('user_id', $user->id)
            ->lockForUpdate()
            ->first();

        if (! $this->belongsOnRoster($user)) {
            $this->leaveRoster($provider, $actor, $request, $auditLogger);

            return;
        }

        $ruralHealthUnitId = $this->homeRuralHealthUnitId($user);

        if ($provider) {
            $this->keepOnRoster($provider, $user, $actor, $ruralHealthUnitId, $request, $auditLogger);

            return;
        }

        $this->placeOnRoster($user, $actor, $ruralHealthUnitId, $request, $auditLogger);
    }

    private function belongsOnRoster(User $user): bool
    {
        return $user->status === User::STATUS_ACTIVE
            && ($user->getAttributes()['role'] ?? $user->role) === User::ROLE_RHU
            && $user->staff_role === 'doctor'
            && $this->homeRuralHealthUnitId($user) !== null;
    }

    private function homeRuralHealthUnitId(User $user): ?int
    {
        $id = $user->getAttributes()['rural_health_unit_id'] ?? null;

        return $id === null ? null : (int) $id;
    }

    private function placeOnRoster(
        User $user,
        User $actor,
        int $ruralHealthUnitId,
        ?Request $request,
        ?AuditLogger $auditLogger
    ): void {
        $provider = RhuProvider::create([
            'rural_health_unit_id' => $ruralHealthUnitId,
            'user_id' => $user->id,
            'name' => $user->name,
            'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
            'is_active' => true,
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
        ]);

        $this->audit(
            $request,
            $auditLogger,
            'provider_created',
            "Added provider {$provider->name} to the RHU roster."
        );
    }

    private function keepOnRoster(
        RhuProvider $provider,
        User $user,
        User $actor,
        int $ruralHealthUnitId,
        ?Request $request,
        ?AuditLogger $auditLogger
    ): void {
        $attributes = [];
        $moved = (int) $provider->rural_health_unit_id !== $ruralHealthUnitId;
        $returning = ! $provider->is_active;

        if ($provider->name !== $user->name) {
            $attributes['name'] = $user->name;
        }

        if ($moved) {
            $attributes['rural_health_unit_id'] = $ruralHealthUnitId;
        }

        if ($returning) {
            $attributes['is_active'] = true;
        }

        if ($moved || $returning) {
            $attributes['availability_status'] = RhuProvider::STATUS_UNAVAILABLE;
        }

        if ($attributes === []) {
            return;
        }

        $attributes['updated_by'] = $actor->id;
        $provider->update($attributes);

        $description = "Updated provider {$provider->name}.";
        if ($moved) {
            $description = "Moved provider {$provider->name} to another RHU and set availability to Unavailable.";
        } elseif ($returning) {
            $description = "Returned provider {$provider->name} to the RHU roster as Unavailable.";
        }

        $this->audit($request, $auditLogger, 'provider_updated', $description);
    }

    private function leaveRoster(
        ?RhuProvider $provider,
        User $actor,
        ?Request $request,
        ?AuditLogger $auditLogger
    ): void {
        if ($provider === null || ! $provider->is_active) {
            return;
        }

        $provider->update([
            'is_active' => false,
            'updated_by' => $actor->id,
        ]);

        $this->audit(
            $request,
            $auditLogger,
            'provider_deactivated',
            "Deactivated provider {$provider->name}."
        );
    }

    private function audit(
        ?Request $request,
        ?AuditLogger $auditLogger,
        string $action,
        string $description
    ): void {
        if ($request === null || $auditLogger === null) {
            return;
        }

        $auditLogger->log($request, $action, 'providers', $description);
    }
}
