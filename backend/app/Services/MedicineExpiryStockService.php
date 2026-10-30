<?php

namespace App\Services;

use App\Models\Medicine;
use App\Models\MedicineExpiryGroup;
use App\Models\MedicineInventoryAllocation;
use App\Models\MedicineInventoryTransaction;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/** Group mutations use the same medicine lock and immutable ledger as existing stock operations. */
class MedicineExpiryStockService
{
    private const MAX = 2147483647;

    public function __construct(private readonly FacilityAccessService $access) {}

    public static function expiryRules(string $itemType, bool $notApplicable): array
    {
        return [
            'expiration_date' => $notApplicable ? ['prohibited'] : ['required', 'date_format:Y-m-d', 'after_or_equal:'.Medicine::facilityCalendarDate()],
            'expiry_not_applicable' => $itemType === 'health_supply' ? ['sometimes', 'boolean'] : ['sometimes', 'declined'],
        ];
    }

    public function operate(User $user, Medicine $medicine, array $context, string $action, int $quantity, ?string $reason, string $key, array $options = []): array
    {
        ActionPermissions::ensure($user, 'inventory.manage');

        return DB::transaction(function () use ($user, $medicine, $context, $action, $quantity, $reason, $key, $options) {
            $locked = Medicine::whereKey($medicine->id)->lockForUpdate()->firstOrFail();
            $this->access->authorizeMedicine($user, $locked);
            $groups = $locked->expiryGroups()->lockForUpdate()->get();
            $locked->setRelation('expiryGroups', $groups);
            $this->assertNewKey($locked, $key);
            if ($locked->stock_summary['unassigned'] < 0) {
                $this->error('INVENTORY_CONFLICT', 409, 'Recorded stock and expiry groups require reconciliation.');
            }
            if ($action === 'release' && ! $locked->is_active) {
                $this->error('MEDICINE_NOT_DISPENSABLE', 422, 'Archived medicine cannot be released.');
            }
            abort_if($quantity < 0 || $quantity > self::MAX, 422, 'Invalid quantity.');
            abort_if($action === 'correction' && isset($options['expiry_group_id']) && ! in_array($options['pool'] ?? null, ['available', 'quarantined'], true), 422, 'Select the stock pool being corrected.');
            abort_if($action !== 'opening_balance' && trim((string) $reason) === '', 422, 'A reason is required.');
            if ($action === 'verify_stock') {
                abort_unless(hash_equals($locked->stock_summary['snapshot'], (string) ($options['snapshot'] ?? '')), 409, 'Stock changed. Refresh and verify all counts again.');
                $options['expected_groups'] = $groups->map->only(['id', 'available_quantity', 'quarantined_quantity'])->all();
                $options['expected_unassigned_quantity'] = $locked->stock_summary['unassigned'];
            }
            if (in_array($action, ['opening_balance', 'restock'], true)) {
                validator($options, self::expiryRules($locked->item_type ?? 'medicine', (bool) ($options['expiry_not_applicable'] ?? false)))->validate();
            }
            if (DB::getDriverName() === 'pgsql') {
                try {
                    $row = DB::selectOne('SELECT public.akay_inventory_group_operation(?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb)) AS result', [$locked->id, $user->id, $context['type'], $context['id'], $action, $quantity, $reason, $key, json_encode($options, JSON_THROW_ON_ERROR)]);

                    return json_decode($row->result, true, flags: JSON_THROW_ON_ERROR);
                } catch (QueryException $e) {
                    $this->mapError($e);
                }
            }

            return $this->sqliteOperation($locked, $user, $action, $quantity, $reason, $key, $options);
        });
    }

