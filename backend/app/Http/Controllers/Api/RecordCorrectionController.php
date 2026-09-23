<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Services\ActionPermissions;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RecordCorrectionController extends Controller
{
    public function index(Request $request, HealthRecord $healthRecord, FacilityAccessService $access)
    {
        $access->authorizeHealthRecord($request->user(), $healthRecord);
        return response()->json(['data' => DB::table('health_record_corrections')->where('health_record_id', $healthRecord->id)->join('users', 'users.id', '=', 'author_id')->select('health_record_corrections.*', 'users.name as author_name')->orderBy('health_record_corrections.id')->get()]);
    }

    public function store(Request $request, HealthRecord $healthRecord, FacilityAccessService $access, AuditLogger $audit)
    {
        ActionPermissions::ensure($request->user(), 'records.correct');
        $access->authorizeHealthRecord($request->user(), $healthRecord);
        abort_unless($request->user()->isBhw(), 403);
        $data = $request->validate(['original_entry' => ['required', 'string', 'max:10000'], 'addendum' => ['required', 'string', 'max:10000'], 'reason' => ['required', 'string', 'max:2000']]);
        $id = DB::transaction(function () use ($request, $healthRecord, $audit, $data) {
            HealthRecord::whereKey($healthRecord->id)->lockForUpdate()->firstOrFail();
            $id = DB::table('health_record_corrections')->insertGetId([...$data, 'health_record_id' => $healthRecord->id, 'author_id' => $request->user()->id, 'created_at' => now()]);
            $audit->log($request, 'correction_added', 'health_records', "Correction {$id} appended to health record {$healthRecord->id}.");
            return $id;
        });
        return response()->json(['data' => DB::table('health_record_corrections')->find($id)], 201);
    }
}
