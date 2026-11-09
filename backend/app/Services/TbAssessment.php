<?php

namespace App\Services;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class TbAssessment
{
    public const DIAGNOSIS_TYPES = ['tb_disease', 'tb_infection'];

    public const RESISTANCE_TYPES = ['drug_susceptible', 'rr_tb', 'mdr_tb', 'clinically_mdr_tb', 'xdr_tb', 'other'];

    public static function rules(string $prefix = 'diagnoses.*.tbManagement'): array
    {
        return [
            $prefix => ['nullable', 'array:diagnosisType,drugResistance,openTreatmentCard'],
            "$prefix.diagnosisType" => ['nullable', Rule::in(self::DIAGNOSIS_TYPES)],
            "$prefix.drugResistance" => ['nullable', Rule::in(self::RESISTANCE_TYPES)],
            "$prefix.openTreatmentCard" => ['nullable', 'boolean'],
        ];
    }

    public static function validate(Validator $validator, array $diagnoses): void
    {
        foreach ($diagnoses as $index => $entry) {
            $assessment = $entry['tbManagement'] ?? null;
            if (! is_array($assessment)) {
                continue;
            }
            $type = $assessment['diagnosisType'] ?? null;
            $resistance = $assessment['drugResistance'] ?? null;
            $prefix = "diagnoses.$index.tbManagement";
            if ($type === 'tb_disease' && blank($resistance)) {
                $validator->errors()->add("$prefix.drugResistance", 'Select drug resistance for TB Disease.');
            } elseif ($type !== 'tb_disease' && filled($resistance)) {
                $validator->errors()->add("$prefix.drugResistance", 'Drug resistance applies only to TB Disease.');
            }
            if (! empty($assessment['openTreatmentCard'])) {
                $validator->errors()->add("$prefix.openTreatmentCard", 'Register Form 4B separately after consultation finalization.');
            }
        }
    }

    /** Old drafts can hold a hidden resistance choice; never restore it for infection. */
    public static function normalizeDraft(array $payload): array
    {
        foreach ($payload['diagnoses'] ?? [] as $index => $entry) {
            if (is_array($entry['tbManagement'] ?? null)) {
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
            }
            if (($entry['tbManagement']['diagnosisType'] ?? null) === 'tb_infection') {
                $payload['diagnoses'][$index]['tbManagement']['drugResistance'] = '';
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
            }
        }

        return $payload;
    }
}
