<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\MedicineInventoryTransaction;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MedicineStockService
{
    private const MAX_QUANTITY = 2147483647;

    private const OPERATION_KEY_UNIQUE_CONSTRAINT =
        'medicine_inventory_transactions_operation_medicine_unique';

    private const ADJUSTMENT_ACTIONS = [
        'adjustment_in',
        'adjustment_out',
        'damaged_disposal',
        'expired_disposal',
        'correction',
    ];

    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly AuditLogger $auditLogger
    ) {
    }

    public function normalize(array $items): array
    {
        $normalized = [];

        foreach ($items as $item) {
            $medicineId = (int) ($item['medicine_id'] ?? 0);
            $quantity = (int) ($item['quantity'] ?? 0);

            abort_if($medicineId <= 0, 422, 'Please select a medicine.');
            abort_if($quantity <= 0, 422, 'Quantity must be greater than 0.');
            abort_if($quantity > self::MAX_QUANTITY, 422, 'Quantity is too large.');

            $normalized[$medicineId] ??= [
                'medicine_id' => $medicineId,
                'quantity' => 0,
                'units' => [],
                'remarks' => [],
            ];
            abort_if(
                $normalized[$medicineId]['quantity'] > self::MAX_QUANTITY - $quantity,
                422,
                'Combined quantity is too large.'
            );
            $normalized[$medicineId]['quantity'] += $quantity;

            $unit = trim((string) ($item['unit'] ?? ''));
            if ($unit !== '') {
                $normalized[$medicineId]['units'][] = $unit;
            }

            $remarks = trim((string) ($item['remarks'] ?? ''));
            if ($remarks !== '') {
                $normalized[$medicineId]['remarks'][] = $remarks;
            }
        }

        ksort($normalized, SORT_NUMERIC);

        return array_values(array_map(function (array $item): array {
            $units = array_values(array_unique($item['units']));
            $remarks = array_values(array_unique($item['remarks']));
            sort($units, SORT_STRING);
            sort($remarks, SORT_STRING);

            return [
                'medicine_id' => $item['medicine_id'],
                'quantity' => $item['quantity'],
                'unit' => $units[0] ?? null,
                'remarks' => $remarks === [] ? null : implode('; ', $remarks),
            ];
        }, $normalized));
    }

    public function openingBalance(Request $request, Medicine $medicine, int $quantity): ?array
    {
        if ($quantity === 0) {
            return null;
        }

        $context = $this->facilityContext($request->user());
        $result = $this->executeSingle(
            'opening_balance',
            $request->user(),
            $medicine,
            $context,
            $quantity,
            null,
            null,
            "medicine:{$medicine->id}:opening"
        );
        $this->auditResult($request, 'medicine_created', $context, $result);

        return $result;
    }

    public function restock(
        Request $request,
        Medicine $medicine,
        int $quantity,
        string $reason,
        ?string $operationKey = null
    ): array {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);
        $context = $this->facilityContext($request->user());
        $result = $this->executeSingle(
            'restock',
            $request->user(),
            $medicine,
            $context,
            $quantity,
            trim($reason),
            null,
            $operationKey ?: (string) Str::uuid()
        );
        $this->auditResult($request, 'medicine_restocked', $context, $result);

        return $result;
    }

    public function adjust(
        Request $request,
        Medicine $medicine,
        string $action,
        int $quantity,
        string $reason,
        ?string $direction = null,
        ?string $operationKey = null
    ): array {
        abort_unless(in_array($action, self::ADJUSTMENT_ACTIONS, true), 422, 'Invalid inventory operation.');
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);
        $context = $this->facilityContext($request->user());
        $result = $this->executeSingle(
            'adjust',
            $request->user(),
            $medicine,
            $context,
            $quantity,
            trim($reason),
            $action === 'correction' ? $direction : null,
            $operationKey ?: (string) Str::uuid(),
            $action
        );
        $auditAction = in_array($action, ['damaged_disposal', 'expired_disposal'], true)
            ? 'medicine_disposed'
            : 'medicine_adjusted';
        $this->auditResult($request, $auditAction, $context, $result);

        return $result;
    }

    public function dispense(Request $request, HealthRecord $record, array $requestedItems): void
    {
        if ($requestedItems === []) {
            return;
        }

        $user = $request->user();
        abort_unless($user->isBhw(), 422, 'Medicine dispensing is only available for BHC visits.');
        $context = $this->facilityContext($user);
        abort_unless(
            $context['type'] === 'bhc'
                && (int) $record->barangay_health_center_id === $context['id'],
            403,
            'This resource is outside your assigned facility.'
        );

        $normalized = $this->normalize($requestedItems);
        $operationKey = "health-record:{$record->id}:dispense";
        $results = DB::getDriverName() === 'pgsql'
            ? $this->postgresDispense($user, $record, $context, $normalized, $operationKey)
            : $this->sqliteDispense($user, $record, $context, $normalized, $operationKey);

        $medicines = Medicine::query()
            ->whereIn('id', array_column($normalized, 'medicine_id'))
            ->get()
            ->keyBy('id');

        foreach ($normalized as $item) {
            $medicine = $medicines->get($item['medicine_id']);
            abort_unless($medicine, 500, 'Medicine inventory could not be finalized.');

            $record->dispensedMedicines()->create([
                'medicine_id' => $medicine->id,
                'medicine_name_snapshot' => $medicine->name,
                'category_snapshot' => $medicine->category,
                'quantity' => $item['quantity'],
                'unit' => $item['unit'] ?: $medicine->unit,
                'remarks' => $item['remarks'],
                'dispensed_by' => $user->id,
                'barangay_health_center_id' => $record->barangay_health_center_id,
            ]);

            $result = collect($results)->firstWhere('medicine_id', $medicine->id);
            if ($result) {
                $this->auditResult(
                    $request,
                    'medicine_dispensed',
                    $context,
                    $result,
                    $record->id
                );
            }
        }
    }

    private function executeSingle(
        string $operation,
        User $user,
        Medicine $medicine,
        array $context,
        int $quantity,
        ?string $reason,
        ?string $direction,
        string $operationKey,
        ?string $action = null
    ): array {
        if (DB::getDriverName() !== 'pgsql') {
            return $this->sqliteSingle(
                $operation,
                $user,
                $medicine,
                $context,
                $quantity,
                $reason,
                $direction,
                $operationKey,
                $action
            );
        }

        try {
            if ($operation === 'opening_balance') {
                $rows = DB::select(
                    'SELECT * FROM public.akay_inventory_opening_balance(?, ?, ?, ?, ?, ?)',
                    [$medicine->id, $user->id, $context['type'], $context['id'], $quantity, $operationKey]
                );
            } elseif ($operation === 'restock') {
                $rows = DB::select(
                    'SELECT * FROM public.akay_inventory_restock(?, ?, ?, ?, ?, ?, ?)',
                    [$medicine->id, $user->id, $context['type'], $context['id'], $quantity, $reason, $operationKey]
                );
            } else {
                $rows = DB::select(
                    'SELECT * FROM public.akay_inventory_adjust(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $medicine->id,
                        $user->id,
                        $context['type'],
                        $context['id'],
                        $action,
                        $direction,
                        $quantity,
                        $reason,
                        $operationKey,
                    ]
                );
            }
        } catch (QueryException $exception) {
            $this->throwMappedDatabaseError($exception);
        }

        abort_unless(count($rows) === 1, 500, 'Inventory operation did not return a result.');

        $result = $this->normalizeResult($rows[0]);
        $result['transaction_type'] = $action ?: $operation;

        return $result;
    }

    private function postgresDispense(
        User $user,
        HealthRecord $record,
        array $context,
        array $items,
        string $operationKey
    ): array {
        $payload = array_map(fn (array $item): array => [
            'medicine_id' => $item['medicine_id'],
            'quantity' => $item['quantity'],
        ], $items);

        try {
            $rows = DB::select(
                'SELECT * FROM public.akay_inventory_dispense_batch(?, ?, ?, ?, ?, ?, CAST(? AS jsonb))',
                [
                    $user->id,
                    $context['type'],
                    $context['id'],
                    'health_record',
                    $record->id,
                    $operationKey,
                    json_encode($payload, JSON_THROW_ON_ERROR),
                ]
            );
        } catch (QueryException $exception) {
            $this->throwMappedDatabaseError($exception);
        }

        return array_map(function (object $row): array {
            $result = $this->normalizeResult($row);
            $result['transaction_type'] = 'dispense';

            return $result;
        }, $rows);
    }

    private function sqliteSingle(
        string $operation,
        User $user,
        Medicine $medicine,
        array $context,
        int $quantity,
        ?string $reason,
        ?string $direction,
        string $operationKey,
        ?string $action
    ): array {
        $locked = Medicine::query()->whereKey($medicine->id)->lockForUpdate()->first();
        $this->assertOwnedMedicine($locked, $context);
        $this->assertOperationKeyAvailable($operationKey, $medicine->id);

        $before = (int) $locked->quantity;
        $transactionType = $action ?: $operation;
        $sourceType = match ($transactionType) {
            'opening_balance' => 'opening_balance',
            'restock' => 'manual_restock',
            'damaged_disposal', 'expired_disposal' => 'disposal',
            'correction' => 'correction',
            default => 'manual_adjustment',
        };

        if ($operation === 'opening_balance') {
            $this->assertUsableForIncrease($locked);
            $this->conflictIf($before !== 0);
            $delta = $quantity;
        } elseif ($operation === 'restock') {
            $this->assertUsableForIncrease($locked);
            $delta = $quantity;
        } else {
            abort_unless(in_array($transactionType, self::ADJUSTMENT_ACTIONS, true), 422, 'Invalid inventory operation.');
            abort_if(
                $transactionType === 'expired_disposal'
                    && (! $locked->expiration_date || ! $locked->expiration_date->isBefore(today())),
                422,
                'Expired disposal is only available for expired stock.'
            );
            abort_if(
                ! $locked->is_active
                    && in_array($transactionType, ['adjustment_in', 'correction'], true),
                409,
                'Archived medicine cannot receive stock.'
            );
            $isIncrease = $transactionType === 'adjustment_in'
                || ($transactionType === 'correction' && $direction === 'in');
            abort_if($transactionType === 'correction' && ! in_array($direction, ['in', 'out'], true), 422, 'Correction direction is required.');
            $delta = $isIncrease ? $quantity : -$quantity;
        }

        $after = $before + $delta;
        $this->conflictIf($after < 0 || $after > self::MAX_QUANTITY);
        $locked->update([
            'quantity' => $after,
            'availability_status' => $this->medicineStatus($after, (int) ($locked->low_stock_threshold ?? 10)),
            'updated_by' => $user->id,
        ]);
        $transaction = MedicineInventoryTransaction::create([
            'medicine_id' => $locked->id,
            'actor_user_id' => $user->id,
            'transaction_type' => $transactionType,
            'quantity_delta' => $delta,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'source_type' => $sourceType,
            'source_id' => $locked->id,
            'reason' => $reason,
            'operation_key' => $operationKey,
        ]);

        return [
            'transaction_id' => $transaction->id,
            'medicine_id' => $locked->id,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'quantity_delta' => $delta,
            'transaction_type' => $transactionType,
        ];
    }

    private function sqliteDispense(
        User $user,
        HealthRecord $record,
        array $context,
        array $items,
        string $operationKey
    ): array {
        $ids = array_column($items, 'medicine_id');
        $medicines = Medicine::query()
            ->whereIn('id', $ids)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($items as $item) {
            $this->assertOwnedMedicine($medicines->get($item['medicine_id']), $context, true);
        }
        $this->assertOperationKeyAvailable($operationKey);

        foreach ($items as $item) {
            $medicine = $medicines->get($item['medicine_id']);
            if (
                ! $medicine->is_active
                || $medicine->expiration_date?->isBefore(today())
                || strcasecmp((string) $medicine->availability_status, 'Unavailable') === 0
            ) {
                $this->inventoryError(
                    'MEDICINE_NOT_DISPENSABLE',
                    422,
                    'One or more selected medicines cannot be dispensed.'
                );
            }
        }

        $insufficientItems = [];
        foreach ($items as $item) {
            $medicine = $medicines->get($item['medicine_id']);
            if ($item['quantity'] > (int) $medicine->quantity) {
                $insufficientItems[] = [
                    'medicine_id' => $medicine->id,
                    'medicine_name' => $medicine->name,
                    'requested_quantity' => $item['quantity'],
                    'available_quantity' => (int) $medicine->quantity,
                ];
            }
        }
        if ($insufficientItems !== []) {
            $this->inventoryError(
                'INSUFFICIENT_STOCK',
                409,
                'One or more selected medicines no longer have enough available stock.',
                $insufficientItems
            );
        }

        $results = [];
        foreach ($items as $item) {
            $medicine = $medicines->get($item['medicine_id']);
            $before = (int) $medicine->quantity;
            $after = $before - $item['quantity'];
            $medicine->update([
                'quantity' => $after,
                'availability_status' => $this->medicineStatus($after, (int) ($medicine->low_stock_threshold ?? 10)),
                'updated_by' => $user->id,
            ]);
            $transaction = MedicineInventoryTransaction::create([
                'medicine_id' => $medicine->id,
                'actor_user_id' => $user->id,
                'transaction_type' => 'dispense',
                'quantity_delta' => -$item['quantity'],
                'quantity_before' => $before,
                'quantity_after' => $after,
                'source_type' => 'health_record',
                'source_id' => $record->id,
                'operation_key' => $operationKey,
            ]);
            $results[] = [
                'transaction_id' => $transaction->id,
                'medicine_id' => $medicine->id,
                'quantity_before' => $before,
                'quantity_after' => $after,
                'quantity_delta' => -$item['quantity'],
                'transaction_type' => 'dispense',
            ];
        }

        return $results;
    }

    private function facilityContext(User $user): array
    {
        if ($user->isBhw() && $this->facilityAccess->hasValidFacilityAssignment($user)) {
            return ['type' => 'bhc', 'id' => (int) $user->barangay_health_center_id];
        }

        if ($user->isRhuStaff() && $this->facilityAccess->hasValidFacilityAssignment($user)) {
            return ['type' => 'rhu', 'id' => (int) $user->rural_health_unit_id];
        }

        abort(403, 'A valid BHC or RHU facility assignment is required for inventory changes.');
    }

    private function assertOwnedMedicine(?Medicine $medicine, array $context, bool $dispensing = false): void
    {
        $owned = $medicine
            && (($context['type'] === 'bhc'
                    && $medicine->rural_health_unit_id === null
                    && (int) $medicine->barangay_health_center_id === $context['id'])
                || ($context['type'] === 'rhu'
                    && $medicine->barangay_health_center_id === null
                    && (int) $medicine->rural_health_unit_id === $context['id']));

        if (! $owned && $dispensing) {
            $this->inventoryError(
                'MEDICINE_FACILITY_MISMATCH',
                422,
                'Please select a medicine from BHC inventory.'
            );
        }

        abort_unless($owned, 403, 'This resource is outside your assigned facility.');
    }

    private function assertUsableForIncrease(Medicine $medicine): void
    {
        $this->conflictIf(! $medicine->is_active || $medicine->expiration_date?->isBefore(today()));
    }

    private function assertOperationKeyAvailable(string $operationKey, ?int $medicineId = null): void
    {
        $query = MedicineInventoryTransaction::query()->where('operation_key', $operationKey);
        if ($medicineId) {
            $query->where('medicine_id', $medicineId);
        }

        if ($query->exists()) {
            $this->inventoryError(
                'INVENTORY_OPERATION_ALREADY_APPLIED',
                409,
                'This inventory operation has already been applied.'
            );
        }
    }

    private function conflictIf(bool $condition): void
    {
        if ($condition) {
            $this->inventoryError('INVENTORY_CONFLICT', 409, 'The inventory changed. Please refresh and try again.');
        }
    }

    private function throwMappedDatabaseError(QueryException $exception): never
    {
        if ($this->isOperationKeyUniqueViolation($exception)) {
            $this->inventoryError(
                'INVENTORY_OPERATION_ALREADY_APPLIED',
                409,
                'This inventory operation has already been applied.'
            );
        }

        $knownCodes = [
            'INSUFFICIENT_STOCK',
            'MEDICINE_NOT_DISPENSABLE',
            'INVALID_INVENTORY_OPERATION',
            'INVENTORY_OPERATION_ALREADY_APPLIED',
            'MEDICINE_FACILITY_MISMATCH',
            'INVENTORY_CONFLICT',
        ];
        $message = $exception->getMessage();
        $code = collect($knownCodes)->first(fn (string $candidate): bool => str_contains($message, $candidate));

        if (! $code) {
            throw $exception;
        }

        $contracts = [
            'INSUFFICIENT_STOCK' => [409, 'One or more selected medicines no longer have enough available stock.'],
            'MEDICINE_NOT_DISPENSABLE' => [422, 'One or more selected medicines cannot be dispensed.'],
            'INVALID_INVENTORY_OPERATION' => [422, 'The inventory operation is invalid.'],
            'INVENTORY_OPERATION_ALREADY_APPLIED' => [409, 'This inventory operation has already been applied.'],
            'MEDICINE_FACILITY_MISMATCH' => [422, 'The selected medicine is not available for this facility.'],
            'INVENTORY_CONFLICT' => [409, 'The inventory changed. Please refresh and try again.'],
        ];

        $this->inventoryError($code, $contracts[$code][0], $contracts[$code][1]);
    }

    private function isOperationKeyUniqueViolation(QueryException $exception): bool
    {
        $sqlState = (string) ($exception->errorInfo[0]
            ?? $exception->getPrevious()?->errorInfo[0]
            ?? $exception->getCode());
        $databaseMessage = (string) ($exception->errorInfo[2]
            ?? $exception->getPrevious()?->getMessage()
            ?? $exception->getMessage());

        return $sqlState === '23505'
            && str_contains($databaseMessage, self::OPERATION_KEY_UNIQUE_CONSTRAINT);
    }

    private function inventoryError(
        string $code,
        int $status,
        string $message,
        ?array $items = null
    ): never {
        $payload = ['message' => $message, 'code' => $code];
        if ($items !== null) {
            $payload['items'] = $items;
        }

        throw new HttpResponseException(response()->json($payload, $status));
    }

    private function normalizeResult(object $row): array
    {
        return [
            'transaction_id' => (int) $row->inventory_transaction_id,
            'medicine_id' => (int) $row->result_medicine_id,
            'quantity_before' => (int) $row->quantity_before,
            'quantity_after' => (int) $row->quantity_after,
            'quantity_delta' => (int) $row->quantity_delta,
            'transaction_type' => null,
        ];
    }

    private function auditResult(
        Request $request,
        string $action,
        array $context,
        array $result,
        ?int $sourceRecordId = null
    ): void {
        $details = [
            "medicine_id={$result['medicine_id']}",
            "facility_type={$context['type']}",
            "facility_id={$context['id']}",
            "inventory_transaction_id={$result['transaction_id']}",
            "quantity_delta={$result['quantity_delta']}",
        ];
        if ($sourceRecordId) {
            $details[] = "source_record_id={$sourceRecordId}";
        }

        $this->auditLogger->log($request, $action, 'medicines', implode('; ', $details).'.');
    }

    private function medicineStatus(int $quantity, int $lowStockThreshold): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
    }
}
