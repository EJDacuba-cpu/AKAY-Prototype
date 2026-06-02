<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\MedicineRequest;
use App\Models\Medicine;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class MedicineController extends Controller
{
    public function index(Request $request)
    {
        $query = Medicine::query()->with('ruralHealthUnit');

        if ($request->user()->isRhuStaff()) {
            $query->where('rural_health_unit_id', $request->user()->rural_health_unit_id);
        }

        foreach (['category', 'availability_status', 'rural_health_unit_id'] as $filter) {
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
        $data['rural_health_unit_id'] = $request->user()->isRhuStaff()
            ? $request->user()->rural_health_unit_id
            : ($data['rural_health_unit_id'] ?? null);
        $data['created_by'] = $request->user()->id;
        $data['updated_by'] = $request->user()->id;

        $medicine = Medicine::create($data);
        $auditLogger->log($request, 'created', 'medicines', "Created medicine {$medicine->name}.");

        return response()->json(['data' => $medicine], 201);
    }

    public function show(Request $request, Medicine $medicine)
    {
        $this->authorizeMedicine($request, $medicine);

        return response()->json(['data' => $medicine->load('ruralHealthUnit')]);
    }

    public function update(MedicineRequest $request, Medicine $medicine, AuditLogger $auditLogger)
    {
        $this->authorizeMedicine($request, $medicine);
        $medicine->update([...$request->validated(), 'updated_by' => $request->user()->id]);
        $auditLogger->log($request, 'updated', 'medicines', "Updated medicine {$medicine->name}.");

        return response()->json(['data' => $medicine->fresh()]);
    }

    public function destroy(Request $request, Medicine $medicine)
    {
        $this->authorizeMedicine($request, $medicine);
        $medicine->delete();

        return response()->json(status: 204);
    }

    private function authorizeMedicine(Request $request, Medicine $medicine): void
    {
        abort_unless(
            $request->user()->isAdmin()
            || ! $request->user()->isRhuStaff()
            || $medicine->rural_health_unit_id === $request->user()->rural_health_unit_id,
            403,
            'Medicine is outside your assigned RHU.'
        );
    }
}
