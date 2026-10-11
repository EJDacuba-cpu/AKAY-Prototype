<?php

namespace App\Http\Requests;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\StaffRoles;
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
            // The MHO never sets a password: people set their own through the invite link.
            'password' => ['prohibited'],
            'password_confirmation' => ['prohibited'],
            'contact_number' => [$isUpdate ? 'sometimes' : 'required', 'required', 'regex:/^09\d{9}$/'],
            'role' => [$isUpdate ? 'sometimes' : 'required', Rule::in([User::ROLE_ADMIN, User::ROLE_BHC, User::ROLE_RHU])],
            'status' => ['sometimes', Rule::in([User::STATUS_ACTIVE, User::STATUS_INACTIVE])],
            'staff_role' => ['nullable', Rule::in(StaffRoles::keys())],
            'permissions' => [$isUpdate ? 'sometimes' : 'present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(ActionPermissions::ALL)],
            'facility_assignments' => ['prohibited'],
            // Only an access change asks for the review confirmation; a status-only update does not.
            'permissions_confirmed' => ['exclude_without:permissions', 'required', 'accepted'],
            'barangay_health_center_id' => ['nullable', 'exists:barangay_health_centers,id'],
            'rural_health_unit_id' => ['nullable', 'exists:rural_health_units,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            if ($validator->errors()->isNotEmpty()) return;
            $existingUser = $this->route('user');
            $staffRole = $this->input('staff_role', $existingUser?->staff_role);
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
            if ($role === User::ROLE_ADMIN && $staffRole !== null) {
                $validator->errors()->add('staff_role', 'Municipal Health Officer accounts do not have a staff role.');
            }
            if ($role !== User::ROLE_ADMIN && $this->hasAny(['permissions', 'staff_role', 'role'])) {
                $tierLabel = $role === User::ROLE_RHU ? 'RHU' : 'BHC';
                if ($staffRole === null) {
                    $validator->errors()->add('staff_role', 'Select a role for this account.');
                } elseif (! StaffRoles::allowedAt($staffRole, $role)) {
                    $facility = StaffRoles::ROLES[$staffRole]['tier'] === User::ROLE_RHU ? 'Rural Health Unit' : 'Barangay Health Center';
                    $validator->errors()->add('staff_role', 'A '.StaffRoles::label($staffRole)." account must be based at a {$facility}.");
                }
                foreach (array_diff($permissions, StaffRoles::available($role)) as $permission) {
                    $validator->errors()->add('permissions', "{$permission} is not available to {$tierLabel} accounts.");
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

            if ($role === User::ROLE_BHC) {
                if (! $bhcId) {
                    $validator->errors()->add(
                        'barangay_health_center_id',
                        'A BHC assignment is required for BHC accounts.'
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
                        'BHC accounts cannot also be assigned to an RHU.'
                    );
                }
            }

            if ($role === User::ROLE_RHU) {
                if (! $rhuId) {
                    $validator->errors()->add(
                        'rural_health_unit_id',
                        'An RHU assignment is required for RHU accounts.'
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
                        'RHU accounts cannot also be assigned to a BHC.'
                    );
                }
            }
        });
    }
}
