<?php

namespace App\Services;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class TbAssessment
{
    public const DIAGNOSIS_TYPES = ['presumptive_tb', 'tb_disease', 'tb_infection'];

    public const RESISTANCE_TYPES = [
        'drug_susceptible',
        'pending_dst',
        'drug_resistant',
        'rr_tb',
        'mdr_tb',
        'clinically_mdr_tb',
        'xdr_tb',
        'other',
    ];

    public const TREATMENT_DECISIONS = ['initiate_at_rhu', 'not_yet_initiated', 'refer_elsewhere'];

    public static function rules(string $prefix = 'diagnoses.*.tbManagement'): array
    {
        return [
            $prefix => ['nullable', 'array:diagnosisType,drugResistance,openTreatmentCard,treatmentDecision,dispositionReason,dispositionPlan'],
            "$prefix.diagnosisType" => ['nullable', Rule::in(self::DIAGNOSIS_TYPES)],
            "$prefix.drugResistance" => ['nullable', Rule::in(self::RESISTANCE_TYPES)],
            "$prefix.openTreatmentCard" => ['nullable', 'boolean'],
            "$prefix.treatmentDecision" => ['nullable', Rule::in(self::TREATMENT_DECISIONS)],
            "$prefix.dispositionReason" => ['nullable', 'string', 'max:2000'],
            "$prefix.dispositionPlan" => ['nullable', 'string', 'max:2000'],
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
            $decision = $assessment['treatmentDecision'] ?? null;
            $open = ! empty($assessment['openTreatmentCard']);
            $prefix = "diagnoses.$index.tbManagement";
            $isDsTb = $type === 'tb_disease' && $resistance === 'drug_susceptible';

            if ($type === 'tb_disease' && blank($resistance)) {
                $validator->errors()->add("$prefix.drugResistance", 'Select drug resistance for TB Disease.');
            } elseif ($type === 'tb_disease' && $resistance === 'drug_resistant') {
                $validator->errors()->add("$prefix.drugResistance", 'Select the drug-resistant TB classification.');
            } elseif ($type !== 'tb_disease' && filled($resistance)) {
                $validator->errors()->add("$prefix.drugResistance", 'Drug resistance applies only to TB Disease.');
            }

            if (! $isDsTb) {
                if (filled($decision)) {
                    $validator->errors()->add("$prefix.treatmentDecision", 'Treatment decision applies only to drug-susceptible TB Disease.');
                }
                if ($open) {
                    $validator->errors()->add("$prefix.openTreatmentCard", 'Form 4B initiation applies only to drug-susceptible TB Disease.');
                }

                continue;
            }

            // Preserve explicit initiation from existing drafts; a new DS-TB
            // assessment does not require a treatment decision or disposition.
            if ($decision === 'initiate_at_rhu') {
                if (! $open) {
                    $validator->errors()->add("$prefix.openTreatmentCard", 'Initiating DS-TB treatment requires Form 4B registration in this consultation.');
                }
                continue;
            }

            if ($open) {
                $validator->errors()->add("$prefix.openTreatmentCard", 'Form 4B is only registered when initiating DS-TB treatment at this RHU.');
            }
        }
    }

    /** Restore eligible initiate drafts; clear incompatible infection/DR leftovers. */
    public static function normalizeDraft(array $payload): array
    {
        foreach ($payload['diagnoses'] ?? [] as $index => $entry) {
            if (! is_array($entry['tbManagement'] ?? null)) {
                continue;
            }
            $management = $entry['tbManagement'];
            $type = $management['diagnosisType'] ?? null;
            $resistance = $management['drugResistance'] ?? null;
            $decision = $management['treatmentDecision'] ?? '';

            if ($type === 'tb_infection' || $type === 'presumptive_tb') {
                $payload['diagnoses'][$index]['tbManagement'] = [
                    'diagnosisType' => $type,
                    'drugResistance' => '',
                    'openTreatmentCard' => false,
                    'treatmentDecision' => '',
                    'dispositionReason' => '',
                    'dispositionPlan' => '',
                ];
                continue;
            }

            $isDsTb = $type === 'tb_disease' && $resistance === 'drug_susceptible';
            if (! $isDsTb) {
                $payload['diagnoses'][$index]['tbManagement']['treatmentDecision'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionReason'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionPlan'] = '';
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
                continue;
            }

            if ($decision === 'initiate_at_rhu') {
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = true;
                $payload['diagnoses'][$index]['tbManagement']['dispositionReason'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionPlan'] = '';
                continue;
            }

            if (in_array($decision, ['not_yet_initiated', 'refer_elsewhere'], true)) {
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
                continue;
            }

            $payload['diagnoses'][$index]['tbManagement']['treatmentDecision'] = '';
            $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
        }

        return $payload;
    }
}
