<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\PersistentSessionException;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\UserNotificationService;
use App\Services\UserSessionRevocationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Symfony\Component\HttpFoundation\Cookie;

class AuthController extends Controller
{
    public function login(
        LoginRequest $request,
        AuditLogger $auditLogger,
        FacilityAccessService $facilityAccess,
        UserSessionRevocationService $sessions
    ) {
        $user = User::where('email', $request->validated('email'))->first();

        $validRole = $user && in_array($user->role, [
            User::ROLE_ADMIN,
            User::ROLE_BHW,
            User::ROLE_RHU_STAFF,
        ], true);
        $validAccount = $user
            && Hash::check($request->validated('password'), $user->password)
            && $user->isActive()
            && $validRole
            && $facilityAccess->hasValidFacilityAssignment($user);

        if (! $validAccount) {
            return response()->json([
                'message' => 'The provided credentials are incorrect.',
                'code' => 'LOGIN_FAILED',
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

    public function forgotPassword(Request $request, UserNotificationService $notifications)
    {
        $validated = $request->validate(['email' => ['required', 'email']]);
        $status = Password::sendResetLink($validated);

        if ($status === Password::RESET_LINK_SENT) {
            $notifications->notifyUser(
                User::where('email', $validated['email'])->first(),
                'Password reset requested',
                'A password reset request was created for your account.',
                'password_reset'
            );
        }

        return response()->json(['message' => __($status)]);
    }

    public function resetPassword(
        Request $request,
        UserSessionRevocationService $sessions
    ) {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $validated,
            function (User $user, string $password) use ($sessions) {
                $user->forceFill(['password' => $password])->save();
                $sessions->revokeAllTokens($user, 'password-reset');
            }
        );

        return $status === Password::PASSWORD_RESET
            ? response()->json(['message' => __($status)])
            : response()->json(['message' => __($status)], 422);
    }

    private function sessionResponse(User $user, array $session)
    {
        return response()->json([
            'token' => $session['access']->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $session['access']->accessToken->expires_at,
            'user' => $this->userPayload($user),
        ]);
    }

    private function userPayload(User $user): array
    {
        $user->loadMissing(['barangayHealthCenter:id,name', 'ruralHealthUnit:id,name']);
        $facility = $user->isBhw()
            ? $user->barangayHealthCenter
            : ($user->isRhuStaff() ? $user->ruralHealthUnit : null);
        $facilityType = $user->isBhw() ? 'bhc' : ($user->isRhuStaff() ? 'rhu' : null);
        $homePath = match ($user->role) {
            User::ROLE_BHW => '/bhc/dashboard',
            User::ROLE_RHU_STAFF => '/rhu/dashboard',
            default => '/admin/dashboard',
        };

        return [
            'id' => $user->getKey(),
            'name' => $user->name,
            'role' => $user->role,
            'status' => $user->status,
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
