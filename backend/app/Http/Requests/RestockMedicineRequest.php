<?php

namespace App\Http\Requests;

use App\Models\Medicine;
use App\Services\FacilityAccessService;
use Illuminate\Foundation\Http\FormRequest;

class RestockMedicineRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user || ! ($user->isBhw() || $user->isRhuStaff())) {
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
        return [
            'quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
