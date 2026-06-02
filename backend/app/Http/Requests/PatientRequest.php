<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PatientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'first_name' => [$required, 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name' => [$required, 'string', 'max:255'],
            'sex' => [$required, Rule::in(['Male', 'Female', 'Other'])],
            'birthdate' => ['nullable', 'date', 'before_or_equal:today'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'street_address' => ['nullable', 'string', 'max:255'],
            'barangay' => ['nullable', 'string', 'max:255'],
            'municipality' => ['nullable', 'string', 'max:255'],
            'civil_status' => ['nullable', 'string', 'max:100'],
            'philhealth_number' => ['nullable', 'string', 'max:100'],
            'philhealth_category' => ['nullable', 'string', 'max:100'],
            'patient_category' => ['nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'string', 'max:100'],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
        ];
    }
}
