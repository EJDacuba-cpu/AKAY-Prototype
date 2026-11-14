<?php

namespace App\Services;

use App\Models\User;

/** Structured prescription authority is narrower than consultations.finalize. */
final class PrescriptionClinicalAuthority
{
    public static function canAuthorize(?User $user): bool
    {
        return $user !== null
            && $user->isRhu()
            && $user->staff_role === 'doctor'
            && ActionPermissions::allows($user, 'conditions.confirm');
    }

    public static function ensureCanAuthorize(User $user): void
    {
        abort_unless(
            self::canAuthorize($user),
            403,
            'Only an RHU physician with condition-confirmation permission may authorize structured prescriptions.'
        );
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
    }

    /**
     * Per-collection attestation. The hash uses fixed clinical slots so key order
     * and a client-supplied authorization cannot change it. Users who fail
     * canAuthorize do not receive a stamp.
     *
     * @param  list<array<string, mixed>>  $prescriptions
     * @return array{physicianId: int|string|null, physicianName: string|null, ruralHealthUnitId: int|string|null, authorizedAt: string, prescriptionHash: string}|null
     */
    public function attestation(User $user, array $prescriptions): ?array
    {
        if (! self::canAuthorize($user)) {
            return null;
        }

        return [
            'physicianId' => $user->id,
            'physicianName' => $user->name,
            'ruralHealthUnitId' => $user->rural_health_unit_id,
            'authorizedAt' => now()->toISOString(),
            'prescriptionHash' => hash('sha256', json_encode(self::clinicalRows($prescriptions), JSON_THROW_ON_ERROR)),
        ];
    }

    /**
     * @param  array<string, mixed>  $monitoringData
     * @return array<string, mixed>
     */
    public function applyToMonitoringData(User $user, array $monitoringData): array
    {
        $prescriptions = $monitoringData['prescriptions'] ?? null;
        if (! is_array($prescriptions) || $prescriptions === []) {
            unset($monitoringData['prescriptionAuthorization']);

            return $monitoringData;
        }

        if (! self::canAuthorize($user)) {
            unset($monitoringData['prescriptionAuthorization']);
            $monitoringData['prescriptions'] = array_values(array_map(function ($item) {
                if (! is_array($item)) {
                    return $item;
                }
                unset($item['authorization']);

                return $item;
            }, $prescriptions));

            return $monitoringData;
        }

        $clean = array_values(array_map(function ($item) {
            if (! is_array($item)) {
                return $item;
            }

            return self::persistedClinical($item);
        }, $prescriptions));
        $attestation = $this->attestation($user, $clean);
        $monitoringData['prescriptions'] = array_map(function ($item) use ($attestation) {
            if (! is_array($item)) {
                return $item;
            }
            $item['authorization'] = $attestation;

            return $item;
        }, $clean);
        $monitoringData['prescriptionAuthorization'] = $attestation;

        return $monitoringData;
    }

    /**
     * Only the slots covered by the hash are durable. Quantity and unit are
     * kept when supplied; a TB case id is kept when the order needs one.
     *
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private static function persistedClinical(array $item): array
    {
        $diagnosisIds = is_array($item['diagnosisIds'] ?? null) ? $item['diagnosisIds'] : [];
        $serviceKeys = is_array($item['serviceKeys'] ?? null) ? $item['serviceKeys'] : [];
        $saved = [
            'id' => (string) ($item['id'] ?? ''),
            'diagnosisIds' => array_values(array_map(static fn ($id) => (string) $id, $diagnosisIds)),
            'medicineName' => (string) ($item['medicineName'] ?? ''),
            'strength' => (string) ($item['strength'] ?? ''),
            'dose' => (string) ($item['dose'] ?? ''),
            'route' => (string) ($item['route'] ?? ''),
            'frequency' => (string) ($item['frequency'] ?? ''),
            'duration' => (string) ($item['duration'] ?? ''),
            'instructions' => (string) ($item['instructions'] ?? ''),
        ];
        if ($serviceKeys !== []) {
            $saved['serviceKeys'] = array_values(array_map(static fn ($key) => (string) $key, $serviceKeys));
        }

        $quantity = $item['authorizedQuantity'] ?? null;
        if ($quantity !== null && $quantity !== '') {
            $saved['authorizedQuantity'] = is_numeric($quantity) ? (int) $quantity : $quantity;
        }
        $unit = (string) ($item['authorizedUnit'] ?? '');
        if ($unit !== '') {
            $saved['authorizedUnit'] = $unit;
        }

        $saved['source'] = (string) ($item['source'] ?? '');
        $tbCaseId = (string) ($item['tbCaseId'] ?? '');
        if ($tbCaseId !== '' || $saved['source'] === 'tb_form4b_ref') {
            $saved['tbCaseId'] = $tbCaseId;
        }

        return $saved;
    }

    /** @param  list<mixed>  $prescriptions */
    private static function clinicalRows(array $prescriptions): array
    {
        $rows = [];
        foreach (array_values($prescriptions) as $item) {
            if (! is_array($item)) {
                $rows[] = null;
                continue;
            }
            $quantity = $item['authorizedQuantity'] ?? null;
            if ($quantity === null || $quantity === '') {
                $quantity = null;
            } elseif (is_numeric($quantity)) {
                $quantity = (int) $quantity;
            }
            $diagnosisIds = is_array($item['diagnosisIds'] ?? null) ? $item['diagnosisIds'] : [];
            $serviceKeys = is_array($item['serviceKeys'] ?? null) ? $item['serviceKeys'] : [];

            $rows[] = [
                (string) ($item['id'] ?? ''),
                array_values(array_map(fn ($id) => (string) $id, $diagnosisIds)),
                array_values(array_map(fn ($key) => (string) $key, $serviceKeys)),
                (string) ($item['medicineName'] ?? ''),
                (string) ($item['strength'] ?? ''),
                (string) ($item['dose'] ?? ''),
                (string) ($item['route'] ?? ''),
                (string) ($item['frequency'] ?? ''),
                (string) ($item['duration'] ?? ''),
                (string) ($item['instructions'] ?? ''),
                $quantity,
                (string) ($item['authorizedUnit'] ?? ''),
                (string) ($item['source'] ?? ''),
                (string) ($item['tbCaseId'] ?? ''),
            ];
        }

        return $rows;
    }
}
