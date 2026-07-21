<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Medicine;
use App\Models\Referral;
use App\Models\RhuPatientVolume;
use App\Models\User;
use App\Services\AkayCacheService;
use App\Services\AuditLogger;
use App\Support\StoredFunction;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function __construct(private readonly AkayCacheService $cache) {}

    public function bhw(Request $request, AuditLogger $auditLogger)
    {
        $query = Referral::where('referrals.barangay_health_center_id', $request->user()->barangay_health_center_id);
        $auditLogger->log($request, 'generated', 'reports', 'Generated BHW report.');
        $data = $this->cache->rememberForUser(
            AkayCacheService::DOMAIN_REPORT_AGGREGATE,
            $request->user(),
            [],
            1,
            (int) config('akay_cache.ttl.report_aggregate_seconds', 120),
            fn (): array => $this->referralReport($query),
            preventStampede: true
        );

        return $this->cache->addDiagnosticHeader(response()->json(['data' => $data]));
    }

    public function rhu(Request $request, AuditLogger $auditLogger)
    {
        $query = Referral::where('referrals.rural_health_unit_id', $request->user()->rural_health_unit_id);
        $auditLogger->log($request, 'generated', 'reports', 'Generated RHU report.');
        $data = $this->cache->rememberForUser(
            AkayCacheService::DOMAIN_REPORT_AGGREGATE,
            $request->user(),
            [],
            1,
            (int) config('akay_cache.ttl.report_aggregate_seconds', 120),
            fn (): array => [
                ...$this->referralReport($query),
                'medicine_availability' => Medicine::where(
                    'rural_health_unit_id',
                    $request->user()->rural_health_unit_id
                )
                    ->selectRaw('availability_status, count(*) as total')
                    ->groupBy('availability_status')
                    ->pluck('total', 'availability_status')
                    ->map(fn (mixed $total): int => (int) $total)
                    ->all(),
                'patient_volume' => $this->patientVolumeSummary(
                    RhuPatientVolume::where(
                        'rural_health_unit_id',
                        $request->user()->rural_health_unit_id
                    )->first()
                ),
            ],
            preventStampede: true
        );

        return $this->cache->addDiagnosticHeader(response()->json(['data' => $data]));
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
                return $this->sanitizeReferralReport(
                    $this->normalizeReferralStatusBuckets($data)
                );
            }
        }

        $base = clone $query;
        $statusCounts = $this->canonicalStatusCounts($base);

        return $this->sanitizeReferralReport([
            'total_referrals' => (clone $base)->count(),
            'completed_referrals' => $statusCounts[Referral::STATUS_COMPLETED] ?? 0,
            'no_show_referrals' => $statusCounts[Referral::STATUS_NO_SHOW] ?? 0,
            'referrals_by_status' => $statusCounts,
            'referrals_by_category' => (clone $base)->selectRaw('referral_category, count(*) as total')->groupBy('referral_category')->pluck('total', 'referral_category'),
            'referrals_by_barangay' => (clone $base)
                ->join('barangay_health_centers', 'referrals.barangay_health_center_id', '=', 'barangay_health_centers.id')
                ->selectRaw('barangay_health_centers.barangay, count(*) as total')
                ->groupBy('barangay_health_centers.barangay')
                ->pluck('total', 'barangay'),
            'weekly_referrals' => (clone $base)->where('created_at', '>=', now()->subWeek())->count(),
            'monthly_referrals' => (clone $base)->where('created_at', '>=', now()->subMonth())->count(),
        ]);
    }

    private function canonicalStatusCounts($query): array
    {
        return collect((clone $query)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status'))
            ->reduce(function (array $counts, mixed $total, string $status): array {
                $canonical = Referral::normalizeWorkflowStatus($status) ?? $status;
                $counts[$canonical] = ($counts[$canonical] ?? 0) + (int) $total;

                return $counts;
            }, []);
    }

    private function normalizeReferralStatusBuckets(array $report): array
    {
        $counts = collect($report['referrals_by_status'] ?? [])
            ->reduce(function (array $normalized, mixed $total, string $status): array {
                $canonical = Referral::normalizeWorkflowStatus($status) ?? $status;
                $normalized[$canonical] = ($normalized[$canonical] ?? 0) + (int) $total;

                return $normalized;
            }, []);

        return [
            ...$report,
            'completed_referrals' => $counts[Referral::STATUS_COMPLETED] ?? 0,
            'no_show_referrals' => $counts[Referral::STATUS_NO_SHOW] ?? 0,
            'referrals_by_status' => $counts,
        ];
    }

    private function sanitizeReferralReport(array $report): array
    {
        return [
            'total_referrals' => (int) ($report['total_referrals'] ?? 0),
            'completed_referrals' => (int) ($report['completed_referrals'] ?? 0),
            'no_show_referrals' => (int) ($report['no_show_referrals'] ?? 0),
            'referrals_by_status' => $this->integerBuckets($report['referrals_by_status'] ?? []),
            'referrals_by_category' => $this->integerBuckets($report['referrals_by_category'] ?? []),
            'referrals_by_barangay' => $this->integerBuckets($report['referrals_by_barangay'] ?? []),
            'weekly_referrals' => (int) ($report['weekly_referrals'] ?? 0),
            'monthly_referrals' => (int) ($report['monthly_referrals'] ?? 0),
        ];
    }

    private function integerBuckets(mixed $buckets): array
    {
        return collect($buckets)
            ->mapWithKeys(fn (mixed $total, mixed $label): array => [
                (string) $label => (int) $total,
            ])
            ->all();
    }

    private function patientVolumeSummary(?RhuPatientVolume $volume): ?array
    {
        return $volume === null
            ? null
            : [
                'status' => $volume->status,
                'updated_at' => $volume->updated_at?->toISOString(),
            ];
    }
}
