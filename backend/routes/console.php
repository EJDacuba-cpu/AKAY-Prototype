<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Services\ReferralNoShowService;

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

Schedule::command('referrals:mark-no-show')
    ->hourly()
    ->withoutOverlapping();
