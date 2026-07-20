<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BarangayHealthCenterController;
use App\Http\Controllers\Api\FeedbackController;
use App\Http\Controllers\Api\FollowUpTaskController;
use App\Http\Controllers\Api\HealthRecordController;
use App\Http\Controllers\Api\IncomingReferralController;
use App\Http\Controllers\Api\MedicineController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\PasswordResetRequestController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\ReferralQrController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RhuPatientVolumeController;
use App\Http\Controllers\Api\RuralHealthUnitController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/forgot-password', [PasswordResetRequestController::class, 'request'])->middleware('throttle:5,1');
Route::post('/auth/reset-password', [PasswordResetRequestController::class, 'complete'])->middleware('throttle:10,1');
Route::post('/auth/password-reset/request', [PasswordResetRequestController::class, 'request'])->middleware('throttle:5,1');
Route::get('/auth/password-reset/verify', [PasswordResetRequestController::class, 'verify'])->middleware('throttle:20,1');
Route::post('/auth/password-reset/complete', [PasswordResetRequestController::class, 'complete'])->middleware('throttle:10,1');

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::get('/auth/profile', [AuthController::class, 'profile']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::delete('/notifications', [NotificationController::class, 'clearAll']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);

    Route::middleware('facility.assigned')->group(function () {
        Route::apiResource('patients', PatientController::class);
        Route::apiResource('health-records', HealthRecordController::class);
        Route::post('health-records/{healthRecord}/dispensed-medicines', [HealthRecordController::class, 'dispenseMedicines']);
        Route::post('/referrals/qr/resolve', [ReferralQrController::class, 'resolve'])
            ->middleware('throttle:referral-qr-resolve');
        Route::post('/referrals/tracking/resolve', [TrackingController::class, 'resolve'])
            ->middleware('throttle:referral-tracking-resolve');
        Route::get('/referrals/{referral}/qr', [ReferralQrController::class, 'show'])
            ->middleware('throttle:referral-qr-display');
        Route::post('/referrals/{referral}/qr/regenerate', [ReferralQrController::class, 'regenerate'])
            ->middleware('throttle:referral-qr-regenerate');
        Route::apiResource('referrals', ReferralController::class)->except(['store', 'update']);
        Route::post('/referrals', [ReferralController::class, 'store'])->middleware('role:bhw');
        Route::patch('/referrals/{referral}/status', [ReferralController::class, 'updateStatus'])->middleware('role:rhu_staff');
        Route::apiResource('feedback', FeedbackController::class)->only(['index', 'show']);
        Route::post('/feedback', [FeedbackController::class, 'store'])->middleware('role:rhu_staff');
        Route::apiResource('medicines', MedicineController::class);
        Route::get('/rhu-patient-volumes', [RhuPatientVolumeController::class, 'index']);
        Route::post('/rhu-patient-volumes', [RhuPatientVolumeController::class, 'store']);

        Route::middleware('role:rhu_staff')->group(function () {
            Route::get('/incoming-referrals', [IncomingReferralController::class, 'index']);
            Route::get('/reports/rhu', [ReportController::class, 'rhu']);
        });

        Route::middleware('role:bhw')->group(function () {
            Route::get('/referral-routing', [ReferralController::class, 'destination']);
            Route::get('/follow-up-tasks', [FollowUpTaskController::class, 'index']);
            Route::patch('/follow-up-tasks/{followUpTask}/no-show', [FollowUpTaskController::class, 'markNoShow']);
            Route::patch('/follow-up-tasks/{followUpTask}/reschedule', [FollowUpTaskController::class, 'reschedule']);
            Route::get('/reports/bhw', [ReportController::class, 'bhw']);
        });
    });

    Route::middleware('role:admin')->group(function () {
        Route::apiResource('users', UserController::class);
        Route::apiResource('barangay-health-centers', BarangayHealthCenterController::class);
        Route::apiResource('rural-health-units', RuralHealthUnitController::class);
        Route::get('/password-reset-requests', [PasswordResetRequestController::class, 'index']);
        Route::get('/password-reset-requests/{passwordResetRequest}', [PasswordResetRequestController::class, 'show']);
        Route::post('/password-reset-requests/{passwordResetRequest}/approve', [PasswordResetRequestController::class, 'approve']);
        Route::post('/password-reset-requests/{passwordResetRequest}/reject', [PasswordResetRequestController::class, 'reject']);
        Route::get('/admin/password-reset-requests', [PasswordResetRequestController::class, 'index']);
        Route::get('/admin/password-reset-requests/{passwordResetRequest}', [PasswordResetRequestController::class, 'show']);
        Route::post('/admin/password-reset-requests/{passwordResetRequest}/approve', [PasswordResetRequestController::class, 'approve']);
        Route::post('/admin/password-reset-requests/{passwordResetRequest}/reject', [PasswordResetRequestController::class, 'reject']);
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/reports/admin', [ReportController::class, 'admin']);
    });
});
