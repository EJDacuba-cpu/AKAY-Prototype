<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustMedicineRequest;
use App\Http\Requests\MedicineRequest;
use App\Http\Requests\RestockMedicineRequest;
use App\Models\HealthRecordMedicine;
use App\Models\Medicine;
use App\Models\MedicineInventoryTransaction;
use App\Services\AkayCacheService;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\MedicineStockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MedicineController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly MedicineStockService $medicineStock,
        private readonly AkayCacheService $cache
    ) {
    }

    public function index(Request $request)
    {
        $query = Medicine::query()
            ->where('is_active', true)
            ->with(['ruralHealthUnit', 'barangayHealthCenter']);

        if ($request->user()->isBhw()) {
            $query->where(function ($query) use ($request) {
                if ($request->user()->barangay_health_center_id) {
                    $query->where('barangay_health_center_id', $request->user()->barangay_health_center_id);
                } else {
                    $query->whereRaw('1 = 0');
                }

                $query->orWhereNotNull('rural_health_unit_id');
            });
        } elseif ($request->user()->isRhuStaff()) {
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
        $dependencies = $request->user()->isBhw()
            ? [$this->cache->medicineRhuFeedDependency()]
            : [];
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
                ->toArray(),
            $dependencies
        );

        return $this->cache->addDiagnosticHeader(
            response()->json(['data' => $data])
        );
    }

    public function store(MedicineRequest $request, AuditLogger $auditLogger)
    {
        $data = $request->validated();
        $openingQuantity = (int) $data['quantity'];
        unset($data['quantity']);

        if ($request->user()->isRhuStaff()) {
            $data['rural_health_unit_id'] = $request->user()->rural_health_unit_id;
            $data['barangay_health_center_id'] = null;
        } elseif ($request->user()->isBhw()) {
            $data['rural_health_unit_id'] = null;
            $data['barangay_health_center_id'] = $request->user()->barangay_health_center_id;
        } else {
            abort(403, 'A BHC or RHU facility assignment is required to create inventory.');
        }

        $medicine = DB::transaction(function () use ($request, $auditLogger, $data, $openingQuantity): Medicine {
            $medicine = Medicine::create([
                ...$data,
                'quantity' => 0,
                'low_stock_threshold' => $data['low_stock_threshold'] ?? 10,
                'availability_status' => 'Unavailable',
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
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
        $this->cache->invalidateMedicine($medicine);

        return response()->json(['data' => $medicine->fresh()], 201);
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
        $threshold = array_key_exists('low_stock_threshold', $data)
            ? (int) $data['low_stock_threshold']
            : (int) ($medicine->low_stock_threshold ?? 10);
        $data['availability_status'] = $this->medicineStatus((int) $medicine->quantity, $threshold);
        $medicine->update([...$data, 'updated_by' => $request->user()->id]);
        $auditLogger->log(
            $request,
            'medicine_updated',
            'medicines',
            "medicine_id={$medicine->id}."
        );
        $this->cache->invalidateMedicine($medicine);

        return response()->json(['data' => $medicine->fresh()]);
    }

    public function restock(RestockMedicineRequest $request, Medicine $medicine)
    {
        $result = DB::transaction(fn (): array => $this->medicineStock->restock(
            $request,
            $medicine,
            (int) $request->validated('quantity'),
            (string) $request->validated('reason')
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

    private function medicineStatus(int $quantity, int $lowStockThreshold): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
    }
}
