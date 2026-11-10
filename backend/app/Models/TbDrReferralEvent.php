<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class TbDrReferralEvent extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $hidden = ['request_key', 'request_hash'];

    protected $casts = ['version' => 'integer', 'event_on' => 'date:Y-m-d', 'recorded_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Referral events are immutable.'));
        static::deleting(fn () => throw new LogicException('Referral events are immutable.'));
    }

    public function referral(): BelongsTo
    {
        return $this->belongsTo(TbDrReferral::class, 'tb_dr_referral_id');
    }
}
