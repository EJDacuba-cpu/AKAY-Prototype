<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FacilityRequest;
use App\Models\RuralHealthUnit;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class RuralHealthUnitController extends Controller
{
    public function index(Request $request)
    {
        $query = RuralHealthUnit::query()->withCount(['users', 'patients']);

        if ($request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        return response()->json(['data' => $query->orderBy('name')->get()]);
    }

    public function store(FacilityRequest $request, AuditLogger $auditLogger)
    {
        $rhu = RuralHealthUnit::create($request->validated());
        $auditLogger->log($request, 'created', 'rural_health_units', "Created RHU {$rhu->name}.");

        return response()->json(['data' => $rhu], 201);
    }

    public function show(RuralHealthUnit $ruralHealthUnit)
    {
        return response()->json(['data' => $ruralHealthUnit->load(['users', 'patients', 'volume'])]);
    }

    public function update(FacilityRequest $request, RuralHealthUnit $ruralHealthUnit, AuditLogger $auditLogger)
    {
        $ruralHealthUnit->update($request->validated());
        $auditLogger->log($request, 'updated', 'rural_health_units', "Updated RHU {$ruralHealthUnit->name}.");

        return response()->json(['data' => $ruralHealthUnit->fresh()]);
    }

    public function destroy(Request $request, RuralHealthUnit $ruralHealthUnit, AuditLogger $auditLogger)
    {
        $ruralHealthUnit->update(['status' => 'inactive']);
        $auditLogger->log($request, 'deactivated', 'rural_health_units', "Deactivated RHU {$ruralHealthUnit->name}.");

        return response()->json(['data' => $ruralHealthUnit->fresh()]);
    }
}
