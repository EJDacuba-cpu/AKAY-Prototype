<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The one place a user's own password is saved, whatever the route (invite link, reset link, or changing a
 * password while signed in). Saving it always clears the temporary-password flags and ends every session, so a
 * password set by any route can never be refused later as an expired temporary one.
 */
class PasswordSetService
{
    public function __construct(
        private readonly PasswordSetRecorder $recorder,
        private readonly UserSessionRevocationService $sessions,
    ) {}

    /**
     * @param  'invite'|'reset'|'temporary_password'|null  $route  The route to record through PasswordSetRecorder;
     *                                                              null records nothing (a voluntary change by a user
     *                                                              who had no temporary password).
     */
    public function set(User $user, string $password, ?string $route, string $revokeReason): void
    {
        DB::transaction(function () use ($user, $password, $route, $revokeReason): void {
            $user->forceFill([
                'password' => $password,
                'must_change_password' => false,
                'temp_password_expires_at' => null,
            ])->save();

            if ($route !== null) {
                $this->recorder->record($user, $route);
            }

            $this->sessions->revokeAllTokens($user, $revokeReason);
        });
    }
}
