<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReferralRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        return [
            'patient_id' => ['required', 'exists:patients,id'],
            'health_record_id' => ['nullable', 'exists:health_records,id'],
            'rural_health_unit_id' => ['required', 'exists:rural_health_units,id'],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'referral_category' => ['nullable', 'string', 'max:100'],
            'urgency_level' => ['nullable', Rule::in(['Low', 'Normal', 'Urgent', 'Emergency'])],
            'reason_for_referral' => ['required', 'string'],
            'chief_complaint' => ['nullable', 'string'],
            'initial_diagnosis' => ['nullable', 'string'],
            'initial_action_taken' => ['nullable', 'string'],
            'referring_practitioner' => ['nullable', 'string', 'max:255'],
            'referral_datetime' => ['nullable', 'date'],
            'remarks' => ['nullable', 'string'],
        ];
    }
}
