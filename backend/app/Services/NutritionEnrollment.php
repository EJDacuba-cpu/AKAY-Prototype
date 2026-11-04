<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\NutritionCareClosure;
use App\Models\Patient;
use Illuminate\Support\Collection;
use Illuminate\Validation\Validator;

class NutritionEnrollment
{
    public const INTENT_ENROLL = 'enroll';

    public const INTENT_CONTINUE = 'continue';

    public const STATUS_NOT_ENROLLED = 'Not Enrolled';

    public const STATUS_ACTIVE = 'Active';

    public const STATUS_CLOSED = 'Closed';

    public const CLOSE_REASONS = ['goals_met', 'transferred', 'lost_to_follow_up', 'other'];

    public static function isNutritionRecord(HealthRecord $record): bool
    {
        $programs = $record->monitoring_data['selectedPrograms'] ?? null;
        if (is_array($programs) && in_array('Nutrition', $programs, true)) {
            return true;
        }

        return $record->category === 'Nutrition';
    }

    public static function nutritionRecordsFor(int $patientId): Collection
    {
        return self::recordsFor($patientId)
            ->filter(fn (HealthRecord $record) => self::isNutritionRecord($record))
            ->values();
    }

    /**
     * @return array<int, array{started_record_id: int, started_on: string, record_ids: array<int, int>, status: string, closure: ?NutritionCareClosure}>
     */
    public static function episodes(Patient|int $patient): array
    {
        $patientId = self::patientId($patient);

        return self::stateFrom($patientId, self::nutritionRecordsFor($patientId))['episodes'];
    }

    /**
     * @return array{started_record_id: int, started_on: string, record_ids: array<int, int>, status: string, closure: ?NutritionCareClosure}|null
     */
    public static function active(Patient|int $patient): ?array
    {
        $patientId = self::patientId($patient);

        return self::stateFrom($patientId, self::nutritionRecordsFor($patientId))['active'];
    }

    /**
     * @return array{status: string, enrolled: bool, latest: ?HealthRecord, active: ?array, episodes: array}
     */
    public static function stateFor(int $patientId): array
    {
        return self::stateFrom($patientId, self::nutritionRecordsFor($patientId));
    }

    public static function validateIntent(Validator $validator, int $patientId, mixed $intent): void
    {
        if (! in_array($intent, [self::INTENT_ENROLL, self::INTENT_CONTINUE], true)) {
            $validator->errors()->add(
                'monitoring_data.nutritionIntent',
                'Say whether this visit enrolls the patient in Nutrition Care or continues an existing enrollment.'
            );

            return;
        }

        $enrolled = self::stateFor($patientId)['enrolled'];
        if ($intent === self::INTENT_ENROLL && $enrolled) {
            $validator->errors()->add(
                'monitoring_data.nutritionIntent',
                'This patient already has active Nutrition Care. Continue the existing enrollment instead of starting another.'
            );
        }
        if ($intent === self::INTENT_CONTINUE && ! $enrolled) {
            $validator->errors()->add(
                'monitoring_data.nutritionIntent',
                'This patient is not enrolled in Nutrition Care. Enroll first.'
            );
        }
    }

    /**
     * @return array{
     *     status: string,
     *     enrolled: bool,
     *     enrolled_on: ?string,
     *     latest_weight_kg: ?float,
     *     latest_height_cm: ?float,
     *     latest_bmi: ?float,
     *     latest_bmi_category: ?string,
     *     measurement_history: array<int, array{health_record_id: int, date_recorded: ?string, weight_kg: ?float, height_cm: ?float, bmi: ?float}>,
     *     closures: array<int, array{id: int, reason: string, closed_on: ?string, note: ?string, closed_by_name: ?string, started_health_record_id: int, enrolled_on: string}>
     * }
     */
    public static function summary(Patient|int $patient): array
    {
        $model = $patient instanceof Patient ? $patient : Patient::query()->findOrFail($patient);
        $records = self::recordsFor((int) $model->id);
        $nutrition = $records
            ->filter(fn (HealthRecord $record) => self::isNutritionRecord($record))
            ->values();
        $state = self::stateFrom((int) $model->id, $nutrition);
        $episode = self::measurementEpisode($state['episodes']);
        $history = $episode === null ? [] : self::measurementHistory($records, $episode);

        $latestWeight = null;
        $latestHeight = null;
        $latestBmi = null;
        foreach ($history as $row) {
            if ($row['weight_kg'] !== null) {
                $latestWeight = $row['weight_kg'];
            }
            if ($row['height_cm'] !== null) {
                $latestHeight = $row['height_cm'];
            }
            if ($row['bmi'] !== null) {
                $latestBmi = $row['bmi'];
            }
        }

        return [
            'status' => $state['status'],
            'enrolled' => $state['enrolled'],
            'enrolled_on' => $state['enrolled'] ? ($state['active']['started_on'] ?? null) : null,
            'latest_weight_kg' => $latestWeight,
            'latest_height_cm' => $latestHeight,
            'latest_bmi' => $latestBmi,
            'latest_bmi_category' => self::bmiCategory($latestBmi, $model),
            'measurement_history' => $history,
            'closures' => self::closureRows($state['episodes']),
        ];
    }

