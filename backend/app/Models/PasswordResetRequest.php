<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PasswordResetRequest extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_EXPIRED = 'expired';

    public const DELIVERY_SENT = 'sent';
    public const DELIVERY_FAILED = 'failed';
    public const DELIVERY_COPIED = 'copied';

    public const VIA_LINK = 'link';
    public const VIA_INVITE = 'invite';
    public const VIA_TEMPORARY_PASSWORD = 'temporary_password';

    protected $fillable = [
        'user_id',
        'email',
        'status',
        'requested_at',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'completed_at',
        'expires_at',
        'reset_token_hash',
        'admin_note',
        'delivery',
        'completed_via',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'completed_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    protected $hidden = [
        'reset_token_hash',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejecter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function isApprovedTokenUsable(): bool
    {
        return $this->status === self::STATUS_APPROVED
            && $this->reset_token_hash
            && $this->expires_at
            && $this->expires_at->isFuture();
    }
}
