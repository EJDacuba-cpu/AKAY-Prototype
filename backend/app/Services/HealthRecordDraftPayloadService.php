<?php

namespace App\Services;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class HealthRecordDraftPayloadService
{
    private const SCALAR = true;

    private const SCHEMA = [
        'dateOfVisit' => self::SCALAR,
        'timeOfVisit' => self::SCALAR,
        'chiefComplaint' => self::SCALAR,
        'summaryOfPresentIllness' => self::SCALAR,
        'diagnosis' => self::SCALAR,
        'medication' => self::SCALAR,
        'attendingStaff' => self::SCALAR,
        'consultationNotes' => self::SCALAR,
        'systolicBp' => self::SCALAR,
        'diastolicBp' => self::SCALAR,
        'temp' => self::SCALAR,
        'pulse' => self::SCALAR,
        'respiratoryRate' => self::SCALAR,
        'weight' => self::SCALAR,
        'height' => self::SCALAR,
        'followUpStatus' => self::SCALAR,
        'followUpDate' => self::SCALAR,
        'monitoringNotes' => self::SCALAR,
        'patientCondition' => self::SCALAR,
        'morbidityReportingStatus' => self::SCALAR,
        'hfmdSurveillance' => self::SCALAR,
        'needsReferral' => self::SCALAR,
        'careDecisionStep' => self::SCALAR,
        'referralDetailsStep' => self::SCALAR,
        'expectedDeliveryDate' => self::SCALAR,
        'aog' => self::SCALAR,
        'maternalData' => [
            'lmp' => self::SCALAR,
            'pmp' => self::SCALAR,
            'cycleDuration' => self::SCALAR,
            'gravida' => self::SCALAR,
            'para' => self::SCALAR,
            'term' => self::SCALAR,
            'preterm' => self::SCALAR,
            'abortion' => self::SCALAR,
            'living' => self::SCALAR,
            'bmi' => self::SCALAR,
            'treatment' => self::SCALAR,
            'previousFpMethodUsed' => self::SCALAR,
            'previousFpMethodOther' => self::SCALAR,
            'previousPregnancyHistory' => ['*' => [
                'pregnancyNo' => self::SCALAR,
                'placeOfDelivery' => self::SCALAR,
                'year' => self::SCALAR,
                'notes' => self::SCALAR,
            ]],
            'riskAssessment' => [
                'ageRisk' => self::SCALAR,
                'heightRisk' => self::SCALAR,
                'grandMultipara' => self::SCALAR,
                'previousCs' => self::SCALAR,
                'recurrentMiscarriageOrStillbirth' => self::SCALAR,
                'postpartumHemorrhage' => self::SCALAR,
                'tuberculosis' => self::SCALAR,
                'heartDisease' => self::SCALAR,
                'diabetes' => self::SCALAR,
                'bronchialAsthma' => self::SCALAR,
                'goiter' => self::SCALAR,
                'hypertensive' => self::SCALAR,
                'alcoholUser' => self::SCALAR,
                'smoker' => self::SCALAR,
            ],
            'laboratoryResults' => [
                'hemoglobin' => self::SCALAR,
                'cbc' => self::SCALAR,
                'hbsag' => self::SCALAR,
                'bloodType' => self::SCALAR,
                'hiv' => self::SCALAR,
                'syphilis' => self::SCALAR,
                'urinalysis' => self::SCALAR,
            ],
            'tetanusToxoidStatus' => [
                'tt1' => self::SCALAR,
                'tt2' => self::SCALAR,
                'tt3' => self::SCALAR,
                'tt4' => self::SCALAR,
                'tt5' => self::SCALAR,
            ],
            'ultrasound' => [
                'result' => self::SCALAR,
                'dateDone' => self::SCALAR,
            ],
        ],
        'immunizationData' => [
            'bcg_vaccine' => self::SCALAR,
            'hepb_birth' => self::SCALAR,
            'pentavalent_dose1' => self::SCALAR,
            'pentavalent_dose2' => self::SCALAR,
            'pentavalent_dose3' => self::SCALAR,
            'opv_dose1' => self::SCALAR,
            'opv_dose2' => self::SCALAR,
            'opv_dose3' => self::SCALAR,
            'ipv_dose1' => self::SCALAR,
            'ipv_dose2' => self::SCALAR,
            'pcv_dose1' => self::SCALAR,
            'pcv_dose2' => self::SCALAR,
            'pcv_dose3' => self::SCALAR,
            'mmr_dose1' => self::SCALAR,
            'mmr_dose2' => self::SCALAR,
            'feeding_status' => self::SCALAR,
            'vaccineEntries' => ['*' => [
                'vaccineName' => self::SCALAR,
                'customVaccineName' => self::SCALAR,
                'dose' => self::SCALAR,
                'dateGiven' => self::SCALAR,
                'weight' => self::SCALAR,
                'height' => self::SCALAR,
                'temperature' => self::SCALAR,
                'nextScheduleDate' => self::SCALAR,
                'siteRoute' => self::SCALAR,
                'reason' => self::SCALAR,
                'remarks' => self::SCALAR,
            ]],
            'breastfeedingMonitoring' => [
                'month1' => self::SCALAR,
                'month2' => self::SCALAR,
                'month3' => self::SCALAR,
                'month4' => self::SCALAR,
                'month5' => self::SCALAR,
                'month6' => self::SCALAR,
            ],
        ],
        'familyPlanningData' => [
            'clientType' => self::SCALAR,
            'methodUsed' => self::SCALAR,
            'previousMethod' => self::SCALAR,
            'fpVisitType' => self::SCALAR,
            'source' => self::SCALAR,
            'dateRegistered' => self::SCALAR,
            'dateOfVisit' => self::SCALAR,
            'nextAppointmentDate' => self::SCALAR,
            'remarks' => self::SCALAR,
            'actionTaken' => self::SCALAR,
            'hasClinicalConcern' => self::SCALAR,
            'concern' => self::SCALAR,
            'findings' => self::SCALAR,
            'adviceGiven' => self::SCALAR,
        ],
        'hypertensionDiabeticData' => [
            'bp' => self::SCALAR,
            'fbs' => self::SCALAR,
            'conditionType' => self::SCALAR,
            'clientStatus' => self::SCALAR,
            'dateOfLastConsultation' => self::SCALAR,
            'treatmentActionTaken' => self::SCALAR,
        ],
        'referralForm' => [
            'urgencyLevel' => self::SCALAR,
            'dateOfReferral' => self::SCALAR,
            'timeOfReferral' => self::SCALAR,
            'referringPractitioner' => self::SCALAR,
            'chiefComplaint' => self::SCALAR,
            'initialDiagnosis' => self::SCALAR,
            'initialActionsTaken' => self::SCALAR,
            'reasonForReferral' => self::SCALAR,
            'clinicalSummary' => self::SCALAR,
            'preferredDoctor' => self::SCALAR,
        ],
        'dispensedMedicines' => ['*' => [
            'medicineId' => self::SCALAR,
            'quantity' => self::SCALAR,
        ]],
    ];

