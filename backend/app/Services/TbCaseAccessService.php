<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

final class TbCaseAccessService
{
    public function __construct(private readonly FacilityAccessService $facilities) {}

    /** RHU clinical-history read of a source consultation owned by the caller's facility. */
    public function authorizeRhuSourceRead(User $user, HealthRecord $record): void
    {
        ActionPermissions::ensure($user, 'clinical.history');
        $this->facilities->ensureValidFacilityAssignment($user);
        abort_unless($user->isRhu() && (int) $record->rural_health_unit_id === (int) $user->rural_health_unit_id, 403, FacilityAccessService::DENIED_MESSAGE);
    }

    public function scope(Builder $query, User $user): Builder
    {
        if (! $user->isActive() || ! $this->facilities->hasValidFacilityAssignment($user)) {
            return $query->whereRaw('1 = 0');
        }
        if ($user->isAdmin()) {
            return $query;
        }
        if (! ActionPermissions::allows($user, 'clinical.history')) {
            return $query->whereRaw('1 = 0');
        }
        if ($user->isRhu()) {
            return $query->where('rural_health_unit_id', $user->rural_health_unit_id);
        }

        if ($user->isBhc()) {
            return $query->whereHas('endorsements', fn ($endorsements) => $endorsements->readableAtBhc((int) $user->barangay_health_center_id));
        }

        return $query->whereRaw('1 = 0');
    }

    public function forPatient(Builder $query, User $user, int $patientId): Builder
    {
        $query = $this->scope($query, $user);

        return $user->isBhc()
            ? $query->whereHas('endorsements', fn ($endorsements) => $endorsements
                ->readableAtBhc((int) $user->barangay_health_center_id)->where('linked_patient_id', $patientId))
            : $query->where('patient_id', $patientId);
    }

    public function authorizePatientList(User $user, Patient $patient): void
    {
        abort_unless($user->isActive(), 403);
        if (! $user->isAdmin()) {
            ActionPermissions::ensure($user, 'clinical.history');
        }
        $this->facilities->ensureValidFacilityAssignment($user);
        if ($user->isBhc()) {
            $this->facilities->authorizePatient($user, $patient);

            return;
        }
        // A walk-in case can belong to the RHU while the patient remains BHC-owned.
        $ownsCase = $this->scope(TbTreatmentCase::query(), $user)->where('patient_id', $patient->id)->exists();
        abort_unless($ownsCase || $this->facilities->canAccessPatient($user, $patient), 403, FacilityAccessService::DENIED_MESSAGE);
    }
}
