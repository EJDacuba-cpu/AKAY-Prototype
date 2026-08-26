<?php

namespace App\Http\Requests;

use App\Models\RhuProvider;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * DOC-15 - roster writes belong to RHU staff only. Admin and BHW are denied
 * here as well as by route middleware; this codebase authorises through
 * middleware plus Form Request rather than policies.
 */
class RhuProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isRhuStaff() ?? false;
    }

    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:255'],
            'specialization' => ['nullable', 'string', 'max:255'],
            'availability_status' => [
                $creating ? 'sometimes' : 'sometimes',
                Rule::in(RhuProvider::AVAILABILITY_STATUSES),
            ],
            'remarks' => ['nullable', 'string'],
            // Display only (see migration doc-comment) - an RHU-supplied
            // estimate, never read to gate submission or trigger notifications.
            'expected_available_at' => ['nullable', 'date'],
        ];
    }
}
