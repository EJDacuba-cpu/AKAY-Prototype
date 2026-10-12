<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AdminDashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDashboardController extends Controller
{
    public function show(Request $request, AdminDashboardService $dashboard): JsonResponse
    {
        $period = $request->query('period', AdminDashboardService::DEFAULT_PERIOD);

        return response()->json([
            'data' => $dashboard->summary(is_string($period) ? $period : AdminDashboardService::DEFAULT_PERIOD),
        ]);
    }
}
