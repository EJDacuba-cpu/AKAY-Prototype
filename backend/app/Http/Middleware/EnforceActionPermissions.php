<?php

namespace App\Http\Middleware;

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
            str_contains($path, '/corrections') => $read ? 'clinical.history' : 'records.correct',
            str_contains($path, 'dispensed-medicines') => 'items.dispense',
            str_contains($path, '/health-record-drafts') => 'consultations.encode',
            str_contains($path, '/health-records') => $read ? 'clinical.history' : 'consultations.finalize',
            str_contains($path, '/patients') => $read ? 'patients.register' : 'patients.register',
            str_contains($path, '/medicines') => $read ? 'inventory.view' : 'inventory.manage',
            str_contains($path, '/rhu-providers') => $read ? 'inventory.view' : 'rhu.manage',
            str_contains($path, '/follow-up-tasks') => $read ? 'clinical.history' : 'followups.manage',
            str_contains($path, '/reports') => 'reports.view',
            str_contains($path, '/referral-routing') => 'consultations.encode',
            str_contains($path, '/referrals') => $read ? 'clinical.history' : ($request->user()->isBhw() ? 'referrals.submit' : 'rhu.manage'),
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
}
