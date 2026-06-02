<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RhuPatientVolumeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isRhuStaff() || $this->user()?->isAdmin();
    }

    public function rules(): array
    {
        return [
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
            'status' => ['required', Rule::in(['Low', 'Normal', 'High'])],
        ];
    }
}
