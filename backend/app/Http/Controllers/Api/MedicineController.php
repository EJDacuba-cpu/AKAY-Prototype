<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\MedicineRequest;
use App\Models\Medicine;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

class MedicineController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(Request $request)
    {
        $query = Medicine::query()->with(['ruralHealthUnit', 'barangayHealthCenter']);

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
        if ($request->user()->isRhuStaff()) {
            $data['rural_health_unit_id'] = $request->user()->rural_health_unit_id;
            $data['barangay_health_center_id'] = null;
        } elseif ($request->user()->isBhw()) {
            abort_unless($request->user()->barangay_health_center_id, 403, 'BHC workers must be assigned to a BHC to manage inventory.');
            $data['rural_health_unit_id'] = null;
            $data['barangay_health_center_id'] = $request->user()->barangay_health_center_id;
        } else {
            $data['rural_health_unit_id'] = $data['rural_health_unit_id'] ?? null;
            $data['barangay_health_center_id'] = empty($data['rural_health_unit_id'])
                ? ($data['barangay_health_center_id'] ?? null)
                : null;
        }
        $data['low_stock_threshold'] = $data['low_stock_threshold'] ?? 10;
        $data['availability_status'] = $this->medicineStatus(
            (int) ($data['quantity'] ?? 0),
            (int) $data['low_stock_threshold']
        );
        $data['created_by'] = $request->user()->id;
        $data['updated_by'] = $request->user()->id;

        $medicine = Medicine::create($data);
        $auditLogger->log($request, 'created', 'medicines', "Created medicine {$medicine->name}.");

        return response()->json(['data' => $medicine], 201);
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
        if ($request->user()->isRhuStaff()) {
            $data['rural_health_unit_id'] = $request->user()->rural_health_unit_id;
            $data['barangay_health_center_id'] = null;
        } elseif ($request->user()->isBhw()) {
            abort_unless($request->user()->barangay_health_center_id, 403, 'BHC workers must be assigned to a BHC to manage inventory.');
            $data['rural_health_unit_id'] = null;
            $data['barangay_health_center_id'] = $request->user()->barangay_health_center_id;
        } elseif (! empty($data['rural_health_unit_id'])) {
            $data['barangay_health_center_id'] = null;
        }
        $quantity = array_key_exists('quantity', $data)
            ? (int) $data['quantity']
            : (int) $medicine->quantity;
        $threshold = array_key_exists('low_stock_threshold', $data)
            ? (int) $data['low_stock_threshold']
            : (int) ($medicine->low_stock_threshold ?? 10);
        $data['availability_status'] = $this->medicineStatus($quantity, $threshold);
        $medicine->update([...$data, 'updated_by' => $request->user()->id]);
        $auditLogger->log($request, 'updated', 'medicines', "Updated medicine {$medicine->name}.");

        return response()->json(['data' => $medicine->fresh()]);
    }

    public function destroy(Request $request, Medicine $medicine)
    {
        $this->facilityAccess->authorizeMedicine($request->user(), $medicine);
        $medicine->delete();

        return response()->json(status: 204);
    }

    private function medicineStatus(int $quantity, int $lowStockThreshold = 10): string
    {
        if ($quantity <= 0) {
            return 'Unavailable';
        }

        return $quantity <= $lowStockThreshold ? 'Low Stock' : 'Available';
    }
}
