<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FormDraft extends Model
{
    protected $guarded = [];

    protected $hidden = ['encrypted_payload', 'encrypted_base_revision', 'encrypted_result', 'payload_hash', 'commit_hash', 'active_slot'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'last_saved_at' => 'datetime', 'version' => 'integer', 'schema_version' => 'integer'];
    }
}