    public function sanitize(array $payload): array
    {
        $sanitized = $this->sanitizeNode($payload, self::SCHEMA, 'payload');

        Validator::make(['payload' => $sanitized], $this->rules())->validate();

        $encoded = json_encode(
            $sanitized,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
        if (strlen($encoded) > config('health_record_drafts.max_payload_bytes')) {
            throw ValidationException::withMessages([
                'payload' => ['The draft is too large to save.'],
            ]);
        }

        return $sanitized;
    }

    private function sanitizeNode(mixed $value, array|bool $schema, string $path): mixed
    {
        if ($schema === self::SCALAR) {
            if (! is_null($value) && ! is_scalar($value)) {
                throw ValidationException::withMessages([
                    $path => ['The draft field has an invalid value.'],
                ]);
            }

            if (is_string($value) && mb_strlen($value) > 10000) {
                throw ValidationException::withMessages([
                    $path => ['The draft text exceeds the maximum length.'],
                ]);
            }

            return $value;
        }

        if (! is_array($value)) {
            throw ValidationException::withMessages([
                $path => ['The draft field must be an object or list.'],
            ]);
        }

        if (array_key_exists('*', $schema)) {
            if (! array_is_list($value) || count($value) > 50) {
                throw ValidationException::withMessages([
                    $path => ['The draft list is invalid or too long.'],
                ]);
            }

            return array_map(
                fn (mixed $item, int $index): mixed => $this->sanitizeNode(
                    $item,
                    $schema['*'],
                    "{$path}.{$index}"
                ),
                $value,
                array_keys($value)
            );
        }

        $unknown = array_diff(array_keys($value), array_keys($schema));
        if ($unknown !== []) {
            throw ValidationException::withMessages([
                $path => ['The draft contains unsupported fields.'],
            ]);
        }

        $sanitized = [];
        foreach ($value as $key => $item) {
            $sanitized[$key] = $this->sanitizeNode(
                $item,
                $schema[$key],
                "{$path}.{$key}"
            );
        }

        return $sanitized;
    }

    private function rules(): array
    {
        return [
            'payload.dateOfVisit' => ['nullable', 'date_format:Y-m-d'],
            'payload.timeOfVisit' => ['nullable', 'date_format:H:i'],
            'payload.followUpDate' => ['nullable', 'date_format:Y-m-d'],
            'payload.expectedDeliveryDate' => ['nullable', 'date_format:Y-m-d'],
            'payload.hfmdSurveillance' => ['nullable', 'boolean'],
            'payload.needsReferral' => ['nullable', 'boolean'],
            'payload.careDecisionStep' => ['nullable', 'boolean'],
            'payload.referralDetailsStep' => ['nullable', 'boolean'],
            'payload.dispensedMedicines' => ['nullable', 'array', 'max:50'],
            'payload.dispensedMedicines.*.medicineId' => ['required', 'integer'],
            'payload.dispensedMedicines.*.quantity' => [
                'required',
                'integer',
                'min:1',
                'max:2147483647',
            ],
            'payload.maternalData.previousPregnancyHistory' => ['nullable', 'array', 'max:30'],
            'payload.immunizationData.vaccineEntries' => ['nullable', 'array', 'max:30'],
            'payload.immunizationData.vaccineEntries.*.dateGiven' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'payload.immunizationData.vaccineEntries.*.nextScheduleDate' => [
                'nullable',
                'date_format:Y-m-d',
            ],
        ];
    }
}
