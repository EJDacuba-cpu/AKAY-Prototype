<?php

namespace App\Services;

use App\Mail\AccountInviteMail;
use App\Models\AccountInvite;
use App\Models\User;
use App\Support\FrontendUrl;
use App\Support\MaskedEmail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/** Creates, rotates and sends account invites. Tokens are only ever stored as sha256 hashes. */
class AccountInviteService
{
    public const LINK_HOURS = 48;

    public const TEMPORARY_PASSWORD_HOURS = 72;

    /** Letters and digits without look-alikes (no 0/O, 1/l/I), so the MHO can read the password out loud. */
    private const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

    private const PASSWORD_LENGTH = 12;

    /** Creates the invite for a new account (or rotates the existing one), then emails it. */
    public function issue(User $user, ?User $by): AccountInvite
    {
        $invite = AccountInvite::firstOrNew(['user_id' => $user->id]);
        $invite->created_by = $by?->id ?? $invite->created_by;
        $invite->email = $user->email;

        return $this->send($invite, $this->rotate($invite));
    }

    /** New token and a fresh 48-hour window; the previous link stops working. */
    public function resend(AccountInvite $invite): AccountInvite
    {
        return $this->send($invite, $this->rotate($invite));
    }

    /** Rotates the token for the MHO to share another way; nothing is emailed. */
    public function link(AccountInvite $invite): string
    {
        $token = $this->rotate($invite);
        $invite->forceFill(['delivery' => AccountInvite::DELIVERY_COPIED])->save();

        return $this->inviteUrl($token);
    }

    /** Sets a temporary password on the account and returns it. The caller must show it once and never log it. */
    public function temporaryPassword(AccountInvite $invite): string
    {
        $password = $this->generatePassword();

        DB::transaction(function () use ($invite, $password): void {
            $invite->user->forceFill([
                'password' => $password,
                'must_change_password' => true,
                'temp_password_expires_at' => now()->addHours(self::TEMPORARY_PASSWORD_HOURS),
            ])->save();

            $invite->forceFill([
                'status' => AccountInvite::STATUS_TEMPORARY,
                'token_hash' => null,
            ])->save();

            app(UserSessionRevocationService::class)->revokeAllTokens($invite->user, 'temporary-password-issued');
        });

        return $password;
    }

    public function inviteUrl(string $token): string
    {
        return FrontendUrl::to('/accept-invite?token='.$token);
    }

    private function rotate(AccountInvite $invite): string
    {
        $token = Str::random(64);

        $invite->forceFill([
            'token_hash' => hash('sha256', $token),
            'status' => AccountInvite::STATUS_PENDING,
            'email' => $invite->user?->email ?? $invite->email,
            'expires_at' => now()->addHours(self::LINK_HOURS),
            'sent_at' => now(),
        ])->save();

        return $token;
    }

    /** Never throws: a mail failure is recorded on the invite so the account can still be created. */
    private function send(AccountInvite $invite, string $token): AccountInvite
    {
        try {
            Mail::to($invite->email)->send(new AccountInviteMail($invite, $this->inviteUrl($token)));
            $invite->forceFill(['delivery' => AccountInvite::DELIVERY_SENT])->save();
        } catch (Throwable $e) {
            Log::warning('Account invite email failed.', [
                'account_invite_id' => $invite->id,
                'recipient' => MaskedEmail::mask($invite->email),
                'error' => get_class($e),
            ]);
            $invite->forceFill(['delivery' => AccountInvite::DELIVERY_FAILED])->save();
        }

        return $invite;
    }

    private function generatePassword(): string
    {
        $max = strlen(self::PASSWORD_ALPHABET) - 1;
        do {
            $password = '';
            for ($i = 0; $i < self::PASSWORD_LENGTH; $i++) {
                $password .= self::PASSWORD_ALPHABET[random_int(0, $max)];
            }
        } while (! (preg_match('/[a-z]/', $password) && preg_match('/[A-Z]/', $password) && preg_match('/\d/', $password)));

        return $password;
    }
}
