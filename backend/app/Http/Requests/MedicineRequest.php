<?php

namespace App\Http\Requests;

use App\Models\Medicine;
use App\Services\FacilityAccessService;
use Illuminate\Foundation\Http\FormRequest;

class MedicineRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user || ! ($user->isBhw() || $user->isRhuStaff() || $user->isAdmin())) {
            return false;
        }

        $medicine = $this->route('medicine');
        if ($medicine instanceof Medicine) {
            app(FacilityAccessService::class)->authorizeMedicine($user, $medicine);
        }

        return true;
    }

    public function rules(): array
    {
        $isCreate = $this->isMethod('post');

        return [
            'name' => [$isCreate ? 'required' : 'sometimes', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'quantity' => $isCreate
                ? ['required', 'integer', 'min:0', 'max:2147483647']
                : ['prohibited'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
            'unit' => ['nullable', 'string', 'max:50'],
            'availability_status' => ['prohibited'],
            'expiration_date' => ['nullable', 'date'],
            'rural_health_unit_id' => ['prohibited'],
            'barangay_health_center_id' => ['prohibited'],
        ];
    }
}
