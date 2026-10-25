<?php

namespace App\Services;

use App\Models\HealthRecord;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\Validator;

class PrenatalEnrollment
{
    public const INTENT_ENROLL = 'enroll';

    public const INTENT_CONTINUE = 'continue';

    public const STATUS_PRENATAL = 'Prenatal';

    public const STATUS_POSTPARTUM = 'Postpartum';

    public const STATUS_COMPLETED = 'Completed';

    public const POSTPARTUM_WINDOW_DAYS = 42;

    public static function isMaternalRecord(HealthRecord $record): bool
    {
        $programs = $record->monitoring_data['selectedPrograms'] ?? null;
        if (is_array($programs)) {
            return in_array('Maternal', $programs, true);
        }

        $category = strtolower(trim((string) $record->category));

        return str_contains($category, 'maternal') || str_contains($category, 'prenatal');
    }

    public static function maternalRecordsFor(int $patientId): Collection
    {
        return HealthRecord::query()
            ->where('patient_id', $patientId)
            ->orderBy('date_recorded')
            ->orderBy('id')
            ->get()
            ->filter(fn (HealthRecord $record) => self::isMaternalRecord($record))
            ->values();
    }

    /**
     * @return array{status: ?string, enrolled: bool, latest: ?HealthRecord}
     */
    public static function stateFor(int $patientId, ?Carbon $today = null): array
    {
        $records = self::maternalRecordsFor($patientId);
        if ($records->isEmpty()) {
            return ['status' => null, 'enrolled' => false, 'latest' => null];
        }

        $status = self::statusFromRecords($records, $today ?? now());

        return [
            'status' => $status,
            'enrolled' => in_array($status, [self::STATUS_PRENATAL, self::STATUS_POSTPARTUM], true),
            'latest' => $records->last(),
        ];
    }

    public static function validateRhuIntent(Validator $validator, int $patientId, mixed $intent, mixed $lmp): void
    {
        if (! in_array($intent, [self::INTENT_ENROLL, self::INTENT_CONTINUE], true)) {
            $validator->errors()->add(
                'monitoring_data.prenatalIntent',
                'Say whether this visit enrolls the patient in prenatal care or continues an existing enrollment.'
            );

            return;
        }

        $state = self::stateFor($patientId);
        if ($intent === self::INTENT_ENROLL && $state['enrolled']) {
            $validator->errors()->add(
                'monitoring_data.prenatalIntent',
                'This patient already has active prenatal care. Continue the existing enrollment instead of starting another.'
            );
        }
        if ($intent === self::INTENT_CONTINUE && ! $state['enrolled']) {
            $validator->errors()->add(
                'monitoring_data.prenatalIntent',
                'This patient is not enrolled in prenatal care. Enroll first.'
            );
        }
        if ($intent === self::INTENT_ENROLL && blank($lmp)) {
            $validator->errors()->add(
                'maternal_data.lmp',
                'Record the last menstrual period to enroll in prenatal care.'
            );
        }
    }

    public static function statusFromRecords(Collection $records, Carbon $today): string
    {
        $deliveryDate = null;
        $postpartumVisitWithoutDelivery = null;

        foreach ($records as $record) {
            $data = is_array($record->maternal_data) ? $record->maternal_data : [];
            $services = $record->monitoring_data['visitPurpose']['services']
                ?? $record->monitoring_data['visitPurpose']['Services']
                ?? [];
            $services = is_array($services) ? $services : [];
            $recordDate = $record->date_recorded ? Carbon::parse($record->date_recorded) : null;
            $recordDelivery = self::toDate($data['deliveryDate'] ?? $data['delivery_date'] ?? null);
            $isPostpartumVisit = in_array('Postpartum', $services, true);
            $isPrenatalVisit = in_array('Prenatal', $services, true) || $services === [];

            if ($deliveryDate && $isPrenatalVisit && ! $isPostpartumVisit && $recordDate) {
                $windowEnd = $deliveryDate->copy()->addDays(self::POSTPARTUM_WINDOW_DAYS);
                if ($recordDate->gt($windowEnd)) {
                    $deliveryDate = null;
                    $postpartumVisitWithoutDelivery = null;
                }
            }

            if ($recordDelivery) {
                $deliveryDate = $recordDelivery;
                $postpartumVisitWithoutDelivery = null;
            } elseif ($isPostpartumVisit) {
                $postpartumVisitWithoutDelivery = $record;
            }
        }

        if ($deliveryDate) {
            $windowEnd = $deliveryDate->copy()->addDays(self::POSTPARTUM_WINDOW_DAYS);

            return $today->gt($windowEnd) ? self::STATUS_COMPLETED : self::STATUS_POSTPARTUM;
        }

        if ($postpartumVisitWithoutDelivery) {
            return self::STATUS_POSTPARTUM;
        }

        return self::STATUS_PRENATAL;
    }

    private static function toDate(mixed $value): ?Carbon
    {
        if (! $value) {
            return null;
        }
        try {
            return Carbon::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }
}
