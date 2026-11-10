<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TbMonitoringRequest extends FormRequest
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
        $correcting = $this->isMethod('patch');

        return [
            ...array_fill_keys(['card_data', 'diagnosis_snapshot', 'patient_id', 'barangay_health_center_id',
                'tb_treatment_case_id', 'tb_case_endorsement_id', 'recorded_by', 'recorder_name', 'recorded_at',
                'rural_health_unit_id', 'outcome', 'regimen', 'case_number', 'status'], ['prohibited']),
            'request_key' => ['required', 'uuid'],
            'endorsement_id' => ['required', 'integer', 'min:1'],
            'endorsement_version' => ['required', 'integer', 'min:1'],
            'observed_on' => $correcting ? ['prohibited'] : ['required', 'date_format:Y-m-d'],
            'dose_status' => ['present', 'nullable', Rule::in(['taken', 'missed', 'incomplete', 'on_hold', 'dispensed'])],
            'weight_kg' => ['present', 'nullable', 'numeric', 'gt:0', 'max:9999.99', 'decimal:0,2'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'voided' => $correcting ? ['sometimes', 'boolean'] : ['prohibited'],
            'version' => $correcting ? ['required', 'integer', 'min:1'] : ['prohibited'],
            'correction_reason' => $correcting ? ['required', 'string', 'max:1000'] : ['prohibited'],
        ];
    }
}
