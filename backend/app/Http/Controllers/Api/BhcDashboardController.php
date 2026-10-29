<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BhcDashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BhcDashboardController extends Controller
{
    public function show(Request $request, BhcDashboardService $dashboard): JsonResponse
    {
        abort_unless($request->user()->isBhc(), 403);

        return response()->json([
            'data' => $dashboard->summary($request->user()),
        ]);
    }
}
