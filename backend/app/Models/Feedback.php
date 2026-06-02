<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Feedback extends Model
{
    protected $table = 'feedback';

    protected $fillable = [
        'referral_id',
        'received_at',
        'rhu_diagnosis',
        'action_taken',
        'treatment_notes',
        'recommendation',
        'receiving_practitioner',
        'remarks',
        'created_by',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    public function referral(): BelongsTo
    {
        return $this->belongsTo(Referral::class);
    }
}
