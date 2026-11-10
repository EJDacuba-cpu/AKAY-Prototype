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
            'manufacturer_lot_number' => ['nullable', 'string', 'max:120'],
            'restock_expiry_group_id' => ['nullable', 'integer', 'min:1'],
            'quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'reason' => ['required', 'string', 'max:1000'],
            'idempotency_key' => ['nullable', 'uuid'],
        ];
    }

    protected function passedValidation(): void
    {
        $lot = \App\Models\MedicineExpiryGroup::normalizeLot($this->input('manufacturer_lot_number'));
        $this->merge([
            'manufacturer_lot_number' => $lot,
            'restock_expiry_group_id' => $this->filled('restock_expiry_group_id') ? (int) $this->input('restock_expiry_group_id') : null,
        ]);
    }
}
