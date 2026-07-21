<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class MedicineInventoryTransaction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'medicine_id',
        'actor_user_id',
        'transaction_type',
        'quantity_delta',
        'quantity_before',
        'quantity_after',
        'source_type',
        'source_id',
        'reason',
        'operation_key',
    ];

    protected $casts = [
        'quantity_delta' => 'integer',
        'quantity_before' => 'integer',
        'quantity_after' => 'integer',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Inventory transactions are append-only.'));
        static::deleting(fn () => throw new LogicException('Inventory transactions are append-only.'));
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
