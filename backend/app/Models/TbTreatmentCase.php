<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A shared DS-TB treatment episode, independent of consultation snapshots. */
class TbTreatmentCase extends Model
{
    protected $fillable = [
        'patient_id', 'rural_health_unit_id', 'source_health_record_id',
        'reporting_year', 'case_number', 'status', 'registered_by', 'registered_at',
        'diagnosis_snapshot', 'card_data', 'version', 'registration_key', 'registration_hash',
        'outcome_status', 'outcome_on', 'outcome_note', 'closed_by', 'closed_name', 'closed_at',
    ];

    protected $hidden = ['registration_key', 'registration_hash'];

    protected $casts = [
        'reporting_year' => 'integer',
        'registered_at' => 'datetime',
        'diagnosis_snapshot' => 'array',
        'card_data' => 'array',
        'version' => 'integer',
        'outcome_on' => 'date:Y-m-d', 'closed_at' => 'datetime',
    ];

    protected function caseNumber(): Attribute
    {
        return Attribute::make(set: fn (string $value) => self::canonicalCaseNumber($value));
    }

    public static function canonicalCaseNumber(string $value): string
    {
        return mb_strtoupper(preg_replace('/\A[\p{Z}\s]+|[\p{Z}\s]+\z/u', '', $value) ?? trim($value));
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function sourceHealthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class, 'source_health_record_id');
    }

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    public function endorsements(): HasMany
    {
        return $this->hasMany(TbCaseEndorsement::class);
    }

    public function monitoringEntries(): HasMany
    {
        return $this->hasMany(TbMonitoringEntry::class);
    }

    public function followUpLabs(): HasMany
    {
        return $this->hasMany(TbFollowUpLab::class);
    }

    public function clinicalEvents(): HasMany
    {
        return $this->hasMany(TbCaseClinicalEvent::class);
    }

    public function treatmentStartDate(): ?string
    {
        $dates = array_filter(array_column($this->card_data['regimen']['rows'] ?? [], 'dateStart'),
            fn ($date) => is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)
                && ($parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date)) && $parsed->format('Y-m-d') === $date);

        return $dates ? min($dates) : null;
    }

    public function projectedCard(): array
    {
        return [...$this->card_data, 'outcome' => ['status' => $this->status === 'closed' ? ($this->outcome_status ?? '') : '',
            'date' => $this->status === 'closed' ? ($this->outcome_on?->toDateString() ?? '') : '']];
    }
}
