<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\User;

/**
 * The authorized, facility-scoped patient detail shown by GET /patients/{id}
 * to non-admin users with clinical history access. PATCH /background returns
 * the same serialization so the client can use it as the saved authority.
 */
class PatientDetail
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function for(Patient $patient, User $user): Patient
    {
        $patient->load([
            'healthRecords' => fn ($query) => $this->facilityAccess
                ->scopePatientHealthRecords($query, $user),
            'referrals' => fn ($query) => $this->facilityAccess
                ->scopeReferrals($query, $user)
                ->with('feedback'),
            'mother' => fn ($query) => $this->facilityAccess
                ->scopePatients($query, $user),
            'father' => fn ($query) => $this->facilityAccess
                ->scopePatients($query, $user),
        ]);
        $patient->loadCount([
            'healthRecords' => fn ($query) => $this->facilityAccess
                ->scopePatientHealthRecords($query, $user),
            'referrals' => fn ($query) => $this->facilityAccess
                ->scopeReferrals($query, $user),
        ]);

        $serial = trim((string) $patient->family_serial_number);
        $others = $serial === '' && ! $patient->household_id
            ? collect()
            : $this->facilityAccess
                ->scopePatients(Patient::query(), $user)
                ->when($patient->household_id, fn ($query) => $query->where('household_id', $patient->household_id), fn ($query) => $query->whereNull('household_id')->where('family_serial_number', $serial))
                ->whereKeyNot($patient->id)
                ->get();
        $patient->setAttribute('household_environment', HouseholdEnvironment::latestFor($patient, $others));
        $patient->load('household');

        return $patient;
    }
}
