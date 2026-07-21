<?php

namespace App\Http\Requests;

use App\Models\Referral;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReferralStatusRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $normalized = Referral::normalizeWorkflowStatus($this->input('status'));

        if ($normalized !== null) {
            $this->merge(['status' => $normalized]);
        }
    }

    public function authorize(): bool
    {
        return $this->user()?->isRhuStaff() ?? false;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in([
                Referral::STATUS_PENDING,
                Referral::STATUS_RECEIVED,
                Referral::STATUS_NO_SHOW,
                Referral::STATUS_COMPLETED,
            ])],
            'remarks' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
