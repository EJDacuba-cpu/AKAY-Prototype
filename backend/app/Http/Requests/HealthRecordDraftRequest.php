<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class HealthRecordDraftRequest extends FormRequest
{
    public const CLASSIFICATIONS = [
        'General Consultation',
        'Immunization',
        'Maternal',
        'Family Planning',
        'TB DOTS / TB Monitoring',
    ];

    public function authorize(): bool
    {
        return $this->user()?->isBhw() && \App\Services\ActionPermissions::allows($this->user(), 'consultations.encode');
    }

    public function rules(): array
    {
        return [
            'patient_id' => ['required', 'integer', 'exists:patients,id'],
            'classification' => ['required', 'string', Rule::in(self::CLASSIFICATIONS)],
            // The consultation identity minted by the client at consultation
            // start. Nullable so drafts from before it existed still save, and
            // never an authorization input - owner and BHC checks still decide
            // what may be read or written.
            'consultation_uuid' => ['nullable', 'uuid'],
            'payload' => ['required', 'array'],
            'version' => $this->isMethod('put')
                ? ['required', 'integer', 'min:1']
                : ['prohibited'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $allowed = ['patient_id', 'classification', 'consultation_uuid', 'payload'];
            if ($this->isMethod('put')) {
                $allowed[] = 'version';
            }

            $unknown = array_diff(array_keys($this->all()), $allowed);
            if ($unknown !== []) {
                $validator->errors()->add(
                    'payload',
                    'The draft contains unsupported request fields.'
                );
            }
        });
    }
}
