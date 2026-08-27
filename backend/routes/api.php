<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BarangayHealthCenterController;
use App\Http\Controllers\Api\FeedbackController;
use App\Http\Controllers\Api\FollowUpTaskController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\HealthRecordController;
use App\Http\Controllers\Api\HealthRecordDraftController;
use App\Http\Controllers\Api\IncomingReferralController;
use App\Http\Controllers\Api\MedicineController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PasswordResetRequestController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\ReferralHoldController;
use App\Http\Controllers\Api\ReferralQrController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RhuProviderController;
use App\Http\Controllers\Api\RhuPatientVolumeController;
use App\Http\Controllers\Api\RuralHealthUnitController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/health/ready', [HealthController::class, 'ready'])
    ->middleware(['sensitive.no-store', 'throttle:health']);

Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware(['sensitive.no-store', 'auth.session-request', 'throttle:login']);
Route::post('/auth/refresh', [AuthController::class, 'refresh'])
    ->middleware(['sensitive.no-store', 'auth.session-request', 'throttle:30,1']);
Route::post('/auth/forgot-password', [PasswordResetRequestController::class, 'request'])->middleware('throttle:5,1');
Route::post('/auth/reset-password', [PasswordResetRequestController::class, 'complete'])->middleware('throttle:10,1');
Route::post('/auth/password-reset/request', [PasswordResetRequestController::class, 'request'])->middleware('throttle:5,1');
Route::get('/auth/password-reset/verify', [PasswordResetRequestController::class, 'verify'])->middleware('throttle:20,1');
Route::post('/auth/password-reset/complete', [PasswordResetRequestController::class, 'complete'])->middleware('throttle:10,1');

Route::middleware(['sensitive.no-store', 'auth:sanctum', 'auth.access-token', 'active'])->group(function () {
    Route::get('/auth/profile', [AuthController::class, 'profile']);
    Route::post('/auth/logout', [AuthController::class, 'logout'])
        ->middleware('auth.session-request');

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/counts', [NotificationController::class, 'counts']);
    Route::get('/notifications/trash', [NotificationController::class, 'trashed']);
    Route::patch('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::delete('/notifications', [NotificationController::class, 'clearAll']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::patch('/notifications/{notification}/unread', [NotificationController::class, 'markUnread']);
    Route::post('/notifications/{notification}/trash', [NotificationController::class, 'trash']);
    Route::post('/notifications/{notification}/restore', [NotificationController::class, 'restore']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);

    Route::middleware('facility.assigned')->group(function () {
        Route::apiResource('patients', PatientController::class);
        Route::apiResource('health-records', HealthRecordController::class);
        Route::get('health-records/{healthRecord}/tb-card-pdf', [HealthRecordController::class, 'tbCardPdf']);
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
        // D-1 FINAL - No-Show referrals only. Deliberately NOT a status
        // transition: the referral stays No-Show and TRK-02 gains no value.
        Route::post('/referrals/{referral}/reschedule', [ReferralController::class, 'reschedule'])->middleware('role:rhu_staff');
        Route::apiResource('feedback', FeedbackController::class)->only(['index', 'show']);
        Route::post('/feedback', [FeedbackController::class, 'store'])->middleware('role:rhu_staff');
        Route::post('/medicines/{medicine}/restock', [MedicineController::class, 'restock']);
        Route::post('/medicines/{medicine}/adjust', [MedicineController::class, 'adjust']);
        Route::get('/medicines/{medicine}/transactions', [MedicineController::class, 'transactions']);
        Route::apiResource('medicines', MedicineController::class);
        // DOC-01/DOC-19 - readable by BHW, RHU staff and admin; each sees only
        // the RHU they are entitled to. Registered before the {rhuProvider}
        // routes so the literal segment is never captured as a model key.
        Route::get('/rhu-providers/availability', [RhuProviderController::class, 'availability']);

        // DOC-20/DOC-22 - roster reads for RHU staff and admin, writes for the
        // owning RHU only (DOC-15: admin is intentionally read-only here).
        Route::get('/rhu-providers', [RhuProviderController::class, 'index'])
            ->middleware('role:rhu_staff,admin');
        Route::post('/rhu-providers', [RhuProviderController::class, 'store'])
            ->middleware('role:rhu_staff');
        Route::patch('/rhu-providers/{rhuProvider}', [RhuProviderController::class, 'update'])
            ->middleware('role:rhu_staff');
        Route::delete('/rhu-providers/{rhuProvider}', [RhuProviderController::class, 'destroy'])
            ->middleware('role:rhu_staff');

        Route::get('/rhu-patient-volumes', [RhuPatientVolumeController::class, 'index']);
        Route::post('/rhu-patient-volumes', [RhuPatientVolumeController::class, 'store']);

        Route::middleware('role:rhu_staff')->group(function () {
            Route::get('/incoming-referrals', [IncomingReferralController::class, 'index']);
            Route::get('/reports/rhu', [ReportController::class, 'rhu']);
        });

        Route::middleware('role:bhw')->group(function () {
            Route::get('/health-record-drafts', [HealthRecordDraftController::class, 'index']);
            Route::get('/health-record-drafts/{draft}', [HealthRecordDraftController::class, 'show']);
            Route::delete('/health-record-drafts/{draft}', [HealthRecordDraftController::class, 'destroy']);
            Route::post('/health-record-drafts', [HealthRecordDraftController::class, 'store'])
                ->middleware('throttle:health-record-drafts');
            Route::put('/health-record-drafts/{draft}', [HealthRecordDraftController::class, 'update'])
                ->middleware('throttle:health-record-drafts');
            Route::get('/referral-routing', [ReferralController::class, 'destination']);
            Route::get('/referral-holds', [ReferralHoldController::class, 'index']);
            Route::post('/referral-holds/{referralHold}/discard', [ReferralHoldController::class, 'discard']);
            Route::get('/follow-up-tasks', [FollowUpTaskController::class, 'index']);
            Route::get('/follow-up-tasks/{followUpTask}', [FollowUpTaskController::class, 'show']);
            Route::patch('/follow-up-tasks/{followUpTask}/no-show', [FollowUpTaskController::class, 'markNoShow']);
            Route::patch('/follow-up-tasks/{followUpTask}/reschedule', [FollowUpTaskController::class, 'reschedule']);
            Route::patch('/follow-up-tasks/{followUpTask}/cancel', [FollowUpTaskController::class, 'cancel']);
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
