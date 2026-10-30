<?php

namespace App\Services;

/**
 * Optional vital-sign encoding checks for official health-record saves.
 *
 * Blank stays valid. These are unit ceilings, not adult reference ranges:
 * unusual-but-plausible values pass, and nothing is diagnosed from them.
 */
final class VitalSigns
{
    public const BP_PAIR_MESSAGE = 'Enter both systolic and diastolic blood pressure.';

    public const BP_RANGE_MESSAGE = 'Enter a blood pressure between 0 and 300 mmHg.';

    public const PULSE_MESSAGE = 'Enter a pulse rate between 0 and 350 bpm.';

    public const SPO2_MESSAGE = 'Enter an SpO₂ between 0 and 100%.';

    public const TEMP_MESSAGE = 'Enter a temperature between 10 and 50°C.';

    public const WEIGHT_MESSAGE = 'Enter a weight greater than 0 and at most 500 kg.';

    public const HEIGHT_MESSAGE = 'Enter a height greater than 0 and at most 250 cm.';

    public const FBS_MESSAGE = 'Enter a valid FBS between 0 and 1000 mg/dL.';

    public static function filled(mixed $value): bool
    {
        return trim((string) $value) !== '';
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function fromInput(array $input): array
    {
        $vitals = is_array($input['vital_signs'] ?? null) ? $input['vital_signs'] : [];

        return [
            'systolicBp' => $vitals['systolicBp'] ?? $vitals['systolic_bp'] ?? null,
            'diastolicBp' => $vitals['diastolicBp'] ?? $vitals['diastolic_bp'] ?? null,
            'pulse' => $vitals['pulse'] ?? null,
            'spo2' => $vitals['spo2'] ?? null,
            'temperature' => $vitals['temperature'] ?? $vitals['temp'] ?? null,
            'weight' => $vitals['weight'] ?? null,
            'height' => $vitals['height'] ?? null,
            'fbs' => $vitals['fbs'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, string>
     */
    public static function errors(array $input): array
    {
        $vitals = self::fromInput($input);
        $errors = [];
        $sysFilled = self::filled($vitals['systolicBp']);
        $diaFilled = self::filled($vitals['diastolicBp']);

        if ($sysFilled !== $diaFilled) {
            $errors['vital_signs.systolicBp'] = self::BP_PAIR_MESSAGE;
            $errors['vital_signs.diastolicBp'] = self::BP_PAIR_MESSAGE;
        }

        if ($message = self::rangeError($vitals['systolicBp'], 0, 300, self::BP_RANGE_MESSAGE)) {
            $errors['vital_signs.systolicBp'] = $message;
        }
        if ($message = self::rangeError($vitals['diastolicBp'], 0, 300, self::BP_RANGE_MESSAGE)) {
            $errors['vital_signs.diastolicBp'] = $message;
        }
        if ($message = self::rangeError($vitals['pulse'], 0, 350, self::PULSE_MESSAGE)) {
            $errors['vital_signs.pulse'] = $message;
        }
        if ($message = self::rangeError($vitals['spo2'], 0, 100, self::SPO2_MESSAGE)) {
            $errors['vital_signs.spo2'] = $message;
        }
        if ($message = self::rangeError($vitals['temperature'], 10, 50, self::TEMP_MESSAGE)) {
            $errors['vital_signs.temperature'] = $message;
        }
        if ($message = self::rangeError($vitals['weight'], 0, 500, self::WEIGHT_MESSAGE, true)) {
            $errors['vital_signs.weight'] = $message;
        }
        if ($message = self::rangeError($vitals['height'], 0, 250, self::HEIGHT_MESSAGE, true)) {
            $errors['vital_signs.height'] = $message;
        }
        if ($message = self::rangeError($vitals['fbs'], 0, 1000, self::FBS_MESSAGE)) {
            $errors['vital_signs.fbs'] = $message;
        }

        return $errors;
    }

    /** @param  array<string, mixed>  $input */
    public static function validate(mixed $validator, array $input): void
    {
        foreach (self::errors($input) as $key => $message) {
            if (! $validator->errors()->has($key)) {
                $validator->errors()->add($key, $message);
            }
        }
    }

    private static function rangeError(mixed $value, float $min, float $max, string $message, bool $exclusiveMin = false): ?string
    {
        if (! self::filled($value)) {
            return null;
        }
        if (! is_numeric($value)) {
            return $message;
        }
        $number = (float) $value;
        if ($exclusiveMin ? ! ($number > $min) : $number < $min) {
            return $message;
        }
        if ($number > $max) {
            return $message;
        }

        return null;
    }
}
