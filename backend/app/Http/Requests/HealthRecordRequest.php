<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class HealthRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        return [
            'patient_id' => [$this->isMethod('post') ? 'required' : 'sometimes', 'exists:patients,id'],
            'date_recorded' => ['nullable', 'date'],
            'vital_signs' => ['nullable', 'array'],
            'visit_type' => ['nullable', 'string', 'in:initial_consultation,follow_up_visit'],
            'parent_health_record_id' => ['nullable', 'exists:health_records,id'],
            'category' => ['nullable', 'string', 'max:100'],
            'maternal_data' => ['nullable', 'array'],
            'immunization_data' => ['nullable', 'array'],
            'monitoring_data' => ['nullable', 'array'],
            'needs_referral' => ['nullable', 'boolean'],
            'chief_complaint' => ['nullable', 'string'],
            'diagnosis' => ['nullable', 'string'],
            'treatment_notes' => ['nullable', 'string'],
            'medical_history' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
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
        });
    }
}
