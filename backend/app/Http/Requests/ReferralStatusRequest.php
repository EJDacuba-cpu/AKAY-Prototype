<?php

namespace App\Http\Requests;

use App\Models\Referral;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReferralStatusRequest extends FormRequest
{
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
                Referral::STATUS_FOR_MONITORING,
                Referral::STATUS_NO_SHOW,
                Referral::STATUS_COMPLETED,
            ])],
            'remarks' => ['nullable', 'string'],
        ];
    }
}