    /**
     * @return Collection<int, HealthRecord>
     */
    private static function recordsFor(int $patientId): Collection
    {
        return HealthRecord::query()
            ->where('patient_id', $patientId)
            ->orderBy('date_recorded')
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  Collection<int, HealthRecord>  $nutrition
     * @return array{status: string, enrolled: bool, latest: ?HealthRecord, active: ?array, episodes: array}
     */
    private static function stateFrom(int $patientId, Collection $nutrition): array
    {
        $episodes = self::buildEpisodes($patientId, $nutrition);
        $last = $episodes === [] ? null : $episodes[array_key_last($episodes)];
        $status = $last === null ? self::STATUS_NOT_ENROLLED : $last['status'];
        $active = ($last !== null && $last['status'] === self::STATUS_ACTIVE) ? $last : null;

        return [
            'status' => $status,
            'enrolled' => $status === self::STATUS_ACTIVE,
            'latest' => $nutrition->isEmpty() ? null : $nutrition->last(),
            'active' => $active,
            'episodes' => $episodes,
        ];
    }

    /**
     * Nutrition records after a closure's created_at open the next episode,
     * including a same-day re-enroll saved after the close.
     *
     * @param  Collection<int, HealthRecord>  $nutrition
     * @return array<int, array{started_record_id: int, started_on: string, record_ids: array<int, int>, status: string, closure: ?NutritionCareClosure}>
     */
    private static function buildEpisodes(int $patientId, Collection $nutrition): array
    {
        $closures = NutritionCareClosure::query()
            ->with('closer:id,name')
            ->where('patient_id', $patientId)
            ->orderBy('id')
            ->get()
            ->keyBy(fn (NutritionCareClosure $closure) => (int) $closure->started_health_record_id);

        $records = $nutrition->values();
        $count = $records->count();
        $episodes = [];
        $index = 0;

        while ($index < $count) {
            /** @var HealthRecord $start */
            $start = $records[$index];
            $closure = $closures->get((int) $start->id);
            $closure = $closure instanceof NutritionCareClosure ? $closure : null;
            $recordIds = [(int) $start->id];
            $index++;

            while ($index < $count) {
                /** @var HealthRecord $next */
                $next = $records[$index];
                if ($closure !== null && self::recordIsAfterClosure($next, $closure)) {
                    break;
                }
                $recordIds[] = (int) $next->id;
                $index++;
            }

            $episodes[] = [
                'started_record_id' => (int) $start->id,
                'started_on' => self::recordedOn($start),
                'record_ids' => $recordIds,
                'status' => $closure === null ? self::STATUS_ACTIVE : self::STATUS_CLOSED,
                'closure' => $closure,
            ];
        }

        return $episodes;
    }

    private static function recordIsAfterClosure(HealthRecord $record, NutritionCareClosure $closure): bool
    {
        if ($record->created_at === null || $closure->created_at === null) {
            return false;
        }

        return $record->created_at->greaterThan($closure->created_at);
    }

    private static function recordedOn(HealthRecord $record): string
    {
        return $record->date_recorded?->toDateString()
            ?? $record->created_at?->toDateString()
            ?? '';
    }

    /**
     * @param  array<int, array{status: string}>  $episodes
     * @return array{started_record_id: int, started_on: string, record_ids: array<int, int>, status: string, closure: ?NutritionCareClosure}|null
     */
    private static function measurementEpisode(array $episodes): ?array
    {
        if ($episodes === []) {
            return null;
        }

        foreach (array_reverse($episodes) as $episode) {
            if ($episode['status'] === self::STATUS_ACTIVE) {
                return $episode;
            }
        }

        return $episodes[array_key_last($episodes)];
    }

    /**
     * @param  Collection<int, HealthRecord>  $records
     * @param  array{started_on: string, closure: ?NutritionCareClosure}  $episode
     * @return array<int, array{health_record_id: int, date_recorded: ?string, weight_kg: ?float, height_cm: ?float, bmi: ?float}>
     */
    private static function measurementHistory(Collection $records, array $episode): array
    {
        $history = [];
        $seen = [];

        foreach ($records as $record) {
            $id = (int) $record->id;
            if (isset($seen[$id]) || ! self::inEpisodeWindow($record, $episode)) {
                continue;
            }

            $weight = self::reading($record, 'weight');
            $height = self::reading($record, 'height');
            if ($weight === null && $height === null) {
                continue;
            }

            $seen[$id] = true;
            $history[] = [
                'health_record_id' => $id,
                'date_recorded' => $record->date_recorded?->toDateString(),
                'weight_kg' => $weight,
                'height_cm' => $height,
                'bmi' => self::bmi($weight, $height),
            ];
        }

        return $history;
    }

    /**
     * @param  array{started_on: string, closure: ?NutritionCareClosure}  $episode
     */
    private static function inEpisodeWindow(HealthRecord $record, array $episode): bool
    {
        $recorded = $record->date_recorded;
        if ($recorded === null || $episode['started_on'] === '') {
            return false;
        }

        $day = $recorded->toDateString();
        if ($day < $episode['started_on']) {
            return false;
        }

        $closure = $episode['closure'] ?? null;
        if ($closure instanceof NutritionCareClosure && $closure->closed_on !== null) {
            return $day <= $closure->closed_on->toDateString();
        }

        return true;
    }

    private static function reading(HealthRecord $record, string $key): ?float
    {
        $vitals = is_array($record->vital_signs) ? $record->vital_signs : [];
        if (array_key_exists($key, $vitals)) {
            $fromVitals = self::measurement($vitals[$key]);
            if ($fromVitals !== null) {
                return $fromVitals;
            }
        }

        $attributes = $record->getAttributes();
        if (array_key_exists($key, $attributes)) {
            return self::measurement($record->getAttribute($key));
        }

        return null;
    }

    /**
     * Same rule as the client calculateBmi: a leading number, then kg / m^2.
     */
    private static function measurement(mixed $value): ?float
    {
        if (is_int($value) || is_float($value)) {
            return $value > 0 ? (float) $value : null;
        }

        if (! is_string($value)) {
            return null;
        }

        if (! preg_match('/^\s*[+-]?(?:\d+\.?\d*|\.\d+)/', $value, $matches)) {
            return null;
        }

        $number = (float) $matches[0];

        return $number > 0 ? $number : null;
    }

    private static function bmi(?float $weightKg, ?float $heightCm): ?float
    {
        if ($weightKg === null || $heightCm === null) {
            return null;
        }

        $metres = $heightCm / 100;
        if ($metres <= 0) {
            return null;
        }

        return $weightKg / ($metres * $metres);
    }

    private static function bmiCategory(?float $bmi, Patient $patient): ?string
    {
        if ($bmi === null) {
            return null;
        }

        $age = $patient->birthdate?->age;
        if (! is_int($age) || $age < 18) {
            return null;
        }

        if ($bmi < 18.5) {
            return 'Underweight';
        }
        if ($bmi < 25) {
            return 'Normal';
        }
        if ($bmi < 30) {
            return 'Overweight';
        }

        return 'Obese';
    }

    /**
     * @param  array<int, array{started_on: string, closure: ?NutritionCareClosure}>  $episodes
     * @return array<int, array{id: int, reason: string, closed_on: ?string, note: ?string, closed_by_name: ?string, started_health_record_id: int, enrolled_on: string}>
     */
    private static function closureRows(array $episodes): array
    {
        $rows = [];
        foreach ($episodes as $episode) {
            $closure = $episode['closure'] ?? null;
            if (! $closure instanceof NutritionCareClosure) {
                continue;
            }

            $rows[] = [
                'id' => (int) $closure->id,
                'reason' => $closure->reason,
                'closed_on' => $closure->closed_on?->toDateString(),
                'note' => $closure->note,
                'closed_by_name' => $closure->closer?->name,
                'started_health_record_id' => (int) $closure->started_health_record_id,
                'enrolled_on' => $episode['started_on'],
            ];
        }

        return $rows;
    }

    private static function patientId(Patient|int $patient): int
    {
        return $patient instanceof Patient ? (int) $patient->id : $patient;
    }
}
