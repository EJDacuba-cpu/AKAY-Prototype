<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\PasswordResetApprovedMail;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Services\AccessRequestStatus;
use App\Services\AccountActivationService;
use App\Services\AdminAccessNotificationService;
use App\Services\AuditLogger;
use App\Services\PasswordSetRecorder;
use App\Services\PasswordSetService;
use App\Support\FrontendUrl;
use App\Support\MaskedEmail;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Throwable;

class PasswordResetRequestController extends Controller
{
    private const PUBLIC_MESSAGE = 'Your password reset request has been submitted. Please wait for admin approval.';

    public function request(Request $request, AdminAccessNotificationService $notifications, AuditLogger $auditLogger)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = Str::lower(trim($validated['email']));
        DB::transaction(function () use ($email, $notifications): void {
            // Lock the existing account: concurrent submissions cannot create two pending requests.
            $user = User::whereRaw('lower(email) = ?', [$email])->lockForUpdate()->first();
            if (! $user || ! $user->isActive() || ! app(AccountActivationService::class)->isActivated($user)) {
                return;
            }
            $reset = PasswordResetRequest::firstOrCreate([
                'user_id' => $user->id,
                'status' => PasswordResetRequest::STATUS_PENDING,
            ], ['email' => $email, 'requested_at' => now()]);
            $reset->setRelation('user', $user);
            $notifications->resetRequested($reset);
        });

        $auditLogger->log($request, 'password reset requested', 'auth', 'Password reset requested for '.MaskedEmail::mask($email).'.');

