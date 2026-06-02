<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\UserNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(LoginRequest $request, AuditLogger $auditLogger)
    {
        $user = User::where('email', $request->validated('email'))->first();

        if (! $user || ! Hash::check($request->validated('password'), $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->isActive()) {
            return response()->json(['message' => 'Account is inactive.'], 403);
        }

        $token = $user->createToken('akay-api')->plainTextToken;
        $auditLogger->log($request, 'login', 'auth', 'User logged in.');

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->load(['barangayHealthCenter', 'ruralHealthUnit']),
        ]);
    }

    public function logout(Request $request, AuditLogger $auditLogger)
    {
        $auditLogger->log($request, 'logout', 'auth', 'User logged out.');
        $request->user()->currentAccessToken()?->delete();

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

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $validated,
            function (User $user, string $password) {
                $user->forceFill(['password' => $password])->save();
                $user->tokens()->delete();
            }
        );

        return $status === Password::PASSWORD_RESET
            ? response()->json(['message' => __($status)])
            : response()->json(['message' => __($status)], 422);
    }
}
