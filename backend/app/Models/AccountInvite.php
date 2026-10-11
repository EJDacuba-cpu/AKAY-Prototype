<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountInvite extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_TEMPORARY = 'temporary';
    public const STATUS_COMPLETED = 'completed';

    public const DELIVERY_SENT = 'sent';
    public const DELIVERY_FAILED = 'failed';
    public const DELIVERY_COPIED = 'copied';

    public const VIA_LINK = 'link';
    public const VIA_TEMPORARY_PASSWORD = 'temporary_password';
    public const VIA_RESET = 'reset';

    protected $fillable = [
        'user_id',
        'email',
        'token_hash',
        'status',
        'delivery',
        'completed_via',
        'expires_at',
        'sent_at',
        'completed_at',
        'created_by',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'sent_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    protected $hidden = [
        'token_hash',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