    private function sqliteOperation(Medicine $medicine, User $user, string $action, int $quantity, ?string $reason, string $key, array $options): array
    {
        $before = (int) $medicine->quantity;
        $changes = [];
        $delta = 0;
        $type = $action === 'verify_stock' ? 'physical_count' : $action;
        if ($action === 'verify_stock') {
            $counts = collect($options['groups'] ?? []);
            $ids = $counts->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            abort_unless($ids === $medicine->expiryGroups->pluck('id')->sort()->values()->all(), 409, 'Verify every current expiry group exactly once.');
            $total = $this->bounded($options['unassigned_quantity'] ?? -1);
            foreach ($medicine->expiryGroups as $group) {
                $count = $counts->firstWhere('id', $group->id);
                $available = $this->bounded($count['available_quantity'] ?? -1);
                $quarantined = $this->bounded($count['quarantined_quantity'] ?? -1);
                $total = $this->bounded($total + $available + $quarantined);
                $changes[] = $this->movement($group, $available - $group->available_quantity, $quarantined - $group->quarantined_quantity);
            }
            $delta = $total - $before;
        } elseif (in_array($action, ['opening_balance', 'restock'], true)) {
            abort_unless($medicine->is_active, 409, 'Archived medicine cannot receive stock.');
            abort_if($action === 'opening_balance' && $before !== 0, 409, 'Opening stock already recorded.');
            abort_if($quantity === 0, 422, 'Quantity must be positive.');
            $date = $options['expiration_date'] ?? null;
            $na = (bool) ($options['expiry_not_applicable'] ?? false);
            $group = $medicine->expiryGroups()->where('expiration_date', $date)->where('expiry_not_applicable', $na)->first();
            $group ??= $medicine->expiryGroups()->create(['expiration_date' => $date, 'expiry_not_applicable' => $na, 'available_quantity' => 0, 'quarantined_quantity' => 0]);
            $changes[] = $this->movement($group, $quantity, 0);
            $delta = $quantity;
        } else {
            abort_if($quantity === 0, 422, 'Quantity must be positive.');
            $group = isset($options['expiry_group_id']) ? $medicine->expiryGroups->firstWhere('id', (int) $options['expiry_group_id']) : null;
            $unassigned = ($options['target'] ?? null) === 'unassigned' || ($medicine->expiryGroups->isEmpty() && ! isset($options['expiry_group_id']));
            abort_if(isset($options['expiry_group_id']) && ! $group, 422, 'The expiry group does not belong to this medicine.');
            abort_if($group && ($options['target'] ?? null) === 'unassigned', 422, 'Select one stock target.');
            abort_unless($group || $unassigned, 422, 'Select an expiry group and stock pool.');
            $pool = $options['pool'] ?? 'available';
            abort_unless(in_array($pool, ['available', 'quarantined'], true), 422, 'Invalid stock pool.');
            $a = $q = 0;
            if (in_array($action, ['quarantine', 'release', 'quarantine_disposal'], true)) {
                abort_unless($group, 422, 'Select an expiry group.');
                abort_if($action === 'release' && $group->is_expired, 422, 'Expired quarantined stock must be disposed.');
                $a = match ($action) {
                    'quarantine' => -$quantity, 'release' => $quantity, default => 0
                };
                $q = $action === 'quarantine' ? $quantity : -$quantity;
                $delta = $a + $q;
            } else {
                abort_unless(in_array($action, ['correction', 'adjustment_in', 'adjustment_out', 'damaged_disposal', 'expired_disposal'], true), 422, 'Invalid inventory operation.');
                abort_if($action !== 'correction' && $pool === 'quarantined', 422, 'Use the quarantine disposal action.');
                abort_if($action === 'expired_disposal' && ! ($group?->is_expired ?? $medicine->isExpiredOnFacilityCalendar()), 422, 'Select expired stock.');
                abort_if($action === 'correction' && ! in_array($options['direction'] ?? null, ['in', 'out'], true), 422, 'Correction direction is required.');
                $increase = $action === 'adjustment_in' || ($action === 'correction' && ($options['direction'] ?? null) === 'in');
                abort_if($increase && ! $medicine->is_active, 409, 'Archived medicine cannot receive stock.');
                $delta = $increase ? $quantity : -$quantity;
                if ($group) {
                    $a = $pool === 'available' ? $delta : 0;
                    $q = $pool === 'quarantined' ? $delta : 0;
                } else {
                    $this->bounded($medicine->stock_summary['unassigned'] + $delta);
                }
            }
            if ($group) {
                $changes[] = $this->movement($group, $a, $q);
            }
        }
        $after = $this->bounded($before + $delta);
        $this->updateMedicine($medicine, $user, $after, $action === 'verify_stock' ? false : $medicine->reconciliation_required);

        return $this->post($medicine, $user, $type, $before, $after, $delta, 0, $reason, $key, $changes);
    }

