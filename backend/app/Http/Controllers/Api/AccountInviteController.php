<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountInvite;
use App\Services\AuditLogger;
use App\Services\PasswordSetRecorder;
use App\Services\UserSessionRevocationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AccountInviteController extends Controller
{
    private const INVALID_MESSAGE = 'This invite link is invalid or expired.';

    /** Public: shows who the invite is for, so the page can greet them before they pick a password. */
    public function verify(Request $request)
    {
        $invite = $this->findUsableInvite($request->query('token'));

        if (! $invite) {
            return response()->json(['message' => self::INVALID_MESSAGE], 422);
        }

        return response()->json([
            'data' => [
                'name' => $invite->user->name,
                'email' => $invite->user->email,
                'expires_at' => $invite->expires_at,
            ],
        ]);
    }

    /** Public: the one-time link sets the first password. A second use of the same link fails. */
    public function accept(
        Request $request,
        PasswordSetRecorder $recorder,
        UserSessionRevocationService $sessions,
        AuditLogger $auditLogger
    ) {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->mixedCase()->numbers()],
        ]);

        $found = $this->findUsableInvite($validated['token']);

        if (! $found) {
            return response()->json(['message' => self::INVALID_MESSAGE], 422);
        }

        $accepted = DB::transaction(function () use ($found, $validated, $recorder, $sessions, $request, $auditLogger): bool {
            // Re-check under a row lock so two simultaneous submissions cannot both succeed.
            $invite = AccountInvite::query()->whereKey($found->id)->lockForUpdate()->first();

            if (! $invite
                || $invite->status !== AccountInvite::STATUS_PENDING
                || $invite->token_hash !== hash('sha256', $validated['token'])
                || ! $invite->expires_at?->isFuture()) {
                return false;
            }

            $user = $invite->user;
            if (! $user || ! $user->isActive()) {
                return false;
            }

            $user->forceFill([
                'password' => $validated['password'],
                'must_change_password' => false,
                'temp_password_expires_at' => null,
            ])->save();

            $recorder->record($user, PasswordSetRecorder::ROUTE_INVITE);
            $sessions->revokeAllTokens($user, 'invite-accepted');

            $auditLogger->log($request, 'account invite completed', 'auth', "Account invite completed for {$user->email}.");

            return true;
        });

        if (! $accepted) {
            return response()->json(['message' => self::INVALID_MESSAGE], 422);
        }

        return response()->json(['message' => 'Your password is set. Sign in to continue.']);
    }

    private function findUsableInvite(?string $token): ?AccountInvite
    {
        if (! $token) {
            return null;
        }

        $invite = AccountInvite::query()
            ->with('user')
            ->where('token_hash', hash('sha256', $token))
            ->where('status', AccountInvite::STATUS_PENDING)
            ->first();

        if (! $invite) {
            return null;
        }

        if (! $invite->expires_at || $invite->expires_at->isPast()) {
            $invite->update([
                'status' => AccountInvite::STATUS_EXPIRED,
                'token_hash' => null,
            ]);

            return null;
        }

        if (! $invite->user || ! $invite->user->isActive()) {
            return null;
        }

        return $invite;
    }
}
