<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class HealthController extends Controller
{
    public function live(): JsonResponse
    {
        return response()->json(['status' => 'ok']);
    }

    public function ready(): JsonResponse
    {
        try {
            DB::selectOne('select 1 as readiness_check');

            return response()->json(['status' => 'ready']);
        } catch (\Throwable $exception) {
            Log::warning('AKAY database readiness check failed.', [
                'exception_type' => get_debug_type($exception),
            ]);

            return response()->json(['status' => 'unavailable'], 503);
        }
    }
}