    public function automaticAllocations($groups, int $quantity): array
    {
        $remaining = max(0, $quantity);
        $allocations = [];
        $eligible = collect($groups)
            ->filter(fn ($group) => $group->isEligibleToDispense())
            ->sortBy(fn ($group) => ($group->expiration_date?->toDateString() ?? '9999-12-31').sprintf('%020d', $group->id));
        foreach ($eligible as $group) {
            if ($remaining === 0) {
                break;
            }
            $amount = min($remaining, (int) $group->available_quantity);
            if ($amount > 0) {
                $allocations[] = ['expiry_group_id' => (int) $group->id, 'quantity' => $amount];
                $remaining -= $amount;
            }
        }

        return $allocations;
    }

    public static function allocationsMatch(array $left, array $right): bool
    {
        $normalize = static function (array $rows): array {
            $clean = [];
            foreach ($rows as $row) {
                $id = (int) ($row['expiry_group_id'] ?? 0);
                $quantity = (int) ($row['quantity'] ?? 0);
                if ($id > 0 && $quantity > 0) {
                    $clean[$id] = $quantity;
                }
            }
            ksort($clean);

            return $clean;
        };

        return $normalize($left) === $normalize($right);
    }

    public function resolveManualDispenseItem($groups, array $item): array
    {
        if (! array_key_exists('allocations', $item)) {
            return $item;
        }
        if (self::allocationsMatch($item['allocations'], $this->automaticAllocations($groups, (int) $item['quantity']))) {
            unset($item['allocations'], $item['override_reason']);

            return $item;
        }
        abort_if(trim((string) ($item['override_reason'] ?? '')) === '', 422, 'A manual allocation reason is required (maximum 1000 characters).');

        return $item;
    }

    public function sqliteDispense(User $user, Medicine $medicine, array $item, string $key, int $recordId): array
    {
        $this->assertNewKey($medicine, $key);
        $groups = $medicine->expiryGroups()->lockForUpdate()->get()->keyBy('id');
        $item = $this->resolveManualDispenseItem($groups, $item);
        $eligible = $groups->filter(fn ($g) => $g->isEligibleToDispense())->sortBy(fn ($g) => ($g->expiration_date?->toDateString() ?? '9999-12-31').sprintf('%020d', $g->id));
        $remaining = $item['quantity'];
        $changes = [];
        $manual = array_key_exists('allocations', $item);
        $allocations = $manual ? $item['allocations'] : $eligible->map(fn ($g) => ['expiry_group_id' => $g->id, 'quantity' => $g->available_quantity])->values()->all();
        foreach ($allocations as $allocation) {
            if (! $manual && $remaining === 0) {
                break;
            }
            $group = $eligible->get($allocation['expiry_group_id']);
            // sortBy preserves IDs; explicit IDs must be both owned and eligible.
            if ($manual) {
                $group = $groups->get($allocation['expiry_group_id']);
                if (! $group || $group->is_expired) {
                    $this->error('MEDICINE_NOT_DISPENSABLE', 422, 'Select an eligible group from this medicine.');
                }
                if ($allocation['quantity'] > $group->available_quantity) {
                    $this->error('INVENTORY_CONFLICT', 409, 'Selected group stock changed. Refresh allocations.');
                }
            }
            $amount = $manual ? $allocation['quantity'] : min($remaining, $group->available_quantity);
            $remaining -= $amount;
            $changes[] = $this->movement($group, -$amount, 0);
        }
        $before = (int) $medicine->quantity;
        $after = $before - ($item['quantity'] - $remaining);
        $this->updateMedicine($medicine, $user, $after, $medicine->reconciliation_required || $remaining > 0);
        $reason = $manual ? 'Manual expiry override: '.$item['override_reason'] : null;
        if ($remaining > 0) {
            $reason = trim(($reason ?? '').'; Reconciliation Required: unallocated shortage '.$remaining, '; ');
        }

        return $this->post($medicine, $user, 'dispense', $before, $after, -$item['quantity'], -$remaining, $reason, $key, $changes, $recordId);
    }

