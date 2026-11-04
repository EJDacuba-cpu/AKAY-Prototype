<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Services\FacilityAccessService;
use App\Services\NutritionEnrollment;
use Illuminate\Http\Request;

class NutritionCareController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function close(Request $request, Patient $patient)
    {
        $user = $request->user();
        $this->facilityAccess->authorizePatient($user, $patient);

        return response()->json([
            'data' => NutritionEnrollment::close($patient, $user, $request->only(['reason', 'closed_on', 'note'])),
        ], 201);
    }
}
