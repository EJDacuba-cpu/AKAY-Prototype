<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthRecordMedicine extends Model
{
    protected $appends = ['allocations', 'unallocated_shortage', 'override_reason'];

    private function dispenseTransaction(): ?MedicineInventoryTransaction
    {
        if (!$this->relationLoaded('inventoryTransaction')) {
            $this->setRelation('inventoryTransaction', MedicineInventoryTransaction::where('medicine_id', $this->medicine_id)
                ->where('source_type', 'health_record')->where('source_id', $this->health_record_id)
                ->where('transaction_type', 'dispense')->with('allocations')->first());
        }
        return $this->getRelation('inventoryTransaction');
    }

    public function getAllocationsAttribute(): array
    {
        return $this->dispenseTransaction()?->allocations->toArray() ?? [];
    }

    public function getUnallocatedShortageAttribute(): int
    {
        return max(0, -(int) $this->dispenseTransaction()?->discrepancy);
    }

    public function getOverrideReasonAttribute(): ?string
    {
        $reason = $this->dispenseTransaction()?->reason;
        $prefix = 'Manual expiry override: ';
        return is_string($reason) && str_starts_with($reason, $prefix) ? substr($reason, strlen($prefix)) : null;
    }

    protected $hidden = ['inventoryTransaction'];

    protected $fillable = [
        'health_record_id',
        'medicine_id',
        'medicine_name_snapshot',
        'category_snapshot',
        'quantity',
        'unit',
        'remarks',
        'dispensed_by',
        'barangay_health_center_id',
    ];

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }

    public function dispenser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispensed_by');
    }
}
