<?php

namespace App\Http\Requests;

use App\Models\HealthRecord;
use App\Models\Referral;
use App\Services\ConsultationPrograms;
use App\Services\CurrentConditionsSync;
use App\Services\VisitPurpose;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class HealthRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $monitoringData = $this->input('monitoring_data');
        if (is_array($monitoringData)) {
            unset($monitoringData['follow_up_reason']);
            $this->merge(['monitoring_data' => $monitoringData]);
        }

        if ($this->isMethod('post')) {
            $this->merge([
                'idempotency_key' => $this->header('Idempotency-Key'),
                'draft_public_id' => $this->header('X-Health-Record-Draft-ID'),
            ]);
        }
    }

    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        return [
            ...ConsultationPrograms::rules('monitoring_data'),
            ...VisitPurpose::rules('monitoring_data.visitPurpose'),
            'idempotency_key' => $this->isMethod('post')
                ? ['bail', 'required', 'uuid', 'max:64']
                : ['prohibited'],
            'draft_public_id' => $this->isMethod('post')
                ? ['nullable', 'uuid']
                : ['prohibited'],
            // The consultation this record concludes - the SAME value the
            // client minted at consultation start and carried through every
            // draft. Not a submission key (that is idempotency_key) and never
            // editable afterwards, so it is create-only.
            'consultation_uuid' => $this->isMethod('post')
                ? ['nullable', 'uuid']
                : ['prohibited'],
            'patient_id' => [$this->isMethod('post') ? 'required' : 'sometimes', 'exists:patients,id'],
            'date_recorded' => ['nullable', 'date'],
            'vital_signs' => ['nullable', 'array'],
            'vital_signs.systolicBp' => ['nullable', 'numeric', 'min:0'],
            'vital_signs.diastolicBp' => ['nullable', 'numeric', 'min:0'],
            'vital_signs.temperature' => ['nullable', 'numeric'],
            'vital_signs.pulse' => ['nullable', 'numeric', 'min:0'],
            'vital_signs.spo2' => ['nullable', 'numeric', 'between:0,100'],
            'vital_signs.weight' => ['nullable', 'numeric', 'gt:0'],
            'vital_signs.height' => ['nullable', 'numeric', 'gt:0'],
            // Additional Measurements: optional, reused by Diabetes monitoring
            // and reports. Nothing is ever derived from it.
            'vital_signs.fbs' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'visit_type' => ['nullable', 'string', 'in:initial_consultation,follow_up_visit'],
            'parent_health_record_id' => ['nullable', 'exists:health_records,id'],
            'category' => ['nullable', 'string', 'max:100'],
            'maternal_data' => ['nullable', 'array'],
            'maternal_data.supplements_given' => ['nullable', 'array'],
            'maternal_data.supplements_given.*.supplement_type' => ['required', 'string', 'in:iron_folic_acid,calcium_carbonate,iodine_supplement,vitamin_a,other'],
            'maternal_data.supplements_given.*.supplement_name' => ['nullable', 'string', 'max:150'],
            'maternal_data.supplements_given.*.quantity' => ['required', 'numeric', 'min:1'],
            'maternal_data.supplements_given.*.unit' => ['required', 'string', 'max:50'],
            'maternal_data.supplements_given.*.date_given' => ['required', 'date'],
            'maternal_data.supplements_given.*.remarks' => ['nullable', 'string'],
            'maternal_data.supplements_given.*.given_by_id' => ['nullable', 'integer', 'exists:users,id'],
            'maternal_data.supplements_given.*.given_by_name' => ['nullable', 'string', 'max:150'],
            // Prenatal: the dose given at this visit, and when each lab result
            // was taken. The dose's date is also filed under its TT/Td schedule
            // below, where it is validated as a date as well.
            'maternal_data.immunizationThisVisit' => ['nullable', 'array'],
            'maternal_data.immunizationThisVisit.type' => ['nullable', 'in:tt1,tt2,tt3,tt4,tt5,td1,td2,td3,td4,td5'],
            'maternal_data.immunizationThisVisit.doseStatus' => ['nullable', 'string', 'max:255'],
            'maternal_data.immunizationThisVisit.dateGiven' => ['nullable', 'date'],
            'maternal_data.laboratoryResultDates' => ['nullable', 'array'],
            'maternal_data.laboratoryResultDates.*' => ['nullable', 'date'],
            'maternal_data.fht' => ['nullable', 'string', 'max:100'],
            'maternal_data.tetanusToxoidStatus' => ['nullable', 'array'],
            'maternal_data.tetanusToxoidStatus.tt1' => ['nullable', 'date'],
            'maternal_data.tetanusToxoidStatus.tt2' => ['nullable', 'date'],
            'maternal_data.tetanusToxoidStatus.tt3' => ['nullable', 'date'],
            'maternal_data.tetanusToxoidStatus.tt4' => ['nullable', 'date'],
            'maternal_data.tetanusToxoidStatus.tt5' => ['nullable', 'date'],
            'maternal_data.tetanus_toxoid_status' => ['nullable', 'array'],
            'maternal_data.tetanus_toxoid_status.tt1' => ['nullable', 'date'],
            'maternal_data.tetanus_toxoid_status.tt2' => ['nullable', 'date'],
            'maternal_data.tetanus_toxoid_status.tt3' => ['nullable', 'date'],
            'maternal_data.tetanus_toxoid_status.tt4' => ['nullable', 'date'],
            'maternal_data.tetanus_toxoid_status.tt5' => ['nullable', 'date'],
            // Td (Tetanus-Diphtheria) is a separate 5-dose schedule from TT,
            // tracked independently - not a rename/replacement of it.
            'maternal_data.tetanusDiphtheriaStatus' => ['nullable', 'array'],
            'maternal_data.tetanusDiphtheriaStatus.td1' => ['nullable', 'date'],
            'maternal_data.tetanusDiphtheriaStatus.td2' => ['nullable', 'date'],
            'maternal_data.tetanusDiphtheriaStatus.td3' => ['nullable', 'date'],
            'maternal_data.tetanusDiphtheriaStatus.td4' => ['nullable', 'date'],
            'maternal_data.tetanusDiphtheriaStatus.td5' => ['nullable', 'date'],
            'maternal_data.tetanus_diphtheria_status' => ['nullable', 'array'],
            'maternal_data.tetanus_diphtheria_status.td1' => ['nullable', 'date'],
            'maternal_data.tetanus_diphtheria_status.td2' => ['nullable', 'date'],
            'maternal_data.tetanus_diphtheria_status.td3' => ['nullable', 'date'],
            'maternal_data.tetanus_diphtheria_status.td4' => ['nullable', 'date'],
            'maternal_data.tetanus_diphtheria_status.td5' => ['nullable', 'date'],
            'maternal_data.tt1Date' => ['nullable', 'date'],
            'maternal_data.tt1_date' => ['nullable', 'date'],
            'maternal_data.td1Date' => ['nullable', 'date'],
            'maternal_data.td1_date' => ['nullable', 'date'],
            'maternal_data.tt2Date' => ['nullable', 'date'],
            'maternal_data.tt2_date' => ['nullable', 'date'],
            'maternal_data.td2Date' => ['nullable', 'date'],
            'maternal_data.td2_date' => ['nullable', 'date'],
            'maternal_data.tt3Date' => ['nullable', 'date'],
            'maternal_data.tt3_date' => ['nullable', 'date'],
            'maternal_data.td3Date' => ['nullable', 'date'],
            'maternal_data.td3_date' => ['nullable', 'date'],
            'maternal_data.tt4Date' => ['nullable', 'date'],
            'maternal_data.tt4_date' => ['nullable', 'date'],
            'maternal_data.td4Date' => ['nullable', 'date'],
            'maternal_data.td4_date' => ['nullable', 'date'],
            'maternal_data.tt5Date' => ['nullable', 'date'],
            'maternal_data.tt5_date' => ['nullable', 'date'],
            'maternal_data.td5Date' => ['nullable', 'date'],
            'maternal_data.td5_date' => ['nullable', 'date'],
            'immunization_data' => ['nullable', 'array'],
            'immunization_data.vaccineEntries.*.medicineId' => ['nullable', 'integer', 'exists:medicines,id'],
            'immunization_data.vaccineEntries.*.inventoryQuantity' => ['nullable', 'integer', 'min:1', 'max:2147483647'],
            'immunization_data.vaccineEntries.*.confirmedGiven' => ['nullable', 'boolean'],
            'monitoring_data' => ['nullable', 'array'],
            'monitoring_data.followUpStatus' => ['nullable', 'string', 'max:100'],
            'monitoring_data.follow_up_status' => ['nullable', 'string', 'max:100'],
            'monitoring_data.status' => ['nullable', 'string', 'max:100'],
            'monitoring_data.followUpDate' => ['nullable', 'date'],
            'monitoring_data.follow_up_date' => ['nullable', 'date'],
            'monitoring_data.followUpTime' => ['nullable', 'date_format:H:i'],
            'monitoring_data.follow_up_time' => ['nullable', 'date_format:H:i'],
            'monitoring_data.followUpReason' => ['nullable', 'string', 'max:1000'],
            'monitoring_data.followUpTaskId' => ['nullable', 'integer', 'exists:follow_up_tasks,id'],
            'monitoring_data.follow_up_task_id' => ['nullable', 'integer', 'exists:follow_up_tasks,id'],
            // Physical examination findings. Stored in the existing JSON column
            // rather than a new one - no schema change was needed.
            'monitoring_data.physicalExam' => ['nullable', 'string'],
            'monitoring_data.physical_exam' => ['nullable', 'string'],
            'monitoring_data.monitoringNotes' => ['nullable', 'string'],
            'monitoring_data.monitoring_notes' => ['nullable', 'string'],
            'monitoring_data.patientCondition' => ['nullable', 'string', 'max:100'],
            'monitoring_data.patient_condition' => ['nullable', 'string', 'max:100'],
            'monitoring_data.attendingStaff' => ['nullable', 'string', 'max:150'],
            'monitoring_data.attending_staff' => ['nullable', 'string', 'max:150'],
            // Registry-driven Community-Based Surveillance tags. Coexists with
            // the legacy hfmdSurveillance/surveillanceCategory keys, which
            // HealthRecordController::normalizeSurveillanceData derives from
            // this when present.
            'monitoring_data.surveillanceTags' => ['nullable', 'array'],
            'monitoring_data.surveillanceTags.*' => ['string'],
            'family_planning_data' => ['nullable', 'array'],
            'family_planning_data.clientType' => ['nullable', 'string', 'max:100'],
            'family_planning_data.client_type' => ['nullable', 'string', 'max:100'],
            'family_planning_data.methodUsed' => ['nullable', 'string', 'max:100'],
            'family_planning_data.method_used' => ['nullable', 'string', 'max:100'],
            'family_planning_data.previousMethod' => ['nullable', 'string', 'max:100'],
            'family_planning_data.previous_method' => ['nullable', 'string', 'max:100'],
            'family_planning_data.fpVisitType' => ['nullable', 'string', 'max:100'],
            'family_planning_data.fp_visit_type' => ['nullable', 'string', 'max:100'],
            'family_planning_data.visitType' => ['nullable', 'string', 'max:100'],
            'family_planning_data.visit_type' => ['nullable', 'string', 'max:100'],
            'family_planning_data.source' => ['nullable', 'string', 'max:100'],
            'family_planning_data.dateRegistered' => ['nullable', 'date'],
            'family_planning_data.date_registered' => ['nullable', 'date'],
            'family_planning_data.dateOfVisit' => ['nullable', 'date'],
            'family_planning_data.date_of_visit' => ['nullable', 'date'],
            'family_planning_data.nextAppointmentDate' => ['nullable', 'date'],
            'family_planning_data.next_appointment_date' => ['nullable', 'date'],
            'family_planning_data.remarks' => ['nullable', 'string'],
            'family_planning_data.actionTaken' => ['nullable', 'string'],
            'family_planning_data.action_taken' => ['nullable', 'string'],
            'family_planning_data.hasClinicalConcern' => ['nullable', 'boolean'],
            'family_planning_data.has_clinical_concern' => ['nullable', 'boolean'],
            'family_planning_data.concern' => ['nullable', 'string'],
            'family_planning_data.findings' => ['nullable', 'string'],
            'family_planning_data.adviceGiven' => ['nullable', 'string'],
            'family_planning_data.advice_given' => ['nullable', 'string'],
            'family_planning_data.medicinesSupplies' => ['nullable', 'string'],
            'family_planning_data.medicines_supplies' => ['nullable', 'string'],
            'tb_data' => ['nullable', 'array'],
            'tb_data.caseFinding' => ['nullable', 'array'],
            'tb_data.caseFinding.diagnosingFacility' => ['nullable', 'string', 'max:255'],
            'tb_data.caseFinding.ntpFacilityCode' => ['nullable', 'string', 'max:100'],
            'tb_data.caseFinding.provinceHuc' => ['nullable', 'string', 'max:150'],
            'tb_data.caseFinding.region' => ['nullable', 'string', 'max:100'],
            'tb_data.caseFinding.referredBy' => ['nullable', 'string', 'max:100'],
            'tb_data.caseFinding.screeningCategory' => ['nullable', 'string', 'max:50'],
            'tb_data.caseFinding.dateOfScreening' => ['nullable', 'date'],
            'tb_data.laboratory' => ['nullable', 'array'],
            'tb_data.laboratory.*' => ['nullable', 'array'],
            'tb_data.laboratory.*.label' => ['nullable', 'string', 'max:150'],
            'tb_data.laboratory.*.collectionDate' => ['nullable', 'date'],
            'tb_data.laboratory.*.examDate' => ['nullable', 'date'],
            'tb_data.laboratory.*.result' => ['nullable', 'string', 'max:255'],
            'tb_data.diagnosis' => ['nullable', 'array'],
            'tb_data.diagnosis.diagnosisType' => ['nullable', 'string', 'max:50'],
            'tb_data.diagnosis.dateOfDiagnosis' => ['nullable', 'date'],
            'tb_data.diagnosis.dateOfNotification' => ['nullable', 'date'],
            'tb_data.diagnosis.tbCaseNumber' => ['nullable', 'string', 'max:100'],
            'tb_data.diagnosis.attendingPhysician' => ['nullable', 'string', 'max:255'],
            'tb_data.diagnosis.referredTo' => ['nullable', 'string', 'max:255'],
            'tb_data.classification' => ['nullable', 'array'],
            'tb_data.classification.bacteriologicalStatus' => ['nullable', 'string', 'max:100'],
            'tb_data.classification.anatomicalSite' => ['nullable', 'string', 'max:100'],
            'tb_data.classification.extrapulmonarySite' => ['nullable', 'string', 'max:150'],
            'tb_data.classification.drugResistance' => ['nullable', 'string', 'max:100'],
            'tb_data.classification.registrationGroup' => ['nullable', 'string', 'max:100'],
            // Form 8 - used by both BHC and RHU TB nurses/physicians, not
            // iClinicSys-territory general history (Forms Finalization
            // Checklist 3.3).
            'tb_data.comorbidities' => ['nullable', 'array'],
            'tb_data.comorbidities.hivStatus' => ['nullable', 'string', 'max:50'],
            'tb_data.comorbidities.hivTestDate' => ['nullable', 'date'],
            'tb_data.comorbidities.artStatus' => ['nullable', 'string', 'max:50'],
            'tb_data.comorbidities.artStartDate' => ['nullable', 'date'],
            'tb_data.comorbidities.cptStatus' => ['nullable', 'string', 'max:50'],
            'tb_data.comorbidities.cptStartDate' => ['nullable', 'date'],
            'tb_data.comorbidities.otherComorbidities' => ['nullable', 'string', 'max:500'],
            'tb_data.regimen' => ['nullable', 'array'],
            'tb_data.regimen.rows' => ['nullable', 'array', 'max:10'],
            'tb_data.regimen.rows.*.dateStart' => ['nullable', 'date'],
            'tb_data.regimen.rows.*.drug4fdc' => ['nullable', 'string', 'max:20'],
            'tb_data.regimen.rows.*.drug2fdc' => ['nullable', 'string', 'max:20'],
            'tb_data.regimen.rows.*.drugH' => ['nullable', 'string', 'max:20'],
            'tb_data.regimen.rows.*.drugR' => ['nullable', 'string', 'max:20'],
            'tb_data.regimen.rows.*.drugZ' => ['nullable', 'string', 'max:20'],
            'tb_data.regimen.rows.*.drugE' => ['nullable', 'string', 'max:20'],
            'tb_data.regimen.rows.*.strength' => ['nullable', 'string', 'max:100'],
            'tb_data.regimen.rows.*.unit' => ['nullable', 'string', 'max:50'],
            'tb_data.treatmentSupporter' => ['nullable', 'array'],
            'tb_data.treatmentSupporter.locationOfTreatment' => ['nullable', 'string', 'max:50'],
            'tb_data.treatmentSupporter.supporterName' => ['nullable', 'string', 'max:255'],
            'tb_data.treatmentSupporter.supporterDesignation' => ['nullable', 'string', 'max:150'],
            'tb_data.treatmentSupporter.supporterType' => ['nullable', 'string', 'max:100'],
            'tb_data.treatmentSupporter.contactInfo' => ['nullable', 'string', 'max:150'],
            'tb_data.treatmentSupporter.datSupported' => ['nullable', 'boolean'],
            'tb_data.treatmentSupporter.scheduleOfTreatment' => ['nullable', 'string', 'max:255'],
            'tb_data.phases' => ['nullable', 'array'],
            'tb_data.phases.intensiveStart' => ['nullable', 'date'],
            'tb_data.phases.intensiveEnd' => ['nullable', 'date'],
            'tb_data.phases.continuationStart' => ['nullable', 'date'],
            'tb_data.phases.continuationEnd' => ['nullable', 'date'],
            'tb_data.adverseEvents' => ['nullable', 'array', 'max:30'],
            'tb_data.adverseEvents.*.dateOfAe' => ['nullable', 'date'],
            'tb_data.adverseEvents.*.specificAe' => ['nullable', 'string', 'max:255'],
            'tb_data.adverseEvents.*.dateReportedToFda' => ['nullable', 'date'],
            'tb_data.doseCalendar' => ['nullable', 'array'],
            'tb_data.doseCalendar.adherencePercent' => ['nullable', 'numeric'],
            'tb_data.doseCalendar.months' => ['nullable', 'array', 'max:13'],
            'tb_data.doseCalendar.months.*.monthIndex' => ['nullable', 'integer', 'min:0', 'max:12'],
            'tb_data.doseCalendar.months.*.label' => ['nullable', 'string', 'max:20'],
            'tb_data.doseCalendar.months.*.days' => ['nullable', 'array', 'max:31'],
            'tb_data.doseCalendar.months.*.days.*' => ['nullable', 'string', 'max:10'],
            'tb_data.doseCalendar.months.*.monthlyTotal' => ['nullable', 'numeric'],
            'tb_data.doseCalendar.months.*.cumulativeDoses' => ['nullable', 'numeric'],
            'tb_data.doseCalendar.months.*.monthlyPercent' => ['nullable', 'numeric'],
            'tb_data.doseCalendar.months.*.weightKg' => ['nullable', 'string', 'max:20'],
            'tb_data.doseCalendar.months.*.heightCm' => ['nullable', 'string', 'max:20'],
            'needs_referral' => ['nullable', 'boolean'],
            'chief_complaint' => [$this->isMethod('post') ? 'required' : 'sometimes', 'string'],
            'physical_exam' => ['nullable', 'string'],
            'history_of_present_illness' => ['nullable', 'string'],
            'body_findings' => ['nullable', 'array', 'max:50'],
            'body_findings.*.id' => ['nullable', 'string', 'max:64'],
            'body_findings.*.region' => ['required', 'string', Rule::in(HealthRecord::BODY_REGIONS)],
            'body_findings.*.location' => ['nullable', 'string', 'max:100'],
            'body_findings.*.finding' => ['required', 'string', 'max:150'],
            'body_findings.*.note' => ['nullable', 'string', 'max:500'],
            'diagnosis' => ['nullable', 'string'],
            // Structured diagnoses typed on the Assessment step. `diagnosis`
            // above stays the plain-text copy every reader already uses.
            'diagnoses' => ['nullable', 'array', 'max:20'],
            'diagnoses.*.id' => ['nullable', 'string', 'max:64'],
            'diagnoses.*.name' => ['required', 'string', 'max:150'],
            'diagnoses.*.addToConditions' => ['nullable', 'boolean'],
            'diagnoses.*.conditionStatus' => ['nullable', 'string', Rule::in(CurrentConditionsSync::STATUSES)],
            // Server-resolved from the name by ClinicalRegistry on save
            // (HealthRecordController::store); any value sent here is accepted
            // by validation but always discarded and recomputed, never trusted.
            'diagnoses.*.conditionKey' => ['nullable', 'string', 'max:64'],
            // Which report this diagnosis is included in; null = not reported.
            // Drives the derived monitoring_data.morbidityReportingStatus.
            'diagnoses.*.reportAs' => ['nullable', 'string', Rule::in(HealthRecord::DIAGNOSIS_REPORT_TYPES)],
            // Care Plan & Next Steps, per diagnosis. null = no ongoing tracking.
            'diagnoses.*.carePlan' => ['nullable', 'string', Rule::in(\App\Services\CarePlan::VALUES)],
            'diagnoses.*.includeInSurveillance' => ['nullable', 'boolean'],
            // Existing follow-ups / monitoring this ITR continues (Start
            // Consultation modal), and the monitoring it stops.
            'care_plan' => ['nullable', 'array'],
            'care_plan.continued_follow_up_task_ids' => ['nullable', 'array', 'max:20'],
            'care_plan.continued_follow_up_task_ids.*' => ['integer', 'distinct'],
            'care_plan.continued_monitoring_ids' => ['nullable', 'array', 'max:20'],
            'care_plan.continued_monitoring_ids.*' => ['integer', 'distinct'],
            'care_plan.monitoring_stops' => ['nullable', 'array', 'max:20'],
            'care_plan.monitoring_stops.*.monitoring_id' => ['required', 'integer', 'distinct'],
            'care_plan.monitoring_stops.*.reason' => ['required', 'string', 'max:500', 'regex:/\S/'],
            'assessment_notes' => ['nullable', 'string', 'max:5000'],
            'treatment_notes' => ['nullable', 'string'],
            'medical_history' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'dispensed_medicines' => ['nullable', 'array'],
            'dispensed_medicines.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'dispensed_medicines.*.quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'dispensed_medicines.*.confirmed_given' => ['nullable', 'boolean'],
            'dispensed_medicines.*.unit' => ['nullable', 'string', 'max:50'],
            'dispensed_medicines.*.remarks' => ['nullable', 'string'],
            'referral' => ['nullable', 'array'],
            'referral.referral_category' => ['nullable', 'string', 'max:100'],
            'referral.urgency_level' => ['required_with:referral', Rule::in(Referral::ATTENTION_LEVELS)],
            'referral.rural_health_unit_id' => ['nullable', 'integer', 'exists:rural_health_units,id'],
            'referral.reason_for_referral' => ['required_with:referral', 'string'],
            'referral.chief_complaint' => ['nullable', 'string'],
            'referral.initial_diagnosis' => ['nullable', 'string'],
            'referral.initial_action_taken' => ['nullable', 'string'],
            'referral.referring_practitioner' => ['nullable', 'string', 'max:255'],
            'referral.referral_datetime' => ['nullable', 'date'],
            'referral.remarks' => ['nullable', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'idempotency_key.required' => 'An Idempotency-Key header is required for official health-record creation.',
            'idempotency_key.uuid' => 'The Idempotency-Key header must be a valid UUID.',
            'dispensed_medicines.*.medicine_id.required' => 'Please select a medicine.',
            'dispensed_medicines.*.medicine_id.exists' => 'Medicine stock changed. Please refresh and try again.',
            'dispensed_medicines.*.quantity.required' => 'Quantity must be greater than 0.',
            'dispensed_medicines.*.quantity.integer' => 'Quantity must be a whole number.',
            'dispensed_medicines.*.quantity.min' => 'Quantity must be greater than 0.',
        ];
    }

    public function withValidator($validator): void
    {
        // Laravel excludes array keys that have no rule of their own whenever a
        // field is validated as `array` AND carries nested `field.*` rules
        // (Validator::$excludeUnvalidatedArrayKeys, on by default). Every
        // clinical column here is a free-form JSON blob whose shape the client
        // owns, so that default silently discarded whole sub-objects on save -
        // a since-removed monitoring_data sub-object is how it was found, but
        // maternal_data, family_planning_data, tb_data and referral were all
        // losing every key that had no explicit rule.
        //
        // The nested rules stay and still validate the keys they name; this
        // only stops the unnamed siblings from being thrown away. The columns
        // are JSON and the model's $fillable still bounds what can be written,
        // so nothing new becomes mass-assignable.
        $validator->excludeUnvalidatedArrayKeys = false;

        $validator->after(function ($validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            VisitPurpose::validate($validator, $this);
            $monitoringData = $this->input('monitoring_data', []);
            ConsultationPrograms::validateSelection(
                $validator,
                $this->input('monitoring_data.selectedPrograms'),
                $this->input('monitoring_data.primaryProgram'),
                'monitoring_data',
                $this->input('category', $this->route('health_record')?->category)
            );
            $clinicalRegistry = app(\App\Services\ClinicalRegistry::class);
            foreach ($this->input('monitoring_data.surveillanceTags', []) as $index => $tagKey) {
                if (! is_string($tagKey) || ! $clinicalRegistry->isValidSurveillanceKey($tagKey)) {
                    $validator->errors()->add("monitoring_data.surveillanceTags.$index", 'This surveillance disease is not configured.');
                }
            }
            $status = $monitoringData['followUpStatus']
                ?? $monitoringData['follow_up_status']
                ?? $monitoringData['status']
                ?? null;
            $date = $monitoringData['followUpDate']
                ?? $monitoringData['follow_up_date']
                ?? null;
            $taskId = $monitoringData['followUpTaskId']
                ?? $monitoringData['follow_up_task_id']
                ?? null;
            $needsReferral = filter_var(
                $this->input('needs_referral', false),
                FILTER_VALIDATE_BOOLEAN
            ) || is_array($this->input('referral'));

            $normalizedStatus = str_replace(
                ['_', '-'],
                ' ',
                strtolower(trim((string) $status))
            );

            if (($needsReferral || $normalizedStatus === 'follow up required') && blank($this->input('diagnosis'))) {
                $validator->errors()->add('diagnosis', 'BHC Assessment is required for follow-up or referral.');
            }
            if ($needsReferral && blank($this->input('referral.reason_for_referral'))) {
                $validator->errors()->add('referral.reason_for_referral', 'Reason for referral is required.');
            }
            // A plain referral hands the follow-up to the RHU, so no date is
            // needed. "Monitor at BHC + Refer" keeps the BHC follow-up, so the
            // date is still required when the visit asks for one.
            $monitorsWithReferral = $needsReferral
                && \App\Services\CarePlan::monitorsAny($this->input('diagnoses', []) ?: []);
            if ((! $needsReferral || $monitorsWithReferral) && $normalizedStatus === 'follow up required' && ! $date) {
                $validator->errors()->add(
                    'monitoring_data.followUpDate',
                    'Follow-up date is required when status is Follow-up Required.'
                );
            }

            if (
                $this->isMethod('post')
                && $this->input('visit_type') === 'follow_up_visit'
                && blank($taskId)
            ) {
                $validator->errors()->add(
                    'monitoring_data.followUpTaskId',
                    'The active follow-up task is required for a follow-up visit.'
                );
            }

            $programs = $this->input('monitoring_data.selectedPrograms', []);
            $required = [];
            if (in_array('Family Planning', $programs)) {
                $required[] = 'family_planning_data.methodUsed';
            }
            // A TB program added to the visit still carries its own TB card,
            // whether or not a diagnosis is being monitored.
            if (in_array('TB', $programs)) {
                $required = [...$required, ...\App\Services\MonitoringDetails::REQUIRED_FIELDS['tb_dots']];
            }
            foreach ($this->monitoringDetailKeys() as $detailsKey) {
                $required = [...$required, ...(\App\Services\MonitoringDetails::REQUIRED_FIELDS[$detailsKey] ?? [])];
            }
            foreach (array_unique($required) as $field) {
                if (blank($this->input($field))) {
                    $validator->errors()->add($field, 'Complete this required field.');
                }
            }
            if (in_array('EPI', $programs) && empty($this->input('immunization_data.vaccineEntries')) && blank($this->input('notes'))) {
                $validator->errors()->add('immunization_data.vaccineEntries', 'Select a vaccine or record why no vaccine was given.');
            }
            $medicineIds = array_column($this->input('dispensed_medicines', []), 'medicine_id');
            foreach ($this->input('immunization_data.vaccineEntries', []) as $index => $entry) {
                if (($entry['confirmedGiven'] ?? false) && (empty($entry['medicineId']) || empty($entry['inventoryQuantity']))) {
                    $validator->errors()->add("immunization_data.vaccineEntries.$index", 'Select the inventory item and quantity for the confirmed administration.');
                }
                if (! empty($entry['medicineId']) && in_array($entry['medicineId'], $medicineIds)) {
                    $validator->errors()->add('dispensed_medicines', 'This vaccine is already recorded in the Immunization form. Remove its duplicate Medicines/Supplies entry.');
                }
            }
            $supplements = $this->input('maternal_data.supplements_given', []);
            if (! is_array($supplements)) {
                return;
            }

            foreach ($supplements as $index => $supplement) {
                if (! is_array($supplement)) {
                    continue;
                }

                if (($supplement['supplement_type'] ?? null) === 'other' && empty(trim((string) ($supplement['supplement_name'] ?? '')))) {
                    $validator->errors()->add(
                        "maternal_data.supplements_given.{$index}.supplement_name",
                        'Supplement name is required for Other supplements.'
                    );
                }
            }
        });
    }

    /**
     * Monitoring Details forms this visit needs: one per distinct
     * monitoring_details key among conditions monitored now - diagnoses set to
     * Monitor, plus continued monitoring records that are not being stopped.
     *
     * @return array<int, string>
     */
    private function monitoringDetailKeys(): array
    {
        $registry = app(\App\Services\ClinicalRegistry::class);
        $keys = [];
        foreach ($this->input('diagnoses', []) as $diagnosis) {
            if (! is_array($diagnosis) || ! \App\Services\CarePlan::monitors($diagnosis['carePlan'] ?? null)) {
                continue;
            }
            $match = $registry->matchCondition($diagnosis['name'] ?? null);
            $keys[] = $registry->monitoringDetailsFor($match['key'] ?? null);
        }

        $stopped = array_map('intval', array_column($this->input('care_plan.monitoring_stops', []) ?: [], 'monitoring_id'));
        $continued = array_diff(array_map('intval', $this->input('care_plan.continued_monitoring_ids', []) ?: []), $stopped);
        if ($continued !== []) {
            $conditionKeys = \App\Models\ConditionMonitoring::query()
                ->whereIn('id', $continued)
                ->where('patient_id', (int) $this->input('patient_id'))
                ->pluck('condition_key');
            foreach ($conditionKeys as $conditionKey) {
                $keys[] = $registry->monitoringDetailsFor($conditionKey);
            }
        }

        return array_values(array_unique(array_filter($keys)));
    }
}
