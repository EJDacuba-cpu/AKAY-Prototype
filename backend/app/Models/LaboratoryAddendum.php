<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LaboratoryAddendum extends Model
{
    protected $table = 'laboratory_addenda';

    protected $guarded = ['id'];

    protected $casts = ['data' => 'array'];
}
