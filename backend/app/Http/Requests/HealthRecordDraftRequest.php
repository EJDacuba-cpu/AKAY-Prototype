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
        'Hypertension / Diabetic Monitoring',
        'TB DOTS / TB Monitoring',
    ];

    public function authorize(): bool
    {
        return $this->user()?->role === User::ROLE_BHW;
    }

    public function rules(): array
    {
        return [
            'patient_id' => ['required', 'integer', 'exists:patients,id'],
            'classification' => ['required', 'string', Rule::in(self::CLASSIFICATIONS)],
            'payload' => ['required', 'array'],
            'version' => $this->isMethod('put')
                ? ['required', 'integer', 'min:1']
                : ['prohibited'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $allowed = ['patient_id', 'classification', 'payload'];
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
