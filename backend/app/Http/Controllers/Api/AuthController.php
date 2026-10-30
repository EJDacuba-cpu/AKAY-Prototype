<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\PersistentSessionException;
use App\Exceptions\TurnstileVerificationException;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Models\User;
use App\Services\AccountActivationService;
use App\Services\ActionPermissions;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\PasswordSetRecorder;
use App\Services\PasswordSetService;
use App\Services\TurnstileVerifier;
use App\Services\UserSessionRevocationService;
use App\Services\WorkingFacilityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Cookie;

class AuthController extends Controller
{
    public function login(
        LoginRequest $request,
        AccountActivationService $activation,
        AuditLogger $auditLogger,
        FacilityAccessService $facilityAccess,
        UserSessionRevocationService $sessions,
        TurnstileVerifier $turnstile
    ) {
        try {
            $turnstile->verify(
                (string) $request->validated('turnstile_token'),
                $request->ip()
            );
        } catch (TurnstileVerificationException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => $exception->codeName(),
            ], $exception->status());
        }

        // LoginRequest normalizes the input; older accounts may retain mixed-case emails.
        // Do not choose an identity if legacy rows collide after case normalization.
        $matches = User::whereRaw('lower(email) = ?', [$request->validated('email')])
            ->limit(2)->get();
        $user = $matches->count() === 1 ? $matches->first() : null;

        $validRole = $user && in_array($user->role, [
            User::ROLE_ADMIN,
            User::ROLE_BHC,
            User::ROLE_RHU,
        ], true);
        $validAccount = $user
            && Hash::check($request->validated('password'), $user->password)
            && $user->isActive()
            && $validRole
            && ($user->isAdmin() || app(WorkingFacilityService::class)->available($user) !== []);

        if (! $validAccount) {
            return response()->json([
                'message' => 'The provided credentials are incorrect.',
                'code' => 'LOGIN_FAILED',
            ], 422);
        }

        if (! $activation->isActivated($user)) {
            return response()->json([
                'message' => 'Finish account setup from the invitation sent to your email, or ask the Municipal Health Officer to resend it.',
                'code' => 'ACCOUNT_SETUP_REQUIRED',
            ], 403);
        }

        // Fail closed: a temporary password with no recorded expiry is treated as expired.
        if ($user->must_change_password
            && (! $user->temp_password_expires_at || $user->temp_password_expires_at->isPast())) {
            return response()->json([
                'message' => 'This temporary password has expired. Ask the MHO for a new one.',
                'code' => 'TEMP_PASSWORD_EXPIRED',
            ], 422);
        }

        $session = $sessions->issuePersistentSession($user);
        $auditLogger->log($request, 'login', 'auth', 'User logged in.');

        return $this->sessionResponse($user, $session)
            ->withCookie($this->refreshCookie(
                $session['refresh']->plainTextToken,
                $session['refresh']->accessToken->expires_at
            ));
    }

    public function refresh(
        Request $request,
        FacilityAccessService $facilityAccess,
        UserSessionRevocationService $sessions
    ) {
        try {
            $session = $sessions->rotatePersistentSession(
                $request->cookie(config('auth_persistence.cookie.name')),
                $facilityAccess
            );
        } catch (PersistentSessionException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => $exception->codeName(),
            ], 401)->withCookie($this->expiredRefreshCookie());
        }

        $user = $session['access']->accessToken->tokenable;

        return $this->sessionResponse($user, $session)
            ->withCookie($this->refreshCookie(
                $session['refresh']->plainTextToken,
                $session['refresh']->accessToken->expires_at
            ));
    }

    public function logout(
        Request $request,
        AuditLogger $auditLogger,
        UserSessionRevocationService $sessions
    ) {
        $auditLogger->log($request, 'logout', 'auth', 'User logged out.');
        $sessions->revokePresentedRefreshToken(
            $request->user(),
            $request->cookie(config('auth_persistence.cookie.name'))
        );
        $sessions->revokeCurrentToken($request->user());

        return response()->json(['message' => 'Logged out.'])
            ->withCookie($this->expiredRefreshCookie());
    }

    public function profile(Request $request)
    {
        return response()->json([
            'user' => $this->userPayload($request->user()),
        ]);
    }

    public function changePassword(
        Request $request,
        PasswordSetService $passwords,
        AuditLogger $auditLogger,
        UserSessionRevocationService $sessions
    ) {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', 'different:current_password', PasswordRule::min(8)->mixedCase()->numbers()],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'The current password is incorrect.',
            ]);
        }

        $wasTemporary = (bool) $user->must_change_password;

        // Every session opened before the change (including any opened with the temporary password) ends.
        // A voluntary change by a user who had no temporary password completes nothing.
        $passwords->set(
            $user,
            $validated['password'],
            $wasTemporary ? PasswordSetRecorder::ROUTE_TEMPORARY_PASSWORD : null,
            'password-changed'
        );

        $session = $sessions->issuePersistentSession($user);

        $auditLogger->log($request, 'password changed', 'auth', 'User changed their password.');

        return $this->sessionResponse($user->fresh(), $session, ['message' => 'Password changed.'])
            ->withCookie($this->refreshCookie(
                $session['refresh']->plainTextToken,
                $session['refresh']->accessToken->expires_at
            ));
    }

    private function sessionResponse(User $user, array $session, array $extra = [])
    {
        return response()->json([
            ...$extra,
            'token' => $session['access']->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $session['access']->accessToken->expires_at,
            'user' => $this->userPayload($user),
        ]);
    }

    private function userPayload(User $user): array
    {
        $choices = app(WorkingFacilityService::class)->available($user);
        $user->loadMissing(['barangayHealthCenter:id,name', 'ruralHealthUnit:id,name']);
        $facility = $user->isBhc()
            ? $user->barangayHealthCenter
            : ($user->isRhu() ? $user->ruralHealthUnit : null);
        $facilityType = $user->isBhc() ? 'bhc' : ($user->isRhu() ? 'rhu' : null);
        $homePath = match ($user->role) {
            User::ROLE_BHC => '/bhc/dashboard',
            User::ROLE_RHU => '/rhu/dashboard',
            default => '/admin/dashboard',
        };

        return [
            'id' => $user->getKey(),
            'name' => $user->name,
            'role' => $user->role,
            'status' => $user->status,
            'email_verified_at' => $user->email_verified_at,
            'must_change_password' => (bool) $user->must_change_password,
            'staff_role' => $user->staff_role,
            'contact_number' => $user->contact_number,
            'permissions' => ActionPermissions::home($user),
            'authorized_facilities' => $choices,
            'barangay_health_center_id' => $user->barangay_health_center_id,
            'rural_health_unit_id' => $user->rural_health_unit_id,
            'facility' => $facility ? [
                'id' => $facility->getKey(),
                'name' => $facility->name,
                'type' => $facilityType,
            ] : null,
            'navigation' => [
                'home' => $homePath,
                'scope' => $facilityType ?? 'admin',
            ],
        ];
    }

    private function refreshCookie(string $value, mixed $expiresAt): Cookie
    {
        return Cookie::create(config('auth_persistence.cookie.name'))
            ->withValue($value)
            ->withExpires($expiresAt)
            ->withPath(config('auth_persistence.cookie.path'))
            ->withDomain(config('auth_persistence.cookie.domain'))
            ->withSecure(config('auth_persistence.cookie.secure'))
            ->withHttpOnly(true)
            ->withSameSite(config('auth_persistence.cookie.same_site'));
    }

    private function expiredRefreshCookie(): Cookie
    {
        return $this->refreshCookie('', now()->subYear());
    }
}
