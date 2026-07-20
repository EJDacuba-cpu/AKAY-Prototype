<?php

namespace App\Http\Controllers\Api;

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

        $newAccessToken = $sessions->issueToken($user);
        $auditLogger->log($request, 'login', 'auth', 'User logged in.');

        return response()->json([
            'token' => $newAccessToken->plainTextToken,
            'token_type' => 'Bearer',
            'expires_at' => $newAccessToken->accessToken->expires_at,
            'user' => $user->load(['barangayHealthCenter', 'ruralHealthUnit']),
        ]);
    }

    public function logout(
        Request $request,
        AuditLogger $auditLogger,
        UserSessionRevocationService $sessions
    ) {
        $auditLogger->log($request, 'logout', 'auth', 'User logged out.');
        $sessions->revokeCurrentToken($request->user());

        return response()->json(['message' => 'Logged out.']);
    }

    public function profile(Request $request)
    {
        return response()->json([
            'user' => $request->user()->load(['barangayHealthCenter', 'ruralHealthUnit']),
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
}
