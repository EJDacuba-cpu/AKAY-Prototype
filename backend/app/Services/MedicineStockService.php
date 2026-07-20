<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;

class MedicineStockService
{
    private const MAX_QUANTITY = 2147483647;

    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
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

    public function lockAndValidate(
        User $user,
        ?int $barangayHealthCenterId,
        array $requestedItems
    ): array {
        if ($requestedItems === []) {
            return [];
        }

        abort_unless($user->isBhw(), 422, 'Medicine dispensing is only available for BHC visits.');

        $normalizedItems = $this->normalize($requestedItems);
        $medicineIds = array_column($normalizedItems, 'medicine_id');
        $lockedMedicines = Medicine::query()
            ->whereIn('id', $medicineIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($normalizedItems as $item) {
            $medicine = $lockedMedicines->get($item['medicine_id']);

            abort_unless(
                $medicine && $this->facilityAccess->canDispenseMedicineForBarangayHealthCenter(
                    $user,
                    $medicine,
                    $barangayHealthCenterId
                ),
                422,
                'Please select a medicine from BHC inventory.'
            );
        }

        foreach ($normalizedItems as $item) {
            $medicine = $lockedMedicines->get($item['medicine_id']);
            $hasPositiveStock = (int) $medicine->quantity > 0;
            $isUnavailable = strcasecmp((string) $medicine->availability_status, 'Unavailable') === 0;

            abort_if(
                $isUnavailable && $hasPositiveStock,
                422,
                'The selected medicine is unavailable.'
            );
            abort_if(
                $medicine->expiration_date?->isBefore(today()),
                422,
                'The selected medicine is expired.'
            );
        }

        $insufficientItems = [];
        foreach ($normalizedItems as $item) {
            $medicine = $lockedMedicines->get($item['medicine_id']);
            $availableQuantity = (int) $medicine->quantity;

            if ((int) $item['quantity'] > $availableQuantity) {
                $insufficientItems[] = [
                    'medicine_id' => $medicine->id,
                    'medicine_name' => $medicine->name,
                    'requested_quantity' => (int) $item['quantity'],
                    'available_quantity' => $availableQuantity,
                ];
            }
        }

        if ($insufficientItems !== []) {
            throw new HttpResponseException(response()->json([
                'message' => 'One or more selected medicines no longer have enough available stock.',
                'code' => 'INSUFFICIENT_STOCK',
                'items' => $insufficientItems,
            ], 409));
        }

        return array_map(fn (array $item): array => [
            ...$item,
            'medicine' => $lockedMedicines->get($item['medicine_id']),
        ], $normalizedItems);
    }

    public function dispense(
        User $user,
        HealthRecord $record,
        array $lockedItems
    ): void {
        foreach ($lockedItems as $item) {
            /** @var Medicine $medicine */
            $medicine = $item['medicine'];
            $newQuantity = (int) $medicine->quantity - (int) $item['quantity'];

            $medicine->update([
                'quantity' => $newQuantity,
                'availability_status' => $this->medicineStatus(
                    $newQuantity,
                    (int) ($medicine->low_stock_threshold ?? 10)
                ),
                'updated_by' => $user->id,
            ]);

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
        }
    }

    private function medicineStatus(int $quantity, int $lowStockThreshold = 10): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
    }
}
