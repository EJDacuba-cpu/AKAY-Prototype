<?php

namespace App\Services;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/** Read-only personnel snapshot; account roles are distinct from staff designations. */
class AdminDashboardPersonnelService
{
    public function summary(CarbonImmutable $now): array
    {
        // Include every registered facility, even if it has been deactivated.
        $bhcs = BarangayHealthCenter::orderBy('name')->orderBy('id')->get(['id', 'name', 'status'])->keyBy('id');
        $rhus = RuralHealthUnit::orderBy('name')->orderBy('id')->get(['id', 'name', 'status'])->keyBy('id');
        $today = $now->toDateString();
        $users = User::query()
            ->whereIn('role', [User::ROLE_BHC, User::ROLE_RHU])
            ->with(['facilityAssignments' => fn ($query) => $query
                ->whereNull('revoked_at')
                ->whereNotNull('barangay_health_center_id')
                ->whereNull('rural_health_unit_id')
                ->whereNotNull('starts_on')
                ->whereDate('starts_on', '<=', $today)
                ->where(fn ($dates) => $dates->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today))])
            ->orderBy('name')->orderBy('id')
            ->get(['id', 'name', 'role', 'staff_role', 'status', 'barangay_health_center_id', 'rural_health_unit_id']);

        $bhcPersonnel = [];
        $rhuPersonnel = [];
        $unassigned = 0;
        $assignedPersonnel = collect();

        foreach ($users as $user) {
            $bhcId = $user->getRawOriginal('barangay_health_center_id');
            $rhuId = $user->getRawOriginal('rural_health_unit_id');
            $home = null;
            $person = $user->only(['id', 'name', 'staff_role', 'status']);

            if ($user->role === User::ROLE_BHC && $bhcId !== null && $rhuId === null) {
                $home = $bhcs->get($bhcId);
                if ($home) {
                    $bhcPersonnel[$bhcId][$user->id] = $person;
                }
            } elseif ($user->role === User::ROLE_RHU && $rhuId !== null && $bhcId === null) {
                $home = $rhus->get($rhuId);
                if ($home) {
                    $rhuPersonnel[$rhuId][$user->id] = $person;
                }
            }

            // Same home-facility validity as FacilityAccessService, independent of
            // account activation: an inactive person can still have a valid assignment.
            if (! $home || $home->status !== 'active') {
                $unassigned++;
            } elseif ($user->staff_role !== null && StaffRoles::allowedAt($user->staff_role, $user->role)) {
                // The chart groups the six designations by their home facility tier.
                // Current BHC nurse duties do not change a nurse's RHU designation.
                $assignedPersonnel->put($user->id, $person);
            }

            // WorkingFacilityService permits additional BHC duty locations only
            // for RHU nurses with an active home RHU. Retain inactive accounts for
            // this staffing inventory, rather than hiding them as login access does.
            if ($user->role !== User::ROLE_RHU || $user->staff_role !== 'nurse'
                || ! $home || $home->status !== 'active') {
                continue;
            }

            foreach ($user->facilityAssignments as $assignment) {
                $bhc = $bhcs->get($assignment->barangay_health_center_id);
                if ($bhc && $bhc->status === 'active') {
                    // A person is counted once at a facility even with overlapping duties.
                    $bhcPersonnel[$bhc->id][$user->id] = $person;
                }
            }
        }

        return [
            'active' => $users->where('status', User::STATUS_ACTIVE)->count(),
            'inactive' => $users->where('status', User::STATUS_INACTIVE)->count(),
            'unassigned' => $unassigned,
            // Count accounts, not duty locations: include unassigned personnel
            // and avoid counting a nurse twice for RHU and BHC assignments.
            'by_role' => collect(StaffRoles::keys())->mapWithKeys(
                fn (string $role) => [$role => $users->where('staff_role', $role)->count()]
            )->all(),
            'assigned_by_role' => collect(StaffRoles::keys())->mapWithKeys(
                fn (string $role) => [$role => $assignedPersonnel->where('staff_role', $role)->count()]
            )->all(),
            'barangay_health_centers' => $this->rows($bhcs, $bhcPersonnel, ['midwife', 'encoder', 'bhw']),
            'rural_health_units' => $this->rows($rhus, $rhuPersonnel, ['intake_staff', 'doctor', 'nurse']),
        ];
    }

    private function rows(Collection $facilities, array $assigned, array $designations): array
    {
        return $facilities->map(function ($facility) use ($assigned, $designations): array {
            $people = collect(array_values($assigned[$facility->id] ?? []));
            $counts = $people->countBy('staff_role');
            $row = ['id' => $facility->id, 'name' => $facility->name];
            foreach ($designations as $designation) {
                $row[$designation] = $counts->get($designation, 0);
            }

            return [...$row, 'total' => $people->count(), 'personnel' => $people->all()];
        })->values()->all();
    }
}
