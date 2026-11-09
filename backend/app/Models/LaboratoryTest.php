<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LaboratoryTest extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['data' => 'array'];

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function addenda(): HasMany
    {
        return $this->hasMany(LaboratoryAddendum::class)->orderBy('id');
    }
}
