<?php

namespace App\Services;

use Illuminate\Validation\Rule;

class ConsultationPrograms
{
    public const CLASSIFICATIONS = [
        'Maternal' => 'Maternal',
        'TB' => 'TB DOTS / TB Monitoring',
        'Family Planning' => 'Family Planning',
        'Hypertension' => 'Hypertension / Diabetic Monitoring',
        'Diabetes' => 'Hypertension / Diabetic Monitoring',
        'EPI' => 'Immunization',
    ];

    public static function rules(string $prefix): array
    {
        return [
            "$prefix.selectedPrograms" => ['sometimes', 'array', 'list', 'max:6'],
            "$prefix.selectedPrograms.*" => ['required', 'string', 'distinct', Rule::in(array_keys(self::CLASSIFICATIONS))],
            "$prefix.primaryProgram" => ['nullable', 'string', Rule::in(array_keys(self::CLASSIFICATIONS))],
        ];
    }

    public static function validateSelection($validator, mixed $programs, mixed $primary, string $prefix, ?string $category = null): void
    {
        // Legacy records and drafts have no selection metadata.
        if ($programs === null && $primary === null) {
            return;
        }
        if (! is_array($programs) || ! array_is_list($programs)) {
            return;
        }
        if (($programs !== [] && ! in_array($primary, $programs, true)) || ($programs === [] && filled($primary))) {
            $validator->errors()->add("$prefix.primaryProgram", 'The primary program must be one of the selected programs.');
        }
        if ($category !== null && is_string($primary) && isset(self::CLASSIFICATIONS[$primary]) && self::CLASSIFICATIONS[$primary] !== $category) {
            $validator->errors()->add('category', 'The category must match the primary program.');
        }
        if ($category !== null && $programs === [] && $category !== 'General Consultation') {
            $validator->errors()->add("$prefix.selectedPrograms", 'Select a program for this consultation category.');
        }
    }
}
