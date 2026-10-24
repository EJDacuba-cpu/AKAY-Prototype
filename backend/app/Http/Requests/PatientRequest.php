<?php

namespace App\Http\Requests;

use App\Http\Controllers\Api\HouseholdController;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PatientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user();
    }

    protected function prepareForValidation(): void
    {
        $aliases = [
            'civilStatus' => 'civil_status',
            'educationLevel' => 'education_level',
            'educationCompleted' => 'education_completed',
            'philHealthStatus' => 'philhealth_status',
            'philHealthNumber' => 'philhealth_number',
            'spouseName' => 'spouse_name',
            'spouseOccupation' => 'spouse_occupation',
            'husbandName' => 'spouse_name',
            'husbandOccupation' => 'spouse_occupation',
            'purokArea' => 'purok_area',
            'motherPatientId' => 'mother_patient_id',
            'fatherPatientId' => 'father_patient_id',
            'motherBirthDate' => 'mother_birth_date',
            'fatherBirthDate' => 'father_birth_date',
        ];

        $mapped = [];

        foreach ($aliases as $source => $target) {
            if ($this->has($source) && ! $this->has($target)) {
                $mapped[$target] = $this->input($source);
            }
        }

        if ($mapped !== []) {
            $this->merge($mapped);
        }
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'household' => ['sometimes', 'required', 'array:kind,household_id,relationship,version,serial_mode,serial_number,address,relationship_link'],
            'household.relationship_link' => ['sometimes', 'nullable', 'array:type'],
            'household.relationship_link.type' => ['required_with:household.relationship_link', 'in:spouse,sibling'],
            'household.kind' => ['required_with:household', 'in:existing,new'],
            'household.household_id' => ['required_if:household.kind,existing', 'integer'],
            'household.relationship' => ['required_if:household.kind,existing', 'string', 'max:100'],
            'household.version' => ['sometimes', 'integer', 'min:1'],
            'household.serial_mode' => ['required_if:household.kind,new', 'in:auto,manual'],
            'household.serial_number' => ['required_if:household.serial_mode,manual', 'nullable', 'string', 'max:100'],
            ...HouseholdController::addressRules('household.'),
            'head_replacement' => ['sometimes', 'array:household_id,head_patient_id,relationships,version'],
            'head_replacement.household_id' => ['required_with:head_replacement', 'integer'],
            'head_replacement.head_patient_id' => ['required_with:head_replacement', 'integer'],
            'head_replacement.relationships' => ['present_with:head_replacement', 'array'],
            'head_replacement.relationships.*' => ['required', 'string', 'max:100'],
            'head_replacement.version' => ['required_with:head_replacement', 'integer', 'min:1'],
            // RHU walk-in check-in: the patient and the visit are created together (Phase 3).
            'check_in' => ['sometimes', 'required', 'array:key'],
            'check_in.key' => ['required_with:check_in', 'string', 'max:100'],
            'confirm_possible_duplicate' => ['sometimes', 'boolean'],
            'first_name' => [$required, 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name' => [$required, 'string', 'max:255'],
            'sex' => [$required, Rule::in(['Male', 'Female', 'Other'])],
            'birthdate' => ['nullable', 'date', 'before_or_equal:today'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'street_address' => ['nullable', 'string', 'max:255'],
            'barangay' => ['nullable', 'string', 'max:255'],
            'municipality' => ['nullable', 'string', 'max:255'],
            'purok_area' => ['nullable', 'string', 'max:255'],
            'civil_status' => ['nullable', 'string', 'max:100'],
            'occupation' => ['nullable', 'string', 'max:255'],
            'education_level' => ['nullable', Rule::in(['None', 'Elementary', 'High School', 'Senior High School', 'Vocational', 'College', 'Postgraduate'])],
            'education_completed' => ['nullable', Rule::in(['Level', 'Graduate'])],
            'philhealth_status' => ['nullable', 'string', 'max:255'],
            'spouse_name' => ['nullable', 'string', 'max:255'],
            'spouse_occupation' => ['nullable', 'string', 'max:255'],
            'registration_type' => ['nullable', Rule::in(['general', 'child'])],
            'mother_patient_id' => ['nullable', 'exists:patients,id'],
            'father_patient_id' => ['nullable', 'exists:patients,id'],
            'mother_name' => ['nullable', 'string', 'max:255'],
            'mother_birth_date' => ['nullable', 'date', 'before_or_equal:today'],
            'father_name' => ['nullable', 'string', 'max:255'],
            'father_birth_date' => ['nullable', 'date', 'before_or_equal:today'],
            'guardian_name' => ['nullable', 'string', 'max:255'],
            'guardian_relationship' => ['nullable', 'string', 'max:100'],
            'guardian_contact_number' => ['nullable', 'string', 'max:50'],
            'family_serial_number' => ['nullable', 'string', 'max:100'],
            'birth_place' => ['nullable', 'string', 'max:255'],
            'birth_time' => ['nullable', 'date_format:H:i'],
            'birth_weight' => ['nullable', 'numeric', 'min:0', 'max:999.99'],
            'birth_height' => ['nullable', 'numeric', 'min:0', 'max:999.99'],
            'nhts_status' => ['nullable', Rule::in(['NHTS', 'Non-NHTS'])],
            'philhealth_number' => ['nullable', 'string', 'max:100'],
            'philhealth_category' => ['nullable', 'string', 'max:100'],
            'patient_category' => ['nullable', 'string', 'max:100'],
            // medical_background is deliberately absent: it is not accepted on
            // create or update, so validated() drops it. The background only
            // changes through PatientBackground's audited clinical paths.
            'status' => ['sometimes', 'string', 'max:100'],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
        ];
    }
}
