<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * DOC-14b - binding: rescheduled_to is caller-supplied ONLY.
 *
 * There is no server default, no `?? now()->addDays(n)`, no computed fallback,
 * and no inference from a posted clinic schedule. An omitted date is a 422.
 */
class RescheduleReferralRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isRhuStaff() ?? false;
    }

    public function rules(): array
    {
        return [
            'rescheduled_to' => ['required', 'date', 'after:now'],
            'reschedule_reason' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'rescheduled_to.required' => 'A new visit date and time is required.',
            'rescheduled_to.after' => 'The new visit date and time must be in the future.',
        ];
    }
}
