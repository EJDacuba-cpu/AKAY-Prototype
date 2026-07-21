<?php

namespace App\Http\Requests;

use App\Models\Medicine;
use App\Services\FacilityAccessService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdjustMedicineRequest extends FormRequest
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
            'action' => [
                'required',
                Rule::in([
                    'adjustment_in',
                    'adjustment_out',
                    'damaged_disposal',
                    'expired_disposal',
                    'correction',
                ]),
            ],
            'direction' => [
                Rule::requiredIf(fn (): bool => $this->input('action') === 'correction'),
                Rule::prohibitedIf(fn (): bool => $this->input('action') !== 'correction'),
                'nullable',
                Rule::in(['in', 'out']),
            ],
            'quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
