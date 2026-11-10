<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TbFollowUpLab extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['due_on' => 'date:Y-m-d', 'collection_on' => 'date:Y-m-d', 'examination_on' => 'date:Y-m-d',
        'version' => 'integer', 'recorded_at' => 'datetime'];
}
