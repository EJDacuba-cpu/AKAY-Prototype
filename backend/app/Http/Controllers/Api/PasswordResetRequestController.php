<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\PasswordResetApprovedMail;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\UserNotificationService;
use App\Services\UserSessionRevocationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class PasswordResetRequestController extends Controller
{
    private const PUBLIC_MESSAGE = 'Your password reset request has been submitted. Please wait for admin approval.';

    public function request(Request $request, UserNotificationService $notifications, AuditLogger $auditLogger)
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = Str::lower(trim($validated['email']));
        $user = User::query()
            ->whereRaw('lower(email) = ?', [$email])
            ->with(['barangayHealthCenter', 'ruralHealthUnit'])
            ->first();

        if (! $user || ! $user->isActive()) {
            $auditLogger->log($request, 'password reset requested', 'auth', "Password reset requested for {$email}.");

            return response()->json(['message' => self::PUBLIC_MESSAGE]);
        }

        $resetRequest = PasswordResetRequest::query()
            ->where('email', $email)
            ->where('status', PasswordResetRequest::STATUS_PENDING)
            ->latest()
            ->first();

        if (! $resetRequest) {
            $resetRequest = PasswordResetRequest::create([
                'user_id' => $user->id,
                'email' => $email,
                'status' => PasswordResetRequest::STATUS_PENDING,
                'requested_at' => now(),
            ]);
        }

        $admins = User::query()
            ->where('role', User::ROLE_ADMIN)
            ->where('status', User::STATUS_ACTIVE)
            ->get();

        $notifications->notifyUsersOnce(
            $admins,
            'Password reset requested',
            "Password reset requested by {$user->name}.",
            'password_reset_request',
            null,
            '/admin/password-reset-requests',
            'password_reset_request',
            $resetRequest->id,
        );

        $auditLogger->log($request, 'password reset requested', 'auth', "Password reset requested for {$email}.");

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
        UserSessionRevocationService $sessions
    ) {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->mixedCase()->numbers()],
        ]);

        $resetRequest = $this->findUsableRequestByToken($validated['token']);

        if (! $resetRequest || ! $resetRequest->user || ! $resetRequest->user->isActive()) {
            return response()->json(['message' => 'This password reset link is invalid or expired.'], 422);
        }

        DB::transaction(function () use (
            $request,
            $resetRequest,
            $validated,
            $auditLogger,
            $sessions
        ): void {
            $resetRequest->user->forceFill([
                'password' => $validated['password'],
            ])->save();
            $sessions->revokeAllTokens($resetRequest->user, 'password-reset');

            $resetRequest->update([
                'status' => PasswordResetRequest::STATUS_COMPLETED,
                'completed_at' => now(),
                'reset_token_hash' => null,
                'expires_at' => null,
            ]);

            $auditLogger->log($request, 'password reset completed', 'auth', "Password reset completed for {$resetRequest->email}.");
        });

        return response()->json(['message' => 'Password changed successfully. You may now sign in.']);
    }

    public function index(Request $request)
    {
        $query = PasswordResetRequest::query()
            ->with(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver', 'rejecter'])
            ->latest('requested_at');

        if ($status = $request->query('status')) {
            $query->where('status', Str::lower($status));
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('email', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($userQuery) => $userQuery
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%"));
            });
        }

        $this->expireStaleApprovedRequests();

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
        if ($passwordResetRequest->status !== PasswordResetRequest::STATUS_PENDING) {
            return response()->json(['message' => 'Only pending password reset requests can be approved.'], 422);
        }

        $passwordResetRequest->load('user');
        if (! $passwordResetRequest->user || ! $passwordResetRequest->user->isActive()) {
            return response()->json(['message' => 'This request cannot be approved because the account is inactive or missing.'], 422);
        }

        $rawToken = Str::random(64);
        $expiresAt = now()->addMinutes((int) env('PASSWORD_RESET_TOKEN_EXPIRES_MINUTES', 60));

        $passwordResetRequest->update([
            'status' => PasswordResetRequest::STATUS_APPROVED,
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'expires_at' => $expiresAt,
            'reset_token_hash' => hash('sha256', $rawToken),
            'admin_note' => $request->input('admin_note'),
        ]);

        $resetUrl = $this->buildResetUrl($rawToken);
        Log::info('Password reset approval email send attempted.', [
            'password_reset_request_id' => $passwordResetRequest->id,
            'recipient' => $this->maskEmail($passwordResetRequest->email),
            'frontend_url' => $this->frontendUrl(),
        ]);

        Mail::to($passwordResetRequest->email)->send(
            new PasswordResetApprovedMail($passwordResetRequest->fresh('user'), $resetUrl)
        );

        Log::info('Password reset approval email sent.', [
            'password_reset_request_id' => $passwordResetRequest->id,
            'recipient' => $this->maskEmail($passwordResetRequest->email),
        ]);

        $auditLogger->log($request, 'password reset approved', 'auth', "Password reset approved for {$passwordResetRequest->email}.");

        return response()->json([
            'message' => 'Password reset approved. A secure reset link was sent to the user.',
            'data' => $this->toResponse($passwordResetRequest->fresh(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver'])),
        ]);
    }

    public function reject(Request $request, PasswordResetRequest $passwordResetRequest, AuditLogger $auditLogger)
    {
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

        $auditLogger->log($request, 'password reset rejected', 'auth', "Password reset rejected for {$passwordResetRequest->email}.");

        return response()->json([
            'message' => 'Password reset request rejected.',
            'data' => $this->toResponse($passwordResetRequest->fresh(['user.barangayHealthCenter', 'user.ruralHealthUnit', 'rejecter'])),
        ]);
    }

    private function findUsableRequestByToken(?string $token): ?PasswordResetRequest
    {
        if (! $token) {
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

        return $resetRequest;
    }

    private function buildResetUrl(string $token): string
    {
        $frontendUrl = $this->frontendUrl();

        return "{$frontendUrl}/reset-password?token={$token}";
    }

    private function frontendUrl(): string
    {
        return rtrim((string) env('FRONTEND_URL', env('APP_FRONTEND_URL', 'http://localhost:5173')), '/');
    }

    private function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $maskedLocal = $local === ''
            ? '***'
            : Str::substr($local, 0, 1).str_repeat('*', max(2, Str::length($local) - 1));

        return $domain ? "{$maskedLocal}@{$domain}" : $maskedLocal;
    }

    private function expireStaleApprovedRequests(): void
    {
        PasswordResetRequest::query()
            ->where('status', PasswordResetRequest::STATUS_APPROVED)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update([
                'status' => PasswordResetRequest::STATUS_EXPIRED,
                'reset_token_hash' => null,
            ]);
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
                'status' => $user->status,
                'facility' => $facility,
            ] : null,
            'approved_by' => $resetRequest->approver?->name,
            'rejected_by' => $resetRequest->rejecter?->name,
        ];
    }
}
