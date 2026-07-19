<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class HealthRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->isMethod('post')) {
            $this->merge([
                'idempotency_key' => $this->header('Idempotency-Key'),
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
            'idempotency_key' => $this->isMethod('post')
                ? ['bail', 'required', 'uuid', 'max:64']
                : ['prohibited'],
            'patient_id' => [$this->isMethod('post') ? 'required' : 'sometimes', 'exists:patients,id'],
            'date_recorded' => ['nullable', 'date'],
            'vital_signs' => ['nullable', 'array'],
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
            'monitoring_data' => ['nullable', 'array'],
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
            'needs_referral' => ['nullable', 'boolean'],
            'chief_complaint' => ['nullable', 'string'],
            'diagnosis' => ['nullable', 'string'],
            'treatment_notes' => ['nullable', 'string'],
            'medical_history' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'dispensed_medicines' => ['nullable', 'array'],
            'dispensed_medicines.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'dispensed_medicines.*.quantity' => ['required', 'integer', 'min:1'],
            'dispensed_medicines.*.unit' => ['nullable', 'string', 'max:50'],
            'dispensed_medicines.*.remarks' => ['nullable', 'string'],
            'referral' => ['nullable', 'array'],
            'referral.referral_category' => ['nullable', 'string', 'max:100'],
            'referral.urgency_level' => ['nullable', Rule::in(['Low', 'Normal', 'Urgent', 'Emergency'])],
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
        $validator->after(function ($validator): void {
            $monitoringData = $this->input('monitoring_data', []);
            $status = $monitoringData['followUpStatus']
                ?? $monitoringData['follow_up_status']
                ?? $monitoringData['status']
                ?? null;
            $date = $monitoringData['followUpDate']
                ?? $monitoringData['follow_up_date']
                ?? null;

            $normalizedStatus = str_replace(
                ['_', '-'],
                ' ',
                strtolower(trim((string) $status))
            );

            if ($normalizedStatus === 'follow up required' && ! $date) {
                $validator->errors()->add(
                    'monitoring_data.followUpDate',
                    'Follow-up date is required when status is Follow-up Required.'
                );
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
}
