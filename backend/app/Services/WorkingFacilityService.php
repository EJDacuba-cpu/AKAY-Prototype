<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;

class WorkingFacilityService
{
    public function available(User $user): array
    {
        if (! $user->isActive()) {
            return [];
        }
        $choices = [];
        $bhc = $user->getRawOriginal('barangay_health_center_id');
        $rhu = $user->getRawOriginal('rural_health_unit_id');
        if (($bhc !== null) xor ($rhu !== null)) {
            $home = $this->facility($bhc, $rhu);
            if ($home) {
                $choices[] = [...$home, 'key' => 'home', 'is_home' => true, 'permissions' => ActionPermissions::home($user)];
            }
        }
        if (! NurseAssignmentPolicy::eligible($user) || ! RuralHealthUnit::whereKey($rhu)->where('status', 'active')->exists()) {
            return $choices;
        }
        foreach ($user->facilityAssignments()->whereNull('revoked_at')->whereNotNull('barangay_health_center_id')->whereNull('rural_health_unit_id')->whereNotNull('starts_on')->whereDate('starts_on', '<=', today())
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', today()))->get() as $assignment) {
            $facility = $this->facility($assignment->barangay_health_center_id, $assignment->rural_health_unit_id);
            if ($facility) {
                $choices[] = [...$facility, 'key' => (string) $assignment->id, 'is_home' => false, 'permissions' => $assignment->permissions];
            }
        }

        return $choices;
    }

    public function select(User $user, ?string $key): void
    {
        $choices = $this->available($user);
        if ($key === null && count($choices) === 1) {
            $key = $choices[0]['key'];
        }
        $selected = collect($choices)->firstWhere('key', $key);
        abort_unless($selected, 403, 'Select a valid authorized duty location.');
        $user->workingFacility = $selected;
        $user->unsetRelation('barangayHealthCenter')->unsetRelation('ruralHealthUnit');
    }

    private function facility(mixed $bhc, mixed $rhu): ?array
    {
        if (! (($bhc !== null) xor ($rhu !== null))) {
            return null;
        }
        $model = $bhc !== null ? BarangayHealthCenter::class : RuralHealthUnit::class;
        $facility = $model::whereKey($bhc ?? $rhu)->where('status', 'active')->first();

        return $facility ? ['id' => $facility->id, 'name' => $facility->name, 'type' => $bhc !== null ? 'bhc' : 'rhu'] : null;
    }
}
