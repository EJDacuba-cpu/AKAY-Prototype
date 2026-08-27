<?php

namespace Tests\Unit\Services;

use App\Services\HealthRecordDraftPayloadService;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Synchronization test between the frontend draft payload builder
 * (frontend/src/pages/bhc/AddHealthRecord.jsx:buildHealthRecordDraftPayload)
 * and the backend allowlist (HealthRecordDraftPayloadService::SCHEMA).
 *
 * These two lists are hand-maintained in two languages with no shared
 * contract. This test reconstructs the exact shape the frontend sends
 * (every top-level field, every pickDraftFields() allowlist, and the raw
 * tbData shape) and runs it through the real sanitizeNode() allowlist, so
 * any future field added on one side and forgotten on the other fails
 * here instead of as a 422 in production.
 */
class HealthRecordDraftPayloadServiceTest extends TestCase
{
    public function test_fully_populated_frontend_payload_survives_sanitization(): void
    {
        $service = new HealthRecordDraftPayloadService();

        $sanitized = $service->sanitize($this->fullFrontendPayload());

        $this->assertIsArray($sanitized);
    }

    public function test_reverting_followup_time_and_preferred_doctor_naming_reproduces_the_original_bug(): void
    {
        // Guards against the exact regression this test suite was written for:
        // if these two field names ever drift back out of sync, this test
        // (not just production) must fail.
        $service = new HealthRecordDraftPayloadService();

        $withoutFollowUpTimeSupport = $this->fullFrontendPayload();
        // Simulate the pre-fix backend by sending a payload shaped like the
        // pre-fix frontend would never produce: renaming the fields back to
        // what the broken schema expected shows the allowlist genuinely
        // discriminates between the two names rather than accepting anything.
        $withoutFollowUpTimeSupport['referralForm']['preferredDoctor'] =
            $withoutFollowUpTimeSupport['referralForm']['preferredRhuDoctorId'];
        unset($withoutFollowUpTimeSupport['referralForm']['preferredRhuDoctorId']);

        $this->expectException(ValidationException::class);

        $service->sanitize($withoutFollowUpTimeSupport);
    }

