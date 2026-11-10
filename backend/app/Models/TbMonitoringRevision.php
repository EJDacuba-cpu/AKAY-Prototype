<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class TbMonitoringRevision extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $hidden = ['request_key', 'request_hash'];

    protected $casts = ['values' => 'array', 'version' => 'integer', 'recorded_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Monitoring revisions are immutable.'));
        static::deleting(fn () => throw new LogicException('Monitoring revisions are immutable.'));
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(TbMonitoringEntry::class, 'tb_monitoring_entry_id');
    }
}
