<?php

namespace App\Http\Requests;

use App\Models\Referral;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReferralRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isBhw() ?? false;
    }

    public function rules(): array
    {
        return [
            'patient_id' => ['required', 'exists:patients,id'],
            'health_record_id' => ['nullable', 'exists:health_records,id'],
            'client_submission_id' => ['nullable', 'string', 'max:100'],
            'referral_category' => ['nullable', 'string', 'max:100'],
            'urgency_level' => ['required', Rule::in(Referral::ATTENTION_LEVELS)],
            'reason_for_referral' => ['required', 'string'],
            'chief_complaint' => ['nullable', 'string'],
            'initial_diagnosis' => ['nullable', 'string'],
            'initial_action_taken' => ['nullable', 'string'],
            'referring_practitioner' => ['nullable', 'string', 'max:255'],
            'preferred_doctor' => ['nullable', 'string', 'max:255'],
            // REF-SLIP-05 - a non-binding preference (REF-SLIP-05b). Existence
            // is checked here; that it belongs to the receiving RHU and is
            // active is enforced by the submission gate (DOC-15).
            'preferred_provider_id' => ['nullable', 'integer', 'exists:rhu_providers,id'],
            // REF-SLIP-05c - resubmission flag after the Decision A warning.
            'acknowledged_unavailable_preference' => ['nullable', 'boolean'],
            'referral_datetime' => ['nullable', 'date'],
            'remarks' => ['nullable', 'string'],
        ];
    }
}
