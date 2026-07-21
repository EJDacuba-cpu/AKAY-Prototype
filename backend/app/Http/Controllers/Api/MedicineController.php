<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustMedicineRequest;
use App\Http\Requests\MedicineRequest;
use App\Http\Requests\RestockMedicineRequest;
use App\Models\HealthRecordMedicine;
use App\Models\Medicine;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\MedicineStockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MedicineController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly MedicineStockService $medicineStock
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

        return response()->json(['data' => $query->orderBy('name')->paginate($request->integer('per_page', 25))]);
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

        $transactions = $medicine->inventoryTransactions()
            ->with(['actor:id,name'])
            ->latest('created_at')
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json(['data' => $transactions]);
    }

    public function destroy(Request $request, Medicine $medicine, AuditLogger $auditLogger)
    {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);

        return DB::transaction(function () use ($request, $medicine, $auditLogger) {
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
    }

    private function medicineStatus(int $quantity, int $lowStockThreshold): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
    }
}
