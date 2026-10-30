<?php

namespace App\Services;

use App\Models\Household;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Exclusive BHC or RHU owner of a household, FSN counter, and its members. */
final class HouseholdOwner
{
    public const BHC = 'bhc';

    public const RHU = 'rhu';

    public function __construct(public readonly string $kind, public readonly int $id) {}

    public static function for(User $user, FacilityAccessService $access): self
    {
        if ($user->isBhc()) {
            $access->ensureValidFacilityAssignment($user);

            return new self(self::BHC, (int) $user->barangay_health_center_id);
        }
        if ($user->isRhu()) {
            $access->ensureValidFacilityAssignment($user);

            return new self(self::RHU, (int) $user->rural_health_unit_id);
        }
        abort(403, 'An active BHC or RHU assignment is required.');
    }

    public static function fromHousehold(Household $household): self
    {
        if ($household->barangay_health_center_id) {
            return new self(self::BHC, (int) $household->barangay_health_center_id);
        }

        return new self(self::RHU, (int) $household->rural_health_unit_id);
    }

    public function isBhc(): bool
    {
        return $this->kind === self::BHC;
    }

    public function lockClass(): int
    {
        return $this->isBhc() ? 72419 : 72420;
    }

    public function attributes(): array
    {
        return $this->isBhc()
            ? ['barangay_health_center_id' => $this->id, 'rural_health_unit_id' => null]
            : ['barangay_health_center_id' => null, 'rural_health_unit_id' => $this->id];
    }

    public function scopeHouseholds(Builder $query): Builder
    {
        return $this->isBhc()
            ? $query->where('barangay_health_center_id', $this->id)
            : $query->where('rural_health_unit_id', $this->id);
    }

    public function scopePatients(Builder $query): Builder
    {
        return $this->isBhc()
            ? $query->where('barangay_health_center_id', $this->id)->whereNull('rural_health_unit_id')
            : $query->where('rural_health_unit_id', $this->id)->whereNull('barangay_health_center_id');
    }

    public function scopeRelationships(Builder $query): Builder
    {
        return $this->isBhc()
            ? $query->where('barangay_health_center_id', $this->id)
            : $query->where('rural_health_unit_id', $this->id);
    }

    public function ownsPatient(Patient $patient): bool
    {
        return $this->isBhc()
            ? (int) $patient->barangay_health_center_id === $this->id && $patient->rural_health_unit_id === null
            : (int) $patient->rural_health_unit_id === $this->id && $patient->barangay_health_center_id === null;
    }
}
