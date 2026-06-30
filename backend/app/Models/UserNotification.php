<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserNotification extends Model
{
    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'link_url',
        'type',
        'entity_type',
        'entity_id',
        'is_read',
        'cleared_at',
        'related_referral_id',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'cleared_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
