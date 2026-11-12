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
            $prefix => ['nullable', 'array:diagnosisType,drugResistance,openTreatmentCard,treatmentDecision,dispositionReason,dispositionPlan,tbCaseNumber'],
            "$prefix.diagnosisType" => ['nullable', Rule::in(self::DIAGNOSIS_TYPES)],
            "$prefix.drugResistance" => ['nullable', Rule::in(self::RESISTANCE_TYPES)],
            "$prefix.openTreatmentCard" => ['nullable', 'boolean'],
            "$prefix.treatmentDecision" => ['nullable', Rule::in(self::TREATMENT_DECISIONS)],
            "$prefix.dispositionReason" => ['nullable', 'string', 'max:2000'],
            "$prefix.dispositionPlan" => ['nullable', 'string', 'max:2000'],
            "$prefix.tbCaseNumber" => ['nullable', 'string', 'max:100', 'regex:/^(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\\-\\/. ]{0,98}[A-Za-z0-9])$/'],
        ];
    }

    public static function validate(Validator $validator, array $diagnoses, ?\App\Models\Patient $patient = null): void
    {
        $seenCaseNumbers = [];
        foreach ($diagnoses as $index => $entry) {
            $assessment = $entry['tbManagement'] ?? null;
            if (! is_array($assessment)) {
                continue;
            }
            $type = $assessment['diagnosisType'] ?? null;
            $resistance = $assessment['drugResistance'] ?? null;
            $decision = $assessment['treatmentDecision'] ?? null;
            $open = ! empty($assessment['openTreatmentCard']);
            $caseNumber = trim((string) ($assessment['tbCaseNumber'] ?? ''));
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
            }

            // Consultation no longer registers Form 4B; the flag must stay off.
            if ($open) {
                $validator->errors()->add(
                    "$prefix.openTreatmentCard",
                    $isDsTb
                        ? 'DS-TB Form 4B registration is discontinued. Leave treatment-card initiation off.'
                        : 'Treatment-card initiation applies only to drug-susceptible TB Disease.'
                );
            }

            if ($caseNumber !== '') {
                if ($type !== 'tb_disease') {
                    $validator->errors()->add("$prefix.tbCaseNumber", 'TB case number applies only to TB Disease.');
                } else {
                    $normalized = strtoupper($caseNumber);
                    if (isset($seenCaseNumbers[$normalized])) {
                        $validator->errors()->add("$prefix.tbCaseNumber", 'This TB case number is already used on another diagnosis in this visit.');
                    } else {
                        $seenCaseNumbers[$normalized] = $index;
                    }
                }
            }
        }

        if ($patient !== null) {
            app(TbClinicalAuthority::class)->enforceFollowUpAssessmentLock($validator, $patient, $diagnoses);
        }
    }

    /**
     * Strip consultation Form 4B registration intent from drafts.
     * Registration happens post-finalize on Health Record Details.
     */
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
                    'tbCaseNumber' => '',
                ];
                continue;
            }

            $caseNumber = trim((string) ($management['tbCaseNumber'] ?? ''));
            $payload['diagnoses'][$index]['tbManagement']['tbCaseNumber'] = $type === 'tb_disease'
                ? mb_substr($caseNumber, 0, 100)
                : '';

            $isDsTb = $type === 'tb_disease' && $resistance === 'drug_susceptible';
            if (! $isDsTb) {
                $payload['diagnoses'][$index]['tbManagement']['treatmentDecision'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionReason'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionPlan'] = '';
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
                continue;
            }

            // Consultation no longer registers Form 4B. Clear legacy initiate intent
            // so delayed registration on Details remains eligible.
            if ($decision === 'initiate_at_rhu' || $decision === '') {
                $payload['diagnoses'][$index]['tbManagement']['treatmentDecision'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionReason'] = '';
                $payload['diagnoses'][$index]['tbManagement']['dispositionPlan'] = '';
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
                continue;
            }

            if (in_array($decision, ['not_yet_initiated', 'refer_elsewhere'], true)) {
                $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
                continue;
            }

            $payload['diagnoses'][$index]['tbManagement']['treatmentDecision'] = '';
            $payload['diagnoses'][$index]['tbManagement']['openTreatmentCard'] = false;
            $payload['diagnoses'][$index]['tbManagement']['dispositionReason'] = '';
            $payload['diagnoses'][$index]['tbManagement']['dispositionPlan'] = '';
        }

        return $payload;
    }
}
