<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

class TbCaseClinicalEvent extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $hidden = ['request_key', 'request_hash'];

    protected $casts = ['snapshot' => 'array', 'case_version' => 'integer', 'recorded_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Clinical events are immutable.'));
        static::deleting(fn () => throw new LogicException('Clinical events are immutable.'));
    }
}