        return response()->json(['message' => self::PUBLIC_MESSAGE]);
    }

    public function verify(Request $request)
    {
        $token = $request->query('token');
        $resetRequest = $this->findUsableRequestByToken($token);

        if (! $resetRequest) {
            return response()->json(['message' => 'This password reset link is invalid or expired.'], 422);
        }

        return response()->json([
            'message' => 'Password reset link is valid.',
            'data' => [
                'email' => $resetRequest->email,
                'expires_at' => $resetRequest->expires_at,
            ],
        ]);
    }

    public function complete(
        Request $request,
        AuditLogger $auditLogger,
        PasswordSetService $passwords
    ) {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->mixedCase()->numbers()],
        ]);

        $resetRequest = $this->findUsableRequestByToken($validated['token']);

        if (! $resetRequest || ! $resetRequest->user || ! $resetRequest->user->isActive()) {
            return response()->json(['message' => 'This password reset link is invalid or expired.'], 422);
        }

        return $this->withLockedRequest($resetRequest, function (PasswordResetRequest $resetRequest) use ($request, $validated, $auditLogger, $passwords) {
            $resetRequest->load('user');
            if (! $resetRequest->isApprovedTokenUsable()
                || ! hash_equals((string) $resetRequest->reset_token_hash, hash('sha256', $validated['token']))
                || ! $resetRequest->user?->isActive()
                || ! app(AccountActivationService::class)->isActivated($resetRequest->user)
                || ! app(AccountActivationService::class)->sameMailbox($resetRequest->email, $resetRequest->user->email)) {
                return response()->json(['message' => 'This password reset link is invalid or expired.'], 422);
            }

            // Clears any temporary-password flags, completes this request and any other open invite or reset
            // request for the user, and ends every session.
            $passwords->set($resetRequest->user, $validated['password'], PasswordSetRecorder::ROUTE_RESET, 'password-reset');

            $auditLogger->log($request, 'password reset completed', 'auth', 'Password reset completed for '.MaskedEmail::mask($resetRequest->email).'.');

            return response()->json(['message' => 'Password changed successfully. You may now sign in.']);
        });
    }

    public function index(Request $request)
    {
        $query = PasswordResetRequest::query()
            ->with(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver', 'rejecter'])
            ->latest('requested_at');

        // Expire first so the filter and the display status see the same rows.
        $this->expireStaleApprovedRequests();

        if ($status = $request->query('status')) {
            AccessRequestStatus::applyToResetRequests($query, Str::lower((string) $status));
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('email', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($userQuery) => $userQuery
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%"));
            });
        }

        return response()->json([
            'data' => $query->paginate($request->integer('per_page', 25))->through(
                fn (PasswordResetRequest $resetRequest) => $this->toResponse($resetRequest)
            ),
        ]);
    }

    public function show(PasswordResetRequest $passwordResetRequest)
    {
        return response()->json([
            'data' => $this->toResponse($passwordResetRequest->load([
                'user.barangayHealthCenter',
                'user.ruralHealthUnit',
                'approver',
                'rejecter',
            ])),
        ]);
    }

    public function approve(Request $request, PasswordResetRequest $passwordResetRequest, AuditLogger $auditLogger)
    {
        return $this->withLockedRequest($passwordResetRequest, function (PasswordResetRequest $passwordResetRequest) use ($request, $auditLogger) {
            if ($passwordResetRequest->status !== PasswordResetRequest::STATUS_PENDING) {
                return response()->json(['message' => 'Only pending password reset requests can be approved.'], 422);
            }

            $passwordResetRequest->load('user');
            if (! $passwordResetRequest->user
                || ! $passwordResetRequest->user->isActive()
                || ! app(AccountActivationService::class)->isActivated($passwordResetRequest->user)) {
                return response()->json(['message' => 'This request cannot be approved because the account is inactive or missing.'], 422);
            }

            $passwordResetRequest->forceFill([
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
                'admin_note' => $request->input('admin_note'),
            ]);
            $this->deliver($passwordResetRequest, $this->issueResetLink($passwordResetRequest));

            $auditLogger->log($request, 'password reset approved', 'auth', 'Password reset approved for '.MaskedEmail::mask($passwordResetRequest->email).'.');

            return response()->json([
                'message' => $passwordResetRequest->delivery === PasswordResetRequest::DELIVERY_SENT
                    ? 'Password reset approved. A secure reset link was sent to the user.'
                    : 'Password reset approved, but the email could not be sent. Resend it or copy the link.',
                'data' => $this->toResponse($passwordResetRequest->fresh(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver'])),
            ]);
        });
    }

    /** Resend: a fresh link and a new 60-minute window; the previous link stops working. */
    public function resend(Request $request, PasswordResetRequest $passwordResetRequest, AuditLogger $auditLogger)
    {
        return $this->withLockedRequest($passwordResetRequest, function (PasswordResetRequest $passwordResetRequest) use ($request, $auditLogger) {
            if ($refusal = $this->refuseIfNotDeliverable($passwordResetRequest)) {
                return $refusal;
            }

            $this->deliver($passwordResetRequest, $this->issueResetLink($passwordResetRequest));

            $auditLogger->log($request, 'reset link resent', 'auth', 'Reset link resent to '.MaskedEmail::mask($passwordResetRequest->email).'.');

            return response()->json([
                'data' => $this->toResponse($passwordResetRequest->fresh(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver'])),
            ]);
        });
    }

    /** Copy link: a fresh one-time link for the MHO to share another way. Nothing is emailed. */
    public function link(Request $request, PasswordResetRequest $passwordResetRequest, AuditLogger $auditLogger)
    {
        return $this->withLockedRequest($passwordResetRequest, function (PasswordResetRequest $passwordResetRequest) use ($request, $auditLogger) {
            if ($refusal = $this->refuseIfNotDeliverable($passwordResetRequest)) {
                return $refusal;
            }

            $url = $this->buildResetUrl($this->issueResetLink($passwordResetRequest));
            $passwordResetRequest->forceFill(['delivery' => PasswordResetRequest::DELIVERY_COPIED])->save();
            app(AdminAccessNotificationService::class)->resetResolved($passwordResetRequest);

            $auditLogger->log($request, 'reset link copied', 'auth', 'Reset link copied for '.MaskedEmail::mask($passwordResetRequest->email).'.');

            return response()->json(['data' => ['url' => $url]]);
        });
    }

    public function reject(Request $request, PasswordResetRequest $passwordResetRequest, AuditLogger $auditLogger)
    {
        return $this->withLockedRequest($passwordResetRequest, function (PasswordResetRequest $passwordResetRequest) use ($request, $auditLogger) {
            $validated = $request->validate([
                'admin_note' => ['nullable', 'string', 'max:1000'],
            ]);

            if (! in_array($passwordResetRequest->status, [PasswordResetRequest::STATUS_PENDING, PasswordResetRequest::STATUS_APPROVED], true)) {
                return response()->json(['message' => 'This password reset request can no longer be rejected.'], 422);
            }

            $passwordResetRequest->update([
                'status' => PasswordResetRequest::STATUS_REJECTED,
                'rejected_by' => $request->user()->id,
                'rejected_at' => now(),
                'reset_token_hash' => null,
                'expires_at' => null,
                'admin_note' => $validated['admin_note'] ?? null,
            ]);

            app(AdminAccessNotificationService::class)->resetResolved($passwordResetRequest);

            $auditLogger->log($request, 'password reset rejected', 'auth', 'Password reset rejected for '.MaskedEmail::mask($passwordResetRequest->email).'.');

            return response()->json([
                'message' => 'Password reset request rejected.',
                'data' => $this->toResponse($passwordResetRequest->fresh(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'rejecter'])),
            ]);
        });
    }

    /** Only a sent-out (approved) or timed-out (expired) request for an active account can get a new link. */
    private function refuseIfNotDeliverable(PasswordResetRequest $resetRequest)
    {
        $resetRequest->loadMissing('user');

        if ($resetRequest->status === PasswordResetRequest::STATUS_PENDING) {
            return response()->json(['message' => 'This request has not been approved yet. Approve it first.'], 422);
        }

        if (! in_array($resetRequest->status, [PasswordResetRequest::STATUS_APPROVED, PasswordResetRequest::STATUS_EXPIRED], true)) {
            return response()->json(['message' => 'This password reset request is closed.'], 422);
        }

        if (! $resetRequest->user
            || ! $resetRequest->user->isActive()
            || ! app(AccountActivationService::class)->isActivated($resetRequest->user)) {
            return response()->json(['message' => 'This request cannot be sent because the account is inactive or missing.'], 422);
        }

        return null;
    }

    /** New token and a fresh window (60 minutes by default); returns the raw token, which is never stored. */
    private function issueResetLink(PasswordResetRequest $resetRequest): string
    {
        $token = Str::random(64);

        $resetRequest->forceFill([
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'reset_token_hash' => hash('sha256', $token),
            'expires_at' => now()->addMinutes((int) env('PASSWORD_RESET_TOKEN_EXPIRES_MINUTES', 60)),
        ])->save();

        return $token;
    }

    /** Never throws: a mail failure is recorded on the request so the admin can resend or copy the link. */
    private function deliver(PasswordResetRequest $resetRequest, string $token): void
    {
        $wasFailed = $resetRequest->delivery === PasswordResetRequest::DELIVERY_FAILED;
        $resetRequest->loadMissing('user');

        try {
            Mail::to($resetRequest->email)->send(
                new PasswordResetApprovedMail($resetRequest, $this->buildResetUrl($token))
            );
            $resetRequest->forceFill(['delivery' => PasswordResetRequest::DELIVERY_SENT])->save();
        } catch (Throwable $e) {
            Log::warning('Password reset email failed.', [
                'password_reset_request_id' => $resetRequest->id,
                'recipient' => $this->maskEmail($resetRequest->email),
                'error' => get_class($e),
            ]);
            $resetRequest->forceFill(['delivery' => PasswordResetRequest::DELIVERY_FAILED])->save();
        }
        app(AdminAccessNotificationService::class)->resetDeliveryChanged($resetRequest, $wasFailed);
    }

    /** Anything but a non-empty string (for example `?token[]=x`) is treated as an unknown link. */
    private function findUsableRequestByToken(mixed $token): ?PasswordResetRequest
    {
        if (! is_string($token) || $token === '') {
            return null;
        }

        $tokenHash = hash('sha256', $token);
        $resetRequest = PasswordResetRequest::query()
            ->with('user')
            ->where('reset_token_hash', $tokenHash)
            ->where('status', PasswordResetRequest::STATUS_APPROVED)
            ->first();

        if (! $resetRequest) {
            return null;
        }

        if (! $resetRequest->isApprovedTokenUsable()) {
            $resetRequest->update([
                'status' => PasswordResetRequest::STATUS_EXPIRED,
                'reset_token_hash' => null,
            ]);

            return null;
        }

        if (! $resetRequest->user || ! app(AccountActivationService::class)->isActivated($resetRequest->user)) {
            return null;
        }

        return $resetRequest;
    }

    private function withLockedRequest(PasswordResetRequest $reset, Closure $action)
    {
        return DB::transaction(function () use ($reset, $action) {
            User::whereKey($reset->user_id)->lockForUpdate()->first();

            return $action(PasswordResetRequest::whereKey($reset->id)->lockForUpdate()->firstOrFail());
        });
    }

    private function buildResetUrl(string $token): string
    {
        return FrontendUrl::to("/reset-password?token={$token}");
    }

    private function maskEmail(string $email): string
    {
        return MaskedEmail::mask($email);
    }

    private function expireStaleApprovedRequests(): void
    {
        AccessRequestStatus::expireStaleResetRequests();
    }

    private function toResponse(PasswordResetRequest $resetRequest): array
    {
        $user = $resetRequest->user;
        $facility = $user?->barangayHealthCenter?->name
            ?: $user?->ruralHealthUnit?->name
            ?: 'No facility assigned';

        return [
            'id' => $resetRequest->id,
            'email' => $resetRequest->email,
            'status' => $resetRequest->status,
            'display_status' => AccessRequestStatus::forResetRequest($resetRequest),
            'delivery' => $resetRequest->delivery,
            'completed_via' => $resetRequest->completed_via,
            'requested_at' => $resetRequest->requested_at,
            'approved_at' => $resetRequest->approved_at,
            'rejected_at' => $resetRequest->rejected_at,
            'completed_at' => $resetRequest->completed_at,
            'expires_at' => $resetRequest->expires_at,
            'admin_note' => $resetRequest->admin_note,
            'user' => $user ? [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'staff_role' => $user->staff_role,
                'status' => $user->status,
                'facility' => $facility,
            ] : null,
            'approved_by' => $resetRequest->approver?->name,
            'rejected_by' => $resetRequest->rejecter?->name,
        ];
    }
}
