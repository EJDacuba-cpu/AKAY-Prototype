<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TbCaseFollowUpRequest extends FormRequest
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
        $action = $this->route('action');
        $prohibited = array_fill_keys(['patient_id', 'rural_health_unit_id', 'barangay_health_center_id', 'tb_treatment_case_id',
            'source_health_record_id', 'card_data', 'diagnosis_snapshot', 'recorded_by', 'recorder_name', 'recorded_at',
            'closed_by', 'closed_name', 'closed_at', 'case_number'], ['prohibited']);
        $labFields = ['milestone', 'test_name', 'due_on', 'status', 'collection_on', 'examination_on', 'result', 'notes', 'version', 'correction_reason'];
        $clinicalFields = ['case_version', 'outcome_status', 'outcome_on', 'note', 'confirmed', 'evidence_lab_ids'];

        return [...$prohibited, 'request_key' => ['required', 'uuid'], ...($action ? [
            ...array_fill_keys($labFields, ['prohibited']), 'case_version' => ['required', 'integer', 'min:1'],
            'note' => ['required', 'string', 'max:2000'], 'confirmed' => ['required', 'accepted'],
            ...($action === 'close' ? ['outcome_status' => ['required', Rule::in(['cured', 'treatment_completed', 'treatment_failed', 'lost_to_follow_up', 'died'])],
                'outcome_on' => ['required', 'date_format:Y-m-d'], 'evidence_lab_ids' => ['present', 'array', 'max:50'],
                'evidence_lab_ids.*' => ['integer', 'min:1', 'distinct']] : array_fill_keys(['outcome_status', 'outcome_on', 'evidence_lab_ids'], ['prohibited'])),
        ] : [
            ...array_fill_keys($clinicalFields, ['prohibited']),
            'milestone' => ['required', Rule::in(['month_2', 'month_5', 'month_6', 'other'])],
            'test_name' => ['required', 'string', 'max:255'], 'due_on' => ['required', 'date_format:Y-m-d'],
            'status' => ['required', Rule::in(['requested', 'awaiting_result', 'result_available', 'cancelled'])],
            'collection_on' => ['nullable', 'date_format:Y-m-d'], 'examination_on' => ['nullable', 'date_format:Y-m-d'],
            'result' => ['nullable', 'string', 'max:10000'], 'notes' => ['nullable', 'string', 'max:2000'],
            'version' => $this->isMethod('patch') ? ['required', 'integer', 'min:1'] : ['prohibited'],
            'correction_reason' => $this->isMethod('patch') ? ['required', 'string', 'max:2000'] : ['prohibited'],
        ])];
    }
}
