<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Services\AccessRequestStatus;
use App\Services\AccountInviteService;
use App\Services\AuditLogger;
use App\Services\PasswordSetRecorder;
use App\Services\PasswordSetService;
use App\Support\AccessRows;
use App\Support\MaskedEmail;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AccountInviteController extends Controller
{
    private const WITH_FACILITY = AccessRows::INVITE_WITH;

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
        PasswordSetService $passwords,
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

        $accepted = DB::transaction(function () use ($found, $validated, $passwords, $request, $auditLogger): bool {
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

            $passwords->set($user, $validated['password'], PasswordSetRecorder::ROUTE_INVITE, 'invite-accepted');

            $auditLogger->log($request, 'account invite completed', 'auth', 'Account invite completed for '.MaskedEmail::mask($user->email).'.');

            return true;
        });

        if (! $accepted) {
            return response()->json(['message' => self::INVALID_MESSAGE], 422);
        }

        return response()->json(['message' => 'Your password is set. Sign in to continue.']);
    }

    /** Admin: the Invites tab, filtered by the four shared statuses. */
    public function index(Request $request)
    {
        AccessRequestStatus::expireStaleInvites();

        $query = AccountInvite::query()
            ->with(self::WITH_FACILITY)
            ->latest('created_at')
            ->latest('id');

        $status = Str::lower((string) $request->query('status'));
        if (in_array($status, AccessRequestStatus::ALL, true)) {
            AccessRequestStatus::applyToInvites($query, $status);
        }

        if ($search = trim((string) $request->query('search'))) {
            $like = '%'.$search.'%';
            $query->where(function ($q) use ($like) {
                $q->where('email', 'like', $like)
                    ->orWhereHas('user', fn ($user) => $user
                        ->where('name', 'like', $like)
                        ->orWhere('email', 'like', $like));
            });
        }

        $perPage = min(max($request->integer('per_page', 25), 1), 100);

        return response()->json([
            'data' => $query->paginate($perPage)->through(fn (AccountInvite $invite) => $this->toResponse($invite)),
        ]);
    }

    /** Admin: the Pending counts shown on the two tab headings. */
    public function summary()
    {
        AccessRequestStatus::expireStaleInvites();
        AccessRequestStatus::expireStaleResetRequests();

        $invites = AccountInvite::query();
        AccessRequestStatus::applyToInvites($invites, AccessRequestStatus::PENDING);

        $resets = PasswordResetRequest::query();
        AccessRequestStatus::applyToResetRequests($resets, AccessRequestStatus::PENDING);

        return response()->json([
            'data' => [
                'reset_requests' => $resets->count(),
                'invites' => $invites->count(),
            ],
        ]);
    }

    public function resend(Request $request, AccountInvite $invite, AccountInviteService $invites, AuditLogger $auditLogger)
    {
        if ($refusal = $this->refuseIfClosed($invite)) {
            return $refusal;
        }

        $invites->resend($invite);

        $auditLogger->log($request, 'account invite resent', 'auth', 'Account invite resent to '.MaskedEmail::mask($invite->email).'.');

        return response()->json(['data' => $this->toResponse($invite->fresh(self::WITH_FACILITY))]);
    }

    public function updateEmail(Request $request, AccountInvite $invite, AccountInviteService $invites, AuditLogger $auditLogger)
    {
        if ($refusal = $this->refuseIfClosed($invite)) {
            return $refusal;
        }

        $validated = $request->validate([
            'email' => [
                'required', 'string', 'email', 'max:255',
                function (string $attribute, mixed $value, Closure $fail) use ($invite): void {
                    $taken = User::query()
                        ->whereRaw('lower(email) = ?', [strtolower(trim($value))])
                        ->where('id', '!=', $invite->user_id)
                        ->exists();

                    if ($taken) {
                        $fail('This email is already in use.');
                    }
                },
            ],
        ]);

        $previous = $invite->user->email;
        $invite->user->forceFill(['email' => trim($validated['email'])])->save();

        $invites->resend($invite);

        $auditLogger->log(
            $request,
            'account invite email changed',
            'auth',
            'Account invite email changed from '.MaskedEmail::mask($previous).' to '.MaskedEmail::mask($invite->email).'.'
        );

        return response()->json(['data' => $this->toResponse($invite->fresh(self::WITH_FACILITY))]);
    }

    /** Copy link: a fresh one-time link for the MHO to share another way. The emailed link stops working. */
    public function link(Request $request, AccountInvite $invite, AccountInviteService $invites, AuditLogger $auditLogger)
    {
        if ($refusal = $this->refuseIfClosed($invite)) {
            return $refusal;
        }

        $url = $invites->link($invite);

        $auditLogger->log($request, 'account invite link copied', 'auth', 'Account invite link copied for '.MaskedEmail::mask($invite->email).'.');

        return response()->json(['data' => ['url' => $url]]);
    }

    /** The password is in this response only; it is never logged or stored in the clear. */
    public function temporaryPassword(Request $request, AccountInvite $invite, AccountInviteService $invites, AuditLogger $auditLogger)
    {
        if ($refusal = $this->refuseIfClosed($invite)) {
            return $refusal;
        }

        $password = $invites->temporaryPassword($invite);

        $auditLogger->log($request, 'temporary password issued', 'auth', 'Temporary password issued for '.MaskedEmail::mask($invite->email).'.');

        return response()->json([
            'data' => [
                'password' => $password,
                'expires_at' => $invite->user->temp_password_expires_at,
            ],
        ]);
    }

    /** Completed invites, and invites of inactive accounts, refuse every action. */
    private function refuseIfClosed(AccountInvite $invite): ?JsonResponse
    {
        $invite->load('user');

        if ($invite->status === AccountInvite::STATUS_COMPLETED) {
            return response()->json(['message' => 'This invite is already completed.'], 422);
        }

        if (! $invite->user || ! $invite->user->isActive()) {
            return response()->json(['message' => 'This invite cannot be changed because the account is inactive or missing.'], 422);
        }

        return null;
    }

    private function toResponse(AccountInvite $invite): array
    {
        return AccessRows::invite($invite);
    }

    /** Anything but a non-empty string (for example `?token[]=x`) is treated as an unknown link. */
    private function findUsableInvite(mixed $token): ?AccountInvite
    {
        if (! is_string($token) || $token === '') {
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
