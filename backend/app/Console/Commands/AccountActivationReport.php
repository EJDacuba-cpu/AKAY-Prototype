<?php

namespace App\Console\Commands;

use App\Models\AccountInvite;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AccountActivationReport extends Command
{
    protected $signature = 'akay:account-activation-report';

    protected $description = 'Read-only counts for email-verified account activation rollout. No emails, tokens, hashes, or passwords.';

    public function handle(): int
    {
        $unverified = User::query()
            ->select('role', DB::raw('count(*) as total'))
            ->whereNull('email_verified_at')
            ->groupBy('role')
            ->orderBy('role')
            ->get();

        $this->info('Unverified accounts by role');
        if ($unverified->isEmpty()) {
            $this->line('none');
        } else {
            foreach ($unverified as $row) {
                $this->line(($row->role ?: 'unknown').': '.$row->total);
            }
        }

        $copied = AccountInvite::query()
            ->where('status', AccountInvite::STATUS_PENDING)
            ->where('delivery', AccountInvite::DELIVERY_COPIED)
            ->whereNotNull('token_hash')
            ->count();
        $this->info('Pending copied invitation tokens: '.$copied);

        $routes = AccountInvite::query()
            ->select('completed_via', DB::raw('count(*) as total'))
            ->whereNotNull('completed_via')
            ->where('completed_via', '!=', '')
            ->groupBy('completed_via')
            ->orderBy('completed_via')
            ->get();
        $this->info('Completed invitations by route');
        if ($routes->isEmpty()) {
            $this->line('none');
        } else {
            foreach ($routes as $row) {
                $this->line($row->completed_via.': '.$row->total);
            }
        }

        $collisions = DB::table('users')
            ->select(DB::raw('count(*) as total'))
            ->groupByRaw('lower(email)')
            ->havingRaw('count(*) > 1')
            ->get()
            ->count();
        $this->info('Case-colliding email groups: '.$collisions);

        $verifiedAdmins = User::query()
            ->where('role', User::ROLE_ADMIN)
            ->whereNotNull('email_verified_at')
            ->count();
        $this->info('Verified Municipal Health Officer accounts: '.$verifiedAdmins);

        return self::SUCCESS;
    }
}
