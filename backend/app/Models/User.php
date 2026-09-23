<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name',
    'email',
    'password',
    'role',
    'status',
    'barangay_health_center_id',
    'rural_health_unit_id',
    'created_by',
    'professional_designation',
    'permissions',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    /** Request-local context only; never persisted onto home assignment columns. */
    public ?array $workingFacility = null;

    public function facilityAssignments(): HasMany
    {
        return $this->hasMany(FacilityAssignment::class);
    }

    public function getBarangayHealthCenterIdAttribute($value)
    {
        return $this->workingFacility === null ? $value : ($this->workingFacility['type'] === 'bhc' ? $this->workingFacility['id'] : null);
    }

    public function getRuralHealthUnitIdAttribute($value)
    {
        return $this->workingFacility === null ? $value : ($this->workingFacility['type'] === 'rhu' ? $this->workingFacility['id'] : null);
    }

    public function workflowRole(): string
    {
        return $this->workingFacility === null ? $this->role : ($this->workingFacility['type'] === 'bhc' ? self::ROLE_BHW : self::ROLE_RHU_STAFF);
    }

    public const ROLE_ADMIN = 'admin';
    public const ROLE_BHW = 'bhw';
    public const ROLE_RHU_STAFF = 'rhu_staff';

    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'permissions' => 'array',
        ];
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    public function isBhw(): bool
    {
        return $this->workflowRole() === self::ROLE_BHW;
    }

    public function isRhuStaff(): bool
    {
        return $this->workflowRole() === self::ROLE_RHU_STAFF;
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(self::class, 'created_by');
    }

    public function patients(): HasMany
    {
        return $this->hasMany(Patient::class, 'created_by');
    }

    public function notifications(): HasMany
    {
        $query = $this->hasMany(UserNotification::class);
        $accountTypes = ['account_created', 'account_deactivated', 'password_reset_approved', 'password_reset_rejected'];
        if (! $this->isAdmin() && ! \App\Services\ActionPermissions::allows($this, 'clinical.history')) {
            $query->whereIn('type', $accountTypes);
        } elseif (! $this->isAdmin() && $this->workingFacility !== null) {
            $column = $this->workingFacility['type'] === 'bhc' ? 'barangay_health_center_id' : 'rural_health_unit_id';
            $id = $this->workingFacility['id'];
            $query->where(function ($scope) use ($accountTypes, $column, $id) {
                $scope->whereIn('type', $accountTypes)
                    ->orWhereIn('related_referral_id', Referral::select('id')->where($column, $id))
                    ->orWhere(function ($holds) use ($column, $id) {
                        $holds->where('entity_type', 'referral_hold')->whereIn('entity_id', ReferralHold::select('id')->where($column, $id));
                    });
                if ($this->workingFacility['is_home']) {
                    // Other existing home-facility notices keep their original behavior.
                    $scope->orWhere(fn ($other) => $other->whereNull('related_referral_id')->where(fn ($type) => $type->whereNull('entity_type')->orWhere('entity_type', '!=', 'referral_hold')));
                }
            });
        }
        return $query;
    }

    public function passwordResetRequests(): HasMany
    {
        return $this->hasMany(PasswordResetRequest::class);
    }
}
