<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MedicineRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isBhw()
            || $this->user()?->isRhuStaff()
            || $this->user()?->isAdmin();
    }

    public function rules(): array
    {
        return [
            'name' => [$this->isMethod('post') ? 'required' : 'sometimes', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'quantity' => ['sometimes', 'integer', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
            'unit' => ['nullable', 'string', 'max:50'],
            'availability_status' => ['nullable', 'string', 'max:100'],
            'expiration_date' => ['nullable', 'date'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
        ];
    }
}
