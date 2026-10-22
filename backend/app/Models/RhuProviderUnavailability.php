<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class RhuProviderUnavailability extends Model
{
    public const TIMEZONE = 'Asia/Manila';

    protected $table = 'rhu_provider_unavailability';

    protected $fillable = [
        'rhu_provider_id',
        'local_date',
        'all_day',
        'start_time',
        'end_time',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'local_date' => 'date:Y-m-d',
        'all_day' => 'boolean',
    ];

    public function provider(): BelongsTo
    {
        return $this->belongsTo(RhuProvider::class, 'rhu_provider_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function facilityCalendarDate(?\DateTimeInterface $now = null): string
    {
        $moment = $now ? Carbon::parse($now) : now();

        return $moment->copy()->timezone(self::TIMEZONE)->toDateString();
    }

    public function windowStart(): Carbon
    {
        $date = $this->localDateString();
        if ($this->all_day || $this->start_time === null || $this->start_time === '') {
            return Carbon::parse($date.' 00:00:00', self::TIMEZONE);
        }

        return Carbon::parse($date.' '.$this->normalizedTime($this->start_time), self::TIMEZONE);
    }

    public function windowEnd(): Carbon
    {
        $date = $this->localDateString();
        if ($this->all_day || $this->end_time === null || $this->end_time === '') {
            return Carbon::parse($date.' 00:00:00', self::TIMEZONE)->addDay();
        }

        return Carbon::parse($date.' '.$this->normalizedTime($this->end_time), self::TIMEZONE);
    }

    public function overlaps(self $other): bool
    {
        if ((int) $this->rhu_provider_id !== (int) $other->rhu_provider_id) {
            return false;
        }
        if ($this->localDateString() !== $other->localDateString()) {
            return false;
        }
        if ($this->all_day || $other->all_day) {
            return true;
        }

        return $this->windowStart()->lt($other->windowEnd())
            && $this->windowEnd()->gt($other->windowStart());
    }

    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'rhu_provider_id' => $this->rhu_provider_id,
            'local_date' => $this->localDateString(),
            'all_day' => $this->all_day,
            'start_time' => $this->all_day ? null : $this->normalizedTime($this->start_time),
            'end_time' => $this->all_day ? null : $this->normalizedTime($this->end_time),
            'updated_at' => $this->updated_at,
        ];
    }

    public function localDateString(): string
    {
        $date = $this->local_date;

        return $date instanceof \DateTimeInterface
            ? $date->format('Y-m-d')
            : substr((string) $date, 0, 10);
    }

    private function normalizedTime(mixed $value): string
    {
        $raw = substr((string) $value, 0, 8);
        if (preg_match('/^\d{2}:\d{2}/', $raw) === 1) {
            return substr($raw, 0, 5);
        }

        return Carbon::parse($raw, self::TIMEZONE)->format('H:i');
    }
}
