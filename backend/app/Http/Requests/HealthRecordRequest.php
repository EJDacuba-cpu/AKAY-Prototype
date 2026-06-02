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
            'category' => ['nullable', 'string', 'max:100'],
            'chief_complaint' => ['nullable', 'string'],
            'diagnosis' => ['nullable', 'string'],
            'treatment_notes' => ['nullable', 'string'],
            'medical_history' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
