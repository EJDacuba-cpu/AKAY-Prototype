<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\TbCaseRegistrationRequest;
use App\Models\HealthRecord;
use App\Services\TbCaseRegistrationService;
use Illuminate\Http\Request;

class TbCaseRegistrationController extends Controller
{
    public function preview(Request $request, HealthRecord $healthRecord, TbCaseRegistrationService $registration)
    {
        return response()->json(['data' => $registration->preview($request->user(), $healthRecord)]);
    }

    public function store(TbCaseRegistrationRequest $request, HealthRecord $healthRecord, TbCaseRegistrationService $registration)
    {
        $result = $registration->register($request, $healthRecord, [
            ...$request->validated(),
            'require_deferred_decision' => true,
        ]);

        return response()->json(['data' => $result['case']], $result['created'] ? 201 : 200);
    }
}
