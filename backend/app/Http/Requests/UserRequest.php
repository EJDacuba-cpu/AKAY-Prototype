<?php

namespace App\Http\Requests;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        $userId = $this->route('user')?->id;
        $isUpdate = $this->isMethod('patch') || $this->isMethod('put');

        return [
            'name' => [$isUpdate ? 'sometimes' : 'required', 'string', 'max:255'],
            'email' => [$isUpdate ? 'sometimes' : 'required', 'email', Rule::unique('users', 'email')->ignore($userId)],
            'password' => [$isUpdate ? 'nullable' : 'required', 'string', 'min:8'],
            'role' => [$isUpdate ? 'sometimes' : 'required', Rule::in([User::ROLE_ADMIN, User::ROLE_BHW, User::ROLE_RHU_STAFF])],
            'status' => ['sometimes', Rule::in([User::STATUS_ACTIVE, User::STATUS_INACTIVE])],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $existingUser = $this->route('user');
            $role = $this->input('role', $existingUser?->role);
            $bhcId = $this->exists('barangay_health_center_id')
                ? $this->input('barangay_health_center_id')
                : $existingUser?->barangay_health_center_id;
            $rhuId = $this->exists('rural_health_unit_id')
                ? $this->input('rural_health_unit_id')
                : $existingUser?->rural_health_unit_id;

            if ($role === User::ROLE_BHW) {
                if (! $bhcId) {
                    $validator->errors()->add(
                        'barangay_health_center_id',
                        'A BHC assignment is required for BHW accounts.'
                    );
                } elseif (! BarangayHealthCenter::query()
                    ->whereKey($bhcId)
                    ->where('status', 'active')
                    ->exists()) {
                    $validator->errors()->add(
                        'barangay_health_center_id',
                        'The selected BHC must be active.'
                    );
                }

                if ($rhuId) {
                    $validator->errors()->add(
                        'rural_health_unit_id',
                        'BHW accounts cannot also be assigned to an RHU.'
                    );
                }
            }

            if ($role === User::ROLE_RHU_STAFF) {
                if (! $rhuId) {
                    $validator->errors()->add(
                        'rural_health_unit_id',
                        'An RHU assignment is required for RHU staff accounts.'
                    );
                } elseif (! RuralHealthUnit::query()
                    ->whereKey($rhuId)
                    ->where('status', 'active')
                    ->exists()) {
                    $validator->errors()->add(
                        'rural_health_unit_id',
                        'The selected RHU must be active.'
                    );
                }

                if ($bhcId) {
                    $validator->errors()->add(
                        'barangay_health_center_id',
                        'RHU staff accounts cannot also be assigned to a BHC.'
                    );
                }
            }
        });
    }
}
