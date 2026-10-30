<?php

namespace App\Http\Middleware;

use App\Models\Referral;
use App\Services\ActionPermissions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceActionPermissions
{
    public function handle(Request $request, Closure $next): Response
    {
        $path = $request->path();
        $read = $request->isMethod('get');
        $permission = match (true) {
            // BHC dashboard sections are gated in the payload, not by a single duty.
            str_contains($path, '/bhc/dashboard') => null,
            // Either consultations.encode or clinical.history; the controller checks.
            str_contains($path, '/care-overview') => null,
            str_contains($path, '/catchment-bhcs') => (
                ActionPermissions::allows($request->user(), 'consultations.encode')
                || ActionPermissions::allows($request->user(), 'consultations.finalize')
                || ActionPermissions::allows($request->user(), 'clinical.history')
            ) ? null : 'consultations.encode',
            str_contains($path, '/monitoring-handoff-requests') => $read
                ? ((ActionPermissions::allows($request->user(), 'consultations.encode')
                    || ActionPermissions::allows($request->user(), 'clinical.history'))
                    ? null
                    : 'clinical.history')
                : 'consultations.encode',
            str_contains($path, '/background-history') => 'clinical.history',
            str_ends_with($path, '/background') => 'clinical.background.update',
            str_contains($path, '/conditions') => 'clinical.history',
            str_contains($path, '/corrections') => $read ? 'clinical.history' : 'records.correct',
            str_contains($path, 'dispensed-medicines') => 'items.dispense',
            str_contains($path, '/health-record-drafts') => $request->user()->isRhu()
                && (ActionPermissions::allows($request->user(), 'consultations.encode')
                    || ActionPermissions::allows($request->user(), 'consultations.finalize'))
                    ? null
                    : 'consultations.encode',
            str_contains($path, '/health-records') => $read ? 'clinical.history' : 'consultations.finalize',
            // BHC and RHU history now opens through the patient directory/profile.
            // Reading these does not confer registration/update authority; facility scopes still apply.
            str_contains($path, '/patients') && $read
                && ($request->user()->isBhc() || $request->user()->isRhu())
                && ActionPermissions::allows($request->user(), 'clinical.history') => null,
            str_contains($path, '/patients') => 'patients.register',
            str_contains($path, '/medicines') => $read ? 'inventory.view' : 'inventory.manage',
            // Doctor availability reads are facility-scoped, not inventory.
            // Writes stay on the MHO-controlled rhu.providers.manage checklist.
            str_contains($path, '/rhu-providers') => $read ? null : 'rhu.providers.manage',
            str_contains($path, '/follow-up-tasks') => $read ? 'clinical.history' : 'followups.manage',
            str_contains($path, '/reports') => 'reports.view',
            str_contains($path, '/referral-routing') => 'consultations.encode',
            str_ends_with($path, '/rhu-visits/patient-search') => 'patients.register',
            str_contains($path, '/rhu-visits') && str_ends_with($path, '/start') => 'consultations.encode',
            str_contains($path, '/rhu-visits') && str_ends_with($path, '/resume') => (
                ActionPermissions::allows($request->user(), 'consultations.encode')
                || ActionPermissions::allows($request->user(), 'consultations.finalize')
            ) ? null : 'consultations.encode',
            // Reading the queue is clinical history; walk-in intake and close are the registration duty.
            str_contains($path, '/rhu-visits') => $read ? 'clinical.history' : 'patients.register',
            // RHU intake identifies an arrival and marks it Received; every other referral write stays rhu.manage.
            $request->user()->isRhu() && $this->isIntakeAction($request, $path) => (
                ActionPermissions::allows($request->user(), 'rhu.intake')
                || ActionPermissions::allows($request->user(), 'rhu.manage')
            ) ? null : 'rhu.intake',
            str_contains($path, '/referrals') => $read ? 'clinical.history' : ($request->user()->isBhc() ? 'referrals.submit' : 'rhu.manage'),
            str_contains($path, '/referral-holds') => 'referrals.submit',
            str_contains($path, '/feedback'), str_contains($path, '/incoming-referrals'), str_contains($path, '/rhu-patient-volumes') => 'rhu.manage',
            default => null,
        };
        // Administration retains existing read/report access. It does not confer clinical write authority.
        $adminRead = $request->user()->isAdmin() && $read;
        $adminPatientManagement = $request->user()->isAdmin() && str_contains($path, '/patients');
        if ($permission !== null && ! $adminRead && ! $adminPatientManagement) {
            ActionPermissions::ensure($request->user(), $permission);
        }

        return $next($request);
    }

    private function isIntakeAction(Request $request, string $path): bool
    {
        if (str_ends_with($path, 'referrals/qr/resolve') || str_ends_with($path, 'referrals/tracking/resolve')) {
            return true;
        }

        return $request->isMethod('patch')
            && preg_match('#referrals/\d+/status$#', $path) === 1
            && Referral::normalizeWorkflowStatus((string) $request->input('status')) === Referral::STATUS_RECEIVED;
    }
}
