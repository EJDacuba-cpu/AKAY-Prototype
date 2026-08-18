<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuProvider;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Relation;

class FacilityAccessService
{
    private const DENIED_MESSAGE = 'This resource is outside your assigned facility.';

    public function hasValidFacilityAssignment(User $user): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if ($user->isBhw()) {
            return $user->barangay_health_center_id !== null
                && $user->rural_health_unit_id === null
                && $user->barangayHealthCenter()
                    ->where('status', 'active')
                    ->exists();
        }

        if ($user->isRhuStaff()) {
            return $user->rural_health_unit_id !== null
                && $user->barangay_health_center_id === null
                && $user->ruralHealthUnit()
                    ->where('status', 'active')
                    ->exists();
        }

        return false;
    }

    public function ensureValidFacilityAssignment(User $user): void
    {
        abort_unless(
            $this->hasValidFacilityAssignment($user),
            403,
            'A valid active facility assignment is required for clinical access.'
        );
    }

    public function scopePatients(Builder|Relation $query, User $user): Builder|Relation
    {
        if ($user->isAdmin()) {
            return $query;
        }

        if (! $this->hasValidFacilityAssignment($user)) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->isBhw()) {
            return $query->where(
                'barangay_health_center_id',
                $user->barangay_health_center_id
            );
        }

        return $query->where(function (Builder $query) use ($user): void {
            $query->where('rural_health_unit_id', $user->rural_health_unit_id)
                ->orWhereHas('referrals', fn (Builder $referrals) => $referrals
                    ->where('rural_health_unit_id', $user->rural_health_unit_id));
        });
    }

    public function scopeHealthRecords(Builder|Relation $query, User $user): Builder|Relation
    {
        if ($user->isAdmin()) {
            return $query;
        }

        if (! $this->hasValidFacilityAssignment($user)) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->isBhw()) {
            return $query
                ->where('barangay_health_center_id', $user->barangay_health_center_id)
                ->whereHas('patient', fn (Builder $patients) => $patients
                    ->where('barangay_health_center_id', $user->barangay_health_center_id));
        }

        return $query
            ->where('rural_health_unit_id', $user->rural_health_unit_id)
            ->whereHas('patient', fn (Builder $patients) => $patients
                ->where('rural_health_unit_id', $user->rural_health_unit_id));
    }

    public function scopePatientHealthRecords(Builder|Relation $query, User $user): Builder|Relation
    {
        if ($user->isAdmin() || $user->isBhw()) {
            return $this->scopeHealthRecords($query, $user);
        }

        if (! $this->hasValidFacilityAssignment($user)) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function (Builder $query) use ($user): void {
            $query->where('rural_health_unit_id', $user->rural_health_unit_id)
                ->orWhereIn('id', Referral::query()
                    ->select('health_record_id')
                    ->where('rural_health_unit_id', $user->rural_health_unit_id)
                    ->whereColumn('referrals.patient_id', 'health_records.patient_id')
                    ->whereNotNull('health_record_id'));
        });
    }

    public function scopeReferrals(Builder|Relation $query, User $user): Builder|Relation
    {
        if ($user->isAdmin()) {
            return $query;
        }

        if (! $this->hasValidFacilityAssignment($user)) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->isBhw()) {
            return $query
                ->where('barangay_health_center_id', $user->barangay_health_center_id)
                ->whereHas('patient', fn (Builder $patients) => $patients
                    ->where('barangay_health_center_id', $user->barangay_health_center_id))
                ->where(function (Builder $referrals) use ($user): void {
                    $referrals->whereNull('health_record_id')
                        ->orWhereHas('healthRecord', fn (Builder $records) => $records
                            ->where('barangay_health_center_id', $user->barangay_health_center_id)
                            ->whereColumn('health_records.patient_id', 'referrals.patient_id'));
                });
        }

        return $query
            ->where('rural_health_unit_id', $user->rural_health_unit_id)
            ->whereHas('patient')
            ->where(function (Builder $referrals): void {
                $referrals->whereNull('health_record_id')
                    ->orWhereHas('healthRecord', fn (Builder $records) => $records
                        ->whereColumn('health_records.patient_id', 'referrals.patient_id'));
            });
    }

    public function scopeFollowUpTasks(Builder|Relation $query, User $user): Builder|Relation
    {
        if ($user->isAdmin()) {
            return $query;
        }

        if (! $user->isBhw() || ! $this->hasValidFacilityAssignment($user)) {
            return $query->whereRaw('1 = 0');
        }

        return $query
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->whereHas('patient', fn (Builder $patients) => $patients
                ->where('barangay_health_center_id', $user->barangay_health_center_id))
            ->whereHas('healthRecord', fn (Builder $records) => $records
                ->where('barangay_health_center_id', $user->barangay_health_center_id)
                ->whereColumn('health_records.patient_id', 'follow_up_tasks.patient_id'));
    }

    /**
     * DOC-01 / DOC-15 - provider roster visibility.
     *
     * RHU staff see their own roster. A BHW sees the roster of the RHU their
     * BHC is mapped to, read-only, because they must know whether a referral
     * can be submitted at all (DOC-14). Admin sees every roster but may not
     * write - USM-05/06 give admin authority over accounts, not clinical
     * rosters.
     */
    public function scopeRhuProviders(Builder|Relation $query, User $user): Builder|Relation
    {
        if ($user->isAdmin()) {
            return $query;
        }

        $ruralHealthUnitId = $this->resolveVisibleRuralHealthUnitId($user);

        if ($ruralHealthUnitId === null) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where('rural_health_unit_id', $ruralHealthUnitId);
    }

    /**
     * The RHU whose roster this user may see, or null if none.
     *
     * For a BHW this is resolved from their BHC's mapping rather than from the
     * user row: BHWs never carry a rural_health_unit_id of their own.
     */
    public function resolveVisibleRuralHealthUnitId(User $user): ?int
    {
        if (! $this->hasValidFacilityAssignment($user)) {
            return null;
        }

        if ($user->isRhuStaff()) {
            return (int) $user->rural_health_unit_id;
        }

        if ($user->isBhw()) {
            $mappedId = $user->barangayHealthCenter()
                ->where('status', 'active')
                ->value('rural_health_unit_id');

            return $mappedId === null ? null : (int) $mappedId;
        }

        return null;
    }

    /**
     * DOC-15 - only the owning RHU may change its own roster. Admin and BHW are
     * both denied write access here, deliberately and by the same rule.
     */
    public function authorizeProviderManagement(User $user, ?RhuProvider $provider = null): void
    {
        abort_unless(
            $user->isRhuStaff() && $this->hasValidFacilityAssignment($user),
            403,
            self::DENIED_MESSAGE
        );

        if ($provider === null) {
            return;
        }

        abort_unless(
            $this->sameAssignedId(
                $provider->rural_health_unit_id,
                $user->rural_health_unit_id
            ),
            403,
            self::DENIED_MESSAGE
        );
    }

    public function canAccessPatient(User $user, Patient $patient): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if (! $this->hasValidFacilityAssignment($user)) {
            return false;
        }

        if ($user->isBhw()) {
            return $this->sameAssignedId(
                $patient->barangay_health_center_id,
                $user->barangay_health_center_id
            );
        }

        return $this->sameAssignedId(
            $patient->rural_health_unit_id,
            $user->rural_health_unit_id
        ) || $patient->referrals()
            ->where('rural_health_unit_id', $user->rural_health_unit_id)
            ->exists();
    }

    public function canModifyPatient(User $user, Patient $patient): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if (! $this->hasValidFacilityAssignment($user)) {
            return false;
        }

        return ($user->isBhw() && $this->sameAssignedId(
            $patient->barangay_health_center_id,
            $user->barangay_health_center_id
        )) || ($user->isRhuStaff() && $this->sameAssignedId(
            $patient->rural_health_unit_id,
            $user->rural_health_unit_id
        ));
    }

    public function authorizePatient(User $user, Patient $patient): void
    {
        abort_unless($this->canAccessPatient($user, $patient), 403, self::DENIED_MESSAGE);
    }

    public function authorizePatientModification(User $user, Patient $patient): void
    {
        abort_unless($this->canModifyPatient($user, $patient), 403, self::DENIED_MESSAGE);
    }

    public function authorizeHealthRecord(User $user, HealthRecord $record): void
    {
        if ($user->isAdmin()) {
            return;
        }

        $record->loadMissing('patient');
        $allowed = $record->patient !== null
                && $this->hasValidFacilityAssignment($user)
                && (($user->isBhw() && $this->sameAssignedId(
                    $record->barangay_health_center_id,
                    $user->barangay_health_center_id
                ) && $this->sameAssignedId(
                    $record->patient->barangay_health_center_id,
                    $user->barangay_health_center_id
                )) || ($user->isRhuStaff() && (
                    ($this->sameAssignedId(
                        $record->rural_health_unit_id,
                        $user->rural_health_unit_id
                    ) && $this->sameAssignedId(
                        $record->patient->rural_health_unit_id,
                        $user->rural_health_unit_id
                    ))
                    // BHC-registered patients carry no rural_health_unit_id of their
                    // own, so a record referred to this RHU is authorized via the
                    // referrals link instead - same rule scopePatientHealthRecords()
                    // already uses for the patient's health-record history tab.
                    || Referral::query()
                        ->where('health_record_id', $record->id)
                        ->where('rural_health_unit_id', $user->rural_health_unit_id)
                        ->exists()
                )));

        abort_unless($allowed, 403, self::DENIED_MESSAGE);
    }

    public function authorizeReferral(User $user, Referral $referral): void
    {
        abort_unless($this->canAccessReferral($user, $referral), 403, self::DENIED_MESSAGE);
    }

    public function canAccessReferral(User $user, Referral $referral): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        $referral->loadMissing(['patient', 'healthRecord']);
        $relationshipsAreConsistent = $referral->patient !== null
            && ($referral->healthRecord === null
                || (int) $referral->healthRecord->patient_id === (int) $referral->patient_id);

        $allowed = $this->hasValidFacilityAssignment($user)
            && $relationshipsAreConsistent
            && (($user->isBhw()
                && $this->sameAssignedId(
                    $referral->barangay_health_center_id,
                    $user->barangay_health_center_id
                )
                && $this->sameAssignedId(
                    $referral->patient->barangay_health_center_id,
                    $user->barangay_health_center_id
                )
                && ($referral->healthRecord === null || $this->sameAssignedId(
                    $referral->healthRecord->barangay_health_center_id,
                    $user->barangay_health_center_id
                )))
            || ($user->isRhuStaff() && $this->sameAssignedId(
                $referral->rural_health_unit_id,
                $user->rural_health_unit_id
            )));

        return $allowed;
    }

    public function authorizeRhuReferralAction(User $user, Referral $referral): void
    {
        abort_unless($user->isRhuStaff(), 403, self::DENIED_MESSAGE);
        $this->authorizeReferral($user, $referral);
    }

    public function authorizeFollowUpTask(User $user, FollowUpTask $task): void
    {
        if ($user->isAdmin()) {
            return;
        }

        $task->loadMissing(['patient', 'healthRecord']);
        $allowed = $user->isBhw()
            && $this->hasValidFacilityAssignment($user)
            && $task->patient !== null
            && $task->healthRecord !== null
            && (int) $task->patient_id === (int) $task->healthRecord->patient_id
            && $this->sameAssignedId(
                $task->barangay_health_center_id,
                $user->barangay_health_center_id
            )
            && $this->sameAssignedId(
                $task->patient->barangay_health_center_id,
                $user->barangay_health_center_id
            )
            && $this->sameAssignedId(
                $task->healthRecord->barangay_health_center_id,
                $user->barangay_health_center_id
            );

        abort_unless($allowed, 403, self::DENIED_MESSAGE);
    }

    public function authorizeMedicine(User $user, Medicine $medicine): void
    {
        $allowed = $user->isAdmin()
            || ($user->isBhw()
                && $this->hasValidFacilityAssignment($user)
                && $medicine->rural_health_unit_id === null
                && $this->sameAssignedId(
                    $medicine->barangay_health_center_id,
                    $user->barangay_health_center_id
                ))
            || ($user->isRhuStaff()
                && $this->hasValidFacilityAssignment($user)
                && $this->sameAssignedId(
                    $medicine->rural_health_unit_id,
                    $user->rural_health_unit_id
                ));

        abort_unless($allowed, 403, self::DENIED_MESSAGE);
    }

    public function canDispenseMedicine(
        User $user,
        Medicine $medicine,
        HealthRecord $record
    ): bool {
        return $this->canDispenseMedicineForBarangayHealthCenter(
            $user,
            $medicine,
            $record->barangay_health_center_id
        );
    }

    public function canDispenseMedicineForBarangayHealthCenter(
        User $user,
        Medicine $medicine,
        mixed $barangayHealthCenterId
    ): bool {
        return $user->isBhw()
            && $this->hasValidFacilityAssignment($user)
            && $medicine->rural_health_unit_id === null
            && $this->sameAssignedId(
                $barangayHealthCenterId,
                $user->barangay_health_center_id
            )
            && $this->sameAssignedId(
                $medicine->barangay_health_center_id,
                $user->barangay_health_center_id
            );
    }

    private function sameAssignedId(mixed $resourceId, mixed $assignedId): bool
    {
        return $resourceId !== null
            && $assignedId !== null
            && (int) $resourceId === (int) $assignedId;
    }
}
