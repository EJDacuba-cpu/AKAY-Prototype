<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Medicine;
use App\Models\Referral;
use App\Models\RhuPatientVolume;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\StoredFunction;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function bhw(Request $request, AuditLogger $auditLogger)
    {
        $query = Referral::where('barangay_health_center_id', $request->user()->barangay_health_center_id);
        $auditLogger->log($request, 'generated', 'reports', 'Generated BHW report.');

        return response()->json(['data' => $this->referralReport($query)]);
    }

    public function rhu(Request $request, AuditLogger $auditLogger)
    {
        $query = Referral::where('rural_health_unit_id', $request->user()->rural_health_unit_id);
        $auditLogger->log($request, 'generated', 'reports', 'Generated RHU report.');

        return response()->json([
            'data' => [
                ...$this->referralReport($query),
                'medicine_availability' => Medicine::where('rural_health_unit_id', $request->user()->rural_health_unit_id)
                    ->selectRaw('availability_status, count(*) as total')
                    ->groupBy('availability_status')
                    ->pluck('total', 'availability_status'),
                'patient_volume' => RhuPatientVolume::where('rural_health_unit_id', $request->user()->rural_health_unit_id)->first(),
            ],
        ]);
    }

    public function admin(Request $request, AuditLogger $auditLogger)
    {
        $auditLogger->log($request, 'generated', 'reports', 'Generated admin report.');

        return response()->json([
            'data' => [
                'users_by_role' => User::selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role'),
                'users_by_status' => User::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
                'audit_logs_by_module' => AuditLog::selectRaw('module, count(*) as total')->groupBy('module')->pluck('total', 'module'),
                'system_activity_total' => AuditLog::count(),
            ],
        ]);
    }

    private function referralReport($query): array
    {
        if (StoredFunction::available()) {
            $user = request()->user();
            $role = $user?->role ?? 'admin';
            $data = StoredFunction::selectJson(
                'SELECT akay_referral_report(?, ?, ?) AS data',
                [
                    $role,
                    $user?->barangay_health_center_id,
                    $user?->rural_health_unit_id,
                ]
            );

            if ($data) {
                return $data;
            }
        }

        $base = clone $query;

        return [
            'total_referrals' => (clone $base)->count(),
            'completed_referrals' => (clone $base)->where('status', Referral::STATUS_COMPLETED)->count(),
            'no_show_referrals' => (clone $base)->where('status', Referral::STATUS_NO_SHOW)->count(),
            'referrals_by_status' => (clone $base)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            'referrals_by_category' => (clone $base)->selectRaw('referral_category, count(*) as total')->groupBy('referral_category')->pluck('total', 'referral_category'),
            'referrals_by_barangay' => (clone $base)
                ->join('barangay_health_centers', 'referrals.barangay_health_center_id', '=', 'barangay_health_centers.id')
                ->selectRaw('barangay_health_centers.barangay, count(*) as total')
                ->groupBy('barangay_health_centers.barangay')
                ->pluck('total', 'barangay'),
            'weekly_referrals' => (clone $base)->where('created_at', '>=', now()->subWeek())->count(),
            'monthly_referrals' => (clone $base)->where('created_at', '>=', now()->subMonth())->count(),
        ];
    }
}
