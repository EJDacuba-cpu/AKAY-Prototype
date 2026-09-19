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

    protected function prepareForValidation(): void
    {
        $aliases = [
            'civilStatus' => 'civil_status',
            'philHealthStatus' => 'philhealth_status',
            'philHealthNumber' => 'philhealth_number',
            'spouseName' => 'spouse_name',
            'spouseOccupation' => 'spouse_occupation',
            'husbandName' => 'spouse_name',
            'husbandOccupation' => 'spouse_occupation',
            'purokArea' => 'purok_area',
            'motherPatientId' => 'mother_patient_id',
            'medicalBackground' => 'medical_background',
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
            'philhealth_status' => ['nullable', 'string', 'max:255'],
            'spouse_name' => ['nullable', 'string', 'max:255'],
            'spouse_occupation' => ['nullable', 'string', 'max:255'],
            'registration_type' => ['nullable', Rule::in(['general', 'child'])],
            'mother_patient_id' => ['nullable', 'exists:patients,id'],
            'mother_name' => ['nullable', 'string', 'max:255'],
            'father_name' => ['nullable', 'string', 'max:255'],
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
            // Longitudinal clinical background owned by the Patient Profile.
            // The per-visit snapshot stays on health_records.medical_history.
            'medical_background' => ['nullable', 'array'],
            'medical_background.currentDiseases' => ['nullable', 'array', 'max:50'],
            'medical_background.currentDiseases.*.name' => ['required', 'string', 'max:150'],
            'medical_background.currentDiseases.*.status' => ['nullable', 'string', 'max:50'],
            'medical_background.currentDiseases.*.firstRecorded' => ['nullable', 'date'],
            'medical_background.currentDiseases.*.lastConfirmed' => ['nullable', 'date'],
            'medical_background.currentDiseases.*.source' => ['nullable', 'string', 'max:100'],
            'medical_background.allergies' => ['nullable', 'string', 'max:1000'],
            'medical_background.hospitalizations' => ['nullable', 'string', 'max:1000'],
            'medical_background.surgeries' => ['nullable', 'string', 'max:1000'],
            'medical_background.familyHistory' => ['nullable', 'array'],
            'medical_background.familyHistory.similarIllness' => ['nullable', 'string', 'max:1000'],
            'medical_background.familyHistory.chronicIllness' => ['nullable', 'string', 'max:1000'],
            'medical_background.familyHistory.hereditaryIllness' => ['nullable', 'string', 'max:1000'],
            'medical_background.personalSocial' => ['nullable', 'array'],
            'medical_background.personalSocial.diet' => ['nullable', 'string', 'max:255'],
            'medical_background.personalSocial.smoking' => ['nullable', 'string', 'max:255'],
            'medical_background.personalSocial.alcohol' => ['nullable', 'string', 'max:255'],
            'medical_background.personalSocial.notes' => ['nullable', 'string', 'max:1000'],
            // When each background section was last edited, so the profile can
            // date what it shows. Not a revision log.
            'medical_background.updatedAt' => ['nullable', 'array'],
            'medical_background.updatedAt.medical' => ['nullable', 'date'],
            'medical_background.updatedAt.family' => ['nullable', 'date'],
            'medical_background.updatedAt.social' => ['nullable', 'date'],
            'status' => ['sometimes', 'string', 'max:100'],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
        ];
    }
}
