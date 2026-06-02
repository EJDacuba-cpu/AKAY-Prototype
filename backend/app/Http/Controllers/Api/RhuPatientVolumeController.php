<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RhuPatientVolumeRequest;
use App\Models\RhuPatientVolume;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class RhuPatientVolumeController extends Controller
{
    public function index(Request $request)
    {
        $query = RhuPatientVolume::query()->with('ruralHealthUnit');

        if ($request->user()->isRhuStaff()) {
            $query->where('rural_health_unit_id', $request->user()->rural_health_unit_id);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(RhuPatientVolumeRequest $request, AuditLogger $auditLogger)
    {
        $data = $request->validated();
        $rhuId = $request->user()->isRhuStaff()
            ? $request->user()->rural_health_unit_id
            : ($data['rural_health_unit_id'] ?? null);

        abort_unless($rhuId, 422, 'RHU is required.');

        $volume = RhuPatientVolume::updateOrCreate(
            ['rural_health_unit_id' => $rhuId],
            ['status' => $data['status'], 'updated_by' => $request->user()->id]
        );

        $auditLogger->log($request, 'updated', 'rhu_patient_volume', "Updated RHU {$rhuId} volume to {$volume->status}.");

        return response()->json(['data' => $volume->load('ruralHealthUnit')]);
    }
}
