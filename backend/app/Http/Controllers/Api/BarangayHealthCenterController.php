<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FacilityRequest;
use App\Models\BarangayHealthCenter;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class BarangayHealthCenterController extends Controller
{
    public function index(Request $request)
    {
        $query = BarangayHealthCenter::query()
            ->with('ruralHealthUnit')
            ->withCount(['users', 'patients']);

        if ($request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        return response()->json(['data' => $query->orderBy('name')->get()]);
    }

    public function store(FacilityRequest $request, AuditLogger $auditLogger)
    {
        $bhc = BarangayHealthCenter::create($request->validated());
        $auditLogger->log($request, 'created', 'barangay_health_centers', "Created BHC {$bhc->name}.");

        return response()->json(['data' => $bhc->load('ruralHealthUnit')], 201);
    }

    public function show(BarangayHealthCenter $barangayHealthCenter)
    {
        return response()->json(['data' => $barangayHealthCenter->load(['users', 'patients', 'ruralHealthUnit'])]);
    }

    public function update(FacilityRequest $request, BarangayHealthCenter $barangayHealthCenter, AuditLogger $auditLogger)
    {
        $barangayHealthCenter->update($request->validated());
        $auditLogger->log($request, 'updated', 'barangay_health_centers', "Updated BHC {$barangayHealthCenter->name}.");

        return response()->json(['data' => $barangayHealthCenter->fresh()->load('ruralHealthUnit')]);
    }

    public function destroy(Request $request, BarangayHealthCenter $barangayHealthCenter, AuditLogger $auditLogger)
    {
        $barangayHealthCenter->update(['status' => 'inactive']);
        $auditLogger->log($request, 'deactivated', 'barangay_health_centers', "Deactivated BHC {$barangayHealthCenter->name}.");

        return response()->json(['data' => $barangayHealthCenter->fresh()]);
    }
}
