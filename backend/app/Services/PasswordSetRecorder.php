<?php

namespace App\Services;

use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * One rule for every route: when a user sets a password (invite link, reset link, or changing a temporary
 * password), every open invite or reset request for that user becomes completed, naming the route used.
 */
class PasswordSetRecorder
{
    public const ROUTE_INVITE = 'invite';
    public const ROUTE_RESET = 'reset';
    public const ROUTE_TEMPORARY_PASSWORD = 'temporary_password';

    private const INVITE_VIA = [
        self::ROUTE_INVITE => AccountInvite::VIA_LINK,
        self::ROUTE_RESET => AccountInvite::VIA_RESET,
        self::ROUTE_TEMPORARY_PASSWORD => AccountInvite::VIA_TEMPORARY_PASSWORD,
    ];

    private const RESET_VIA = [
        self::ROUTE_RESET => PasswordResetRequest::VIA_LINK,
        self::ROUTE_INVITE => PasswordResetRequest::VIA_INVITE,
        self::ROUTE_TEMPORARY_PASSWORD => PasswordResetRequest::VIA_TEMPORARY_PASSWORD,
    ];

    /** @param 'invite'|'reset'|'temporary_password' $route */
    public function record(User $user, string $route): void
    {
        if (! isset(self::INVITE_VIA[$route])) {
            throw new \InvalidArgumentException("Unknown password-set route [{$route}].");
        }

        DB::transaction(function () use ($user, $route) {
            $now = now();
            $completeInvite = $route === self::ROUTE_INVITE
                || app(AccountActivationService::class)->isActivated($user);

            if ($completeInvite) {
                AccountInvite::where('user_id', $user->id)
                    ->where('status', '!=', AccountInvite::STATUS_COMPLETED)
                    ->update([
                        'status' => AccountInvite::STATUS_COMPLETED,
                        'completed_via' => self::INVITE_VIA[$route],
                        'completed_at' => $now,
                        'token_hash' => null,
                        'updated_at' => $now,
                    ]);
            }

            PasswordResetRequest::where('user_id', $user->id)
                ->whereIn('status', [
                    PasswordResetRequest::STATUS_PENDING,
                    PasswordResetRequest::STATUS_APPROVED,
                    PasswordResetRequest::STATUS_EXPIRED,
                ])
                ->update([
                    'status' => PasswordResetRequest::STATUS_COMPLETED,
                    'completed_via' => self::RESET_VIA[$route],
                    'completed_at' => $now,
                    'reset_token_hash' => null,
                    'expires_at' => null,
                    'updated_at' => $now,
                ]);
        });
    }
}
