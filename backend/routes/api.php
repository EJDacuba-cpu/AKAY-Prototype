<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BarangayHealthCenterController;
use App\Http\Controllers\Api\FeedbackController;
use App\Http\Controllers\Api\HealthRecordController;
use App\Http\Controllers\Api\IncomingReferralController;
use App\Http\Controllers\Api\MedicineController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RhuPatientVolumeController;
use App\Http\Controllers\Api\RuralHealthUnitController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::get('/auth/profile', [AuthController::class, 'profile']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);

    Route::apiResource('patients', PatientController::class);
    Route::apiResource('health-records', HealthRecordController::class);
    Route::apiResource('referrals', ReferralController::class)->except(['update']);
    Route::patch('/referrals/{referral}/status', [ReferralController::class, 'updateStatus']);
    Route::get('/tracking/{value}', [TrackingController::class, 'show']);
    Route::apiResource('feedback', FeedbackController::class)->only(['index', 'store', 'show']);
    Route::apiResource('medicines', MedicineController::class);
    Route::get('/rhu-patient-volumes', [RhuPatientVolumeController::class, 'index']);
    Route::post('/rhu-patient-volumes', [RhuPatientVolumeController::class, 'store']);

    Route::middleware('role:rhu_staff')->group(function () {
        Route::get('/incoming-referrals', [IncomingReferralController::class, 'index']);
        Route::get('/reports/rhu', [ReportController::class, 'rhu']);
    });

    Route::middleware('role:bhw')->group(function () {
        Route::get('/reports/bhw', [ReportController::class, 'bhw']);
    });

    Route::middleware('role:admin')->group(function () {
        Route::apiResource('users', UserController::class);
        Route::apiResource('barangay-health-centers', BarangayHealthCenterController::class);
        Route::apiResource('rural-health-units', RuralHealthUnitController::class);
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/reports/admin', [ReportController::class, 'admin']);
    });
});
