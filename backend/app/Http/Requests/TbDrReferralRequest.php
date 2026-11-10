<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TbDrReferralRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['request_key' => strtolower((string) $this->header('Idempotency-Key'))]);
    }

    public function rules(): array
    {
        $status = $this->route('referral') !== null;
        $forbidden = ['patient_id', 'rural_health_unit_id', 'source_health_record_id', 'patient_snapshot', 'source_snapshot',
            'authorized_by', 'authorized_name', 'authorized_at', 'card_data', 'case_number', 'recorded_by', 'recorder_name', 'recorded_at'];

        return [...array_fill_keys($forbidden, ['prohibited']), 'request_key' => ['required', 'uuid'], ...($status ? [
            ...array_fill_keys(['destination_name', 'destination_address', 'destination_contact', 'reason', 'source_revision', 'confirmed'], ['prohibited']),
            'version' => ['required', 'integer', 'min:1'], 'status' => ['required', Rule::in(['sent', 'attendance_reported', 'cancelled'])],
            'note' => ['required', 'string', 'max:2000'], 'event_on' => ['required', 'date_format:Y-m-d'],
        ] : [
            ...array_fill_keys(['version', 'status', 'note', 'event_on'], ['prohibited']),
            'source_revision' => ['required', 'string', 'size:64'], 'confirmed' => ['required', 'accepted'],
            'destination_name' => ['required', 'string', 'max:255'], 'destination_address' => ['nullable', 'string', 'max:1000'],
            'destination_contact' => ['nullable', 'string', 'max:255'], 'reason' => ['required', 'string', 'max:2000'],
        ])];
    }
}
