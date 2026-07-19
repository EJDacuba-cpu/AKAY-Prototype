<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class FeedbackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isRhuStaff() ?? false;
    }

    public function rules(): array
    {
        return [
            'referral_id' => ['required', 'exists:referrals,id'],
            'received_at' => ['nullable', 'date'],
            'rhu_diagnosis' => ['required', 'string'],
            'action_taken' => ['nullable', 'string'],
            'treatment_notes' => ['nullable', 'string'],
            'recommendation' => ['nullable', 'string'],
            'receiving_practitioner' => ['nullable', 'string', 'max:255'],
            'remarks' => ['nullable', 'string'],
        ];
    }
}
