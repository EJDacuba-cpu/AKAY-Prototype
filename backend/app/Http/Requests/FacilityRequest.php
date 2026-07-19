<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FacilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        $rules = [
            'name' => [$this->isMethod('post') ? 'required' : 'sometimes', 'string', 'max:255'],
            'barangay' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'contact_information' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
        ];

        if ($this->routeIs('barangay-health-centers.*')) {
            $rules['rural_health_unit_id'] = [
                'nullable',
                Rule::exists('rural_health_units', 'id')
                    ->where(fn ($query) => $query->where('status', 'active')),
            ];
        }

        return $rules;
    }
}
