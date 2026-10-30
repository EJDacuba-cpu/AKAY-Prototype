<?php

namespace App\Console\Commands;

use App\Models\AccountInvite;
use App\Models\User;
use App\Services\AccountActivationService;
use App\Services\AccountInviteService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BootstrapAdmin extends Command
{
    protected $signature = 'akay:bootstrap-admin {email : Mailbox that will complete invitation setup}';

    protected $description = 'Create or reinvite the first Municipal Health Officer through an emailed invitation. Never prints the token.';

    public function handle(AccountInviteService $invites, AccountActivationService $activation): int
    {
        $email = strtolower(trim((string) $this->argument('email')));

        try {
            validator(['email' => $email], ['email' => ['required', 'email', 'max:255']])->validate();
        } catch (ValidationException) {
            $this->error('Provide a valid email address.');

            return self::FAILURE;
        }

        $existing = User::query()->whereRaw('lower(email) = ?', [$email])->limit(2)->get();
        if ($existing->count() > 1) {
            $this->error('That mailbox matches more than one account. Resolve the collision before bootstrapping.');

            return self::FAILURE;
        }

        $user = $existing->first();
        $verifiedAdmin = User::query()
            ->where('role', User::ROLE_ADMIN)
            ->whereNotNull('email_verified_at')
            ->first();

        if ($verifiedAdmin && (! $user || (int) $user->id !== (int) $verifiedAdmin->id)) {
            $this->error('A verified Municipal Health Officer already exists. Create additional accounts in AKAY after signing in.');

            return self::FAILURE;
        }

        if ($user && $user->role !== User::ROLE_ADMIN) {
            $this->error('That mailbox belongs to a non-admin account.');

            return self::FAILURE;
        }

        if ($user && $activation->isActivated($user)) {
            $this->info('That Municipal Health Officer is already verified. No invitation was sent.');
            $this->invalidateCopied($invites);

            return self::SUCCESS;
        }

        DB::transaction(function () use ($user, $email): User {
            if ($user) {
                return $user;
            }

            return User::create([
                'name' => 'Municipal Health Officer',
                'email' => $email,
                'password' => Str::random(64),
                'role' => User::ROLE_ADMIN,
                'status' => User::STATUS_ACTIVE,
                'permissions' => [],
            ]);
        });

        $account = User::query()->whereRaw('lower(email) = ?', [$email])->firstOrFail();
        $invite = $invites->issue($account, null);
        $this->invalidateCopied($invites);

        if ($invite->delivery === AccountInvite::DELIVERY_FAILED) {
            $this->warn('The invitation email could not be sent. Check mail configuration and rerun this command.');

            return self::FAILURE;
        }

        $this->info('Invitation sent. Complete setup from that mailbox. The token is not printed here.');

        return self::SUCCESS;
    }

    private function invalidateCopied(AccountInviteService $invites): void
    {
        $cleared = $invites->invalidateCopiedPendingInvites();
        if ($cleared > 0) {
            $this->info("Invalidated {$cleared} previously copied pending invitation token(s).");
        }
    }
}
