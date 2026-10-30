<?php

namespace App\Models;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Throwable;

class Patient extends Model
{
    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'sex',
        'birthdate',
        'contact_number',
        'street_address',
        'barangay',
        'municipality',
        'purok_area',
        'civil_status',
        'occupation',
        'education_level',
        'education_completed',
        'philhealth_status',
        'spouse_name',
        'spouse_occupation',
        'registration_type',
        'mother_patient_id',
        'father_patient_id',
        'mother_name',
        'mother_birth_date',
        'father_name',
        'father_birth_date',
        'guardian_name',
        'guardian_relationship',
        'guardian_contact_number',
        'family_serial_number',
        'household_id',
        'relationship_to_household_head',
        'birth_place',
        'birth_time',
        'birth_weight',
        'birth_height',
        'nhts_status',
        'philhealth_number',
        'philhealth_category',
        'patient_category',
        'medical_background',
        'status',
        'created_by',
        'barangay_health_center_id',
        'rural_health_unit_id',
    ];

    protected $casts = [
        // Serialized as a plain calendar date, not an instant. Under
        // APP_TIMEZONE=Asia/Manila the default 'date' cast emits local midnight
        // as "...T16:00:00Z", which every client that reads the date part off
        // the front of the string resolves to the PREVIOUS day - so a birthday
        // displayed one day early, and written back one day early on the next
        // profile save. A birthdate is a calendar date; it has no instant.
        'birthdate' => 'date:Y-m-d',
        'mother_birth_date' => 'date:Y-m-d',
        'father_birth_date' => 'date:Y-m-d',
        'birth_time' => 'datetime:H:i',
        'birth_weight' => 'decimal:2',
        'birth_height' => 'decimal:2',
        'medical_background' => 'array',
    ];

    protected $appends = ['full_name', 'age'];

    /** Last completed month of age that still counts as an infant. */
    public const INFANT_MAX_MONTHS = 12;

    /**
     * Calendar months fully elapsed from a date of birth. Null when the date
     * is missing, unparseable, or in the future — matching the frontend
     * calculateAgeInMonths helper, including the 12-month infant cutoff.
     */
    public static function completedMonths(
        CarbonInterface|DateTimeInterface|string|null $birthdate,
        CarbonInterface|DateTimeInterface|string|null $today = null,
    ): ?int {
        $dob = static::parseCalendarDate($birthdate);
        if ($dob === null) {
            return null;
        }

        $on = static::parseCalendarDate($today) ?? Carbon::now()->startOfDay();
        if ($dob->gt($on)) {
            return null;
        }

        $months = (($on->year - $dob->year) * 12) + ($on->month - $dob->month);
        if ($on->day < $dob->day) {
            $months--;
        }

        return max($months, 0);
    }

    /** Infants are aged from birth through 12 completed months. */
    public static function isInfantBirthdate(
        CarbonInterface|DateTimeInterface|string|null $birthdate,
        CarbonInterface|DateTimeInterface|string|null $today = null,
    ): bool {
        $months = static::completedMonths($birthdate, $today);

        return $months !== null && $months <= self::INFANT_MAX_MONTHS;
    }

    private static function parseCalendarDate(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof CarbonInterface) {
            return Carbon::instance($value)->startOfDay();
        }

        if ($value instanceof DateTimeInterface) {
            return Carbon::instance($value)->startOfDay();
        }

        if (! is_string($value)) {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (Throwable) {
            return null;
        }
    }

    protected function fullName(): Attribute
    {
        return Attribute::get(fn () => trim(collect([
            $this->first_name,
            $this->middle_name,
            $this->last_name,
        ])->filter()->implode(' ')));
    }

    protected function age(): Attribute
    {
        return Attribute::get(fn () => $this->birthdate?->age);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    public function barangayHealthCenter(): BelongsTo
    {
        return $this->belongsTo(BarangayHealthCenter::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function mother(): BelongsTo
    {
        return $this->belongsTo(self::class, 'mother_patient_id');
    }

    public function father(): BelongsTo
    {
        return $this->belongsTo(self::class, 'father_patient_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'mother_patient_id');
    }

    /** Explicit spouse/sibling rows where this patient is either side of the pair. */
    public function relationshipLinks(): \Illuminate\Database\Eloquent\Builder
    {
        return PatientRelationship::where(fn ($query) => $query->where('patient_id', $this->id)->orWhere('relative_id', $this->id));
    }

    public function healthRecords(): HasMany
    {
        return $this->hasMany(HealthRecord::class);
    }

    public function conditions(): HasMany
    {
        return $this->hasMany(PatientCondition::class);
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class);
    }
}
