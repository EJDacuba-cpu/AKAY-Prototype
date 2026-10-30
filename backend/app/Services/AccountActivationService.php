<?php

namespace App\Services;

use App\Models\AccountInvite;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Mailbox-based invitation acceptance is the only write that marks an account verified.
 */
class AccountActivationService
{
    public function __construct(
        private readonly PasswordSetService $passwords,
        private readonly UserSessionRevocationService $sessions,
    ) {}

    public function isActivated(User $user): bool
    {
        return $user->email_verified_at !== null;
    }

    public function acceptInvite(AccountInvite $invite, string $token, string $password): bool
    {
        return DB::transaction(function () use ($invite, $token, $password): bool {
            $user = User::query()->whereKey($invite->user_id)->lockForUpdate()->first();
            $lockedInvite = AccountInvite::query()->whereKey($invite->id)->lockForUpdate()->first();

            if (! $user
                || ! $lockedInvite
                || ! $user->isActive()
                || $lockedInvite->status !== AccountInvite::STATUS_PENDING
                || $lockedInvite->token_hash !== hash('sha256', $token)
                || ! $lockedInvite->expires_at?->isFuture()
                || ! $this->sameMailbox($user->email, $lockedInvite->email)) {
                return false;
            }

            $this->passwords->set($user, $password, PasswordSetRecorder::ROUTE_INVITE, 'invite-accepted');
            $user->forceFill(['email_verified_at' => now()])->save();

            return true;
        });
    }

    public function sameMailbox(string $left, string $right): bool
    {
        return strtolower(trim($left)) === strtolower(trim($right));
    }

    public function startOverForMailboxChange(User $user): void
    {
        $user->forceFill(['email_verified_at' => null])->save();
        $this->sessions->revokeAllTokens($user, 'account-email-changed');
    }
}
