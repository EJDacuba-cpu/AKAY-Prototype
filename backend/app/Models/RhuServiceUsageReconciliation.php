<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RhuServiceUsageReconciliation extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_RECONCILED = 'reconciled';

    public const STATUS_UNAVAILABLE = 'unavailable';

    public const STATUS_NEEDS_REVIEW = 'needs_review';

    public const PROGRAMS = ['EPI', 'Maternal', 'Family Planning', 'Nutrition'];

    protected $fillable = [
        'health_record_id',
        'patient_id',
        'rural_health_unit_id',
        'service_program',
        'clinical_source_key',
        'item_description',
        'quantity',
        'unit',
        'administered_at',
        'note',
        'reconciliation_status',
        'inventory_medicine_id',
        'inventory_transaction_id',
        'expiry_group_id',
        'reconciled_quantity',
        'confirmed_by',
        'confirmed_at',
    ];

    protected $casts = [
        'administered_at' => 'date',
        'confirmed_at' => 'datetime',
        'quantity' => 'integer',
        'reconciled_quantity' => 'integer',
    ];

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function inventoryMedicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class, 'inventory_medicine_id');
    }

    public function confirmedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function isPending(): bool
    {
        return $this->reconciliation_status === self::STATUS_PENDING
            || $this->reconciliation_status === self::STATUS_NEEDS_REVIEW;
    }

    public function toQueueArray(): array
    {
        $qty = $this->quantity.($this->unit !== '' ? ' '.$this->unit : '');

        return [
            'id' => 'usage-'.$this->id,
            'kind' => 'service_usage',
            'usageId' => $this->id,
            'healthRecordId' => $this->health_record_id,
            'patientId' => $this->patient_id,
            'patientName' => $this->patient?->full_name ?: '',
            'visitDate' => optional($this->healthRecord?->date_recorded)->toDateString()
                ?: optional($this->administered_at)->toDateString(),
            'source' => $this->service_program,
            'sourceType' => 'SERVICE_USAGE',
            'itemSummary' => trim($this->item_description.' / '.$qty),
            'itemDescription' => $this->item_description,
            'quantity' => $this->quantity,
            'unit' => $this->unit,
            'administeredAt' => optional($this->administered_at)->toDateString(),
            'note' => $this->note,
            'status' => $this->reconciliation_status === self::STATUS_RECONCILED
                ? 'reconciled'
                : ($this->reconciliation_status === self::STATUS_UNAVAILABLE
                    ? 'unavailable'
                    : ($this->reconciliation_status === self::STATUS_NEEDS_REVIEW
                        ? 'needs_review'
                        : 'pending')),
            'inventoryTransactionId' => $this->inventory_transaction_id,
            'confirmedAt' => optional($this->confirmed_at)?->toIso8601String(),
        ];
    }
}
