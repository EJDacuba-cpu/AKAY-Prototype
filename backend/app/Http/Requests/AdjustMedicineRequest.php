<?php

namespace App\Http\Requests;

use App\Models\Medicine;
use App\Services\FacilityAccessService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdjustMedicineRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (filled($this->header('Idempotency-Key'))) $this->merge(['idempotency_key' => $this->header('Idempotency-Key')]);
    }

    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user || ! ($user->isBhc() || $user->isRhu())) {
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
            'idempotency_key' => ['nullable', 'uuid'],
            'expiry_group_id' => ['nullable', 'integer', 'min:1'],
            'pool' => ['nullable', 'in:available,quarantined'],
            'target' => ['nullable', 'in:unassigned'],
            'action' => [
                'required',
                Rule::in([
                    'adjustment_in',
                    'adjustment_out',
                    'damaged_disposal',
                    'expired_disposal',
                    'correction',
                    'physical_count',
                ]),
            ],
            'direction' => [
                Rule::requiredIf(fn (): bool => $this->input('action') === 'correction'),
                Rule::prohibitedIf(fn (): bool => $this->input('action') !== 'correction'),
                'nullable',
                Rule::in(['in', 'out']),
            ],
            'quantity' => ['required', 'integer', $this->input('action') === 'physical_count' ? 'min:0' : 'min:1', 'max:2147483647'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
