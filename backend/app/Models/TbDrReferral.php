<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TbDrReferral extends Model
{
    public const STATUS_LABELS = ['issued' => 'Issued by RHU', 'sent' => 'Dispatch recorded by RHU',
        'attendance_reported' => 'Attendance reported to RHU', 'cancelled' => 'Cancelled'];

    public const TRANSITIONS = ['issued' => ['sent', 'cancelled'], 'sent' => ['attendance_reported', 'cancelled'],
        'attendance_reported' => [], 'cancelled' => []];

    protected $guarded = ['id'];

    protected $casts = ['patient_snapshot' => 'array', 'source_snapshot' => 'array', 'version' => 'integer', 'authorized_at' => 'datetime'];

    public function events(): HasMany
    {
        return $this->hasMany(TbDrReferralEvent::class);
    }
}
