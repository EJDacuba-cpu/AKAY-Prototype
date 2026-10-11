<?php

namespace App\Http\Requests;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
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
            'professional_designation' => ['nullable', 'string', 'max:100'],
            'permissions' => [$isUpdate ? 'sometimes' : 'present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(ActionPermissions::ALL)],
            'facility_assignments' => ['prohibited'],
            'permissions_confirmed' => ['required_with:permissions', 'accepted'],
            'acknowledged_overrides' => ['sometimes', 'array'],
            'acknowledged_overrides.*' => ['string', Rule::in(ActionPermissions::ALL)],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            if ($validator->errors()->isNotEmpty()) return;
            $existingUser = $this->route('user');
            $designation = $this->input('professional_designation', $existingUser?->professional_designation);
            $role = $this->input('role', $existingUser?->role);
            $permissions = (array) $this->input('permissions', $existingUser?->permissions ?? []);
            if ($this->exists('permissions')) {
                if ($role === User::ROLE_ADMIN && $permissions) {
                    $validator->errors()->add('permissions', 'Administrative accounts do not carry facility duties.');
                }
                foreach (ActionPermissions::missingRequirements($permissions) as $permission => $required) {
                    $validator->errors()->add('permissions', "{$permission} also requires ".implode(', ', $required).'.');
                }
            }
            // Any designation may hold any duty, but every duty outside its usual scope must be acknowledged
            // whenever the request changes what the account can do, including a designation-only change.
            if ($role !== User::ROLE_ADMIN && $this->hasAny(['permissions', 'professional_designation', 'role'])) {
                $unacknowledged = array_diff(ActionPermissions::overrides($permissions, $designation, $role), (array) $this->input('acknowledged_overrides', []));
                if ($unacknowledged) {
                    $validator->errors()->add('acknowledged_overrides', 'Confirm these overrides before saving: '.implode(', ', $unacknowledged).'.');
                }
            }
            $bhcId = $this->exists('barangay_health_center_id')
                ? $this->input('barangay_health_center_id')
                : $existingUser?->barangay_health_center_id;
            $rhuId = $this->exists('rural_health_unit_id')
                ? $this->input('rural_health_unit_id')
                : $existingUser?->rural_health_unit_id;
            if ($role === User::ROLE_ADMIN && ($bhcId || $rhuId)) {
                $validator->errors()->add('role', 'Administrative accounts do not have a clinical home facility.');
            }

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
