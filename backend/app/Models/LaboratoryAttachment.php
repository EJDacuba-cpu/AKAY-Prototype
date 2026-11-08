<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LaboratoryAttachment extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $hidden = ['disk', 'path', 'consultation_uuid'];

    protected $casts = ['removed_at' => 'datetime', 'purged_at' => 'datetime', 'uploaded_at' => 'datetime'];
}
