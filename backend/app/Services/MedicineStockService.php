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
        private readonly AuditLogger $auditLogger,
        private readonly MedicineExpiryStockService $expiryStock
    ) {}

    public function normalize(array $items): array
    {
        $normalized = [];

        foreach ($items as $item) {
            $medicineId = (int) ($item['medicine_id'] ?? 0);
            $quantity = (int) ($item['quantity'] ?? 0);

            abort_if($medicineId <= 0, 422, 'Please select a medicine.');
            abort_if($quantity <= 0, 422, 'Quantity must be greater than 0.');
            abort_if($quantity > self::MAX_QUANTITY, 422, 'Quantity is too large.');

            $manual = array_key_exists('allocations', $item);
            abort_if(isset($normalized[$medicineId]) && ($manual || array_key_exists('allocations', $normalized[$medicineId])), 422, 'Combine manual allocations into one entry per medicine.');
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
            if ($manual) {
                $allocations = $item['allocations'];
                abort_unless(is_array($allocations), 422, 'Invalid group allocations.');
                $reason = trim((string) ($item['override_reason'] ?? ''));
                abort_if(mb_strlen($reason) > 1000, 422, 'A manual allocation reason is required (maximum 1000 characters).');
                $seen = [];
                $total = 0;
                $clean = [];
                foreach ($allocations as $allocation) {
                    $groupId = filter_var($allocation['expiry_group_id'] ?? null, FILTER_VALIDATE_INT);
                    $amount = filter_var($allocation['quantity'] ?? null, FILTER_VALIDATE_INT);
                    abort_if(! $groupId || $groupId < 1 || ! $amount || $amount < 1 || $amount > self::MAX_QUANTITY || isset($seen[$groupId]), 422, 'Invalid or duplicate group allocation.');
                    $seen[$groupId] = true;
                    $total += $amount;
                    $clean[] = ['expiry_group_id' => $groupId, 'quantity' => $amount];
                }
                abort_if($total > $quantity, 422, 'Group allocations exceed the actual quantity.');
                usort($clean, fn ($a, $b) => $a['expiry_group_id'] <=> $b['expiry_group_id']);
                $normalized[$medicineId]['allocations'] = $clean;
                $normalized[$medicineId]['override_reason'] = $reason;
            }

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
                ...(array_key_exists('allocations', $item) ? ['allocations' => $item['allocations'], 'override_reason' => $item['override_reason']] : []),
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
            "medicine:{$medicine->id}:opening",
            options: $request->only(['expiration_date', 'expiry_not_applicable'])
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
            $operationKey ?: (string) Str::uuid(),
            options: $request->only(['expiration_date', 'expiry_not_applicable'])
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
        if ($action === 'physical_count') {
            return $this->correctRecordedQuantity($request, $medicine, $quantity, $reason, $operationKey);
        }
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
            $action,
            $request->only(['expiry_group_id', 'pool', 'target'])
        );
        $auditAction = in_array($action, ['damaged_disposal', 'expired_disposal'], true)
            ? 'medicine_disposed'
            : 'medicine_adjusted';
        $this->auditResult($request, $auditAction, $context, $result);

        return $result;
    }

    public function correctRecordedQuantity(
        Request $request,
        Medicine $medicine,
        int $quantity,
        string $reason,
        ?string $operationKey = null
    ): array {
        return DB::transaction(function () use ($request, $medicine, $quantity, $reason, $operationKey) {
            $locked = Medicine::whereKey($medicine->id)->lockForUpdate()->firstOrFail();
            $this->facilityAccess->authorizeMedicine($request->user(), $locked);
            abort_if($locked->expiryGroups()->exists(), 422, 'Use a group correction or complete stock verification for grouped inventory.');
            $result = $this->expiryStock->operate($request->user(), $locked, $this->facilityContext($request->user()), 'verify_stock', 0, $reason, $operationKey ?: (string) Str::uuid(), [
                'groups' => [], 'unassigned_quantity' => $quantity, 'snapshot' => $locked->stock_summary['snapshot'],
            ]);
            $this->auditResult($request, 'inventory_corrected', $this->facilityContext($request->user()), $result);

            return $result;
        });
    }

    public function groupOperation(Request $request, Medicine $medicine, array $data): array
    {
        $result = $this->expiryStock->operate($request->user(), $medicine, $this->facilityContext($request->user()), $data['action'], (int) ($data['quantity'] ?? 0), $data['reason'], $data['idempotency_key'], $data);
        $this->auditResult($request, 'medicine_'.$data['action'], $this->facilityContext($request->user()), $result);

        return $result;
    }

    public function dispense(Request $request, HealthRecord $record, array $requestedItems): void
    {
        ActionPermissions::ensure($request->user(), 'items.dispense');
        if ($requestedItems === []) {
            return;
        }

        $user = $request->user();
        abort_unless($user->isBhc(), 422, 'Medicine dispensing is only available for BHC visits.');
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
        string $operation, User $user, Medicine $medicine, array $context,
        int $quantity, ?string $reason, ?string $direction, string $operationKey,
        ?string $action = null, array $options = []
    ): array {
        return $this->expiryStock->operate($user, $medicine, $context, $action ?: $operation, $quantity, $reason, $operationKey, [...$options, 'direction' => $direction]);
    }

    private function postgresDispense(
        User $user,
        HealthRecord $record,
        array $context,
        array $items,
        string $operationKey
    ): array {
        $medicines = Medicine::query()
            ->whereIn('id', array_column($items, 'medicine_id'))
            ->with('expiryGroups')
            ->get()
            ->keyBy('id');

        foreach ($items as $item) {
            $medicine = $medicines->get($item['medicine_id']);
            $this->assertOwnedMedicine($medicine, $context, true);
            $this->assertDispensable($medicine);
        }

        $payload = array_map(function (array $item) use ($medicines): array {
            $item = $this->expiryStock->resolveManualDispenseItem($medicines->get($item['medicine_id'])->expiryGroups, $item);

            return [
                'medicine_id' => $item['medicine_id'],
                'quantity' => $item['quantity'],
                ...(array_key_exists('allocations', $item) ? ['allocations' => $item['allocations'], 'override_reason' => $item['override_reason']] : []),
            ];
        }, $items);

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
            $this->assertDispensable($medicine);
        }

        $results = [];
        foreach ($items as $item) {
            $results[] = $this->expiryStock->sqliteDispense($user, $medicines->get($item['medicine_id']), $item, $operationKey, $record->id);
        }

        return $results;
    }

    private function facilityContext(User $user): array
    {
        if ($user->isBhc() && $this->facilityAccess->hasValidFacilityAssignment($user)) {
            return ['type' => 'bhc', 'id' => (int) $user->barangay_health_center_id];
        }

        if ($user->isRhu() && $this->facilityAccess->hasValidFacilityAssignment($user)) {
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

    private function assertDispensable(Medicine $medicine): void
    {
        if (! $medicine->is_active) {
            $this->inventoryError(
                'MEDICINE_NOT_DISPENSABLE',
                422,
                'One or more selected medicines cannot be dispensed.'
            );
        }
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
            'INVENTORY_GROUP_MISMATCH',
            'INVENTORY_GROUP_CONTEXT_REQUIRED',
            'INVALID_INVENTORY_EXPIRY',
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
            'INVENTORY_GROUP_MISMATCH' => [422, 'The selected group does not belong to this medicine.'],
            'INVENTORY_GROUP_CONTEXT_REQUIRED' => [422, 'An expiry group is required.'],
            'INVALID_INVENTORY_EXPIRY' => [422, 'The expiry information is invalid.'],
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
}