    private function movement(MedicineExpiryGroup $group, int $a, int $q): array
    {
        $available = $this->bounded($group->available_quantity + $a);
        $quarantined = $this->bounded($group->quarantined_quantity + $q);
        $movement = ['expiry_group_id' => $group->id, 'available_before' => $group->available_quantity, 'available_delta' => $a, 'available_after' => $available, 'quarantined_before' => $group->quarantined_quantity, 'quarantined_delta' => $q, 'quarantined_after' => $quarantined];
        $group->update(['available_quantity' => $available, 'quarantined_quantity' => $quarantined]);

        return $movement;
    }

    private function bounded(mixed $quantity): int
    {
        if (! (filter_var($quantity, FILTER_VALIDATE_INT) !== false && $quantity >= 0 && $quantity <= self::MAX)) {
            $this->error('INVENTORY_CONFLICT', 409, 'The stock count is outside the available balance or permitted range.');
        }

        return (int) $quantity;
    }

    private function error(string $code, int $status, string $message): never
    {
        throw new HttpResponseException(response()->json(['code' => $code, 'message' => $message], $status));
    }

    private function updateMedicine(Medicine $medicine, User $user, int $after, bool $reconciliation): void
    {
        $medicine->update(['quantity' => $after, 'updated_by' => $user->id, 'reconciliation_required' => $reconciliation, 'availability_status' => $after === 0 ? 'Unavailable' : ($after <= ($medicine->low_stock_threshold ?? 10) ? 'Low Stock' : 'Available')]);
    }

    private function post(Medicine $medicine, User $user, string $type, int $before, int $after, int $delta, int $discrepancy, ?string $reason, string $key, array $changes, ?int $recordId = null): array
    {
        $source = $recordId ? 'health_record' : match ($type) {
            'opening_balance' => 'opening_balance', 'restock' => 'manual_restock', 'correction', 'physical_count' => 'correction', 'damaged_disposal', 'expired_disposal', 'quarantine_disposal' => 'disposal', default => 'manual_adjustment'
        };
        $tx = MedicineInventoryTransaction::create(['medicine_id' => $medicine->id, 'actor_user_id' => $user->id, 'transaction_type' => $type, 'quantity_before' => $before, 'quantity_after' => $after, 'quantity_delta' => $delta, 'discrepancy' => $discrepancy, 'reason' => $reason, 'operation_key' => $key, 'source_type' => $source, 'source_id' => $recordId ?? $medicine->id]);
        foreach ($changes as $change) {
            MedicineInventoryAllocation::create(['transaction_id' => $tx->id, ...$change]);
        }

        return ['transaction_id' => $tx->id, 'medicine_id' => $medicine->id, 'quantity_before' => $before, 'quantity_after' => $after, 'quantity_delta' => $delta, 'discrepancy' => $discrepancy, 'transaction_type' => $type];
    }

    private function assertNewKey(Medicine $medicine, string $key): void
    {
        if ($medicine->inventoryTransactions()->where('operation_key', $key)->exists()) {
            throw new HttpResponseException(response()->json(['code' => 'INVENTORY_OPERATION_ALREADY_APPLIED', 'message' => 'This inventory operation has already been applied.'], 409));
        }
    }

    private function mapError(QueryException $e): never
    {
        foreach (['INVENTORY_OPERATION_ALREADY_APPLIED', 'INVENTORY_SNAPSHOT_CONFLICT', 'INVENTORY_GROUP_MISMATCH', 'INVENTORY_GROUP_CONTEXT_REQUIRED', 'INVALID_INVENTORY_EXPIRY', 'INVENTORY_CONFLICT', 'INSUFFICIENT_STOCK', 'INVALID_INVENTORY_OPERATION', 'MEDICINE_NOT_DISPENSABLE', 'MEDICINE_FACILITY_MISMATCH'] as $code) {
            if (str_contains($e->getMessage(), $code)) {
                throw new HttpResponseException(response()->json(['code' => $code, 'message' => 'Inventory operation could not be applied. Refresh stock and check the selected groups.'], in_array($code, ['INVALID_INVENTORY_OPERATION', 'MEDICINE_NOT_DISPENSABLE', 'MEDICINE_FACILITY_MISMATCH', 'INVENTORY_GROUP_MISMATCH', 'INVENTORY_GROUP_CONTEXT_REQUIRED', 'INVALID_INVENTORY_EXPIRY']) ? 422 : 409));
            }
        }
        throw $e;
    }
}
