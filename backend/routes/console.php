<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Services\ReferralNoShowService;
use App\Services\DeploymentReadinessService;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('referrals:mark-no-show {--dry-run : Count eligible referrals without changing them}', function () {
    $dryRun = (bool) $this->option('dry-run');
    $count = app(ReferralNoShowService::class)->markOverduePending(dryRun: $dryRun);

    $this->info($dryRun
        ? "{$count} overdue Pending referral(s) would be marked No-Show."
        : "{$count} overdue Pending referral(s) marked No-Show.");
})->purpose('Safely mark overdue Pending referrals as No-Show');

Artisan::command('akay:deployment-check {--production : Enforce production deployment requirements}', function (DeploymentReadinessService $readiness) {
    $checks = $readiness->checks((bool) $this->option('production'));

    foreach ($checks as $check) {
        $this->line(sprintf(
            '[%s] %s',
            $check['passed'] ? 'PASS' : 'FAIL',
            $check['name']
        ));
    }

    return collect($checks)->every('passed')
        ? \Symfony\Component\Console\Command\Command::SUCCESS
        : \Symfony\Component\Console\Command\Command::FAILURE;
})->purpose('Validate AKAY deployment configuration without printing secrets');

Schedule::command('referrals:mark-no-show')
    ->hourly()
    ->timezone(config('app.timezone'))
    ->withoutOverlapping(config('operations.scheduler.no_show_overlap_minutes'));

Schedule::command('sanctum:prune-expired', [
    '--hours' => config('operations.scheduler.token_prune_retention_hours'),
])
    ->dailyAt(config('operations.scheduler.token_prune_time'))
    ->timezone(config('app.timezone'))
    ->withoutOverlapping(config('operations.scheduler.token_prune_overlap_minutes'));
