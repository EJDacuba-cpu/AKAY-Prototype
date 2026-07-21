<?php

use App\Http\Controllers\Api\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/up', [HealthController::class, 'live'])
    ->middleware(['sensitive.no-store', 'throttle:health']);

Route::get('/', function () {
    return response()->json([
        'name' => 'AKAY API',
        'status' => 'ready',
    ]);
});
