<?php

namespace App\Services;

use App\Models\HealthRecord;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class HealthRecordDraftPayloadService
{
    private const SCALAR = true;

    private const SCHEMA = [
        // Identity of the consultation this draft belongs to, minted by the
        // client at consultation start. It rides in the payload so the
        // encrypted on-device copy carries it too; the server also keeps it as
        // a real column for lookup. Optional, so drafts saved before it existed
        // still decrypt - sanitize() runs on READ as well as write.
        'consultationUuid' => self::SCALAR,
        // Marks a draft as the BHC general v2 flow. Optional: legacy drafts never carry it.
        'consultationWorkflow' => self::SCALAR,
        'receivingRhuId' => self::SCALAR,
        'sharedConditionReferral' => self::SCALAR,
        'selectedPrograms' => ['*' => self::SCALAR],
        'primaryProgram' => self::SCALAR,
        'prenatalIntent' => self::SCALAR,
        'consultationMode' => self::SCALAR,
        'wizardPhase' => self::SCALAR,
        // Which screen of the step-based consultation the user was on (a program
        // form, Clinical Assessment or Treatment). UI position only; optional, so
        // drafts saved before the steps existed keep loading.
        'formStep' => self::SCALAR,
        'nextScreen' => self::SCALAR,
        'dateOfVisit' => self::SCALAR,
        'timeOfVisit' => self::SCALAR,
        'chiefComplaint' => self::SCALAR,
        'physicalExam' => self::SCALAR,
        // Findings pinned on the assessment step's 2D body preview.
        'bodyFindings' => ['*' => [
            'id' => self::SCALAR,
            'region' => self::SCALAR,
            'side' => self::SCALAR,
            'location' => self::SCALAR,
            'finding' => self::SCALAR,
            'note' => self::SCALAR,
        ]],
        'bodyFindingReassessments' => ['*' => [
            'sourceRecordId' => self::SCALAR,
            'sourceFindingIndex' => self::SCALAR,
            'expectedRevision' => self::SCALAR,
            'status' => self::SCALAR,
        ]],
        'summaryOfPresentIllness' => self::SCALAR,
        'diagnosis' => self::SCALAR,
        'diagnoses' => ['*' => [
            'id' => self::SCALAR,
            'name' => self::SCALAR,
            'reportAs' => self::SCALAR,
            'carePlan' => self::SCALAR,
            'bhcFollowUp' => self::SCALAR,
            'includeInSurveillance' => self::SCALAR,
            // v2: destinations this diagnosis is reported in (ReportingEntries::DESTINATIONS).
            'reportIn' => ['*' => self::SCALAR],
            'clinicalOutcome' => self::SCALAR,
            'activate' => self::SCALAR,
            'manageToBhc' => self::SCALAR,
            'referral' => [
                'urgencyLevel' => self::SCALAR,
                'receivingRhuId' => self::SCALAR,
                'reasonForReferral' => self::SCALAR,
            ],
        ]],
        'assessmentNotes' => self::SCALAR,
        'medication' => self::SCALAR,
        'noInterventionPerformed' => self::SCALAR,
        'noInterventionReason' => self::SCALAR,
        'attendingStaff' => self::SCALAR,
        'consultationNotes' => self::SCALAR,
        'systolicBp' => self::SCALAR,
        'diastolicBp' => self::SCALAR,
        'temp' => self::SCALAR,
        'pulse' => self::SCALAR,
        'spo2' => self::SCALAR,
        'weight' => self::SCALAR,
        'height' => self::SCALAR,
        'fbs' => self::SCALAR,
        'followUpStatus' => self::SCALAR,
        'followUpDate' => self::SCALAR,
        'followUpTime' => self::SCALAR,
        'followUpReason' => self::SCALAR,
        'followUpSchedules' => ['*' => [
            'purposeKey' => self::SCALAR,
            'purpose' => self::SCALAR,
            'date' => self::SCALAR,
            'time' => self::SCALAR,
            'predecessorTaskId' => self::SCALAR,
            'sourceEntryId' => self::SCALAR,
        ]],
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
            // Unknown keys are rejected by sanitizeNode() - which also runs when
            // a draft is READ back - so a field added to the prenatal form must
            // be listed here or draft autosave starts failing for that record
            // type. The OB score is stored as its components (term, preterm,
            // abortion, living, gravida, para), not as a formatted string.
            'lmp' => self::SCALAR,
            'pmp' => self::SCALAR,
            'cycleDuration' => self::SCALAR,
            'deliveryDate' => self::SCALAR,
            'expectedDeliveryDate' => self::SCALAR,
            'aog' => self::SCALAR,
            'gravida' => self::SCALAR,
            'para' => self::SCALAR,
            'term' => self::SCALAR,
            'preterm' => self::SCALAR,
            'abortion' => self::SCALAR,
            'living' => self::SCALAR,
            'bmi' => self::SCALAR,
            // Fetal heart tone, e.g. "140 bpm".
            'fht' => self::SCALAR,
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
                // Risk Code D parent and its items. ageRisk / heightRisk are
                // computed by the form; the rest are ticked.
                'previousPregnancyComplications' => self::SCALAR,
                'previousCs' => self::SCALAR,
                'recurrentMiscarriageOrStillbirth' => self::SCALAR,
                'postpartumHemorrhage' => self::SCALAR,
                // Legacy keys below are no longer sent by the prenatal form (a
                // BHC worker does not confirm diseases; smoking and alcohol live
                // in Patient Background). They stay here only so drafts started
                // before that change still validate when they are read back.
                'medicalConditions' => self::SCALAR,
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
            // The date each result above was taken, kept beside it so records
            // that stored a plain result string per test read unchanged.
            'laboratoryResultDates' => [
                'hemoglobin' => self::SCALAR,
                'cbc' => self::SCALAR,
                'hbsag' => self::SCALAR,
                'bloodType' => self::SCALAR,
                'hiv' => self::SCALAR,
                'syphilis' => self::SCALAR,
                'urinalysis' => self::SCALAR,
            ],
            // The TT/Td dose given at this visit. On the official record its
            // date is also filed under tetanusToxoidStatus /
            // tetanusDiphtheriaStatus, so the dose history stays complete.
            'immunizationThisVisit' => [
                'type' => self::SCALAR,
                'doseStatus' => self::SCALAR,
                'dateGiven' => self::SCALAR,
            ],
            'tetanusToxoidStatus' => [
                'tt1' => self::SCALAR,
                'tt2' => self::SCALAR,
                'tt3' => self::SCALAR,
                'tt4' => self::SCALAR,
                'tt5' => self::SCALAR,
            ],
            // Td (Tetanus-Diphtheria) is a separate 5-dose schedule from TT,
            // tracked independently - not a rename/replacement of it.
            'tetanusDiphtheriaStatus' => [
                'td1' => self::SCALAR,
                'td2' => self::SCALAR,
                'td3' => self::SCALAR,
                'td4' => self::SCALAR,
                'td5' => self::SCALAR,
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
                'medicineId' => self::SCALAR,
                'inventoryQuantity' => self::SCALAR,
                'confirmedGiven' => self::SCALAR,
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
            // Free-text list of what was handed to the client. Separate from
            // dispensed_medicines, which is the inventory-linked deduction.
            'medicinesSupplies' => self::SCALAR,
        ],
        'tbData' => [
            'caseFinding' => [
                'diagnosingFacility' => self::SCALAR,
                'ntpFacilityCode' => self::SCALAR,
                'provinceHuc' => self::SCALAR,
                'region' => self::SCALAR,
                'referredBy' => self::SCALAR,
                'screeningCategory' => self::SCALAR,
                'dateOfScreening' => self::SCALAR,
            ],
            'laboratory' => [
                'xpert' => [
                    'collectionDate' => self::SCALAR,
                    'examDate' => self::SCALAR,
                    'result' => self::SCALAR,
                ],
                'smearOrLamp' => [
                    'collectionDate' => self::SCALAR,
                    'examDate' => self::SCALAR,
                    'result' => self::SCALAR,
                ],
                'chestXray' => [
                    'collectionDate' => self::SCALAR,
                    'examDate' => self::SCALAR,
                    'result' => self::SCALAR,
                ],
                'tst' => [
                    'collectionDate' => self::SCALAR,
                    'examDate' => self::SCALAR,
                    'result' => self::SCALAR,
                ],
                'other' => [
                    'label' => self::SCALAR,
                    'collectionDate' => self::SCALAR,
                    'examDate' => self::SCALAR,
                    'result' => self::SCALAR,
                ],
            ],
            'diagnosis' => [
                'diagnosisType' => self::SCALAR,
                'dateOfDiagnosis' => self::SCALAR,
                'dateOfNotification' => self::SCALAR,
                'tbCaseNumber' => self::SCALAR,
                'attendingPhysician' => self::SCALAR,
                'referredTo' => self::SCALAR,
            ],
            'classification' => [
                'bacteriologicalStatus' => self::SCALAR,
                'anatomicalSite' => self::SCALAR,
                'extrapulmonarySite' => self::SCALAR,
                'drugResistance' => self::SCALAR,
                'registrationGroup' => self::SCALAR,
            ],
            // Form 8 - used by both BHC and RHU, not iClinicSys-territory
            // general history (Forms Finalization Checklist 3.3).
            'comorbidities' => [
                'hivStatus' => self::SCALAR,
                'hivTestDate' => self::SCALAR,
                'artStatus' => self::SCALAR,
                'artStartDate' => self::SCALAR,
                'cptStatus' => self::SCALAR,
                'cptStartDate' => self::SCALAR,
                'otherComorbidities' => self::SCALAR,
            ],
            'regimen' => [
                'rows' => ['*' => [
                    'dateStart' => self::SCALAR,
                    'drug4fdc' => self::SCALAR,
                    'drug2fdc' => self::SCALAR,
                    'drugH' => self::SCALAR,
                    'drugR' => self::SCALAR,
                    'drugZ' => self::SCALAR,
                    'drugE' => self::SCALAR,
                    'strength' => self::SCALAR,
                    'unit' => self::SCALAR,
                ]],
            ],
            'treatmentSupporter' => [
                'locationOfTreatment' => self::SCALAR,
                'supporterName' => self::SCALAR,
                'supporterDesignation' => self::SCALAR,
                'supporterType' => self::SCALAR,
                'contactInfo' => self::SCALAR,
                'datSupported' => self::SCALAR,
                'scheduleOfTreatment' => self::SCALAR,
            ],
            'phases' => [
                'intensiveStart' => self::SCALAR,
                'intensiveEnd' => self::SCALAR,
                'continuationStart' => self::SCALAR,
                'continuationEnd' => self::SCALAR,
            ],
            'adverseEvents' => ['*' => [
                'dateOfAe' => self::SCALAR,
                'specificAe' => self::SCALAR,
                'dateReportedToFda' => self::SCALAR,
            ]],
            'doseCalendar' => [
                'adherencePercent' => self::SCALAR,
                'months' => ['*' => [
                    'monthIndex' => self::SCALAR,
                    'label' => self::SCALAR,
                    'days' => ['*' => self::SCALAR],
                    'monthlyTotal' => self::SCALAR,
                    'cumulativeDoses' => self::SCALAR,
                    'monthlyPercent' => self::SCALAR,
                    'weightKg' => self::SCALAR,
                    'heightCm' => self::SCALAR,
                ]],
            ],
            // Final NTP treatment outcome. The frontend's EMPTY_TB_DATA always
            // carries it (empty until treatment closes), so every draft has it.
            'outcome' => [
                'status' => self::SCALAR,
                'date' => self::SCALAR,
            ],
        ],
        // Care Plan & Next Steps: what this consultation continues or stops.
        'carePlan' => [
            'continuedConcerns' => ['*' => ['taskId' => self::SCALAR, 'careOutcome' => self::SCALAR]],
            'continuedFollowUpTaskIds' => ['*' => self::SCALAR],
            'continuedMonitoringIds' => ['*' => self::SCALAR],
            'monitoringStops' => ['*' => [
                'monitoringId' => self::SCALAR,
                'reason' => self::SCALAR,
            ]],
            'monitoringReferrals' => ['*' => self::SCALAR],
            'startConditionIds' => ['*' => self::SCALAR],
            // v2 visit-level next actions.
            'bhcFollowUp' => self::SCALAR,
            'referToRhu' => self::SCALAR,
            'referralMultipleIssues' => self::SCALAR,
            'serviceReferrals' => ['*' => self::SCALAR],
        ],
        // Patient Background sections edited in this consultation, applied to
        // the patient on finalize (PatientBackground::apply). Only the sections
        // the clinician changed are present, each with the revision it was
        // opened at. Never stored for or sent to users without clinical.history
        // (HealthRecordDraftService / HealthRecordDraftController::show).
        // 'backgroundUpdate' is added by schema(): PatientBackground owns its shape.
        // Who gave this visit's history, and the similar-illness answer; both
        // are saved on the record (HealthRecordRequest informant / similar_illness).
        'informant' => [
            'relation' => self::SCALAR,
            'name' => self::SCALAR,
            'patientId' => self::SCALAR,
        ],
        'similarIllness' => [
            'answer' => self::SCALAR,
            'who' => self::SCALAR,
            'note' => self::SCALAR,
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
        ],
        'dispensedMedicines' => ['*' => [
            'confirmedGiven' => self::SCALAR,
            'medicineId' => self::SCALAR,
            'quantity' => self::SCALAR,
            // Typed per-line remarks used to be dropped here, so resuming a
            // draft silently lost them.
            'remarks' => self::SCALAR,
        ]],
        'prescribedMedicines' => ['*' => [
            'medicineId' => self::SCALAR,
            'quantity' => self::SCALAR,
            'unit' => self::SCALAR,
            'instructions' => self::SCALAR,
            'category' => self::SCALAR,
            'name' => self::SCALAR,
        ]],
        'includeTb' => self::SCALAR,
        'rhuFollowUp' => self::SCALAR,
        'manageToBhc' => self::SCALAR,
        'rhuVisitId' => self::SCALAR,
    ];

    /**
     * SCHEMA plus the Patient Background update, whose keys come from
     * PatientBackground's own field whitelist so the two cannot drift.
     */
    private function schema(): array
    {
        return [...self::SCHEMA, 'backgroundUpdate' => PatientBackground::draftSchema('baseRevisions')];
    }

    /**
     * sanitize() for a payload read back from storage. A staged background
     * update an older bundle saved can still fail today's rules in a way
     * isLegacyUpdate() does not foresee; the draft must still open, so that
     * one node is dropped (the clinician re-enters the history) rather than
     * the whole draft failing.
     */
    public function sanitizeStored(array $payload): array
    {
        try {
            return $this->sanitize($payload);
        } catch (ValidationException $exception) {
            $inBackground = array_filter(
                array_keys($exception->errors()),
                fn (string $key): bool => $key === 'payload.backgroundUpdate' || str_starts_with($key, 'payload.backgroundUpdate.')
            );
            if ($inBackground === [] || ! array_key_exists('backgroundUpdate', $payload)) {
                throw $exception;
            }
            unset($payload['backgroundUpdate']);

            return $this->sanitize($payload);
        }
    }

    public function sanitize(array $payload): array
    {
        // Drafts saved before the ITR Patient History rework stage the update in
        // the old string shapes, which no longer validate. Drop it so they open.
        if (is_array($payload['backgroundUpdate'] ?? null) && PatientBackground::isLegacyUpdate($payload['backgroundUpdate'])) {
            unset($payload['backgroundUpdate']);
        }

        // Drafts saved before the BHC preferred-doctor field was removed still
        // carry it; drop it so they stay readable.
        if (is_array($payload['referralForm'] ?? null)) {
            unset($payload['referralForm']['preferredRhuDoctorId']);
        }

        // TB stopped being a consultation program. Drafts saved earlier may still
        // list it; drop it (and any primary that pointed at it) so they open.
        // The draft's stored tbData is left untouched.
        if (is_array($payload['selectedPrograms'] ?? null) && array_is_list($payload['selectedPrograms'])) {
            $payload['selectedPrograms'] = array_values(array_filter(
                $payload['selectedPrograms'],
                fn ($program) => $program !== 'TB'
            ));
        }
        if (($payload['primaryProgram'] ?? null) === 'TB') {
            $payload['primaryProgram'] = is_array($payload['selectedPrograms'] ?? null)
                ? ($payload['selectedPrograms'][0] ?? '')
                : '';
        }

        // The Purpose of Visit is no longer recorded. Drafts saved earlier may
        // still carry it; drop it so they open (the workspace no longer reads it).
        unset($payload['visitPurpose']);

        // HFMD surveillance tags were retired for the per-diagnosis
        // includeInSurveillance flag. Drafts saved earlier may still carry
        // them; drop them so they open (the workspace no longer reads them).
        unset($payload['surveillanceTags']);

        $sanitized = $this->sanitizeNode($payload, $this->schema(), 'payload');

        $validator = Validator::make(['payload' => $sanitized], $this->rules());
        $validator->after(function ($validator) use ($sanitized): void {
            ConsultationPrograms::validateSelection($validator, $sanitized['selectedPrograms'] ?? null, $sanitized['primaryProgram'] ?? null, 'payload');
        });
        $validator->validate();

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

        // An object or list the form has not filled in (e.g. a Patient Background
        // slice that was never recorded) is sent as null.
        if ($value === null) {
            return null;
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
            ...ConsultationPrograms::rules('payload'),
            ...PatientBackground::rules('payload.backgroundUpdate', 'baseRevisions', draft: true),
            'payload.informant' => ['nullable', 'array'],
            'payload.informant.relation' => ['required_with:payload.informant', 'string', Rule::in(HealthRecord::INFORMANT_RELATIONS)],
            'payload.informant.name' => ['nullable', 'string', 'max:150'],
            'payload.informant.patientId' => ['nullable', 'integer', 'exists:patients,id'],
            'payload.similarIllness' => ['nullable', 'array'],
            'payload.similarIllness.answer' => ['required_with:payload.similarIllness', 'string', Rule::in(HealthRecord::SIMILAR_ILLNESS_ANSWERS)],
            'payload.similarIllness.who' => ['nullable', 'string', 'max:150'],
            'payload.similarIllness.note' => ['nullable', 'string', 'max:500'],
            'payload.consultationUuid' => ['nullable', 'uuid'],
            'payload.consultationWorkflow' => ['nullable', Rule::in([HealthRecord::WORKFLOW_BHC_GENERAL_V2, HealthRecord::WORKFLOW_RHU_ITR_V1])],
            'payload.consultationMode' => ['nullable', 'in:general,program'],
            'payload.wizardPhase' => ['nullable', 'in:program,form,next,review'],
            'payload.formStep' => ['nullable', 'string', 'max:100'],
            'payload.nextScreen' => ['nullable', 'in:next,outcome,monitoring'],
            'payload.physicalExam' => ['nullable', 'string'],
            ...BodyFindingReassessments::rules('payload.bodyFindingReassessments'),
            'payload.bodyFindings' => ['nullable', 'array', 'max:50'],
            'payload.bodyFindings.*.id' => ['nullable', 'string', 'max:64'],
            'payload.bodyFindings.*.region' => ['required', 'string', Rule::in(HealthRecord::BODY_REGIONS)],
            'payload.bodyFindings.*.side' => ['nullable', 'string', Rule::in(['front', 'back'])],
            'payload.bodyFindings.*.location' => ['nullable', 'string', 'max:100'],
            'payload.bodyFindings.*.finding' => ['required', 'string', 'max:150'],
            'payload.bodyFindings.*.note' => ['nullable', 'string', 'max:500'],
            'payload.diagnoses' => ['nullable', 'array', 'max:20'],
            'payload.diagnoses.*.id' => ['nullable', 'string', 'max:64'],
            'payload.diagnoses.*.name' => ['required', 'string', 'max:150'],
            'payload.diagnoses.*.reportAs' => ['nullable', 'string', Rule::in(HealthRecord::DIAGNOSIS_REPORT_TYPES)],
            'payload.diagnoses.*.reportIn' => ['nullable', 'array'],
            'payload.diagnoses.*.reportIn.*' => ['string', Rule::in(ReportingEntries::DESTINATIONS)],
            'payload.diagnoses.*.clinicalOutcome' => ['nullable', Rule::in(['managed_at_bhc', 'refer_to_rhu'])],
            'payload.diagnoses.*.activate' => ['nullable', 'boolean'],
            'payload.diagnoses.*.manageToBhc' => ['nullable', 'boolean'],
            'payload.diagnoses.*.referral.urgencyLevel' => ['nullable', Rule::in(\App\Models\Referral::ATTENTION_LEVELS)],
            'payload.diagnoses.*.referral.receivingRhuId' => ['nullable', 'integer'],
            'payload.diagnoses.*.referral.reasonForReferral' => ['nullable', 'string', 'max:5000'],
            'payload.carePlan.bhcFollowUp' => ['nullable', 'boolean'],
            'payload.carePlan.continuedConcerns' => ['nullable', 'array', 'max:20'],
            'payload.carePlan.continuedConcerns.*.taskId' => ['required', 'integer', 'min:1', 'distinct'],
            'payload.carePlan.continuedConcerns.*.careOutcome' => ['nullable', Rule::in(ContinuedConcerns::OUTCOMES)],
            'payload.sharedConditionReferral' => ['nullable', 'boolean'],
            'payload.carePlan.referToRhu' => ['nullable', 'boolean'],
            'payload.carePlan.referralMultipleIssues' => ['nullable', 'boolean'],
            'payload.carePlan.serviceReferrals' => ['nullable', 'array', 'max:3'],
            'payload.carePlan.serviceReferrals.*' => ['string', Rule::in(['Maternal', 'EPI', 'Family Planning'])],
            'payload.assessmentNotes' => ['nullable', 'string', 'max:5000'],
            'payload.dateOfVisit' => ['nullable', 'date_format:Y-m-d'],
            'payload.timeOfVisit' => ['nullable', 'date_format:H:i'],
            'payload.followUpDate' => ['nullable', 'date_format:Y-m-d'],
            'payload.followUpTime' => ['nullable', 'date_format:H:i'],
            'payload.followUpReason' => ['nullable', 'string', 'max:1000'],
            'payload.noInterventionPerformed' => ['nullable', 'boolean'],
            'payload.noInterventionReason' => ['nullable', 'string', 'max:1000'],
            'payload.followUpSchedules' => ['nullable', 'array', 'max:20'],
            'payload.followUpSchedules.*.purposeKey' => ['nullable', 'string', 'max:64'],
            'payload.followUpSchedules.*.purpose' => ['nullable', 'string', 'max:150'],
            'payload.followUpSchedules.*.date' => ['nullable', 'date_format:Y-m-d'],
            'payload.followUpSchedules.*.time' => ['nullable', 'date_format:H:i'],
            'payload.followUpSchedules.*.predecessorTaskId' => ['nullable', 'integer'],
            'payload.followUpSchedules.*.sourceEntryId' => ['nullable', 'string', 'max:64'],
            'payload.expectedDeliveryDate' => ['nullable', 'date_format:Y-m-d'],
            'payload.hfmdSurveillance' => ['nullable', 'boolean'],
            'payload.needsReferral' => ['nullable', 'boolean'],
            'payload.careDecisionStep' => ['nullable', 'boolean'],
            'payload.referralDetailsStep' => ['nullable', 'boolean'],
            'payload.dispensedMedicines' => ['nullable', 'array', 'max:50'],
            'payload.dispensedMedicines.*.medicineId' => ['required', 'integer'],
            'payload.dispensedMedicines.*.remarks' => ['nullable', 'string', 'max:500'],
            'payload.dispensedMedicines.*.quantity' => [
                'required',
                'integer',
                'min:1',
                'max:2147483647',
            ],
            'payload.prescribedMedicines' => ['nullable', 'array', 'max:50'],
            'payload.prescribedMedicines.*.medicineId' => ['required', 'integer'],
            'payload.prescribedMedicines.*.quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'payload.prescribedMedicines.*.unit' => ['nullable', 'string', 'max:50'],
            'payload.prescribedMedicines.*.instructions' => ['nullable', 'string', 'max:1000'],
            'payload.prescribedMedicines.*.category' => ['nullable', 'string', 'max:100'],
            'payload.prescribedMedicines.*.name' => ['nullable', 'string', 'max:200'],
            'payload.includeTb' => ['nullable', 'boolean'],
            'payload.rhuFollowUp' => ['nullable', 'boolean'],
            'payload.manageToBhc' => ['nullable', 'boolean'],
            'payload.rhuVisitId' => ['nullable', 'integer'],
            'payload.maternalData.previousPregnancyHistory' => ['nullable', 'array', 'max:30'],
            'payload.maternalData.immunizationThisVisit.type' => [
                'nullable',
                'in:tt1,tt2,tt3,tt4,tt5,td1,td2,td3,td4,td5',
            ],
            'payload.immunizationData.vaccineEntries' => ['nullable', 'array', 'max:30'],
            'payload.immunizationData.vaccineEntries.*.dateGiven' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'payload.immunizationData.vaccineEntries.*.nextScheduleDate' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'payload.tbData.regimen.rows' => ['nullable', 'array', 'max:10'],
            'payload.tbData.adverseEvents' => ['nullable', 'array', 'max:30'],
            'payload.tbData.doseCalendar.months' => ['nullable', 'array', 'max:13'],
            'payload.tbData.doseCalendar.months.*.days' => ['nullable', 'array', 'max:31'],
        ];
    }
}
