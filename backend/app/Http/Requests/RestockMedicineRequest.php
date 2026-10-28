<?php

namespace App\Http\Requests;

use App\Models\Medicine;
use App\Services\FacilityAccessService;
use Illuminate\Foundation\Http\FormRequest;

class RestockMedicineRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (filled($this->header('Idempotency-Key'))) {
            $this->merge([
                'idempotency_key' => $this->header('Idempotency-Key'),
            ]);
        }
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
            ...\App\Services\MedicineExpiryStockService::expiryRules($this->route('medicine')?->item_type ?? 'medicine', $this->boolean('expiry_not_applicable')),
            'quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'reason' => ['required', 'string', 'max:1000'],
            'idempotency_key' => ['nullable', 'uuid'],
        ];
    }
}
