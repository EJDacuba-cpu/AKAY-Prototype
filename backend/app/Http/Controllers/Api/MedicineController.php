<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustMedicineRequest;
use App\Http\Requests\DeductMedicineRequest;
use App\Http\Requests\MedicineRequest;
use App\Http\Requests\RestockMedicineRequest;
use App\Models\HealthRecordMedicine;
use App\Models\Medicine;
use App\Models\MedicineInventoryTransaction;
use App\Services\AkayCacheService;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\MedicineCreateIdempotencyService;
use App\Services\MedicineStockService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MedicineController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly MedicineStockService $medicineStock,
        private readonly MedicineCreateIdempotencyService $createIdempotency,
        private readonly AkayCacheService $cache
    ) {}

    public function index(Request $request)
    {
        $query = Medicine::query()
            ->where('is_active', true)
            ->with(['ruralHealthUnit', 'barangayHealthCenter']);

        if ($request->user()->isBhc()) {
            $query->where('barangay_health_center_id', $request->user()->barangay_health_center_id ?? 0)
                ->whereNull('rural_health_unit_id');
        } elseif ($request->user()->isRhu()) {
            $query->where('rural_health_unit_id', $request->user()->rural_health_unit_id);
        }

        foreach (['category', 'availability_status', 'rural_health_unit_id', 'barangay_health_center_id'] as $filter) {
            if ($request->query($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }

        if ($search = $request->query('search')) {
            $query->where('name', 'like', "%{$search}%");
        }

        $page = max($request->integer('page', 1), 1);
        $perPage = min(max($request->integer('per_page', 25), 1), 100);
        $filters = [
            'category' => (string) $request->query('category', ''),
            'availability_status' => (string) $request->query('availability_status', ''),
            'rural_health_unit_id' => (string) $request->query('rural_health_unit_id', ''),
            'barangay_health_center_id' => (string) $request->query('barangay_health_center_id', ''),
            'search' => mb_strtolower(trim((string) $request->query('search', ''))),
            'per_page' => $perPage,
        ];
        $data = $this->cache->rememberForUser(
            AkayCacheService::DOMAIN_MEDICINE_AVAILABILITY,
            $request->user(),
            $filters,
            $page,
            (int) config('akay_cache.ttl.medicine_availability_seconds', 20),
            fn (): array => $query
                ->orderBy('name')
                ->paginate($perPage, ['*'], 'page', $page)
                ->through(fn (Medicine $item): array => $this->medicineListItem($item))
                ->toArray()
        );

        return $this->cache->addDiagnosticHeader(
            response()->json(['data' => $data])
        );
    }

    public function store(MedicineRequest $request, AuditLogger $auditLogger)
    {
        $data = $request->validated();
        $openingQuantity = (int) $data['quantity'];
        $idempotencyKey = $data['idempotency_key'] ?? null;
        unset($data['quantity'], $data['idempotency_key']);

        if ($request->user()->isRhu()) {
            $data['rural_health_unit_id'] = $request->user()->rural_health_unit_id;
            $data['barangay_health_center_id'] = null;
        } elseif ($request->user()->isBhc()) {
            $data['rural_health_unit_id'] = null;
            $data['barangay_health_center_id'] = $request->user()->barangay_health_center_id;
        } else {
            abort(403, 'A BHC or RHU facility assignment is required to create inventory.');
        }

        $threshold = (int) ($data['low_stock_threshold'] ?? 10);
        $idempotencyHash = $idempotencyKey
            ? $this->createIdempotency->hash([
                ...$data,
                'quantity' => $openingQuantity,
                'low_stock_threshold' => $threshold,
            ])
            : null;

        if ($idempotencyKey) {
            $existing = Medicine::query()->where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return $this->replayMedicineCreate($request, $existing, $idempotencyHash);
            }
        }

        try {
            $medicine = DB::transaction(function () use (
                $request,
                $auditLogger,
                $data,
                $openingQuantity,
                $threshold,
                $idempotencyKey,
                $idempotencyHash
            ): Medicine {
                $medicine = Medicine::create([
                    ...$data,
                    'quantity' => 0,
                    'low_stock_threshold' => $threshold,
                    'availability_status' => 'Unavailable',
                    'is_active' => true,
                    'created_by' => $request->user()->id,
                    'updated_by' => $request->user()->id,
                    'idempotency_key' => $idempotencyKey,
                    'idempotency_hash' => $idempotencyHash,
                ]);
                $this->medicineStock->openingBalance($request, $medicine, $openingQuantity);
                if ($openingQuantity === 0) {
                    $auditLogger->log(
                        $request,
                        'medicine_created',
                        'medicines',
                        "medicine_id={$medicine->id}; opening_balance=0."
                    );
                }

                return $medicine;
            });
        } catch (QueryException $exception) {
            if (! $this->isMedicineIdempotencyConflict($exception)) {
                throw $exception;
            }

            $existing = Medicine::query()->where('idempotency_key', $idempotencyKey)->first();
            if (! $existing) {
                throw $exception;
            }

            return $this->replayMedicineCreate($request, $existing, $idempotencyHash);
        }

        $this->cache->invalidateMedicine($medicine);

        return $this->storeMedicineResponse($medicine->fresh(), false, 201);
    }

    public function show(Request $request, Medicine $medicine)
    {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);

        return response()->json(['data' => $medicine->load(['ruralHealthUnit', 'barangayHealthCenter'])]);
    }

    public function update(MedicineRequest $request, Medicine $medicine, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);
        $data = $request->validated();
        $quantity = array_key_exists('quantity', $data) ? (int) $data['quantity'] : null;
        $reason = trim((string) ($data['reason'] ?? ''));
        $operationKey = $data['idempotency_key'] ?? null;
        unset($data['quantity'], $data['reason'], $data['idempotency_key']);

        $updated = DB::transaction(function () use (
            $request,
            $medicine,
            $auditLogger,
            $data,
            $quantity,
            $reason,
            $operationKey
        ): Medicine {
            $locked = Medicine::query()->whereKey($medicine->id)->lockForUpdate()->firstOrFail();
            $this->facilityAccess->authorizeMedicine($request->user(), $locked);

            if ($quantity !== null) {
                $this->medicineStock->correctRecordedQuantity(
                    $request,
                    $locked,
                    $quantity,
                    $reason,
                    $operationKey
                );
                $locked->refresh();
            }

            $threshold = array_key_exists('low_stock_threshold', $data)
                ? (int) $data['low_stock_threshold']
                : (int) ($locked->low_stock_threshold ?? 10);
            $data['availability_status'] = $this->medicineStatus((int) $locked->quantity, $threshold);
            $locked->update([...$data, 'updated_by' => $request->user()->id]);
            $auditLogger->log(
                $request,
                'medicine_updated',
                'medicines',
                "medicine_id={$locked->id}."
            );

            return $locked->fresh();
        });
        $this->cache->invalidateMedicine($updated);

        return response()->json(['data' => $updated]);
    }

    public function restock(RestockMedicineRequest $request, Medicine $medicine)
    {
        $result = DB::transaction(fn (): array => $this->medicineStock->restock(
            $request,
            $medicine,
            (int) $request->validated('quantity'),
            (string) $request->validated('reason'),
            $request->validated('idempotency_key')
        ));
        $this->cache->invalidateMedicine($medicine);

        return response()->json([
            'data' => [
                'medicine' => $medicine->fresh(),
                'transaction' => $result,
            ],
        ]);
    }

    public function deduct(DeductMedicineRequest $request, Medicine $medicine)
    {
        $result = DB::transaction(fn (): array => $this->medicineStock->adjust(
            $request,
            $medicine,
            'adjustment_out',
            (int) $request->validated('quantity'),
            (string) $request->validated('reason'),
            null,
            $request->validated('idempotency_key')
        ));
        $this->cache->invalidateMedicine($medicine);

        return response()->json([
            'data' => [
                'medicine' => $medicine->fresh(),
                'transaction' => $result,
            ],
        ]);
    }

    public function adjust(AdjustMedicineRequest $request, Medicine $medicine)
    {
        $data = $request->validated();
        $result = DB::transaction(fn (): array => $this->medicineStock->adjust(
            $request,
            $medicine,
            $data['action'],
            (int) $data['quantity'],
            $data['reason'],
            $data['direction'] ?? null
        ));
        $this->cache->invalidateMedicine($medicine);

        return response()->json([
            'data' => [
                'medicine' => $medicine->fresh(),
                'transaction' => $result,
            ],
        ]);
    }

    public function transactions(Request $request, Medicine $medicine)
    {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);
        $perPage = min(max($request->integer('per_page', 15), 1), 100);

        $transactions = $medicine->inventoryTransactions()
            ->select([
                'transaction_type',
                'quantity_before',
                'quantity_delta',
                'quantity_after',
                'discrepancy',
                'reason',
                'source_type',
                'created_at',
                'actor_user_id',
            ])
            ->with(['actor:id,name'])
            ->latest('created_at')
            ->latest('id')
            ->paginate($perPage)
            ->through(fn (MedicineInventoryTransaction $transaction): array => [
                'transaction_type' => $transaction->transaction_type,
                'quantity_before' => $transaction->quantity_before,
                'quantity_delta' => $transaction->quantity_delta,
                'quantity_after' => $transaction->quantity_after,
                'discrepancy' => $transaction->discrepancy,
                'reason' => $transaction->reason,
                'source_type' => $transaction->source_type,
                'created_at' => $transaction->created_at?->toISOString(),
                'actor' => $transaction->actor
                    ? ['name' => $transaction->actor->name]
                    : null,
            ]);

        return response()->json(['data' => $transactions]);
    }

    public function destroy(Request $request, Medicine $medicine, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);

        $response = DB::transaction(function () use ($request, $medicine, $auditLogger) {
            $locked = Medicine::query()->whereKey($medicine->id)->lockForUpdate()->firstOrFail();
            $this->facilityAccess->authorizeMedicine($request->user(), $locked);
            $hasDispenseHistory = HealthRecordMedicine::query()
                ->where('medicine_id', $locked->id)
                ->exists();
            $hasLedgerHistory = $locked->inventoryTransactions()->exists();

            if ((int) $locked->quantity === 0 && ! $hasDispenseHistory && ! $hasLedgerHistory) {
                $medicineId = $locked->id;
                $locked->delete();
                $auditLogger->log(
                    $request,
                    'medicine_deleted',
                    'medicines',
                    "medicine_id={$medicineId}; unused_zero_stock=true."
                );

                return response()->json(status: 204);
            }

            $locked->update([
                'is_active' => false,
                'archived_at' => now(),
                'updated_by' => $request->user()->id,
            ]);
            $auditLogger->log(
                $request,
                'medicine_archived',
                'medicines',
                "medicine_id={$locked->id}."
            );

            return response()->json(['data' => $locked->fresh()]);
        });
        $this->cache->invalidateMedicine($medicine);

        return $response;
    }

    private function medicineListItem(Medicine $medicine): array
    {
        return [
            'id' => $medicine->id,
            'name' => $medicine->name,
            'category' => $medicine->category,
            'description' => $medicine->description,
            'quantity' => (int) $medicine->quantity,
            'reconciliation_required' => (bool) $medicine->reconciliation_required,
            'low_stock_threshold' => (int) ($medicine->low_stock_threshold ?? 10),
            'unit' => $medicine->unit,
            'availability_status' => $medicine->availability_status,
            'expiration_date' => $medicine->expiration_date?->toDateString(),
            'rural_health_unit_id' => $medicine->rural_health_unit_id,
            'barangay_health_center_id' => $medicine->barangay_health_center_id,
            'created_at' => $medicine->created_at?->toISOString(),
            'updated_at' => $medicine->updated_at?->toISOString(),
            'rural_health_unit' => $medicine->ruralHealthUnit?->only(['id', 'name', 'status']),
            'barangay_health_center' => $medicine->barangayHealthCenter?->only(['id', 'name', 'status']),
        ];
    }

    private function replayMedicineCreate(
        Request $request,
        Medicine $medicine,
        ?string $idempotencyHash
    ) {
        if ((int) $medicine->created_by !== (int) $request->user()->id) {
            return $this->medicineIdempotencyConflictResponse(
                'This submission key is not available for this inventory save.',
                'IDEMPOTENCY_KEY_UNAVAILABLE'
            );
        }

        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);

        if (
            ! is_string($idempotencyHash)
            || ! hash_equals((string) $medicine->idempotency_hash, $idempotencyHash)
        ) {
            return $this->medicineIdempotencyConflictResponse(
                'This submission key was already used for different inventory data.',
                'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
            );
        }

        return $this->storeMedicineResponse($medicine->fresh(), true, 200);
    }

    private function storeMedicineResponse(Medicine $medicine, bool $replay, int $status)
    {
        return response()->json([
            'data' => $medicine,
            'idempotent_replay' => $replay,
        ], $status);
    }

    private function medicineIdempotencyConflictResponse(string $message, string $code)
    {
        return response()->json([
            'message' => $message,
            'code' => $code,
        ], 409);
    }

    private function isMedicineIdempotencyConflict(QueryException $exception): bool
    {
        $sqlState = (string) ($exception->errorInfo[0] ?? $exception->getCode());
        $message = strtolower($exception->getMessage());

        return in_array($sqlState, ['23505', '23000'], true)
            && str_contains($message, 'idempotency_key');
    }

    private function medicineStatus(int $quantity, int $lowStockThreshold): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
    }
}
