<?php
// backend/app/Http/Controllers/Api/CarePathwayEnrollmentController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

class CarePathwayEnrollmentController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function index(Request $request, Patient $patient)
    {
        $this->facilityAccess->authorizePatient($request->user(), $patient);

        $enrollments = $patient->carePathwayEnrollments()
            ->with(['conditions' => fn ($query) => $query->whereNull('removed_at')])
            ->latest('started_at')
            ->get();

        return response()->json(['data' => $enrollments->map(fn ($enrollment) => [
            'id' => $enrollment->id,
            'pathway_key' => $enrollment->pathway_key,
            'status' => $enrollment->status,
            'started_at' => $enrollment->started_at,
            'ended_at' => $enrollment->ended_at,
            'conditions' => $enrollment->conditions->map(fn ($condition) => [
                'condition_name' => $condition->condition_name,
                'field_set_key' => $condition->field_set_key,
            ])->values(),
        ])]);
    }
}
