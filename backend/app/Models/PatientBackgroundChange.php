<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Append-only audit; no update/delete API is exposed. */
class PatientBackgroundChange extends Model
{
    public $timestamps = false;

    protected $fillable = ['patient_id', 'barangay_health_center_id', 'section', 'source', 'before', 'after', 'revision', 'changed_by', 'changed_at'];

    protected $casts = ['before' => 'array', 'after' => 'array', 'revision' => 'integer', 'changed_at' => 'datetime'];

    public function historyEntry(): array
    {
        return [
            'auditId' => $this->id,
            'section' => $this->section,
            'source' => $this->source,
            'before' => $this->before,
            'after' => $this->after,
            'revision' => $this->revision,
            'changedBy' => $this->changed_by,
            'changedAt' => $this->changed_at->toISOString(),
            'dateRecorded' => $this->changed_at->toDateString(),
        ];
    }
}
