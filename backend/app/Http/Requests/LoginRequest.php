<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => strtolower(trim((string) $this->input('email'))),
            'turnstile_token' => trim((string) $this->input('turnstile_token')),
        ]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'turnstile_token' => ['required', 'string', 'max:2048'],
        ];
    }

    public function messages(): array
    {
        return [
            'turnstile_token.required' => 'Complete the bot check before signing in.',
            'turnstile_token.max' => 'Complete the bot check before signing in.',
        ];
    }
}