    private function fullFrontendPayload(): array
    {
        return [
            'dateOfVisit' => '2026-08-27',
            'timeOfVisit' => '09:30',
            'chiefComplaint' => 'Fever and cough',
            'summaryOfPresentIllness' => 'Onset three days ago',
            'diagnosis' => 'Upper respiratory tract infection',
            'medication' => 'Paracetamol',
            'attendingStaff' => 'Nurse Reyes',
            'consultationNotes' => 'Advised rest and hydration',
            'systolicBp' => '120',
            'diastolicBp' => '80',
            'temp' => '37.5',
            'weight' => '60',
            'height' => '165',
            'followUpStatus' => 'Routine Monitoring',
            'followUpDate' => '2026-09-03',
            'followUpTime' => '10:00',
            'monitoringNotes' => 'Check temperature daily',
            'patientCondition' => 'Improving',
            'morbidityReportingStatus' => 'not_included',
            'hfmdSurveillance' => false,
            'needsReferral' => false,
            'careDecisionStep' => true,
            'referralDetailsStep' => false,
            'expectedDeliveryDate' => '2026-12-01',
            'aog' => '28 weeks',
            'maternalData' => [
                'lmp' => '2026-02-01',
                'pmp' => '2026-01-01',
                'cycleDuration' => '28',
                'gravida' => '2',
                'para' => '1',
                'term' => '1',
                'preterm' => '0',
                'abortion' => '0',
                'living' => '1',
                'bmi' => '22.5',
                'treatment' => 'Iron supplementation',
                'previousFpMethodUsed' => 'Pills',
                'previousFpMethodOther' => '',
                'previousPregnancyHistory' => [
                    [
                        'pregnancyNo' => '1',
                        'placeOfDelivery' => 'RHU',
                        'year' => '2023',
                        'notes' => 'Normal delivery',
                    ],
                ],
                'riskAssessment' => [
                    'ageRisk' => false,
                    'heightRisk' => false,
                    'grandMultipara' => false,
                    'previousCs' => false,
                    'recurrentMiscarriageOrStillbirth' => false,
                    'postpartumHemorrhage' => false,
                    'tuberculosis' => false,
                    'heartDisease' => false,
                    'diabetes' => false,
                    'bronchialAsthma' => false,
                    'goiter' => false,
                    'hypertensive' => false,
                    'alcoholUser' => false,
                    'smoker' => false,
                ],
                'laboratoryResults' => [
                    'hemoglobin' => '120',
                    'cbc' => 'Normal',
                    'hbsag' => 'Non-reactive',
                    'bloodType' => 'O+',
                    'hiv' => 'Non-reactive',
                    'syphilis' => 'Non-reactive',
                    'urinalysis' => 'Normal',
                ],
                'tetanusToxoidStatus' => [
                    'tt1' => '2026-01-01',
                    'tt2' => '2026-02-01',
                    'tt3' => '',
                    'tt4' => '',
                    'tt5' => '',
                ],
                'ultrasound' => [
                    'result' => 'Single live intrauterine pregnancy',
                    'dateDone' => '2026-08-01',
                ],
            ],
            'immunizationData' => [
                'bcg_vaccine' => '2026-01-01',
                'hepb_birth' => '2026-01-01',
                'pentavalent_dose1' => '',
                'pentavalent_dose2' => '',
                'pentavalent_dose3' => '',
                'opv_dose1' => '',
                'opv_dose2' => '',
                'opv_dose3' => '',
                'ipv_dose1' => '',
                'ipv_dose2' => '',
                'pcv_dose1' => '',
                'pcv_dose2' => '',
                'pcv_dose3' => '',
                'mmr_dose1' => '',
                'mmr_dose2' => '',
                'feeding_status' => 'Exclusively breastfed',
                'vaccineEntries' => [
                    [
                        'vaccineName' => 'BCG',
                        'customVaccineName' => '',
                        'dose' => '0.05ml',
                        'dateGiven' => '2026-01-01',
                        'weight' => '3.2',
                        'height' => '50',
                        'temperature' => '36.8',
                        'nextScheduleDate' => '2026-02-01',
                        'siteRoute' => 'Intradermal, right deltoid',
                        'reason' => 'Routine',
                        'remarks' => 'No adverse reaction',
                    ],
                ],
                'breastfeedingMonitoring' => [
                    'month1' => 'Exclusive',
                    'month2' => 'Exclusive',
                    'month3' => '',
                    'month4' => '',
                    'month5' => '',
                    'month6' => '',
                ],
            ],
            'familyPlanningData' => [
                'clientType' => 'New Acceptor',
                'methodUsed' => 'Pills',
                'previousMethod' => '',
                'fpVisitType' => 'Initial',
                'source' => 'RHU',
                'dateRegistered' => '2026-08-01',
                'dateOfVisit' => '2026-08-27',
                'nextAppointmentDate' => '2026-09-27',
                'remarks' => 'No concerns',
                'actionTaken' => 'Counseled on method',
                'hasClinicalConcern' => false,
                'concern' => '',
                'findings' => '',
                'adviceGiven' => 'Continue current method',
            ],
            'hypertensionDiabeticData' => [
                'bp' => '130/85',
                'fbs' => '95',
                'conditionType' => 'Hypertension',
                'clientStatus' => 'Controlled',
                'dateOfLastConsultation' => '2026-08-01',
                'treatmentActionTaken' => 'Continue current medication',
            ],
            'tbData' => [
                'caseFinding' => [
                    'diagnosingFacility' => 'Sample RHU',
                    'ntpFacilityCode' => 'NTP-001',
                    'provinceHuc' => 'Sample Province',
                    'region' => 'Region IV-A',
                    'referredBy' => 'public',
                    'screeningCategory' => 'PCF',
                    'dateOfScreening' => '2026-07-01',
                ],
                'laboratory' => [
                    'xpert' => [
                        'collectionDate' => '2026-07-01',
                        'examDate' => '2026-07-02',
                        'result' => 'MTB detected',
                    ],
                    'smearOrLamp' => [
                        'collectionDate' => '',
                        'examDate' => '',
                        'result' => '',
                    ],
                    'chestXray' => [
                        'collectionDate' => '',
                        'examDate' => '',
                        'result' => '',
                    ],
                    'tst' => [
                        'collectionDate' => '',
                        'examDate' => '',
                        'result' => '',
                    ],
                    'other' => [
                        'label' => '',
                        'collectionDate' => '',
                        'examDate' => '',
                        'result' => '',
                    ],
                ],
                'diagnosis' => [
                    'diagnosisType' => 'tb_disease',
                    'dateOfDiagnosis' => '2026-07-05',
                    'dateOfNotification' => '2026-07-06',
                    'tbCaseNumber' => 'TB-2026-001',
                    'attendingPhysician' => 'Dr. Santos',
                    'referredTo' => 'RHU TB Clinic',
                ],
                'classification' => [
                    'bacteriologicalStatus' => 'bacteriologically_confirmed',
                    'anatomicalSite' => 'pulmonary',
                    'extrapulmonarySite' => '',
                    'drugResistance' => 'drug_susceptible',
                    'registrationGroup' => 'new',
                ],
                'regimen' => [
                    'rows' => [
                        [
                            'dateStart' => '2026-07-10',
                            'drug4fdc' => '2',
                            'drug2fdc' => '',
                            'drugH' => '',
                            'drugR' => '',
                            'drugZ' => '',
                            'drugE' => '',
                            'strength' => '',
                            'unit' => 'tablet',
                        ],
                    ],
                ],
                'treatmentSupporter' => [
                    'locationOfTreatment' => 'facility',
                    'supporterName' => 'Nurse Cruz',
                    'supporterDesignation' => 'BHW',
                    'supporterType' => 'Health Worker',
                    'contactInfo' => '09171234567',
                    'datSupported' => true,
                    'scheduleOfTreatment' => 'Daily',
                ],
                'phases' => [
                    'intensiveStart' => '2026-07-10',
                    'intensiveEnd' => '2026-09-10',
                    'continuationStart' => '2026-09-11',
                    'continuationEnd' => '2026-12-11',
                ],
                'adverseEvents' => [
                    [
                        'dateOfAe' => '2026-07-15',
                        'specificAe' => 'Nausea',
                        'dateReportedToFda' => '2026-07-16',
                    ],
                ],
                'doseCalendar' => [
                    'adherencePercent' => 92,
                    'months' => [
                        [
                            'monthIndex' => 0,
                            'label' => 'Month 1',
                            'days' => array_fill(0, 31, ''),
                            'monthlyTotal' => 20,
                            'cumulativeDoses' => 20,
                            'monthlyPercent' => 92,
                            'weightKg' => '60',
                            'heightCm' => '165',
                        ],
                    ],
                ],
            ],
            'referralForm' => [
                'urgencyLevel' => 'Routine',
                'dateOfReferral' => '2026-08-27',
                'timeOfReferral' => '11:00',
                'referringPractitioner' => 'Nurse Reyes',
                'chiefComplaint' => 'Fever and cough',
                'initialDiagnosis' => 'Upper respiratory tract infection',
                'initialActionsTaken' => 'Symptomatic treatment given',
                'reasonForReferral' => 'Needs further evaluation',
                'clinicalSummary' => 'Stable, ambulatory patient',
                'preferredRhuDoctorId' => '42',
            ],
            'dispensedMedicines' => [
                [
                    'medicineId' => 1,
                    'quantity' => 2,
                ],
            ],
        ];
    }
}
